// Qualification only: the outer fault injector is not a production supervisor.
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { reconcile } from './verifier-container-recovery.mjs'

assert.ok(process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true', 'Disposable Linux CI only.')
const filename = fileURLToPath(import.meta.url)
const controller = fileURLToPath(new URL('./verifier-crash-qualification.mjs', import.meta.url))
const exec = promisify(execFile)
const docker = args => exec('docker', args, { timeout: 15000, maxBuffer: 16384 })
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Readiness timeout.')), 30000)
    child.once('message', message => { clearTimeout(timer); message?.ready === true ? resolve() : reject(new Error('Invalid readiness.')) })
    closed.then(() => { clearTimeout(timer); reject(new Error('Process exited before readiness.')) }, reject)
  })
  return { child, closed, ready }
}

if (process.argv[2] === '--observer') {
  const [journal, token] = process.argv.slice(3)
  const worker = launch([controller, '--child', journal, token, 'running-tree'])
  await worker.ready
  assert.equal(worker.child.kill('SIGKILL'), true)
  assert.equal((await worker.closed).signal, 'SIGKILL')
  // No operation clients remain. Observer dies before reconciling or writing a
  // completion receipt; only the uncertain journal survives.
  process.send({ ready: true })
  setInterval(() => {}, 1000)
} else {
  assert.equal(process.argv.length, 2)
  const token = randomUUID()
  const record = { version: 1, name: `sdlc-crash-${token}`, token }
  const journal = path.join(await mkdtemp(path.join(tmpdir(), 'sdlc-observer-')), 'intent.json')
  const evidence = {
    scriptSha256: createHash('sha256').update(await readFile(filename)).digest('hex'),
    controllerSha256: createHash('sha256').update(await readFile(controller)).digest('hex'),
    qualified: false, retryAuthorized: false,
  }
  let observer
  try {
    await exec('docker', ['pull', 'node@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8'], { timeout: 180000, maxBuffer: 16384 })
    observer = launch([filename, '--observer', journal, token])
    await observer.ready
    assert.equal(observer.child.kill('SIGKILL'), true)
    assert.equal((await observer.closed).signal, 'SIGKILL')
    evidence.observerKilled = true
    const bytes = await readFile(journal)
    assert.ok(bytes.length > 0 && bytes.length <= 4096)
    const state = JSON.parse(bytes)
    assert.equal(state.state, 'uncertain')
    assert.equal(state.token, token)
    const info = JSON.parse((await docker(['inspect', record.name])).stdout)[0]
    assert.equal(info.Config.Labels['sdlc.qualification.owner'], token)
    assert.equal(info.State.Running, true)
    const top = (await docker(['top', record.name, '-eo', 'pid,ppid,comm'])).stdout.trim().split('\n')
    assert.ok(top.length >= 4)
    evidence.liveOrphanTreeAfterObserverDeath = true
    const recovery = await exec(process.execPath, [controller, '--recover', journal, token], { timeout: 45000, maxBuffer: 16384 })
    assert.deepEqual(JSON.parse(recovery.stdout), { containerAbsent: true, retryAuthorized: false })
    evidence.containerAbsent = true
    evidence.qualified = true
  } catch {
    process.exitCode = 1
    evidence.failure = 'Observer-loss qualification failed; execution remains disabled.'
  } finally {
    if (observer) { observer.child.kill('SIGKILL'); await observer.closed }
    // Cleanup failure cannot produce a successful qualification.
    try { await reconcile(record, token, docker) } catch { evidence.qualified = false; process.exitCode = 1 }
    await mkdir('docs/evidence/verifier', { recursive: true })
    await writeFile('docs/evidence/verifier/observer-loss-qualification.json', JSON.stringify(evidence, null, 2))
    console.log(`::notice title=Trusted observer loss summary::${JSON.stringify(evidence)}`)
  }
}
