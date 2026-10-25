// Root-only confinement probe. Only the pinned native client uses its existing
// login for metadata; this controller never reads/exports native authentication.
// No model call, execution policy activation or attempt refund.
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer, connect } from 'node:net'
import { createReadStream } from 'node:fs'
import { chown, readFile, unlink, writeFile } from 'node:fs/promises'
import { nativeUnitProperties } from './systemd-attempt-guardian.mjs'
import { boundedJsonChannel } from './bounded-json-channel.mjs'
import { trustedHostFile } from './trusted-host-files.mjs'
import { digest } from '../src/sdlc/contracts'
import { fenceUnlaunchedAttempt } from './unlaunched-fence.mjs'

const node = '/opt/aisdlc-node/24.14.0/node', base = '/opt/aisdlc-codex/guarded'
const env = { PATH: '/usr/bin:/bin', HOME: '/root', LANG: 'C', NODE_ENV: 'production' }
assert.equal(process.platform, 'linux'); assert.equal(process.getuid(), 0); assert.equal(process.execPath, node)
assert.equal(process.argv.length, 2); assert.equal((await readFile('/proc/1/comm', 'utf8')).trim(), 'systemd')
const exec = promisify(execFile), units = [], files = [], reports = []
const token = randomUUID(), canaries = ['/var/lib', '/home', '/run'].map(folder => `${folder}/aisdlc-native-qualification-${token}`)
const own = `/var/lib/aisdlc-codex-broker/.codex/qualification-${token}`
const probe = `${base}/qualification-${token}.mjs`
const properties = nativeUnitProperties.flatMap(value => ['--property', value])
const uid = Number((await exec('/usr/bin/id', ['-u', 'aisdlc-broker'], { env })).stdout)
const gid = Number((await exec('/usr/bin/id', ['-g', 'aisdlc-broker'], { env })).stdout)
assert.ok(Number.isInteger(uid) && uid > 0)
const create = async (file, data, mode = 0o644) => { await writeFile(file, data, { flag: 'wx', mode }); files.push(file) }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const running = async pid => {
  try { return !['Z', 'X'].includes((await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ')[1].split(' ')[0]) }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const connection = (host, port) => new Promise(resolve => {
  const socket = connect(port, host), timer = setTimeout(() => { socket.destroy(); resolve(false) }, 1500)
  socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
  socket.once('error', () => { clearTimeout(timer); resolve(false) })
})
const listener = createServer(socket => { socket.on('error', () => {}); socket.end() })
try {
  const installed = JSON.parse((await trustedHostFile(`${base}/installed-runtime.json`)).toString())
  assert.equal(installed.role, 'client')
  for (const canary of canaries) await create(canary, 'synthetic-host-data')
  await create(own, 'synthetic-broker-data', 0o600); await chown(own, uid, gid)
  await exec('/usr/bin/setpriv', [`--reuid=${uid}`, `--regid=${gid}`, '--clear-groups', '/usr/bin/cat', ...canaries], { env })
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  assert.equal(await connection('127.0.0.1', port), true)
  // Connectivity only: no IMDS request or identity credential is fetched.
  assert.equal(await connection('169.254.169.254', 80), true)
  await create(probe, `
import {readFileSync} from 'node:fs';import {connect} from 'node:net';import {spawn} from 'node:child_process';
process.on('SIGTERM',()=>{});setInterval(()=>{},1000);
const r=JSON.parse(process.argv[2]);
const denied=r.canaries.map(file=>{try{readFileSync(file);return false}catch{return true}});
const own=readFileSync(r.own,'utf8')==='synthetic-broker-data';
const dnsReadable=readFileSync('/etc/resolv.conf','utf8').includes('nameserver ');
const blocked=host=>new Promise(resolve=>{const s=connect(host==='127.0.0.1'?r.port:80,host);const t=setTimeout(()=>{s.destroy();resolve(true)},700);s.once('connect',()=>{clearTimeout(t);s.destroy();resolve(false)});s.once('error',()=>{clearTimeout(t);resolve(true)})});
const network=await Promise.all(['127.0.0.1','169.254.169.254'].map(blocked));
const child=spawn('/usr/bin/python3',['-c','import os,signal,time,json;signal.signal(signal.SIGTERM,signal.SIG_IGN);child=os.fork();os.setsid() if child==0 else None;print(json.dumps([os.getpid(),child]),flush=True) if child else None;time.sleep(60)'],{detached:true,stdio:['ignore','pipe','ignore']});
child.stdout.once('data',bytes=>process.stdout.write(JSON.stringify({uid:process.getuid(),denied,own,dnsReadable,network,pids:JSON.parse(bytes.toString())})+'\\n'));
`)
  for (const scenario of ['explicit-stop', 'controller-disconnect']) {
    const unit = `aisdlc-qualification-${randomUUID()}.service`; units.push(unit)
    const child = spawn('/usr/bin/systemd-run', ['--quiet', '--unit', unit, '--wait', '--pipe', ...properties,
      '--property', 'RuntimeMaxSec=12s', '--working-directory=/opt/aisdlc-codex/workspace',
      node, '--jitless', probe, JSON.stringify({ canaries, own, port })], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.on('error', () => {}); child.stderr.resume()
    const closed = new Promise(resolve => child.once('close', resolve)), channel = boundedJsonChannel(child.stdout)
    try {
      const observed = await channel.read(Date.now() + 8000)
      assert.equal(observed.uid, uid); assert.deepEqual(observed.denied, [true, true, true]); assert.equal(observed.own, true)
      assert.equal(observed.dnsReadable, true)
      assert.deepEqual(observed.network, [true, true])
      assert.ok(observed.pids.length === 2 && observed.pids.every(pid => Number.isInteger(pid) && pid > 1))
      const controlGroup = (await exec('/usr/bin/systemctl', ['show', unit, '--property=ControlGroup', '--value'], { env })).stdout.trim()
      assert.equal(controlGroup, `/system.slice/${unit}`)
      if (scenario === 'explicit-stop') await exec('/usr/bin/systemctl', ['stop', unit], { env, timeout: 6000 })
      else child.kill('SIGKILL')
      await closed
      const until = Date.now() + 18000
      while (Date.now() < until && (await Promise.all(observed.pids.map(running))).some(Boolean)) await pause(100)
      for (const pid of observed.pids) assert.equal(await running(pid), false)
      const state = (await exec('/usr/bin/systemctl', ['show', unit, '--property=ActiveState', '--value'], { env })).stdout.trim()
      assert.ok(['inactive', 'failed'].includes(state))
      try { assert.doesNotMatch(await readFile(`/sys/fs/cgroup${controlGroup}/cgroup.events`, 'utf8'), /(?:^|\n)populated 1(?:\n|$)/) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      reports.push({ scenario, hostCanariesHidden: true, brokerSyntheticDataReadable: true, loopbackBlocked: true,
        metadataBlocked: true, detachedDescendantsStopped: true, cgroupEmpty: true })
    } finally { channel.dispose(); child.stdin.end(); if (child.exitCode === null) child.kill('SIGKILL') }
  }
  // Native account/config/catalog/thread metadata under the exact confinement.
  // This cannot send turn/start and therefore cannot start model generation.
  const metadataUnit = `aisdlc-qualification-${randomUUID()}.service`; units.push(metadataUnit)
  const metadataProcess = spawn('/usr/bin/systemd-run', ['--quiet', '--unit', metadataUnit, '--wait', '--pipe', ...properties,
    '--property', 'RuntimeMaxSec=40s', '--working-directory=/opt/aisdlc-codex/workspace', '/usr/bin/python3', `${base}/metadata-preflight.py`],
    { env, stdio: ['ignore', 'pipe', 'pipe'] })
  metadataProcess.stderr.resume()
  const metadataClosed = new Promise(resolve => metadataProcess.once('close', resolve)), metadataChannel = boundedJsonChannel(metadataProcess.stdout)
  let nativeMetadata
  try {
    nativeMetadata = await metadataChannel.read(Date.now() + 35000)
    assert.equal(nativeMetadata.metadataOnly, true); assert.equal(nativeMetadata.realModelCalls, 0)
    assert.equal(nativeMetadata.threadPolicyChecked, true)
    await exec('/usr/bin/systemctl', ['stop', metadataUnit], { env, timeout: 6000 })
    const timer = setTimeout(() => metadataProcess.kill('SIGKILL'), 5000)
    try { await metadataClosed } finally { clearTimeout(timer) }
  } finally { metadataChannel.dispose(); if (metadataProcess.exitCode === null) metadataProcess.kill('SIGKILL') }
  const hashes = {}
  const fenceInput = { attemptId: randomUUID(), taskKey: digest('synthetic-qualification'), reservationHash: digest(token),
    runtimeHash: digest('synthetic-runtime'), hostId: (await readFile('/sys/class/dmi/id/product_uuid', 'utf8')).trim().toLowerCase(),
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(), deadline: Math.floor(Date.now() / 1000) - 1 }
  const fenced = { ...fenceInput, unit: `aisdlc-attempt-${fenceInput.attemptId}.service` }
  assert.deepEqual(await fenceUnlaunchedAttempt(fenced), { rootExited: true, cgroupEmpty: true, launchWritersDrained: true })
  await assert.rejects(fenceUnlaunchedAttempt(fenced))
  const claimedId = randomUUID()
  await writeFile(`/var/lib/aisdlc-guardian/journal/${claimedId}.jsonl`, JSON.stringify({ phase: 'synthetic-launch-claimed' }) + '\n', { flag: 'wx', mode: 0o600 })
  await assert.rejects(fenceUnlaunchedAttempt({ ...fenced, attemptId: claimedId, unit: `aisdlc-attempt-${claimedId}.service` }))
  for (const [name, file] of Object.entries({ nodeHash: node, codexHash: '/opt/aisdlc-codex/0.155.1/codex',
    configHash: '/var/lib/aisdlc-codex-broker/.codex/config.toml',
    brokerHash: `${base}/broker.mjs`, guardianHash: `${base}/guardian.mjs`, qualificationBundleHash: `${base}/qualify-host.mjs` })) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); hashes[name] = hash.digest('hex')
  }
  assert.equal(hashes.brokerHash, installed.files['broker.mjs']); assert.equal(hashes.guardianHash, installed.files['guardian.mjs'])
  assert.equal(hashes.qualificationBundleHash, installed.files['qualify-host.mjs'])
  const privateKey = createPrivateKey(await trustedHostFile('/var/lib/aisdlc-guardian/signing-key.pem', { maximumBytes: 4096, privateMode: true }))
  const publicKeyDer = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64')
  const record = { version: 1, kind: 'private-client-profile', observedAt: Math.floor(Date.now() / 1000),
    hostId: (await readFile('/sys/class/dmi/id/product_uuid', 'utf8')).trim().toLowerCase(),
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(), manifestHash: installed.manifestHash,
    profileHash: digest(nativeUnitProperties), hashes, publicKeyDer, reports, nativeMetadata,
    unlaunchedRecovery: { fencedAbsentUnit: true, duplicateFenceDenied: true, existingLaunchClaimDenied: true, realModelCalls: 0 },
    nativeAuthenticationUsedForMetadata: true, nativeAuthenticationExported: false, modelCalls: 0, executionAllowed: false }
  console.log(JSON.stringify({ record, signature: sign(null, Buffer.from('ai-sdlc/private-client-profile/v1\n' + digest(record)), privateKey).toString('base64') }))
} finally {
  for (const unit of units) {
    try { await exec('/usr/bin/systemctl', ['stop', unit], { env, timeout: 10000 }) } catch { /* Failed qualification grants nothing. */ }
    try { await exec('/usr/bin/systemctl', ['reset-failed', unit], { env }) } catch { /* No unit may remain. */ }
  }
  await new Promise(resolve => listener.close(resolve))
  for (const file of files.reverse()) await unlink(file)
}
