// Ephemeral protocol qualification only. The supplied candidates are named
// verifier controls, never real agent work or writes to the accepted fixture.
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { AzureAuthorityLedger } from './azure-authority-ledger.mjs'
import { AttemptAuthority } from './authority-attempts.mjs'
import { AttemptEvidenceVerifier, attemptEvidenceSigningBytes } from './attempt-evidence.mjs'
import { NativeDeliveryAuthority } from '../src/sdlc/native-delivery-authority.ts'
import { authenticateDeliveryArtifact } from '../src/sdlc/delivery-artifact.ts'
import { authenticateCurrentDelivery } from '../src/sdlc/delivery-current.ts'
import { authenticateShowcase } from '../src/sdlc/delivery-showcase.ts'
import { nativeCandidateSigningBytes } from '../src/sdlc/native-candidate.ts'
import { digest } from '../src/sdlc/contracts.ts'

export async function qualifyNativeDelivery({ source, candidate, policyText, runnerSource, verifierHash, image, shouldPass }) {
  assert.equal(process.platform, 'linux')
  assert.ok(process.env.GITHUB_ACTIONS === 'true' || process.env.AISDLC_QUALIFICATION_HOST === 'azure-tools-trial')
  const root = generateKeyPairSync('ed25519'), guardian = generateKeyPairSync('ed25519'), now = () => Math.floor(Date.now() / 1000)
  let stored = Buffer.alloc(0), revision = 1
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticdelivery', publicKey: root.publicKey, token: async () => 'synthetic',
    transport: async (_, options) => {
      const etag = `"0x${revision.toString(16)}"`
      if (options.method === 'GET') return new Response(Buffer.from(stored), { headers: { etag } })
      if (options.headers['If-Match'] !== etag || options.headers['x-ms-blob-condition-appendpos'] !== String(stored.length)) return new Response(null, { status: 412 })
      const offset = stored.length; stored = Buffer.concat([stored, options.body]); revision++
      return new Response(null, { status: 201, headers: { etag: `"0x${revision.toString(16)}"`, 'x-ms-blob-append-offset': String(offset) } })
    } })
  const hash = value => createHash('sha256').update(value).digest('hex')
  const policyHash = hash(policyText), taskKey = digest({ syntheticProtocol: randomUUID() })
  const trust = { keyId: 'synthetic-protocol-root', authorityRevision: 1, publicKey: root.publicKey, nativeRuntimeQualified: true,
    runtimeHash: digest('synthetic-not-native'), verifierHash, qualificationHash: digest('synthetic-qualification-only'), image,
    validFrom: now() - 10, expiresAt: now() + 600 }
  const configuration = { storyId: 1, taskKey, scopeHash: digest('synthetic-scope'), approvalHash: digest('synthetic-approvals'), source,
    contract: { sourceHash: source.sha256, checkPolicyHash: policyHash, allowedPaths: ['src/filter-tasks.mjs'],
      acceptanceCriteria: JSON.parse(policyText).requirements },
    guardian: { keyId: 'synthetic-guardian', revision: 1, publicKey: guardian.publicKey,
      publicKeyDer: guardian.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }, trust,
    policyText, runnerSource, workspaceRoot: await realpath(tmpdir()) }
  const proof = new AttemptEvidenceVerifier({ resolveCurrent: async ({ kind, runtimeHash }) => ({ kind, runtimeHash,
    keyId: kind === 'termination' ? configuration.guardian.keyId : trust.keyId, revision: 1,
    publicKey: kind === 'termination' ? guardian.publicKey : root.publicKey, validFrom: trust.validFrom, validUntil: trust.expiresAt,
    verifierHash, qualificationHash: trust.qualificationHash, image }) })
  const signRoot = async bytes => sign(null, bytes, root.privateKey).toString('base64')
  const expected = { storyId: 1, taskKey, scopeHash: configuration.scopeHash, approvalHash: configuration.approvalHash,
    sourceHash: source.sha256, checkPolicyHash: policyHash, allowedPaths: configuration.contract.allowedPaths,
    criteriaTotal: configuration.contract.acceptanceCriteria.length }
  const attempts = new AttemptAuthority({ ledger, signRecord: signRoot, authorizeCurrent: async () => true,
    verifyEvidence: async (bytes, context) => {
      if (context.action !== 'delivery') return proof.verify(bytes, context)
      try { return authenticateDeliveryArtifact(JSON.parse(Buffer.from(bytes).toString()), trust, now(), expected).artifactHash === context.payload.artifactHash }
      catch { return false }
    } })
  const registered = await attempts.register({ taskKey, scopeHash: configuration.scopeHash, approvalHash: configuration.approvalHash,
    runtimeHash: trust.runtimeHash, expiresAt: now() + 300, maxAttempts: 3, subscriptionOnly: true,
    additionalChargesAllowed: false, model: 'gpt-6-sol', maxTurnsPerAttempt: 1 })
  const begun = await attempts.begin({ taskKey, registrationId: registered.operationId, attempt: 1,
    reservationHash: digest('synthetic-reservation'), hostId: randomUUID(), bootId: randomUUID(), deadline: now() + 120 })
  const challengeNonce = randomUUID(), admitted = await attempts.admit({ taskKey, attemptId: begun.operationId, challengeNonce })
  const attempt = (await attempts.inspect(taskKey)).task.attempts[0], observedAt = now()
  const native = { version: 1, keyId: configuration.guardian.keyId, authorityRevision: 1, taskKey, attemptId: begun.operationId,
    admissionId: admitted.operationId, challengeNonce, reservationHash: attempt.reservationHash, runtimeHash: trust.runtimeHash,
    ...attempt.runtime, sourceHash: source.sha256, candidateHash: candidate.sha256, threadId: 'synthetic_thread', turnId: 'synthetic_turn',
    observedAt, provider: 'openai', authentication: 'chatgpt', model: 'gpt-6-sol', maxTurns: 1, usage: null }
  const provenance = { record: native, signature: sign(null, nativeCandidateSigningBytes(native), guardian.privateKey).toString('base64') }
  const cleanup = { version: 1, kind: 'termination', keyId: configuration.guardian.keyId, authorityRevision: 1, taskKey,
    attemptId: begun.operationId, reservationHash: attempt.reservationHash, runtimeHash: trust.runtimeHash, ...attempt.runtime,
    observedAt, expiresAt: observedAt + 30, rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
  const terminationProof = { record: cleanup, signature: sign(null, attemptEvidenceSigningBytes(cleanup), guardian.privateKey).toString('base64') }
  const service = new NativeDeliveryAuthority({ attempts, proofVerifier: proof, signRecord: signRoot, configuration })
  await service.finish({ attemptId: begun.operationId, candidate, provenance, terminationProof })
  const verified = await service.verify({ attemptId: begun.operationId, candidate, provenance })
  assert.equal(verified.artifact.envelope.claim.verdict, shouldPass ? 'pass' : 'fail')
  const current = await service.head(), claim = current.artifact.envelope.claim
  assert.equal(authenticateCurrentDelivery(current.current, trust, taskKey, now()).artifactHash, digest(current.artifact))
  assert.equal(authenticateShowcase(current.evidence, claim).cases.length, 22)
  assert.equal((await service.verify({ attemptId: begun.operationId, candidate, provenance })).artifactHash, current.current.state.artifactHash)
  if (!shouldPass) {
    const proofBytes = Buffer.from(JSON.stringify(current.evidence.proof))
    await attempts.repair({ taskKey, attemptId: begun.operationId, candidateHash: candidate.sha256,
      verifierEvidenceHash: hash(proofBytes) }, proofBytes)
  }
  await attempts.revoke({ taskKey, reasonHash: digest('qualification complete') })
  await assert.rejects(service.head())
  return { syntheticOnly: true, realModelCalls: 0, actualHumanApprovals: 0, nativeRuntimeQualified: false,
    verdict: claim.verdict, replayCases: current.evidence.report.replay.length, archivedBytes: stored.length, executionAllowed: false }
}
