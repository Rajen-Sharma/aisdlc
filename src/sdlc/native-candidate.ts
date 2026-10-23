import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { digest } from './contracts'
import { validateSourceCapsule, type SourceCapsule } from './source-capsule'

export type NativeCandidate = {
  version: 1; keyId: string; authorityRevision: number; taskKey: string; attemptId: string; admissionId: string; challengeNonce: string
  reservationHash: string; runtimeHash: string; hostId: string; bootId: string; unit: string
  sourceHash: string; candidateHash: string; threadId: string; turnId: string; observedAt: number
  provider: 'openai'; authentication: 'chatgpt'; model: 'gpt-6-sol'; maxTurns: 1
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null
}
export const nativeCandidateSigningBytes = (record: NativeCandidate) => Buffer.from(`ai-sdlc/native-candidate/v1\n${digest(record)}`)

export function authenticateNativeCandidate(input: unknown, capsule: unknown, context: {
  policy: { taskKey: string; runtimeHash: string }; sourceHash: string
  attempt: { attemptId: string; issuedAt: number; reservationHash: string; runtime: { hostId: string; bootId: string; unit: string };
    admission: { operationId: string; challengeNonce: string } | null }
  guardian: { keyId: string; revision: number; publicKey: KeyObject; publicKeyDer: string }
}, now: number) {
  const reject = (): never => { throw new Error('Native candidate provenance rejected.') }
  const exact = (value: unknown, fields: string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',')
  if (!exact(input, ['record', 'signature']) || !exact(input.record, ['version', 'keyId', 'authorityRevision', 'taskKey', 'attemptId',
    'admissionId', 'challengeNonce', 'reservationHash', 'runtimeHash', 'hostId', 'bootId', 'unit', 'sourceHash', 'candidateHash',
    'threadId', 'turnId', 'observedAt', 'provider', 'authentication', 'model', 'maxTurns', 'usage'])) return reject()
  const r = input.record
  if (r.version !== 1 || r.keyId !== context.guardian.keyId || r.authorityRevision !== context.guardian.revision
    || r.taskKey !== context.policy.taskKey || r.runtimeHash !== context.policy.runtimeHash || r.sourceHash !== context.sourceHash
    || r.attemptId !== context.attempt.attemptId || r.reservationHash !== context.attempt.reservationHash
    || !context.attempt.admission || r.admissionId !== context.attempt.admission.operationId || r.challengeNonce !== context.attempt.admission.challengeNonce
    || (['hostId', 'bootId', 'unit'] as const).some(key => r[key] !== context.attempt.runtime[key])
    || r.provider !== 'openai' || r.authentication !== 'chatgpt' || r.model !== 'gpt-6-sol' || r.maxTurns !== 1
    || typeof r.candidateHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.candidateHash)
    || typeof r.threadId !== 'string' || typeof r.turnId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.threadId) || !/^[A-Za-z0-9_-]{1,100}$/.test(r.turnId)
    || !Number.isSafeInteger(r.observedAt) || !Number.isSafeInteger(now) || (r.observedAt as number) < context.attempt.issuedAt || (r.observedAt as number) > now) return reject()
  if (r.usage !== null && (!exact(r.usage, ['inputTokens', 'outputTokens', 'totalTokens'])
    || !['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger((r.usage as Record<string, unknown>)[key])
      && ((r.usage as Record<string, number>)[key] >= 0) && ((r.usage as Record<string, number>)[key] <= 10000000))
    || r.usage.totalTokens !== (r.usage.inputTokens as number) + (r.usage.outputTokens as number))) return reject()
  const key = context.guardian.publicKey
  const signature = typeof input.signature === 'string' ? Buffer.from(input.signature, 'base64') : Buffer.alloc(0)
  if (key?.type !== 'public' || key.asymmetricKeyType !== 'ed25519'
    || createPublicKey({ key: Buffer.from(context.guardian.publicKeyDer, 'base64'), format: 'der', type: 'spki' }).export({ format: 'der', type: 'spki' }).toString('base64') !== key.export({ format: 'der', type: 'spki' }).toString('base64')
    || typeof input.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(input.signature)
    || signature.length !== 64 || signature.toString('base64') !== input.signature
    || !verify(null, nativeCandidateSigningBytes(r as NativeCandidate), key, signature)) return reject()
  const candidate = validateSourceCapsule(capsule, r.candidateHash)
  return { record: structuredClone(r) as NativeCandidate, capsule: candidate as SourceCapsule }
}
