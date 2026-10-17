// Synthetic qualification only. Never imports/evaluates candidate code on the host.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdtemp, mkdir, chmod, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { decodeCodexCandidate } from '../src/sdlc/codex-candidate.ts'
import { exportSourceCapsule } from '../src/sdlc/source-capsule.ts'
import { verifierImage } from '../src/sdlc/task-binding.ts'

if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Requires disposable Linux CI.')
const exec = promisify(execFile)
const docker = (args, options = {}) => exec('docker', args, { timeout: 15000, maxBuffer: 65536, ...options })
const hash = value => createHash('sha256').update(value).digest('hex')
const policy = JSON.parse(await readFile('checks/taskboard-filter-policy.json', 'utf8'))
const source = await exportSourceCapsule(await realpath('fixtures/taskboard'), ['src/filter-tasks.mjs'])
const cases = [
  ...policy.cases,
  ...policy.invalidStatuses.flatMap((status, index) => [
    { id: `invalid-empty-${index}`, tasks: [], status, invalid: true },
    { id: `invalid-populated-${index}`, tasks: policy.cases[0].tasks, status, invalid: true },
  ]),
]
const expected = cases.map(entry => ({ id: entry.id, thrown: !!entry.invalid, typeError: !!entry.invalid,
  inputUnchanged: true, result: entry.invalid ? null : entry.expectedIndexes.map(index => entry.tasks[index]),
  indexes: entry.invalid ? null : entry.expectedIndexes, newArray: !entry.invalid }))
// This reference is test data. It is never written into the task fixture or
// counted as the required real model-produced implementation.
const reference = 'export function filterTasks(tasks,status){if(!["todo","doing","done"].includes(status))throw new TypeError("status");return tasks.filter(task=>task.status===status)}'
const variants = [
  ['reference-control', reference, true],
  ['wrong-empty', 'export function filterTasks(){return []}', false],
  ['sort-input', reference.replace('return tasks.filter', 'tasks.sort((a,b)=>String(a.id).localeCompare(String(b.id)));return tasks.filter'), false],
  ['clone-items', reference.replace('task.status===status)', 'task.status===status).map(task=>({...task}))'), false],
  ['mutate-task', reference.replace('return tasks.filter', 'if(tasks.length)tasks[0].title="changed";return tasks.filter'), false],
  ['invalid-status-accepted', 'export function filterTasks(tasks,status){return tasks.filter(task=>task.status===status)}', false],
  ['invalid-only-empty', reference.replace('if(![', 'if(!tasks.length&&!['), false],
  ['wrong-error-type', reference.replace('new TypeError', 'new Error'), false],
  ['early-exit', 'process.exit(0)', false],
  ['forged-success', 'console.log("passed");export function filterTasks(){return []}', false],
  ['protected-runner-import', 'import fs from "node:fs";fs.writeFileSync("/runner/runner.mjs", "");' + reference, false],
  ['cpu-runaway', 'export function filterTasks(){while(true){}}', false],
  ['getter-forgery', 'export function filterTasks(tasks){Object.defineProperty(tasks[0]??tasks,"hidden",{get(){return 1}});return tasks}', false],
]
const evidence = { version: 1, image: verifierImage, sourceHash: source.sha256,
  policyHash: hash(JSON.stringify(policy) + '\n'), runnerHash: hash(await readFile('scripts/taskboard-isolated-runner.mjs')),
  casesPerVariant: cases.length, results: [], syntheticOnly: true, executionAllowed: false, retryAuthorized: false }
await docker(['pull', verifierImage], { timeout: 180000, maxBuffer: 262144 })
const runnerDir = await mkdtemp(path.join(await realpath(tmpdir()), 'taskboard-runner-'))
await chmod(runnerDir, 0o755)
await writeFile(path.join(runnerDir, 'runner.mjs'), await readFile('scripts/taskboard-isolated-runner.mjs'), { mode: 0o444 })
for (const [label, content, shouldPass] of variants) {
  const decoded = decodeCodexCandidate(JSON.stringify({ version: 1, sourceHash: source.sha256,
    files: [{ path: 'src/filter-tasks.mjs', content }] }), source, { sourceHash: source.sha256, allowedPaths: ['src/filter-tasks.mjs'] })
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'taskboard-candidate-'))
  await chmod(directory, 0o755)
  await mkdir(path.join(directory, 'src'), { mode: 0o755 })
  const file = path.join(directory, 'src/filter-tasks.mjs')
  await writeFile(file, Buffer.from(decoded.capsule.files[0].content, 'base64'), { mode: 0o444 })
  const name = `taskboard-${randomUUID()}`
  let accepted = false, failure = null
  try {
    await docker(['create', '--name', name, '--network', 'none', '--read-only', '--user', '65534:65534',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32',
      '--memory', '128m', '--memory-swap', '128m', '--cpus', '1',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777', '--env', 'AISDLC_ISOLATED_RUNNER=1',
      '--mount', `type=bind,source=${directory},target=/source,readonly`,
      '--mount', `type=bind,source=${runnerDir},target=/runner,readonly`, verifierImage,
      'node', '--no-warnings', '--experimental-vm-modules', '/runner/runner.mjs', JSON.stringify(cases)])
    const config = JSON.parse((await docker(['inspect', '--format', '{{json .HostConfig}}', name])).stdout)
    assert.equal(config.NetworkMode, 'none')
    assert.equal(config.ReadonlyRootfs, true)
    assert.equal(config.Memory, 128 * 1024 * 1024)
    assert.equal(config.MemorySwap, config.Memory)
    assert.equal(config.PidsLimit, 32)
    assert.equal(config.NanoCpus, 1e9)
    try {
      const run = await docker(['start', '--attach', name], { timeout: 6000 })
      const state = JSON.parse((await docker(['inspect', '--format', '{{json .State}}', name])).stdout)
      accepted = state.ExitCode === 0 && !state.Running && !state.OOMKilled && isDeepStrictEqual(JSON.parse(run.stdout), expected)
    } catch {
      failure = 'runtime-output-or-timeout'
    }
  } finally {
    await docker(['rm', '--force', name])
    assert.equal((await docker(['ps', '--all', '--quiet', '--filter', `name=^/${name}$`])).stdout.trim(), '')
    assert.equal(hash(await readFile(file)), decoded.capsule.files[0].sha256)
    assert.equal(hash(await readFile(path.join(runnerDir, 'runner.mjs'))), evidence.runnerHash)
  }
  evidence.results.push({ label, candidateHash: decoded.candidateHash, expectedAcceptance: shouldPass,
    accepted, matchedExpectation: accepted === shouldPass, removed: true, failure })
}
await mkdir('docs/evidence/github-ci', { recursive: true })
await writeFile('docs/evidence/github-ci/taskboard-verifier.json', JSON.stringify(evidence, null, 2) + '\n')
const failures = evidence.results.filter(result => !result.matchedExpectation)
if (failures.length) console.log('::error title=Taskboard verifier qualification::' + failures.map(result => result.label).join(','))
assert.equal(failures.length, 0)
console.log(`::notice title=Taskboard verifier qualification::variants=${variants.length}; cases=${cases.length}; referencePassed=true; rejectedVariants=${variants.length - 1}; allContainersRemoved=true`)
