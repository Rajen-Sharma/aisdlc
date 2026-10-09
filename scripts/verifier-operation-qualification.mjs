import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { pausedDockerProxy } from './qualification-docker-proxy.mjs'
import { reconcileAfterDrain } from './verifier-container-recovery.mjs'

const exec = promisify(execFile)
const docker = args => exec('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { timeout: 15000, maxBuffer: 16384 })
const image = 'node@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8'
const bounded = async promise => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Operation bound exceeded.')), 20000) })]) }
  finally { clearTimeout(timer) }
}
function ownedChild(command, args, ipc = false) {
  const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'ignore', ...(ipc ? ['ipc'] : [])] })
  let closed = false
  const closure = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => { closed = true; resolve({ code, signal }) })
  })
  // Attach an error handler immediately, even while another bounded operation is awaited.
  closure.catch(() => {})
  return { child, closure, isClosed: () => closed, async stop(signal = 'SIGKILL') { if (!closed) child.kill(signal); return bounded(closure) } }
}
const createArgs = name => ['create', '--name', name, '--label', `sdlc.qualification.owner=${name.slice('sdlc-crash-'.length)}`, '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '128m', '--memory-swap', '128m', '--cpus', '1', image, 'node', '-e', `require('node:child_process').spawn('/bin/sh',['-c','sleep 60 & wait'],{stdio:'ignore'}); setInterval(()=>{},1000)`]

if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Selected disposable Linux CI only.')
const evidence = { image, scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), cases: [], qualified: false, retryAuthorized: false }
try {
  for (const action of ['create', 'start']) for (const phase of ['request', 'response']) {
    const token = randomUUID()
    const record = { version: 1, token, name: `sdlc-crash-${token}`, state: 'uncertain' }
    const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'sdlc-op-'))
    const file = await open(path.join(directory, 'intent.json'), 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(record)); await file.sync() } finally { await file.close() }
    const dir = await open(directory, 'r')
    try { await dir.sync() } finally { await dir.close() }
    let id
    if (action === 'start') { id = (await docker(createArgs(record.name))).stdout.trim(); assert.match(id, /^[a-f0-9]{64}$/) }
    const proxy = await pausedDockerProxy(path.join(directory, 'api.sock'), { action, phase, id, name: record.name })
    const controller = ownedChild(process.execPath, ['-e', `process.send({action:${JSON.stringify(action)}}); setInterval(()=>{},1000)`], true)
    let client, proxyClosed = false, recovered = false
    try {
      await bounded(new Promise((resolve, reject) => {
        controller.child.once('message', message => message.action === action ? resolve() : reject(new Error('Unexpected controller request.')))
        controller.closure.then(() => reject(new Error('Controller closed before request.')), reject)
      }))
      client = ownedChild('docker', ['--host', `unix://${path.join(directory, 'api.sock')}`, ...(action === 'create' ? createArgs(record.name) : ['start', id])])
      await bounded(proxy.reached)
      assert.equal(client.isClosed(), false, 'Operation client must be pending at controller death.')
      const signal = action === 'create' ? 'SIGKILL' : 'SIGTERM'
      assert.equal((await controller.stop(signal)).signal, signal)
      const before = (await docker(['ps', '--all', '--quiet', '--filter', `name=^/${record.name}$`])).stdout.trim()
      if (action === 'create' && phase === 'request') assert.equal(before, '')
      // An empty inventory here must not be used as termination proof.
      await assert.rejects(reconcileAfterDrain(record, token, docker, { controllerClosed: true, operationClientsClosed: false, proxyClosed: false }))
      proxy.release()
      assert.equal((await bounded(client.closure)).code, 0)
      assert.equal(proxy.stats().forwarded, 1)
      let liveTree = false
      if (action === 'start') {
        for (let attempt = 0; attempt < 20; attempt++) {
          if ((await docker(['top', id, '-eo', 'pid,ppid,comm'])).stdout.trim().split('\n').length >= 4) { liveTree = true; break }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        assert.ok(liveTree, 'Late start did not produce the expected live process tree.')
      }
      await bounded(proxy.close()); proxyClosed = true
      const result = await reconcileAfterDrain(record, token, docker, { controllerClosed: controller.isClosed(), operationClientsClosed: client.isClosed(), proxyClosed })
      assert.deepEqual(result, { containerAbsent: true, retryAuthorized: false })
      recovered = true
      evidence.cases.push({ action, phase, signal, operationPendingAtDeath: true, prematureRecoveryDenied: true, emptyInventoryBeforeLateCreate: action === 'create' && phase === 'request', operationDrained: true, liveTree, containerAbsent: true, retryAuthorized: false })
    } finally {
      await controller.stop()
      if (client) await client.stop()
      if (!proxyClosed) { await bounded(proxy.close()); proxyClosed = true }
      if (!recovered) await reconcileAfterDrain(record, token, docker, { controllerClosed: controller.isClosed(), operationClientsClosed: !client || client.isClosed(), proxyClosed })
    }
  }
  evidence.qualified = evidence.cases.length === 4
} catch {
  evidence.failure = 'Pending-operation qualification failed; execution and retries remain disabled.'
  console.log('::error::Pending-operation qualification failed.')
  process.exitCode = 1
} finally {
  await mkdir('docs/evidence/verifier', { recursive: true })
  await writeFile('docs/evidence/verifier/operation-qualification.json', JSON.stringify(evidence, null, 2))
  const summary = JSON.stringify(evidence)
  assert.ok(Buffer.byteLength(summary) < 4000)
  console.log(`::notice title=Trusted operation drain summary::${summary}`)
}
