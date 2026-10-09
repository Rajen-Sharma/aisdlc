// Trusted qualification controller. Never imports or evaluates candidate source on host.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, readFile, chmod, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { exportSourceCapsule, validateSourceCapsule } from '../src/sdlc/source-capsule.ts'

const exec = promisify(execFile)
const image = 'node@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8'
const hash = value => createHash('sha256').update(value).digest('hex')
const cases = [{ input: 'alpha', expected: 'alpha' }, { input: 17, expected: 17 }, { input: { nested: [false, null] }, expected: { nested: [false, null] } }]
const variants = [
  ['positive-control', 'export default x => x', true],
  ['wrong-result', 'export default () => null', false],
  ['early-success-exit', 'process.exit(0)', false],
  ['forged-success', 'console.log(JSON.stringify({passed:true,count:3})); process.exit(0)', false],
  ['output-flood', 'while(true) console.log("x".repeat(8192))', false],
  ['cpu-runaway', 'while(true) {}', false],
  ['grandchild-runaway', `import {spawn} from 'node:child_process'; spawn(process.execPath,['-e', 'require("node:child_process").spawn(process.execPath,["-e","while(true) {}"],{stdio:"ignore"}); while(true) {}'],{stdio:'ignore'}); while(true) {}`, false],
  ['protected-write', `import fs from 'node:fs'; fs.writeFileSync('/source/src/candidate.mjs','export default x=>x'); export default x=>x`, false],
  ['checks-absent', `import fs from 'node:fs'; fs.readFileSync('/checks/policy.json'); export default x=>x`, false],
  ['host-secret-path', `import fs from 'node:fs'; fs.readFileSync('/host-canary/secret'); export default x=>x`, false],
  ['socket-absent', `import fs from 'node:fs'; fs.statSync('/var/run/docker.sock'); export default x=>x`, false],
  ['network-egress', `await fetch('http://1.1.1.1',{signal:AbortSignal.timeout(1500)}); export default x=>x`, false],
  ['environment-boundary', `import assert from 'node:assert/strict'; import fs from 'node:fs'; for(const k of ['DATABASE_URL','PAYLOAD_SECRET','OPENAI_API_KEY','GITHUB_TOKEN','SDLC_CANARY']) assert.equal(process.env[k],undefined); assert.notEqual(process.getuid(),0); const s=fs.readFileSync('/proc/self/status','utf8'); assert.match(s,/CapEff:\\s+0+\\n/); assert.match(s,/NoNewPrivs:\\s+1/); export default x=>x`, true],
]
const evidence = { version: 1, image, controllerSha256: hash(await readFile(new URL(import.meta.url))), policySha256: hash(JSON.stringify(cases)), scope: 'Synthetic identity-function verifier qualification only; no task execution authorization.', results: [], qualified: false }
const docker = (args, options = {}) => exec('docker', args, { timeout: 15000, maxBuffer: 16384, ...options })

// Compare data ourselves. Exit status and candidate success claims have no authority.
export function matches(stdout, expected) {
  try { return isDeepStrictEqual(JSON.parse(stdout), expected) } catch { return false }
}

async function run(source, input) {
  const name = `sdlc-verifier-${randomUUID()}`
  // Hosted runner /tmp can be a link; exporter deliberately requires canonical roots.
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'sdlc-verifier-'))
  await chmod(directory, 0o755)
  await mkdir(path.join(directory, 'src'), { mode: 0o755 })
  const file = path.join(directory, 'src', 'candidate.mjs')
  await writeFile(file, source, { mode: 0o444 })
  const exported = await exportSourceCapsule(directory, ['src/candidate.mjs'])
  // Controller-owned expected digest; never accept a sender's self-asserted digest.
  const trustedDigest = exported.sha256
  const capsule = validateSourceCapsule(exported, trustedDigest)
  if (!Buffer.from(capsule.files[0].content, 'base64').equals(Buffer.from(source))) throw new Error('Source binding failed.')
  for (const mutate of [
    value => { value.files[0].content = Buffer.from('process.exit(0)').toString('base64') },
    value => { value.files[0].path = '../checks/policy.json' },
    value => { value.sha256 = '0'.repeat(64) },
  ]) {
    const altered = structuredClone(exported)
    mutate(altered)
    let denied = false
    try { validateSourceCapsule(altered, trustedDigest) } catch { denied = true }
    if (!denied) throw new Error('Modified capsule accepted; execution blocked.')
  }
  let outcome = { accepted: false, reason: 'execution-failed', removed: false }
  try {
    await docker(['create', '--name', name, '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '128m', '--memory-swap', '128m', '--cpus', '1', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777', '--mount', `type=bind,source=${directory},target=/source,readonly`, image, 'node', '--input-type=module', '-e', `const {default:fn}=await import('/source/src/candidate.mjs'); console.log(JSON.stringify(await fn(${JSON.stringify(input)})))`])
    try {
      const result = await docker(['start', '--attach', name], { timeout: 5000 })
      const state = JSON.parse((await docker(['inspect', '--format', '{{json .State}}', name])).stdout)
      outcome = { accepted: state.ExitCode === 0 && !state.OOMKilled && matches(result.stdout, input), reason: state.ExitCode === 0 ? 'compared' : 'nonzero-exit', removed: false }
    } catch { outcome.reason = 'timeout-output-or-client-failure' }
  } finally {
    // Failure here aborts the entire qualification; no later candidate may run.
    await docker(['rm', '--force', name])
    const remaining = await docker(['ps', '--all', '--quiet', '--filter', `name=^/${name}$`])
    if (remaining.stdout.trim()) throw new Error('Termination uncertain; qualification stopped.')
    outcome.removed = true
    if (hash(await readFile(file)) !== hash(source)) throw new Error('Immutable source changed.')
    // Synthetic staging retained in runner temp; runner disposal removes it. No recursive host deletion.
  }
  return { ...outcome, capsuleSha256: trustedDigest, capsuleTamperDenials: 3 }
}

try {
  if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Only the selected disposable Linux CI environment is supported.')
  await docker(['pull', image], { timeout: 180000, maxBuffer: 256000 })
  process.env.SDLC_CANARY = `synthetic-${randomUUID()}`
  for (const [name, source, expectedAcceptance] of variants) {
    const results = []
    for (const test of cases) results.push(await run(source, test.input))
    const accepted = results.every(result => result.accepted)
    evidence.results.push({ name, sourceSha256: hash(source), expectedAcceptance, accepted, passed: results.every(result => result.accepted === expectedAcceptance), cases: results })
  }
  evidence.qualified = evidence.results.length === variants.length && evidence.results.every(result => result.passed)
  if (!evidence.qualified) process.exitCode = 1
} catch {
  evidence.failure = 'Infrastructure, boundary or cleanup failure; execution remains disabled.'
  process.exitCode = 1
} finally {
  delete process.env.SDLC_CANARY
  await mkdir('docs/evidence/verifier', { recursive: true })
  await writeFile('docs/evidence/verifier/qualification.json', JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
}
