import { createHash } from 'node:crypto'
import { digest } from './contracts'
import { validateSourceCapsule } from './source-capsule'

export const verifierImage = 'node@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8'
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const reject = (): never => { throw new Error('Task artifact binding rejected.') }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export type BindingArtifacts = { sourceHash: string; candidateHash: string; checkPolicyHash: string; verifierHash: string; qualificationHash: string; image: string; supervisorKey: string }
export type BindingGate = { id: number; kind: 'sprint' | 'design-security'; actorId: number; decisionKey: string }
export type TaskBindingRecord = BindingArtifacts & {
  version: 1; executionAllowed: false; syntheticOnly: true; taskId: number; storyId: number; storyRevision: number
  projectKey: string; scopeHash: string; owner: string; fence: number; attempt: number; recoveryKey: string; approvalGates: BindingGate[]
}
export type BindingReceipt = { bindingHash: string; record: TaskBindingRecord }

/** Verifier material is supplied by trusted coordinator code, never extracted from candidate files.
 * This captures integrity only; it does not certify the verifier, supervisor, or qualification evidence.
 */
export function bindArtifacts(contract: { sourceHash: string; checkPolicyHash: string; allowedPaths: string[] }, input: unknown): BindingArtifacts {
  if (!exact(input, ['sourceCapsule', 'candidateCapsule', 'checkPolicy', 'verifierSource', 'qualificationHash', 'image', 'supervisorKey'])) return reject()
  for (const key of ['checkPolicy', 'verifierSource']) {
    if (typeof input[key] !== 'string' || !input[key].length || Buffer.byteLength(input[key] as string) > 65536) return reject()
  }
  if (typeof input.qualificationHash !== 'string' || !sha.test(input.qualificationHash) || input.image !== verifierImage || typeof input.supervisorKey !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(input.supervisorKey)) return reject()
  const base = validateSourceCapsule(input.sourceCapsule, contract.sourceHash)
  // Candidate digest is computed/checked for integrity, never treated as an approval.
  const candidateInput = input.candidateCapsule as { sha256?: unknown } | null
  if (typeof candidateInput?.sha256 !== 'string') return reject()
  const candidate = validateSourceCapsule(candidateInput, candidateInput.sha256)
  if (base.files.length !== candidate.files.length || base.files.some((file, index) => file.path !== candidate.files[index].path || (file.sha256 !== candidate.files[index].sha256 && !contract.allowedPaths.includes(file.path)))) return reject()
  const checkPolicyHash = hash(input.checkPolicy as string)
  if (checkPolicyHash !== contract.checkPolicyHash) return reject()
  return { sourceHash: base.sha256, candidateHash: candidate.sha256, checkPolicyHash, verifierHash: hash(input.verifierSource as string), qualificationHash: input.qualificationHash, image: verifierImage, supervisorKey: input.supervisorKey }
}

export function validateBinding(input: unknown, expectedHash: string): BindingReceipt {
  if (typeof expectedHash !== 'string' || !sha.test(expectedHash) || !exact(input, ['version', 'executionAllowed', 'syntheticOnly', 'taskId', 'storyId', 'storyRevision', 'projectKey', 'scopeHash', 'owner', 'fence', 'attempt', 'recoveryKey', 'approvalGates', 'sourceHash', 'candidateHash', 'checkPolicyHash', 'verifierHash', 'qualificationHash', 'image', 'supervisorKey'])) return reject()
  if (input.version !== 1 || input.executionAllowed !== false || input.syntheticOnly !== true || !positive(input.taskId) || !positive(input.storyId) || !positive(input.storyRevision) || !positive(input.fence) || !positive(input.attempt) || input.attempt > 3) return reject()
  if (typeof input.projectKey !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(input.projectKey) || typeof input.owner !== 'string' || !uuid.test(input.owner) || typeof input.recoveryKey !== 'string' || !uuid.test(input.recoveryKey)) return reject()
  for (const key of ['scopeHash', 'sourceHash', 'candidateHash', 'checkPolicyHash', 'verifierHash', 'qualificationHash']) if (typeof input[key] !== 'string' || !sha.test(input[key] as string)) return reject()
  if (input.image !== verifierImage || typeof input.supervisorKey !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(input.supervisorKey) || !Array.isArray(input.approvalGates) || input.approvalGates.length !== 2) return reject()
  for (const [index, kind] of (['sprint', 'design-security'] as const).entries()) {
    const gate = input.approvalGates[index]
    if (!exact(gate, ['id', 'kind', 'actorId', 'decisionKey']) || !positive(gate.id) || !positive(gate.actorId) || gate.kind !== kind || gate.decisionKey !== `${input.storyId}:${input.scopeHash}:${kind}`) return reject()
  }
  if (input.approvalGates[0].id === input.approvalGates[1].id || digest(input) !== expectedHash) return reject()
  return { bindingHash: expectedHash, record: JSON.parse(JSON.stringify(input)) as TaskBindingRecord }
}

/** Call after a trusted coordinator reload/revalidation, using independently trusted expected material. */
export function validateBoundCandidate(receipt: BindingReceipt, candidate: unknown, expected: BindingArtifacts & { recoveryKey: string }) {
  const { record } = validateBinding(receipt.record, receipt.bindingHash)
  for (const key of ['sourceHash', 'candidateHash', 'checkPolicyHash', 'verifierHash', 'qualificationHash', 'image', 'supervisorKey', 'recoveryKey'] as const) if (record[key] !== expected[key]) return reject()
  validateSourceCapsule(candidate, record.candidateHash)
  return { artifactsMatch: true as const, executionAllowed: false as const, retryAuthorized: false as const }
}
