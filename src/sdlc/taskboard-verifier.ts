import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validateSourceCapsule } from './source-capsule'
import { verifierImage } from './task-binding'

const exec = promisify(execFile)
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const reject = (): never => { throw new Error('Trusted taskboard verification rejected.') }
type Case = { id: string; tasks: Record<string, unknown>[]; status: unknown; expectedIndexes?: number[]; invalid?: boolean }

/** Fixed, independently installed verifier input; never derive tests or commands from candidate files. */
export function taskboardCases(policyText: string, expectedHash: string) {
  if (typeof policyText !== 'string' || Buffer.byteLength(policyText) > 65536 || hash(policyText) !== expectedHash) return reject()
  const policy = JSON.parse(policyText) as { version: number; exportName: string; statuses: string[]; cases: Case[]; invalidStatuses: unknown[] }
  if (policy.version !== 1 || policy.exportName !== 'filterTasks' || !isDeepStrictEqual(policy.statuses, ['todo', 'doing', 'done'])
    || !Array.isArray(policy.cases) || !policy.cases.length || !Array.isArray(policy.invalidStatuses) || !policy.invalidStatuses.length) return reject()
  const cases: Case[] = [...policy.cases, ...policy.invalidStatuses.flatMap((status, index) => [
    { id: `invalid-empty-${index}`, tasks: [], status, invalid: true },
    { id: `invalid-populated-${index}`, tasks: policy.cases[0].tasks, status, invalid: true },
  ])]
  if (cases.length > 32 || new Set(cases.map(c => c.id)).size !== cases.length
    || cases.some(c => typeof c.id !== 'string' || !c.id.length || !Array.isArray(c.tasks) || c.tasks.length > 100
      || (!c.invalid && (!Array.isArray(c.expectedIndexes) || c.expectedIndexes.some(i => !Number.isSafeInteger(i) || i < 0 || i >= c.tasks.length))))) return reject()
  const expected = cases.map(entry => ({ id: entry.id, thrown: !!entry.invalid, typeError: !!entry.invalid,
    inputUnchanged: true, result: entry.invalid ? null : entry.expectedIndexes!.map(index => entry.tasks[index]),
    indexes: entry.invalid ? null : entry.expectedIndexes, newArray: !entry.invalid }))
  return { cases, expected }
}

/** Linux trusted supervisor only. Candidate code runs solely in a bounded, networkless
 * container; host code never imports/evaluates it. Uncertain cleanup never yields a verdict.
 */
