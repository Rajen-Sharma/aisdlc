import { createHash, KeyObject, verify } from 'node:crypto'
import { digest } from './contracts'
import { verifierImage } from './task-binding'

const sha = /^[a-f0-9]{64}$/
const slug = /^[a-z][a-z0-9-]{2,63}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const reject = (): never => { throw new Error('Verifier evidence rejected.') }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// Supplied only by trusted operator code. No sender-selected keys or default trust anchor.
export type SupervisorPolicy = { supervisorKey: string; keyId: string; publicKey: KeyObject; verifierHash: string; qualificationHash: string; image: string }
export type VerifierChallenge = {
  version: 2; nonce: string; bindingHash: string; registryHash: string; registryRevision: number; supervisorKey: string; keyId: string; keyFingerprint: string
  verifierHash: string; qualificationHash: string; image: string; issuedAt: number; expiresAt: number
  syntheticOnly: true; executionAllowed: false
}
export type ChallengeReceipt = { challengeHash: string; record: VerifierChallenge }
export type VerifierClaim = { version: 1; challengeHash: string; evidenceHash: string; evidenceBytes: number; verdict: 'pass' | 'fail' | 'error'; syntheticOnly: true; executionAllowed: false }
export function supervisorIdentity(policy: SupervisorPolicy) {
  for (const key of ['supervisorKey', 'keyId', 'verifierHash', 'qualificationHash', 'image'] as const) if (typeof policy[key] !== 'string') return reject()
  if (!slug.test(policy.supervisorKey) || !slug.test(policy.keyId) || !sha.test(policy.verifierHash) || !sha.test(policy.qualificationHash) || policy.image !== verifierImage || !(policy.publicKey instanceof KeyObject) || policy.publicKey.type !== 'public' || policy.publicKey.asymmetricKeyType !== 'ed25519') return reject()
  return { supervisorKey: policy.supervisorKey, keyId: policy.keyId, keyFingerprint: hash(policy.publicKey.export({ type: 'spki', format: 'der' })), verifierHash: policy.verifierHash, qualificationHash: policy.qualificationHash, image: policy.image }
}
export function validateChallenge(input: unknown, expectedHash: string): ChallengeReceipt {
  if (!sha.test(expectedHash) || !exact(input, ['version', 'nonce', 'bindingHash', 'registryHash', 'registryRevision', 'supervisorKey', 'keyId', 'keyFingerprint', 'verifierHash', 'qualificationHash', 'image', 'issuedAt', 'expiresAt', 'syntheticOnly', 'executionAllowed'])) return reject()
  if (!Number.isSafeInteger(input.registryRevision) || (input.registryRevision as number) < 1) return reject()
  if (input.version !== 2 || input.syntheticOnly !== true || input.executionAllowed !== false || typeof input.nonce !== 'string' || !uuid.test(input.nonce) || typeof input.supervisorKey !== 'string' || !slug.test(input.supervisorKey) || typeof input.keyId !== 'string' || !slug.test(input.keyId) || input.image !== verifierImage) return reject()
  for (const key of ['bindingHash', 'registryHash', 'keyFingerprint', 'verifierHash', 'qualificationHash']) if (typeof input[key] !== 'string' || !sha.test(input[key] as string)) return reject()
  if (!Number.isSafeInteger(input.issuedAt) || !Number.isSafeInteger(input.expiresAt) || (input.issuedAt as number) < 1 || (input.expiresAt as number) <= (input.issuedAt as number) || (input.expiresAt as number) - (input.issuedAt as number) > 300 || digest(input) !== expectedHash) return reject()
  return { challengeHash: expectedHash, record: JSON.parse(JSON.stringify(input)) as VerifierChallenge }
}
// Domain separation prevents a signature for another protocol from authenticating this claim.
export const verifierSigningBytes = (claim: VerifierClaim) => Buffer.from(`ai-sdlc/verifier-result/v1\n${digest(claim)}`, 'utf8')

/** Authenticates bounded evidence provenance only. A signed verdict is not a human or behavioral acceptance. */
export function authenticateVerifierEvidence(receipt: ChallengeReceipt, policy: SupervisorPolicy, envelopeText: string, evidenceInput: Uint8Array, now: number) {
  const { record } = validateChallenge(receipt.record, receipt.challengeHash)
  if (!Number.isSafeInteger(now) || now < record.issuedAt || now >= record.expiresAt) return reject()
  const identity = supervisorIdentity(policy)
  for (const key of ['supervisorKey', 'keyId', 'keyFingerprint', 'verifierHash', 'qualificationHash', 'image'] as const) if (identity[key] !== record[key]) return reject()
  if (typeof envelopeText !== 'string' || Buffer.byteLength(envelopeText) > 4096 || !(evidenceInput instanceof Uint8Array) || evidenceInput.byteLength < 1 || evidenceInput.byteLength > 65536) return reject()
  // Copy before hashing/storage; caller mutation cannot change retained evidence after validation.
  const evidence = Buffer.from(evidenceInput)
  let envelope: unknown
  try { envelope = JSON.parse(envelopeText) } catch { return reject() }
  if (!exact(envelope, ['claim', 'signature']) || !exact(envelope.claim, ['version', 'challengeHash', 'evidenceHash', 'evidenceBytes', 'verdict', 'syntheticOnly', 'executionAllowed'])) return reject()
  const claim = envelope.claim
  if (claim.version !== 1 || claim.syntheticOnly !== true || claim.executionAllowed !== false || claim.challengeHash !== receipt.challengeHash || claim.evidenceBytes !== evidence.length || claim.evidenceHash !== hash(evidence) || !['pass', 'fail', 'error'].includes(claim.verdict as string)) return reject()
  if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) return reject()
  const signature = Buffer.from(envelope.signature, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== envelope.signature || !verify(null, verifierSigningBytes(claim as VerifierClaim), policy.publicKey, signature)) return reject()
  const retained = { claim: claim as VerifierClaim, signature: envelope.signature }
  return { resultHash: digest(retained), envelope: retained, evidenceBase64: evidence.toString('base64'), authenticated: true as const, executionAllowed: false as const, retryAuthorized: false as const }
}
