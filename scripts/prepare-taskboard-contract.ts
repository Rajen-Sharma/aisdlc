// Prepare review data only. Never create approval records or invoke a provider.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { digest } from '../src/sdlc/contracts'
import { validateSourceCapsule } from '../src/sdlc/source-capsule'
import { validateProject } from '../src/sdlc/project'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const blob = (name: string) => execFileSync('git', ['show', `${revision}:${name}`], { maxBuffer: 262144 })
const sourceBytes = blob('fixtures/taskboard/src/filter-tasks.mjs')
const files = [{ path: 'src/filter-tasks.mjs', bytes: sourceBytes.length,
  sha256: hash(sourceBytes), content: sourceBytes.toString('base64') }]
const sourceCapsule = { version: 1, files, sha256: hash(JSON.stringify({ version: 1, files })) }
validateSourceCapsule(sourceCapsule, sourceCapsule.sha256)
const policy = JSON.parse(await readFile('checks/taskboard-filter-policy.json', 'utf8'))
// Canonical policy bytes are explicit and portable across Windows/Linux checkouts.
const checkPolicy = JSON.stringify(policy) + '\n'
const project = validateProject(JSON.parse(blob('projects/active.json').toString('utf8')))
const contract = { sourceHash: sourceCapsule.sha256, checkPolicyHash: hash(checkPolicy),
  designHash: hash(blob('docs/security/next-build-design.md')),
  sprintHash: hash(blob('docs/planning/next-build.md')),
  allowedPaths: ['src/filter-tasks.mjs'], acceptanceCriteria: policy.requirements }
if (contract.designHash !== '3053d9e151ccd7ebe9b4a12644fa2c2d33071019534aa3b6bdab75a508121e4d' ||
    contract.sprintHash !== 'b017bbf09986e3a0c51adf9c7feda2ed467af9d975218e07603fd20f1a0d4d82') {
  throw new Error('Accepted design or sprint bytes changed; contract preparation stopped.')
}
const proposedStory = { projectKey: project.key, contextHash: digest(project), storyKey: 'taskboard-filter',
  revision: 1, title: 'Filter synthetic tasks by status', contract, supersedes: null }
const pack = { version: 1, proposalOnly: true, executionAllowed: false, sourceRevision: revision,
  sourceByteConvention: 'Exact Git blob bytes, not platform checkout newline conversion.',
  proposedStory, proposedScopeHash: digest(proposedStory), sourceCapsule,
  checkPolicy, checkPolicyByteConvention: 'UTF-8 JSON.stringify(policy) followed by one LF.',
  humanDecisions: { sprint: 'pending', designSecurity: 'pending', codeSecurity: 'not-yet-eligible',
    outcome: 'not-yet-eligible', mvp: 'not-yet-eligible' },
  provider: { selected: 'Codex ChatGPT subscription', additionalChargesAllowed: false, maxAttempts: 3,
    runtimeQualification: 'incomplete', actualInvocationAllowed: false },
  limitations: ['No story or approval was created in the coordinator.',
    'The proposed scope hash must be recomputed by the authenticated coordinator for its actual revision.',
    'The policy cases are prepared; a task-specific isolated verifier still needs implementation and qualification.',
    'Actual authenticated provider lifecycle and independent recovery/signing authority remain required.'] }
await writeFile('docs/planning/taskboard-first-delivery.json', JSON.stringify(pack, null, 2) + '\n')
console.log(JSON.stringify({ proposalOnly: true, proposedScopeHash: pack.proposedScopeHash,
  sourceHash: contract.sourceHash, checkPolicyHash: contract.checkPolicyHash, executionAllowed: false }))
