// Trusted local operator only. Public files over pinned native SSH; no private
// authentication/signing file is opened or transferred by this controller.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeSshBinary, nativeSshEnvironment } from '../src/sdlc/native-transport.ts'

const exec = promisify(execFile), root = path.resolve('.local')
const [packageDirectory, packetDirectory] = process.argv.slice(2).map(value => path.resolve(value))
if (process.argv.length !== 4 || !packageDirectory.startsWith(root + path.sep + 'native-runtime' + path.sep + 'package-')
  || !packetDirectory.startsWith(root + path.sep + 'native-deployment' + path.sep + 'packet-')
  || await realpath(packageDirectory) !== packageDirectory || await realpath(packetDirectory) !== packetDirectory) throw new Error('Select a prepared public package and plan.')
const manifestBytes = await readFile(path.join(packageDirectory, 'manifest.json')), manifest = JSON.parse(manifestBytes)
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex')
if (manifest.nativeRuntimeQualified !== false || manifest.executionAllowed !== false) throw new Error('Invalid unactivated package.')
const plan = JSON.parse(await readFile(path.join(packetDirectory, 'plan.json'), 'utf8'))
const window = JSON.parse(await readFile('.local/azure-trial-window-2026-10-25.json', 'utf8'))
if (window.mode !== 'protected-trial' || window.additionalChargesAllowed !== false || window.trialCreditsOnly !== true
  || window.subscriptionId !== 'b7c13fa8-f215-42a7-b04b-b48e78f1ba72' || window.expiresAt * 1000 <= Date.now()
  || window.expiresAt - window.issuedAt > 172800 || window.planningCeilingUsd !== 10) throw new Error('Current authorized protected trial required.')
const common = ['-F', 'none', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
  '-o', `UserKnownHostsFile=${path.resolve('.local/azure-trial-known-hosts').replaceAll('\\', '/')}`, '-o', 'GlobalKnownHostsFile=none',
  '-o', 'IdentitiesOnly=yes', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no',
  '-o', 'ConnectTimeout=10', '-o', 'LogLevel=ERROR', '-i', path.resolve('.local/azure-trial-key')]
