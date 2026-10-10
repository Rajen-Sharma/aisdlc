import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, open, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { reconcile } from './verifier-container-recovery.mjs'

const exec = promisify(execFile)
const docker = (args, options = {}) => exec('docker', args, { timeout: 15000, maxBuffer: 16384, ...options })
const image = 'node@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8'
const filename = fileURLToPath(import.meta.url)
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Disposable selected Linux CI only.')

async function readJournal(journal) {
  const file = await open(journal, 'r')
  try {
    const buffer = Buffer.alloc(4097)
    let bytes = 0
    while (bytes < buffer.length) {
      const result = await file.read(buffer, bytes, buffer.length - bytes, bytes)
      if (!result.bytesRead) break
      bytes += result.bytesRead
    }
    assert.ok(bytes > 0 && bytes <= 4096, 'Journal exceeds transport bound.')
    return JSON.parse(buffer.subarray(0, bytes).toString('utf8'))
  } finally { await file.close() }
}

if (process.argv[2] === '--child') {
  const [journal, token, stage] = process.argv.slice(3)
  assert.match(token, /^[a-f0-9-]{36}$/)
  const name = `sdlc-crash-${token}`
  const record = { version: 1, name, token, state: 'uncertain' }
  // Durable intent precedes container creation. No code-task eligibility is recorded.
  const file = await open(journal, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(record)); await file.sync() } finally { await file.close() }
  const directory = await open(path.dirname(journal), 'r')
  try { await directory.sync() } finally { await directory.close() }
  if (stage !== 'before-create') {
    await docker(['create', '--name', name, '--label', `sdlc.qualification.owner=${token}`, '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '128m', '--memory-swap', '128m', '--cpus', '1', image, 'node', '-e', `require('node:child_process').spawn('/bin/sh',['-c','sleep 60 & wait'],{stdio:'ignore'}); setInterval(()=>{},1000)`])
  }
  if (stage === 'running-tree') {
    await docker(['start', name])
    let observed = false
    for (let i = 0; i < 20; i++) {
      const top = (await docker(['top', name, '-eo', 'pid,ppid,comm'])).stdout.trim().split('\n')
      if (top.length >= 4) { observed = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(observed, 'Child/grandchild tree was not observed.')
  }
  process.send({ ready: true, stage })
  // Parent kills this controller; no finally cleanup runs in this process.
  setInterval(() => {}, 1000)
} else if (process.argv[2] === '--recover') {
  const [journal, token] = process.argv.slice(3)
  const result = await reconcile(await readJournal(journal), token, docker)
  console.log(JSON.stringify(result))
} else {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--daemon-restart'))
  const daemonRestart = process.argv[2] === '--daemon-restart'
  const stages = daemonRestart ? ['running-tree'] : ['before-create', 'created-not-started', 'running-tree']
  const evidence = { image, scriptSha256: createHash('sha256').update(await readFile(filename)).digest('hex'), daemonRestart, cases: [], qualified: false, retryAuthorized: false }
  try {
    // This runner owns no production services; pre-pull before killing any controller.
    if (daemonRestart) await docker(['pull', image], { timeout: 180000 })
    for (const stage of stages) {
      const token = randomUUID()
      const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'sdlc-crash-journal-'))
      const journal = path.join(directory, 'intent.json')
      const child = spawn(process.execPath, [filename, '--child', journal, token, stage], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      let closed = false
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => { closed = true; resolve({ code, signal }) })
      })
      let recovered = false
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Qualification child did not become ready.')), 20000)
          child.once('message', value => { clearTimeout(timer); value.ready && value.stage === stage ? resolve() : reject(new Error('Invalid readiness.')) })
          exited.then(() => { clearTimeout(timer); reject(new Error('Child exited before ready.')) }, reject)
        })
        assert.equal(child.kill('SIGKILL'), true)
        assert.equal((await exited).signal, 'SIGKILL')
        const state = await readJournal(journal)
        assert.equal(state.state, 'uncertain')
        if (stage === 'running-tree') {
          const info = JSON.parse((await docker(['inspect', '--format', '{{json .State}}', state.name])).stdout)
          assert.equal(info.Running, true, 'Controller death did not leave a live orphan for recovery.')
        }
        if (daemonRestart) {
          const original = JSON.parse((await docker(['inspect', state.name])).stdout)[0]
          assert.match(original.Id, /^[a-f0-9]{64}$/)
          assert.equal(original.Config.Labels['sdlc.qualification.owner'], token)
          const daemonPid = async () => {
            const value = (await exec('systemctl', ['show', 'docker.service', '--property=MainPID', '--value'], { timeout: 15000, maxBuffer: 1024 })).stdout.trim()
            assert.match(value, /^[1-9][0-9]*$/)
            return value
          }
          const before = await daemonPid()
          await exec('sudo', ['-n', 'systemctl', 'restart', 'docker.service'], { timeout: 60000, maxBuffer: 16384 })
          assert.notEqual(await daemonPid(), before, 'Docker daemon identity did not change.')
          await docker(['info'])
          // Absence alone could hide daemon data loss. Require the original owned ID
          // to survive the restart before invoking the fresh recovery process.
          const retained = JSON.parse((await docker(['inspect', state.name])).stdout)[0]
          assert.equal(retained.Id, original.Id)
          assert.equal(retained.Name, `/${state.name}`)
          assert.equal(retained.Config.Labels['sdlc.qualification.owner'], token)
          assert.match(retained.Id, /^[a-f0-9]{64}$/)
          evidence.daemonIdentityChanged = true
          evidence.ownedContainerRetained = true
          evidence.containerRunningAfterRestart = retained.State.Running === true
        }
        // Recovery is a fresh OS process, with only trusted journal identity as input.
        const result = await exec(process.execPath, [filename, '--recover', journal, token], { timeout: 45000, maxBuffer: 16384 })
        assert.deepEqual(JSON.parse(result.stdout), { containerAbsent: true, retryAuthorized: false })
        recovered = true
        evidence.cases.push({ stage, controllerKilled: true, liveOrphanObserved: stage === 'running-tree', containerAbsent: true, retryAuthorized: false })
      } finally {
        if (!closed) { child.kill('SIGKILL'); await exited }
        if (!recovered) {
          // Best effort bounded cleanup for a failed qualification; never mark that case recovered.
          await reconcile({ version: 1, name: `sdlc-crash-${token}`, token }, token, docker)
        }
      }
    }
    evidence.qualified = evidence.cases.length === stages.length
  } catch {
    evidence.failure = 'Crash or reconciliation qualification failed; task execution stays disabled.'
    console.log('::error::Crash or reconciliation qualification failed.')
    process.exitCode = 1
  } finally {
    await mkdir('docs/evidence/verifier', { recursive: true })
    await open(`docs/evidence/verifier/${daemonRestart ? 'daemon-restart' : 'crash'}-qualification.json`, 'w').then(async file => { try { await file.writeFile(JSON.stringify(evidence, null, 2)) } finally { await file.close() } })
    console.log(JSON.stringify(evidence))
    // Contains only trusted stage names, booleans and pinned hashes, never child diagnostics.
    console.log(`::notice title=Trusted crash recovery summary::${JSON.stringify(evidence)}`)
  }
}
