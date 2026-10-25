// Disposable GitHub Linux only. Ephemeral test roots; no authentication or model calls.
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { chmod, chown, copyFile, lstat, mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { turnPermitSigningBytes } from './turn-permit.mjs'
import { boundedJsonChannel } from './bounded-json-channel.mjs'

assert.equal(process.platform, 'linux'); assert.equal(process.getuid(), 0); assert.equal(process.env.GITHUB_ACTIONS, 'true')
const packageDirectory = process.argv[2], sourceNode = process.env.AISDLC_NODE_BINARY
assert.ok(path.isAbsolute(packageDirectory)); assert.ok(path.isAbsolute(sourceNode))
const exec = promisify(execFile), dirs = [], files = [], units = [], reports = []
const rootNode = '/opt/aisdlc-node/24.14.0/node', broker = '/opt/aisdlc-codex/guarded/broker.mjs'
const home = '/var/lib/aisdlc-codex-broker', journal = '/var/lib/aisdlc-guardian/journal'
const engineFile = '/opt/aisdlc-codex/guarded/engine-fixture.mjs'
const token = randomUUID(), canaries = ['/var/lib', '/home', '/run'].map(folder => `${folder}/aisdlc-guardian-canary-${token}`)
let accountCreated = false, listener, observer
const create = async (file, bytes, mode = 0o644) => { await writeFile(file, bytes, { flag: 'wx', mode }); files.push(file) }
const folder = async (file, mode = 0o755) => { await mkdir(file, { mode }); dirs.push(file) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const running = async pid => {
  try { return !['Z', 'X'].includes((await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ')[1].split(' ')[0]) }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
try {
  for (const top of ['/opt/aisdlc-node', '/opt/aisdlc-codex', '/var/lib/aisdlc-guardian', home]) {
    await assert.rejects(lstat(top), { code: 'ENOENT' })
  }
  await assert.rejects(exec('/usr/bin/id', ['aisdlc-broker']))
  assert.equal((await exec(sourceNode, ['--version'])).stdout.trim(), 'v24.14.0')
  await exec('/usr/sbin/useradd', ['--system', '--user-group', '--home-dir', home, '--shell', '/usr/sbin/nologin', 'aisdlc-broker'])
  accountCreated = true
  const uid = Number((await exec('/usr/bin/id', ['-u', 'aisdlc-broker'])).stdout), gid = Number((await exec('/usr/bin/id', ['-g', 'aisdlc-broker'])).stdout)
  for (const directory of ['/opt/aisdlc-node', '/opt/aisdlc-node/24.14.0', '/opt/aisdlc-codex', '/opt/aisdlc-codex/guarded', '/opt/aisdlc-codex/workspace']) await folder(directory)
  await folder('/var/lib/aisdlc-guardian', 0o700); await folder(journal, 0o700)
  await folder(home, 0o700); await folder(home + '/.codex', 0o700)
  await chown(home, uid, gid); await chown(home + '/.codex', uid, gid)
  await create(home + '/.codex/synthetic-control', 'synthetic-public-broker-data', 0o600)
  await chown(home + '/.codex/synthetic-control', uid, gid)
  for (const canary of canaries) await create(canary, 'synthetic-host-canary')
  await exec('/usr/bin/setpriv', [`--reuid=${uid}`, `--regid=${gid}`, '--clear-groups', '/usr/bin/cat', ...canaries])
  await copyFile(sourceNode, rootNode); files.push(rootNode); await chown(rootNode, 0, 0); await chmod(rootNode, 0o755)
  const installedNode = await lstat(rootNode)
  assert.equal(installedNode.uid, 0); assert.equal(installedNode.nlink, 1); assert.equal(installedNode.mode & 0o022, 0)
  await copyFile(path.join(packageDirectory, 'guardian-engine.mjs'), engineFile); files.push(engineFile)
  const engine = await import(pathToFileURL(engineFile).href)
  listener = createServer(socket => { socket.on('error', () => {}); socket.end() })
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await exec('/usr/bin/setpriv', [`--reuid=${uid}`, `--regid=${gid}`, '--clear-groups', rootNode, '-e',
    'const s=require("node:net").connect(Number(process.argv[1]),"127.0.0.1");s.on("connect",()=>{s.destroy();process.exit(0)});s.on("error",()=>process.exit(1));setTimeout(()=>process.exit(1),1000)', String(port)])
  await create(broker, `
import { spawn } from 'node:child_process'; import { readFileSync } from 'node:fs'; import { connect } from 'node:net';
process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);
let pending=''; process.stdin.on('data', async chunk => {
  pending += chunk; if (!pending.includes('\\n')) return; const task=JSON.parse(pending.split('\\n')[0]); process.stdin.removeAllListeners('data');
  const denied=task.canaries.map(file=>{try{readFileSync(file);return false}catch{return true}});
  const brokerData=readFileSync('${home}/.codex/synthetic-control','utf8')==='synthetic-public-broker-data';
  const networkDenied=await new Promise(resolve=>{const s=connect(task.port,'127.0.0.1'); const t=setTimeout(()=>{s.destroy();resolve(true)},500); s.on('error',()=>{clearTimeout(t);resolve(true)});s.on('connect',()=>{clearTimeout(t);s.destroy();resolve(false)})});
  const rogue=spawn('/usr/bin/python3',['-c','import os,signal,time,json;signal.signal(signal.SIGTERM,signal.SIG_IGN);child=os.fork();os.setsid() if child==0 else None;print(json.dumps([os.getpid(),child]),flush=True) if child else None;time.sleep(60)'],{detached:true,stdio:['ignore','pipe','ignore']});
  rogue.stdout.once('data', bytes=>{const pids=JSON.parse(bytes.toString());process.stdout.write(JSON.stringify({kind:'fixture-ready',uid:process.getuid(),denied,brokerData,networkDenied,pids})+'\\n')});
});
`)
  const keys = generateKeyPairSync('ed25519'), bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  const hash = text => createHash('sha256').update(text).digest('hex')
  const policy = { publicKey: keys.publicKey, nativeRuntimeQualified: true, keyId: 'ephemeral-qualification', authorityRevision: 1,
    taskKey: hash('synthetic-task'), scopeHash: hash('synthetic-scope'), approvalHash: hash('synthetic-approvals'), runtimeHash: hash('synthetic-runtime'), expiresAt: Math.floor(Date.now() / 1000) + 600 }
  const ticket = (seconds = 30) => {
    const attemptId = randomUUID(), challengeNonce = randomUUID(), hostId = randomUUID(), issuedAt = Math.floor(Date.now() / 1000)
    const lease = { version: 1, kind: 'launch', keyId: policy.keyId, authorityRevision: 1, taskKey: policy.taskKey, scopeHash: policy.scopeHash,
      approvalHash: policy.approvalHash, runtimeHash: policy.runtimeHash, reservationHash: hash('synthetic-reservation'), attemptId, attempt: 1, fence: 1,
      hostId, bootId, unit: `aisdlc-attempt-${attemptId}.service`, challengeNonce, threadId: null, admissionId: attemptId,
      issuedAt, expiresAt: issuedAt + Math.min(seconds, 15), deadline: issuedAt + seconds, model: 'gpt-6-sol', maxTurns: 1, subscriptionOnly: true, additionalChargesAllowed: false }
    units.push(lease.unit); files.push(`${journal}/${attemptId}.jsonl`)
    return { envelope: { lease, signature: sign(null, turnPermitSigningBytes(lease), keys.privateKey).toString('base64') },
      context: { policy, hostId, bootId, kind: 'launch', challengeNonce }, task: { canaries, port } }
  }
  const successful = ticket(), work = await engine.launchGuardedAttempt(successful.envelope, successful.context, { diagnostic: chunk => {
    console.error('::notice title=Credential-free guardian launcher::' + chunk.toString('utf8').slice(0, 2000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
  } })
  work.send(successful.task)
  const observed = await work.read(Date.now() + 10000)
  assert.equal(observed.uid, uid); assert.deepEqual(observed.denied, [true, true, true]); assert.equal(observed.brokerData, true); assert.equal(observed.networkDenied, true)
  assert.ok(observed.pids.every(pid => Number.isInteger(pid) && pid > 1))
  assert.deepEqual(await work.stop(), { rootExited: true, cgroupEmpty: true, launchWritersDrained: true })
  for (const pid of observed.pids) assert.equal(await running(pid), false)
  await assert.rejects(engine.launchGuardedAttempt(successful.envelope, successful.context))
  reports.push('Actual fixed unit hides readable host canaries, retains only broker data, blocks host loopback, and drains detached TERM-ignoring descendants; duplicate launch denied')

  const lost = ticket(12), requestFile = '/opt/aisdlc-codex/guarded/loss-request.json', workerFile = '/opt/aisdlc-codex/guarded/loss-worker.mjs'
  await create(requestFile, JSON.stringify({ ...lost, context: { ...lost.context, policy: { ...policy, publicKey: undefined, publicKeyDer: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') } } }))
  await create(workerFile, `import {readFileSync} from 'node:fs';import {createPublicKey} from 'node:crypto';import {launchGuardedAttempt} from './engine-fixture.mjs';const r=JSON.parse(readFileSync('${requestFile}','utf8'));r.context.policy.publicKey=createPublicKey({key:Buffer.from(r.context.policy.publicKeyDer,'base64'),type:'spki',format:'der'});const w=await launchGuardedAttempt(r.envelope,r.context);w.send(r.task);console.log(JSON.stringify(await w.read(Date.now()+10000)));setInterval(()=>{},1000);`)
  observer = spawn(rootNode, [workerFile], { stdio: ['ignore', 'pipe', 'pipe'] })
  const channel = boundedJsonChannel(observer.stdout)
  const observerClosed = new Promise(resolve => observer.once('close', resolve)); observer.stderr.resume()
  const detached = await channel.read(Date.now() + 15000)
  observer.kill('SIGKILL'); await observerClosed; channel.dispose()
  await assert.rejects(engine.launchGuardedAttempt(lost.envelope, lost.context))
  const until = Date.now() + 20000
  while (Date.now() < until && (await Promise.all(detached.pids.map(running))).some(Boolean)) await pause(100)
  for (const pid of detached.pids) assert.equal(await running(pid), false)
  const active = (await exec('/usr/bin/systemctl', ['show', lost.envelope.lease.unit, '--property=ActiveState', '--value'])).stdout.trim()
  assert.ok(['inactive', 'failed'].includes(active))
  reports.push('Killed outer observer cannot relaunch the spent journal; fixed service deadline stops descendants without returning a cleanup certificate or retry permission')
  console.log(JSON.stringify({ nativeGuardianQualifiedSynthetically: true, realModelCalls: 0, credentialsUsed: false, actualHumanApprovals: 0,
    nativeRuntimeQualified: false, executionAllowed: false, reports }))
} catch (error) {
  for (const unit of units) {
    try {
      const status = await exec('/usr/bin/systemctl', ['show', unit, '--property=LoadState,ActiveState,SubState,Result,ExecMainCode,ExecMainStatus'])
      console.error('::notice title=Credential-free guardian unit::' + status.stdout.trim().replaceAll('\n', ';'))
      const log = await exec('/usr/bin/journalctl', ['--unit', unit, '--no-pager', '-n', '8', '-o', 'cat'], { timeout: 5000, maxBuffer: 16384 })
      console.error('::notice title=Credential-free guardian fixture::' + log.stdout.slice(0, 2000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
    } catch { /* Unit might never have been created. */ }
  }
  console.error('::error title=Synthetic guardian qualification::' + String(error.message).slice(0, 2000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
  throw error
} finally {
  if (observer && observer.exitCode === null) observer.kill('SIGKILL')
  for (const unit of units) {
    try { await exec('/usr/bin/systemctl', ['stop', unit], { timeout: 10000 }) } catch { /* Disposable host; keep failure visible. */ }
    try { await exec('/usr/bin/systemctl', ['reset-failed', unit]) } catch { /* Unit may already be inactive. */ }
  }
  if (listener) await new Promise(resolve => listener.close(resolve))
  for (const file of files.reverse()) { try { await unlink(file) } catch (error) { if (error.code !== 'ENOENT') throw error } }
  for (const directory of dirs.reverse()) await rmdir(directory)
  if (accountCreated) await exec('/usr/sbin/userdel', ['--force', 'aisdlc-broker'])
}
