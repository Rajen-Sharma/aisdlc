// Ephemeral cryptographic test vectors. No provider execution or real delivery.
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { digest } from '../../src/sdlc/contracts'
import { deliverySigningBytes, type DeliveryClaim, type DeliveryTrust } from '../../src/sdlc/delivery-artifact'
import { currentDeliverySigningBytes, type CurrentDelivery } from '../../src/sdlc/delivery-current'
import type { SourceCapsule } from '../../src/sdlc/source-capsule'

export function deliveryFixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const capsule = (content: string): SourceCapsule => {
    const files = [{ path: 'src/synthetic.mjs', bytes: Buffer.byteLength(content), sha256: hash(content), content: Buffer.from(content).toString('base64') }]
    return { version: 1, files, sha256: hash(JSON.stringify({ version: 1, files })) }
  }
  const source = capsule('// synthetic base\n'), candidate = capsule('// synthetic unexecuted candidate\n')
  const now = Math.floor(Date.now() / 1000)
  const trust: DeliveryTrust = { keyId: 'test-delivery-root', authorityRevision: 1, publicKey, nativeRuntimeQualified: true,
    runtimeHash: digest('runtime'), verifierHash: digest('verifier'), qualificationHash: digest('qualification'),
    image: `node@sha256:${'d'.repeat(64)}`, validFrom: now - 10, expiresAt: now + 600 }
  const claim: DeliveryClaim = { version: 1, keyId: trust.keyId, authorityRevision: 1, taskKey: digest('task'), storyId: 1,
    scopeHash: digest('scope'), approvalHash: digest('approvals'), attemptId: randomUUID(), attempt: 1,
    sourceHash: source.sha256, candidateHash: candidate.sha256, checkPolicyHash: digest('checks'), verifierHash: trust.verifierHash,
    qualificationHash: trust.qualificationHash, image: trust.image, runtimeHash: trust.runtimeHash,
    terminationHash: digest('termination'), verificationHash: digest('verification'), criteriaPassed: 1, criteriaTotal: 1,
    verdict: 'pass', nativeCodex: true, issuedAt: now }
  const envelope = () => ({ claim: structuredClone(claim), signature: sign(null, deliverySigningBytes(claim), privateKey).toString('base64') })
  const artifact = () => ({ envelope: envelope(), source: structuredClone(source), candidate: structuredClone(candidate) })
  const expected = () => ({ storyId: claim.storyId, taskKey: claim.taskKey, scopeHash: claim.scopeHash, approvalHash: claim.approvalHash,
    sourceHash: source.sha256, checkPolicyHash: claim.checkPolicyHash, allowedPaths: ['src/synthetic.mjs'], criteriaTotal: 1 })
  const current = (overrides: Partial<CurrentDelivery> = {}) => {
    const state: CurrentDelivery = { version: 1, keyId: trust.keyId, authorityRevision: trust.authorityRevision,
      taskKey: claim.taskKey, artifactHash: digest(artifact()), scopeHash: claim.scopeHash, approvalHash: claim.approvalHash,
      attemptId: claim.attemptId, terminationHash: claim.terminationHash, verificationHash: claim.verificationHash,
      issuedAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 15, ...overrides }
    return { state, signature: sign(null, currentDeliverySigningBytes(state), privateKey).toString('base64') }
  }
  const publicConfig = () => {
    const { publicKey: _, ...policy } = trust
    return { ...policy, publicKeyDer: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }
  }
  return { trust, claim, artifact, expected, current, publicConfig, now }
}