const hosts = { client: '20.53.249.58', tools: '20.213.88.10' }
const ssh = async (role, command, input = '', timeout = 90000) => {
  const operation = exec(nativeSshBinary(), [...common, '-T', `trialadmin@${hosts[role]}`, command], {
    env: nativeSshEnvironment(), encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 262144,
  })
  operation.child.stdin.on('error', () => {}); operation.child.stdin.end(input)
  return (await operation).stdout
}
const scp = process.platform === 'win32' ? path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32/OpenSSH/scp.exe') : '/usr/bin/scp'
const stage = path.join(packetDirectory, 'private-' + randomUUID()); await mkdir(stage, { mode: 0o700 })
const save = (name, data) => writeFile(path.join(stage, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const folder = `/home/trialadmin/native-package-${manifestHash.slice(0, 20)}`
let phase = 'public-package-validation'
try {
  for (const entry of manifest.files) {
    if (!/^[a-z-]+\.(?:mjs|sh|py)$/.test(entry.name)) throw new Error('Unexpected package path.')
    const file = path.join(packageDirectory, entry.name), stat = await lstat(file), data = await readFile(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || data.length !== entry.bytes
      || createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error('Public package changed.')
  }
  for (const role of ['client', 'tools']) {
    phase = `${role}-public-install`
    await ssh(role, `mkdir -m 700 ${folder}`)
    await exec(scp, [...common, '-q', ...[...manifest.files.map(entry => entry.name), 'manifest.json'].map(name => path.join(packageDirectory, name)),
      `trialadmin@${hosts[role]}:${folder}/`], { env: nativeSshEnvironment(), windowsHide: true, timeout: 90000, maxBuffer: 16384 })
    const installed = await ssh(role, `sudo -n python3 - ${role} ${folder} ${manifestHash}`,
      await readFile(path.join(packageDirectory, 'install-runtime.py')), 240000)
    await save(`${role}-install.jsonl`, installed)
  }
  phase = 'public-policy-preparation'
  const policyText = await readFile(path.join(packetDirectory, 'taskboard-policy.json'), 'utf8')
  if (createHash('sha256').update(policyText).digest('hex') !== plan.eligibility.record.checkPolicyHash) throw new Error('Prepared policy changed.')
  const records = {
    '/opt/aisdlc-authority/taskboard-policy.json': policyText,
    '/opt/aisdlc-authority/qualification-input.json': JSON.stringify({ source: plan.source,
      sourceHash: plan.eligibility.record.sourceHash, checkPolicyHash: plan.eligibility.record.checkPolicyHash }),
  }
  const writer = values => `import {lstat,writeFile,rename} from 'node:fs/promises';
const values=JSON.parse(Buffer.from('${Buffer.from(JSON.stringify(values)).toString('base64')}','base64').toString());
for(const [file,text] of Object.entries(values)){
if(!['/opt/aisdlc-authority/taskboard-policy.json','/opt/aisdlc-authority/qualification-input.json','/opt/aisdlc-codex/trial-window.json'].includes(file))throw Error('Invalid path');
try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1)throw Error('Unsafe public policy')}catch(e){if(e.code!=='ENOENT')throw e;}
const temp=file+'.prepare-${randomUUID()}';await writeFile(temp,text,{flag:'wx',mode:0o644});await rename(temp,file);}
console.log(JSON.stringify({publicPoliciesPrepared:true,executionAllowed:false}));`
  await ssh('tools', 'sudo -n /opt/aisdlc-node/24.14.0/node --input-type=module -', writer(records))
  await ssh('client', 'sudo -n /opt/aisdlc-node/24.14.0/node --input-type=module -', writer({ '/opt/aisdlc-codex/trial-window.json': JSON.stringify(window) }))
  phase = 'public-anchor-export'
  for (const role of ['client', 'tools']) {
    const file = role === 'client' ? '/opt/aisdlc-codex/guarded/guardian-public-key.der' : '/opt/aisdlc-authority/root-public-key.der'
    const reply = await ssh(role, 'sudo -n /opt/aisdlc-node/24.14.0/node --input-type=module -',
      `import{readFile}from'node:fs/promises';console.log(JSON.stringify({publicKeyDer:(await readFile('${file}')).toString('base64')}));`)
    const publicData = JSON.parse(reply)
    if (!/^[A-Za-z0-9+/]{59}=$/.test(publicData.publicKeyDer)) throw new Error('Invalid public trust anchor.')
    await save(`${role}-public.json`, publicData)
  }
  phase = 'client-native-metadata'
  const metadata = await ssh('client', 'sudo -n -u aisdlc-broker python3 -', await readFile(path.join(packageDirectory, 'metadata-preflight.py')), 45000)
  await save('client-metadata.jsonl', metadata)
  const meta = JSON.parse(metadata.trim().split('\n').at(-1))
  if (meta.metadataOnly !== true || meta.authentication !== 'chatgpt' || meta.realModelCalls !== 0) throw new Error('Private native metadata denied.')
  phase = 'client-confinement-qualification'
  await save('client-qualification.json', JSON.parse(await ssh('client',
    'sudo -n /opt/aisdlc-node/24.14.0/node --jitless /opt/aisdlc-codex/guarded/qualify-host.mjs', '', 90000)))
  phase = 'tools-verifier-qualification'
  await save('tools-qualification.json', JSON.parse(await ssh('tools',
    'sudo -n -u aisdlc-authority /opt/aisdlc-node/24.14.0/node /opt/aisdlc-authority/qualify-tools.mjs', '', 90000)))
  await save('stage.json', { version: 1, packageDirectory, packetDirectory, manifestHash, preparedAt: new Date().toISOString(),
    nativeRuntimeQualified: false, executionAllowed: false, modelCalls: 0 })
  console.log(JSON.stringify({ stage, manifestHash, installed: true, qualificationEvidenceRetained: true, executionAllowed: false, modelCalls: 0 }))
} catch {
  await save('failure.json', { phase, executionAllowed: false, modelCalls: 0 }).catch(() => {})
  console.error(JSON.stringify({ stage, failedPhase: phase, executionAllowed: false, modelCalls: 0,
    message: 'Installation/qualification paused. No operation was retried and no native policy was activated.' }))
  process.exitCode = 1
}
