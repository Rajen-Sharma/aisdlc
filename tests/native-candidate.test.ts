import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { authenticateNativeCandidate, nativeCandidateSigningBytes, type NativeCandidate } from '../src/sdlc/native-candidate'
import { deliveryFixture } from './helpers/delivery-evidence'

test('native provenance binds the admitted thread and exact runtime/candidate without granting acceptance', () => {
  const f = deliveryFixture(), keys = generateKeyPairSync('ed25519'), hostId = randomUUID(), bootId = randomUUID()
  const attemptId = randomUUID(), admissionId = randomUUID(), challengeNonce = randomUUID()
  const context = { policy: { taskKey: f.claim.taskKey, runtimeHash: f.claim.runtimeHash }, sourceHash: f.claim.sourceHash,
    attempt: { attemptId, issuedAt: f.now, reservationHash: 'a'.repeat(64), runtime: { hostId, bootId, unit: `aisdlc-attempt-${attemptId}.service` },
      admission: { operationId: admissionId, challengeNonce } },
    guardian: { keyId: 'synthetic-guardian', revision: 1, publicKey: keys.publicKey, publicKeyDer: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') } }
  const record: NativeCandidate = { version: 1, keyId: context.guardian.keyId, authorityRevision: 1, taskKey: f.claim.taskKey,
    attemptId, admissionId, challengeNonce, reservationHash: context.attempt.reservationHash, runtimeHash: f.claim.runtimeHash,
    ...context.attempt.runtime, sourceHash: f.claim.sourceHash, candidateHash: f.claim.candidateHash, threadId: 'thread_test', turnId: 'turn_test',
    observedAt: f.now, provider: 'openai', authentication: 'chatgpt', model: 'gpt-6-sol', maxTurns: 1, usage: null }
  const envelope = () => ({ record: structuredClone(record), signature: sign(null, nativeCandidateSigningBytes(record), keys.privateKey).toString('base64') })
  assert.equal(authenticateNativeCandidate(envelope(), f.artifact().candidate, context, f.now).capsule.sha256, f.claim.candidateHash)
  for (const changes of [{ admissionId: randomUUID() }, { bootId: randomUUID() }, { candidateHash: 'b'.repeat(64) },
    { authentication: 'apiKey' }, { maxTurns: 2 }, { observedAt: f.now + 1 }, { usage: { inputTokens: 2, outputTokens: 3, totalTokens: 4 } }]) {
    const original = structuredClone(record)
    Object.assign(record, changes)
    assert.throws(() => authenticateNativeCandidate(envelope(), f.artifact().candidate, context, f.now))
    Object.assign(record, original)
  }
  const forged = envelope(); forged.record.turnId = 'other'
  assert.throws(() => authenticateNativeCandidate(forged, f.artifact().candidate, context, f.now))
  assert.throws(() => authenticateNativeCandidate(envelope(), f.artifact().candidate, { ...context, attempt: { ...context.attempt, admission: null } }, f.now))
})
