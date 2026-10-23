import { KeyObject, verify } from 'node:crypto'
import { digest } from './contracts'
import { validateSourceCapsule, type SourceCapsule } from './source-capsule'

const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const exact = (value: unknown, fields: string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',')
const reject = (): never => { throw new Error('Delivery artifact evidence rejected.') }
export type DeliveryClaim = {
  version: 1; keyId: string; authorityRevision: number; taskKey: string; storyId: number; scopeHash: string
  approvalHash: string; attemptId: string; attempt: number; sourceHash: string; candidateHash: string
  checkPolicyHash: string; verifierHash: string; qualificationHash: string; image: string; runtimeHash: string
  terminationHash: string; verificationHash: string; criteriaPassed: number; criteriaTotal: number
  verdict: 'pass' | 'fail' | 'error'; nativeCodex: true; issuedAt: number
}
export type DeliveryEnvelope = { claim: DeliveryClaim; signature: string }
export type DeliveryArtifact = { envelope: DeliveryEnvelope; source: SourceCapsule; candidate: SourceCapsule }
export type DeliveryTrust = {
  keyId: string; authorityRevision: number; publicKey: KeyObject; nativeRuntimeQualified: true
  runtimeHash: string; verifierHash: string; qualificationHash: string; image: string; validFrom: number; expiresAt: number
}
export const deliverySigningBytes = (claim: DeliveryClaim) => Buffer.from(`ai-sdlc/delivery-artifact/v1\n${digest(claim)}`)

/** Trusted policy is independently resolved on each read/review, never supplied by a browser.
 * Signatures certify provenance of the trusted producer's assertions, not behavioral correctness.
 */
export function authenticateDeliveryArtifact(input: unknown, trust: DeliveryTrust, now: number,
  expected: { storyId: number; taskKey: string; scopeHash: string; approvalHash: string; sourceHash: string; checkPolicyHash: string; allowedPaths: string[]; criteriaTotal: number }) {
  if (!exact(input, ['envelope', 'source', 'candidate']) || !exact(input.envelope, ['claim', 'signature'])) return reject()
  const c = input.envelope.claim
  if (!exact(c, ['version', 'keyId', 'authorityRevision', 'taskKey', 'storyId', 'scopeHash', 'approvalHash', 'attemptId', 'attempt',
    'sourceHash', 'candidateHash', 'checkPolicyHash', 'verifierHash', 'qualificationHash', 'image', 'runtimeHash',
    'terminationHash', 'verificationHash', 'criteriaPassed', 'criteriaTotal', 'verdict', 'nativeCodex', 'issuedAt'])) return reject()
  if (c.version !== 1 || c.nativeCodex !== true || typeof c.keyId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(c.keyId)
    || !Number.isSafeInteger(c.authorityRevision) || (c.authorityRevision as number) < 1
    || typeof c.attemptId !== 'string' || !uuid.test(c.attemptId) || !Number.isSafeInteger(c.attempt) || (c.attempt as number) < 1 || (c.attempt as number) > 3
    || !Number.isSafeInteger(c.issuedAt) || !Number.isSafeInteger(now) || (c.issuedAt as number) < 1 || (c.issuedAt as number) > now
    || !['pass', 'fail', 'error'].includes(c.verdict as string)
    || !Number.isSafeInteger(c.criteriaTotal) || (c.criteriaTotal as number) < 1 || (c.criteriaTotal as number) > 1000
    || !Number.isSafeInteger(c.criteriaPassed) || (c.criteriaPassed as number) < 0 || (c.criteriaPassed as number) > (c.criteriaTotal as number)
    || (c.verdict === 'pass' && c.criteriaPassed !== c.criteriaTotal)) return reject()
  for (const key of ['taskKey', 'scopeHash', 'approvalHash', 'sourceHash', 'candidateHash', 'checkPolicyHash', 'verifierHash', 'qualificationHash', 'runtimeHash', 'terminationHash', 'verificationHash']) {
    if (typeof c[key] !== 'string' || !sha.test(c[key] as string)) return reject()
  }
  for (const key of ['storyId', 'taskKey', 'scopeHash', 'approvalHash', 'sourceHash', 'checkPolicyHash', 'criteriaTotal'] as const) if (c[key] !== expected[key]) return reject()
  if (trust.nativeRuntimeQualified !== true || !(trust.publicKey instanceof KeyObject) || trust.publicKey.type !== 'public'
    || trust.publicKey.asymmetricKeyType !== 'ed25519' || !Number.isSafeInteger(trust.validFrom) || !Number.isSafeInteger(trust.expiresAt)
    || trust.validFrom > (c.issuedAt as number) || trust.expiresAt <= now) return reject()
  for (const key of ['keyId', 'authorityRevision', 'runtimeHash', 'verifierHash', 'qualificationHash', 'image'] as const) if (c[key] !== trust[key]) return reject()
  if (typeof c.image !== 'string' || !/^node@sha256:[a-f0-9]{64}$/.test(c.image)
    || typeof input.envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(input.envelope.signature)) return reject()
  const signature = Buffer.from(input.envelope.signature, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== input.envelope.signature
    || !verify(null, deliverySigningBytes(c as DeliveryClaim), trust.publicKey, signature)) return reject()
  const source = validateSourceCapsule(input.source, expected.sourceHash)
  const candidate = validateSourceCapsule(input.candidate, c.candidateHash as string)
  if (source.sha256 === candidate.sha256 || source.files.length !== candidate.files.length
    || !Array.isArray(expected.allowedPaths) || !expected.allowedPaths.length
    || source.files.some((file, index) => file.path !== candidate.files[index].path
      || (file.sha256 !== candidate.files[index].sha256 && !expected.allowedPaths.includes(file.path)))) return reject()
  // Text is displayed literally in the review UI and never imported/executed on this host.
  for (const file of [...source.files, ...candidate.files]) {
    const bytes = Buffer.from(file.content, 'base64')
    if (!bytes.equals(Buffer.from(bytes.toString('utf8'))) || bytes.includes(0)) return reject()
  }
  const artifact: DeliveryArtifact = { envelope: { claim: structuredClone(c) as DeliveryClaim, signature: input.envelope.signature }, source, candidate }
  return { artifact, artifactHash: digest(artifact), passed: c.verdict === 'pass' }
}
