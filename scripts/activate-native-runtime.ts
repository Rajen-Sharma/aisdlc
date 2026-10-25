// Trusted operator only. Activation requires actual private-host signed probes,
// current human scope gates, exact clean source package and successful source CI.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { withExecutionEligibility } from '../src/sdlc/task-coordinator'
import { buildNativePolicies } from '../src/sdlc/native-policy'
import { nativeAuthorityCall, nativeSshArguments, nativeSshBinary, nativeSshEnvironment } from '../src/sdlc/native-transport'
import type { NativeExecutorConfiguration } from '../src/sdlc/native-transport'

if (process.argv.length !== 3) throw new Error('Select the completed private qualification stage.')
const stageDirectory = path.resolve(process.argv[2])
if (!stageDirectory.startsWith(path.resolve('.local/native-deployment') + path.sep)) throw new Error('Invalid qualification stage.')
const read = async (file: string) => {
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 262144) throw new Error('Qualification evidence unavailable.')
  return JSON.parse(await readFile(file, 'utf8'))
}
const stage = await read(path.join(stageDirectory, 'stage.json'))
const manifest = await read(path.join(stage.packageDirectory, 'manifest.json'))
const manifestHash = createHash('sha256').update(await readFile(path.join(stage.packageDirectory, 'manifest.json'))).digest('hex')
if (stage.manifestHash !== manifestHash || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision)) throw new Error('Qualified package changed.')
const response = await fetch(`https://api.github.com/repos/Rajen-Sharma/aisdlc/actions/workflows/verify.yml/runs?head_sha=${manifest.sourceRevision}&per_page=5`,
  { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aisdlc-native-activation' }, signal: AbortSignal.timeout(10000) })
if (!response.ok) throw new Error('Current CI evidence unavailable.')
const runs = await response.json() as any
const ci = runs.workflow_runs?.find((run: any) => run.head_sha === manifest.sourceRevision && run.status === 'completed' && run.conclusion === 'success')
if (!ci) throw new Error('Successful full source CI required before activation.')
const plan = await read(path.join(stage.packetDirectory, 'plan.json'))
const [window, client, tools, clientPublic, toolsPublic] = await Promise.all([
  read(path.resolve('.local/azure-trial-window-2026-10-25.json')), read(path.join(stageDirectory, 'client-qualification.json')),
  read(path.join(stageDirectory, 'tools-qualification.json')), read(path.join(stageDirectory, 'client-public.json')), read(path.join(stageDirectory, 'tools-public.json')),
])
const metadataText = await readFile(path.join(stageDirectory, 'client-metadata.jsonl'), 'utf8')
if (Buffer.byteLength(metadataText) > 16384) throw new Error('Metadata evidence exceeds bound.')
const metadata = JSON.parse(metadataText.trim().split('\n').at(-1)!)
const exec = promisify(execFile)
async function remote(executor: NativeExecutorConfiguration, role: 'client' | 'authority', command: string, input = '') {
  const args = nativeSshArguments(executor, role), end = args.findIndex(arg => arg.startsWith('trialadmin@'))
  if (end < 0) throw new Error('Invalid pinned SSH transport.')
  const operation = exec(nativeSshBinary(), [...args.slice(0, end + 1), command], { env: nativeSshEnvironment(),
    windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 262144 })
  operation.child.stdin!.on('error', () => {}); operation.child.stdin!.end(input)
  return operation
}
const payload = await getPayload({ config })
try {
  const activation = await withExecutionEligibility(payload, plan.storyId, async current => {
    const policies = buildNativePolicies({ plan, snapshot: await current(), manifest, manifestHash, window, client, tools,
      clientPublicKeyDer: clientPublic.publicKeyDer, authorityPublicKeyDer: toolsPublic.publicKeyDer, metadata,
      ci: { conclusion: ci.conclusion, head_sha: ci.head_sha, status: ci.status, path: ci.path }, now: Math.floor(Date.now() / 1000) })
    const writer = (file: string, value: unknown) => `import {lstat,writeFile,rename} from 'node:fs/promises';
const file='${file}';if(!['/opt/aisdlc-codex/guarded/policy.json','/opt/aisdlc-authority/native-policy.json'].includes(file))throw Error('Invalid policy path');
try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1)throw Error('Unsafe public policy')}catch(e){if(e.code!=='ENOENT')throw e;}
const temp=file+'.activate-${randomUUID()}';await writeFile(temp,Buffer.from('${Buffer.from(JSON.stringify(value)).toString('base64')}','base64'),{flag:'wx',mode:0o644});await rename(temp,file);
console.log(JSON.stringify({qualifiedPolicyInstalled:true,modelCalls:0}));`
    const command = 'sudo -n /opt/aisdlc-node/24.14.0/node --input-type=module -'
    await remote(policies.executor, 'client', command, writer('/opt/aisdlc-codex/guarded/policy.json', policies.clientPolicy))
    await remote(policies.executor, 'authority', command, writer('/opt/aisdlc-authority/native-policy.json', policies.authorityPolicy))
    // Actual current external state must remain readable under the pinned anchor.
    let external = await nativeAuthorityCall(policies.executor, 'inspect', null)
    if (external.executionAllowed !== false || external.retryAuthorized !== false || (external.task && external.task.policy.scopeHash !== policies.executor.scopeHash && !external.task.revoked)) throw new Error('External authority requires reconciliation.')
    let helloText = ''
    try {
      const op = exec(nativeSshBinary(), nativeSshArguments(policies.executor, 'client'), {
        env: nativeSshEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 262144 })
      op.child.stdin!.on('error', () => {}); op.child.stdin!.end(); helloText = (await op).stdout
    } catch (error) { helloText = (error as { stdout?: string }).stdout || '' }
    const hello = JSON.parse(helloText.trim().split('\n')[0])
    if (hello.kind !== 'hello' || hello.hostId !== policies.clientPolicy.hostId || hello.bootId !== policies.clientPolicy.qualifiedBootId
      || hello.runtimeHash !== policies.executor.runtimeHash) throw new Error('Guardian policy preflight failed.')
    if (external.task && !external.task.revoked && external.task.policy.runtimeHash !== policies.executor.runtimeHash) {
      await nativeAuthorityCall(policies.executor, 'requalify', null, await current())
      external = await nativeAuthorityCall(policies.executor, 'inspect', null)
      if (external.task?.policy.runtimeHash !== policies.executor.runtimeHash) throw new Error('Runtime requalification was not retained.')
    }
    await current() // Recheck human actor and scope immediately before local activation.
    const file = path.resolve('.local/native-executor.json'), temporary = file + `.activate-${randomUUID()}`
    await writeFile(temporary, JSON.stringify(policies.executor, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, file)
    return { version: 1, activatedAt: new Date().toISOString(), manifestHash, sourceRevision: manifest.sourceRevision,
      ciRunId: ci.id, storyId: plan.storyId, scopeHash: policies.executor.scopeHash, runtimeHash: policies.executor.runtimeHash,
      attemptAccounting: external.accounting, nativeRuntimeQualified: true, modelCalls: 0, humanArtifactApprovals: 0 }
  })
  await writeFile(path.join(stageDirectory, `activation-${randomUUID()}.json`), JSON.stringify(activation, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify(activation))
} finally { await payload.destroy() }
process.exit(0)
