// Protocol test vectors only: synthetic source/comments, ephemeral keys and no model calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { AzureAuthorityLedger } from '../scripts/azure-authority-ledger.mjs'
import { AttemptAuthority } from '../scripts/authority-attempts.mjs'
import { AttemptEvidenceVerifier, attemptEvidenceSigningBytes } from '../scripts/attempt-evidence.mjs'
import { NativeDeliveryAuthority } from '../src/sdlc/native-delivery-authority'
import { authenticateDeliveryArtifact, deliverySigningBytes, type DeliveryClaim } from '../src/sdlc/delivery-artifact'
import { nativeCandidateSigningBytes, type NativeCandidate } from '../src/sdlc/native-candidate'
import { authenticateCurrentDelivery } from '../src/sdlc/delivery-current'
import { digest } from '../src/sdlc/contracts'
import { deliveryFixture } from './helpers/delivery-evidence'

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value))
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
test('native handoff retains authenticated usage, verifier receipt and full artifact across fresh external reads', async () => {
  const f = deliveryFixture(), root = generateKeyPairSync('ed25519'), guardian = generateKeyPairSync('ed25519')
  let stored = Buffer.alloc(0), revision = 1
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticdelivery', publicKey: root.publicKey, token: async () => 'synthetic',
    transport: async (_url: unknown, options: any) => {
      const etag = `"0x${revision.toString(16)}"`
      if (options.method === 'GET') return new Response(Buffer.from(stored), { headers: { etag } })
      if (options.headers['If-Match'] !== etag || options.headers['x-ms-blob-condition-appendpos'] !== String(stored.length)) return new Response(null, { status: 412 })
      const offset = stored.length; stored = Buffer.concat([stored, options.body]); revision++
      return new Response(null, { status: 201, headers: { etag: `"0x${revision.toString(16)}"`, 'x-ms-blob-append-offset': String(offset) } })
    } })
  const configuration = { storyId: 1, taskKey: f.claim.taskKey, scopeHash: f.claim.scopeHash, approvalHash: f.claim.approvalHash,
    source: f.artifact().source, contract: { sourceHash: f.claim.sourceHash, checkPolicyHash: f.claim.checkPolicyHash,
      allowedPaths: ['src/synthetic.mjs'], acceptanceCriteria: ['Synthetic protocol test only.'] },
    trust: { ...f.trust, publicKey: root.publicKey }, guardian: { keyId: 'synthetic-guardian', revision: 1, publicKey: guardian.publicKey,
      publicKeyDer: guardian.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }, policyText: '', runnerSource: '', workspaceRoot: '/nonexistent' }
  const expected = { ...f.expected() }
  const proof = new AttemptEvidenceVerifier({ now: () => f.now, resolveCurrent: async ({ kind, runtimeHash }: any) => ({ kind, runtimeHash,
    keyId: kind === 'termination' ? configuration.guardian.keyId : configuration.trust.keyId,
    revision: 1, publicKey: kind === 'termination' ? guardian.publicKey : root.publicKey,
    validFrom: f.now - 10, validUntil: f.now + 500, verifierHash: f.trust.verifierHash, qualificationHash: f.trust.qualificationHash, image: f.trust.image }) })
  const signRoot = async (input: Uint8Array) => sign(null, input, root.privateKey).toString('base64')
  const attempts = new AttemptAuthority({ ledger, now: () => f.now, signRecord: signRoot, authorizeCurrent: async () => true,
    verifyEvidence: async (input: Uint8Array, context: any) => {
      if (context.action !== 'delivery') return proof.verify(input, context)
      try { return authenticateDeliveryArtifact(JSON.parse(Buffer.from(input).toString()), configuration.trust, f.now, expected).artifactHash === context.payload.artifactHash }
      catch { return false }
    } })
  const registration = await attempts.register({ taskKey: f.claim.taskKey, scopeHash: f.claim.scopeHash, approvalHash: f.claim.approvalHash,
    runtimeHash: f.claim.runtimeHash, expiresAt: f.now + 300, maxAttempts: 3, subscriptionOnly: true, additionalChargesAllowed: false, model: 'gpt-6-sol', maxTurnsPerAttempt: 1 })
  const intent = await attempts.begin({ taskKey: f.claim.taskKey, registrationId: registration.operationId, attempt: 1,
    reservationHash: 'b'.repeat(64), hostId: randomUUID(), bootId: randomUUID(), deadline: f.now + 100 })
  const challengeNonce = randomUUID()
  const admission = await attempts.admit({ taskKey: f.claim.taskKey, attemptId: intent.operationId, challengeNonce })
  const attempt = (await attempts.inspect(f.claim.taskKey)).task!.attempts[0]
  const candidate = f.artifact().candidate
  const native: NativeCandidate = { version: 1, keyId: configuration.guardian.keyId, authorityRevision: 1,
    taskKey: f.claim.taskKey, attemptId: intent.operationId, admissionId: admission.operationId, challengeNonce, reservationHash: attempt.reservationHash,
    runtimeHash: f.claim.runtimeHash, ...attempt.runtime, sourceHash: f.claim.sourceHash, candidateHash: candidate.sha256,
    threadId: 'thread_fixture', turnId: 'turn_fixture', observedAt: f.now, provider: 'openai', authentication: 'chatgpt', model: 'gpt-6-sol', maxTurns: 1,
    usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } }
  const provenance = { record: native, signature: sign(null, nativeCandidateSigningBytes(native), guardian.privateKey).toString('base64') }
  const terminationRecord = { version: 1, kind: 'termination', keyId: configuration.guardian.keyId, authorityRevision: 1,
    taskKey: f.claim.taskKey, attemptId: intent.operationId, reservationHash: attempt.reservationHash, runtimeHash: f.claim.runtimeHash,
    ...attempt.runtime, observedAt: f.now, expiresAt: f.now + 30, rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
  const terminationProof = { record: terminationRecord, signature: sign(null, attemptEvidenceSigningBytes(terminationRecord), guardian.privateKey).toString('base64') }
  const service = new NativeDeliveryAuthority({ attempts, proofVerifier: proof, signRecord: signRoot, configuration, now: () => f.now })
  const invalid = structuredClone(candidate); invalid.files[0].content = Buffer.from('forged').toString('base64')
  await assert.rejects(service.finish({ attemptId: intent.operationId, candidate: invalid, provenance, terminationProof }))
  assert.equal((await attempts.inspect(f.claim.taskKey)).task!.attempts[0].candidateHash, null)
  await service.finish({ attemptId: intent.operationId, candidate, provenance, terminationProof })
  assert.equal((await attempts.inspect(f.claim.taskKey)).accounting.usage.knownTotalTokens, 5)
  await assert.rejects(service.head())
  // This signed report is an ephemeral protocol test vector, never a claim that
  // the comment-only candidate passed real taskboard checks. Linux CI tests the actual verifier separately.
  const report = { candidateHash: candidate.sha256, verdict: 'pass', syntheticProtocolVector: true }
  const verificationRecord = { version: 2, kind: 'verification', keyId: f.trust.keyId, authorityRevision: 1,
    taskKey: f.claim.taskKey, attemptId: intent.operationId, reservationHash: attempt.reservationHash, runtimeHash: f.claim.runtimeHash,
    ...attempt.runtime, observedAt: f.now, expiresAt: f.now + 30, candidateHash: candidate.sha256, verdict: 'pass',
    verifierHash: f.trust.verifierHash, qualificationHash: f.trust.qualificationHash, image: f.trust.image,
    evidenceHash: hash(bytes(report)), provenanceHash: hash(bytes(provenance)) }
  const verifierProof = { record: verificationRecord, signature: await signRoot(attemptEvidenceSigningBytes(verificationRecord)) }
  const verificationHash = hash(bytes(verifierProof)), evidence = { proof: verifierProof, report, provenance }
  await attempts.verification({ taskKey: f.claim.taskKey, attemptId: intent.operationId, candidateHash: candidate.sha256, verificationHash, evidence }, bytes(verifierProof))
  const claim: DeliveryClaim = { ...f.claim, attemptId: intent.operationId, terminationHash: hash(bytes(terminationProof)), verificationHash }
  const artifact = { envelope: { claim, signature: await signRoot(deliverySigningBytes(claim)) }, source: configuration.source, candidate }
  const artifactHash = digest(artifact)
  await attempts.deliver({ taskKey: f.claim.taskKey, attemptId: intent.operationId, artifactHash, artifact }, bytes(artifact))
  const current = await service.head()
  assert.equal(current.current.state.artifactHash, artifactHash)
  assert.equal(authenticateCurrentDelivery(current.current, configuration.trust, f.claim.taskKey, f.now).attemptId, intent.operationId)
  assert.equal(current.evidence.provenance.record.threadId, 'thread_fixture')
  assert.deepEqual(current.artifact, artifact)
  await assert.rejects(attempts.deliver({ taskKey: f.claim.taskKey, attemptId: intent.operationId, artifactHash, artifact }, bytes(artifact)))
  await attempts.revoke({ taskKey: f.claim.taskKey, reasonHash: 'f'.repeat(64) })
  await assert.rejects(service.head())
})