export async function verifyTaskboardCandidate(input: { capsule: unknown; candidateHash: string; policyText: string;
  policyHash: string; runnerSource: string; runnerHash: string; workspaceRoot: string }) {
  if (process.platform !== 'linux' || typeof input.runnerSource !== 'string' || Buffer.byteLength(input.runnerSource) > 65536
    || hash(input.runnerSource) !== input.runnerHash || !path.isAbsolute(input.workspaceRoot)) return reject()
  const root = await realpath(input.workspaceRoot), rootInfo = await lstat(input.workspaceRoot)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || root !== input.workspaceRoot) return reject()
  const capsule = validateSourceCapsule(input.capsule, input.candidateHash)
  if (capsule.files.length !== 1 || capsule.files[0].path !== 'src/filter-tasks.mjs') return reject()
  const { cases, expected } = taskboardCases(input.policyText, input.policyHash)
  const started = Date.now(), directory = await mkdtemp(path.join(root, 'aisdlc-verifier-'))
  const sourceDir = path.join(directory, 'source'), runnerDir = path.join(directory, 'runner')
  const sourceFile = path.join(sourceDir, 'src/filter-tasks.mjs'), runnerFile = path.join(runnerDir, 'runner.mjs')
  const name = `aisdlc-verifier-${randomUUID()}`
  let createAcknowledged = false, verdict: 'pass' | 'fail' | 'error' = 'error', exitCode: number | null = null, casesPassed = 0
  let observations: unknown[] | null = null, outputHash: string | null = null, outputBytes = 0
  const docker = (args: string[], timeout = 15000) => exec('/usr/bin/docker', args, { timeout, maxBuffer: 65536,
    encoding: 'utf8', windowsHide: true,
    env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin', HOME: '/nonexistent', DOCKER_CONFIG: '/nonexistent', DOCKER_HOST: 'unix:///var/run/docker.sock' } })
  const written: string[] = [], directories = [directory]
  let removed = false, integrity = false
  try {
    await chmod(directory, 0o755)
    for (const folder of [sourceDir, path.join(sourceDir, 'src'), runnerDir]) { await mkdir(folder, { mode: 0o755 }); directories.push(folder) }
    await writeFile(sourceFile, Buffer.from(capsule.files[0].content, 'base64'), { mode: 0o444, flag: 'wx' }); written.push(sourceFile)
    await writeFile(runnerFile, input.runnerSource, { mode: 0o444, flag: 'wx' }); written.push(runnerFile)
    await docker(['create', '--name', name, '--network', 'none', '--read-only', '--user', '65534:65534',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '128m',
      '--memory-swap', '128m', '--cpus', '1', '--restart', 'no', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777',
      '--env', 'AISDLC_ISOLATED_RUNNER=1', '--mount', `type=bind,source=${sourceDir},target=/source,readonly`,
      '--mount', `type=bind,source=${runnerDir},target=/runner,readonly`, verifierImage,
      'node', '--no-warnings', '--experimental-vm-modules', '/runner/runner.mjs', JSON.stringify(cases)])
    createAcknowledged = true
    const inspected = JSON.parse((await docker(['inspect', name])).stdout)[0]
    const config = inspected.HostConfig
    if (config.NetworkMode !== 'none' || config.ReadonlyRootfs !== true || config.Privileged !== false
      || config.Memory !== 128 * 1024 * 1024 || config.MemorySwap !== config.Memory || config.PidsLimit !== 32 || config.NanoCpus !== 1e9
      || config.RestartPolicy?.Name !== 'no' || inspected.Config.User !== '65534:65534'
      || !isDeepStrictEqual(config.CapDrop, ['ALL']) || !config.SecurityOpt?.includes('no-new-privileges:true')
      || inspected.Mounts.filter((m: { Destination: string; RW: boolean }) => ['/source', '/runner'].includes(m.Destination)).length !== 2
      || inspected.Mounts.some((m: { Destination: string; RW: boolean }) => ['/source', '/runner'].includes(m.Destination) && m.RW)) return reject()
    try {
      const run = await docker(['start', '--attach', name], 6000)
      const state = JSON.parse((await docker(['inspect', '--format', '{{json .State}}', name])).stdout)
      if (!Number.isInteger(state.ExitCode) || state.Running || state.OOMKilled) throw new Error('Verifier runtime incomplete.')
      exitCode = state.ExitCode
      outputHash = hash(run.stdout); outputBytes = Buffer.byteLength(run.stdout)
      const observed = JSON.parse(run.stdout)
      if (Array.isArray(observed) && observed.length <= 32) observations = observed
      casesPassed = Array.isArray(observed) ? expected.filter((entry, index) => isDeepStrictEqual(observed[index], entry)).length : 0
      verdict = exitCode === 0 && isDeepStrictEqual(observed, expected) ? 'pass' : 'fail'
    } catch { verdict = 'error' }
  } finally {
    // The one create writer must have acknowledged before absence can mean cleanup.
    // A lost create acknowledgement remains uncertain even after best-effort removal.
    try {
      await docker(['rm', '--force', name])
      removed = createAcknowledged && (await docker(['ps', '--all', '--quiet', '--filter', `name=^/${name}$`])).stdout.trim() === ''
      integrity = hash(await readFile(sourceFile)) === capsule.files[0].sha256 && hash(await readFile(runnerFile)) === input.runnerHash
    } catch { removed = false }
    if (removed || !createAcknowledged) {
      // Explicitly remove only files/directories created by this invocation.
      for (const file of written) await unlink(file)
      for (const folder of directories.reverse()) await rmdir(folder)
    }
  }
  if (!removed || !integrity) throw new Error('Verifier cleanup is uncertain; no verdict may authorize a repair.')
  return { version: 1 as const, candidateHash: capsule.sha256, checkPolicyHash: input.policyHash, verifierHash: input.runnerHash,
    image: verifierImage, verdict, casesPassed, casesTotal: cases.length, exitCode, elapsedMs: Date.now() - started,
    outputHash, outputBytes, replay: cases.map((entry, index) => ({ id: entry.id, input: { tasks: entry.tasks, status: entry.status },
      expected: expected[index], observed: observations?.[index] ?? null,
      passed: observations !== null && isDeepStrictEqual(observations[index], expected[index]) })),
    cleanupVerified: true as const, executionAllowed: false as const, retryAuthorized: false as const }
}
