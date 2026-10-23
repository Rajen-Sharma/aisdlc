// Synthetic qualification only. Never imports/evaluates candidate code on the host.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { decodeCodexCandidate } from '../src/sdlc/codex-candidate.ts'
import { exportSourceCapsule } from '../src/sdlc/source-capsule.ts'
import { verifierImage } from '../src/sdlc/task-binding.ts'
import { taskboardCases, verifyTaskboardCandidate } from '../src/sdlc/taskboard-verifier.ts'

if (process.platform !== 'linux' || (process.env.GITHUB_ACTIONS !== 'true' &&
    process.env.AISDLC_QUALIFICATION_HOST !== 'azure-tools-trial')) throw new Error('Requires an explicitly selected Linux qualification host.')
const exec = promisify(execFile)
const docker = (args, options = {}) => exec('docker', args, { timeout: 15000, maxBuffer: 65536, ...options })
const hash = value => createHash('sha256').update(value).digest('hex')
const policy = JSON.parse(await readFile('checks/taskboard-filter-policy.json', 'utf8'))
const source = await exportSourceCapsule(await realpath('fixtures/taskboard'), ['src/filter-tasks.mjs'])
const policyText = JSON.stringify(policy) + '\n'
const { cases } = taskboardCases(policyText, hash(policyText))
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
  ['spoof-error-name', reference.replace('throw new TypeError("status")', 'throw Object.assign(new Error("status"),{name:"TypeError"})'), false],
  ['error-name-getter', reference.replace('throw new TypeError("status")', 'throw Object.defineProperty(new Error("status"),"name",{get(){while(true){}}})'), false],
  ['clone-iterator-forgery', reference.replace('return tasks.filter(task=>task.status===status)',
    'const matches=tasks.filter(task=>task.status===status);const clones=matches.map(task=>({...task}));Array.prototype[Symbol.iterator]=function*(){yield* matches.values()};return clones'), false],
  ['result-setter-forgery', 'Object.defineProperty(globalThis,"__result",{set(){},get(){return __tasks.filter(task=>task.status===__status)}});export function filterTasks(){return []}', false],
  ['array-property-mutation', reference.replace('return tasks.filter', 'tasks.extra="changed";return tasks.filter'), false],
  ['array-length-mutation', reference.replace('return tasks.filter', 'tasks.length++;return tasks.filter'), false],
  ['nonmatching-item-replacement', reference.replace('return tasks.filter', 'for(let i=0;i<tasks.length;i++)if(tasks[i].status!==status)tasks[i]={...tasks[i]};return tasks.filter'), false],
  ['nested-reference-replacement', reference.replace('return tasks.filter', 'for(const task of tasks)if(task.metadata)task.metadata={...task.metadata};return tasks.filter'), false],
  ['input-descriptor-mutation', reference.replace('return tasks.filter', 'if(tasks.length)Object.defineProperty(tasks[0],"id",{writable:false});return tasks.filter'), false],
  ['input-prototype-mutation', reference.replace('return tasks.filter', 'if(tasks.length)Object.setPrototypeOf(tasks[0],null);return tasks.filter'), false],
  ['input-extensibility-mutation', reference.replace('return tasks.filter', 'Object.preventExtensions(tasks);return tasks.filter'), false],
  ['input-parser-tamper', 'JSON.parse=()=>[];' + reference, true],
  ['early-exit', 'process.exit(0)', false],
  ['forged-success', 'console.log("passed");export function filterTasks(){return []}', false],
  ['protected-runner-import', 'import fs from "node:fs";fs.writeFileSync("/runner/runner.mjs", "");' + reference, false],
  ['cpu-runaway', 'export function filterTasks(){while(true){}}', false],
  ['getter-forgery', 'export function filterTasks(tasks){Object.defineProperty(tasks[0]??tasks,"hidden",{get(){return 1}});return tasks}', false],
]
const evidence = { version: 1, image: verifierImage, sourceHash: source.sha256,
  qualificationHost: process.env.GITHUB_ACTIONS === 'true' ? 'github-disposable-linux' : 'azure-tools-trial',
  policyHash: hash(JSON.stringify(policy) + '\n'), runnerHash: hash(await readFile('scripts/taskboard-isolated-runner.mjs')),
  casesPerVariant: cases.length, results: [], syntheticOnly: true, executionAllowed: false, retryAuthorized: false }
await docker(['pull', verifierImage], { timeout: 180000, maxBuffer: 262144 })
const runnerSource = await readFile('scripts/taskboard-isolated-runner.mjs', 'utf8')
for (const [label, content, shouldPass] of variants) {
  const decoded = decodeCodexCandidate(JSON.stringify({ version: 1, sourceHash: source.sha256,
    files: [{ path: 'src/filter-tasks.mjs', content }] }), source, { sourceHash: source.sha256, allowedPaths: ['src/filter-tasks.mjs'] })
  const report = await verifyTaskboardCandidate({ capsule: decoded.capsule, candidateHash: decoded.candidateHash,
    policyText, policyHash: evidence.policyHash, runnerSource, runnerHash: evidence.runnerHash,
    workspaceRoot: await realpath(tmpdir()) })
  const accepted = report.verdict === 'pass'
  evidence.results.push({ label, candidateHash: decoded.candidateHash, expectedAcceptance: shouldPass,
    accepted, matchedExpectation: accepted === shouldPass, removed: report.cleanupVerified, report })
}
await mkdir('docs/evidence/github-ci', { recursive: true })
await writeFile('docs/evidence/github-ci/taskboard-verifier.json', JSON.stringify(evidence, null, 2) + '\n')
const failures = evidence.results.filter(result => !result.matchedExpectation)
if (failures.length) console.log('::error title=Taskboard verifier qualification::' + failures.map(result => result.label).join(','))
assert.equal(failures.length, 0)
console.log(`::notice title=Taskboard verifier qualification::variants=${variants.length}; cases=${cases.length}; acceptedControls=${variants.filter(([, , pass]) => pass).length}; rejectedVariants=${variants.filter(([, , pass]) => !pass).length}; allContainersRemoved=true`)
