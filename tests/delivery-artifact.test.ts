import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { authenticateDeliveryArtifact } from '../src/sdlc/delivery-artifact'
import { authenticateCurrentDelivery } from '../src/sdlc/delivery-current'
import { deliveryFixture } from './helpers/delivery-evidence'

test('delivery evidence binds source, candidate, independent checks and current public-only qualification', () => {
  const f = deliveryFixture()
  const result = authenticateDeliveryArtifact(f.artifact(), f.trust, f.now, f.expected())
  assert.equal(result.passed, true)
  const current = authenticateCurrentDelivery(f.current(), f.trust, f.claim.taskKey, f.now)
  assert.equal(current.artifactHash, result.artifactHash)
  // Detached output prevents mutations of a sender-owned envelope changing retained bytes.
  const input = f.artifact(), retained = authenticateDeliveryArtifact(input, f.trust, f.now, f.expected())
  input.envelope.claim.criteriaPassed = 0
  assert.equal(retained.artifact.envelope.claim.criteriaPassed, 1)
})

test('synthetic flags, forged signatures, wrong artifact scope and unauthorized paths cannot promote', () => {
  const f = deliveryFixture()
  for (const mutate of [
    (a: ReturnType<typeof f.artifact>) => { a.envelope.claim.criteriaPassed = 0 },
    (a: ReturnType<typeof f.artifact>) => { a.envelope.signature = 'A'.repeat(86) + '==' },
    (a: ReturnType<typeof f.artifact>) => { Object.assign(a.envelope.claim, { syntheticOnly: true }) },
    (a: ReturnType<typeof f.artifact>) => { Object.assign(a.envelope.claim, { nativeCodex: false }) },
    (a: ReturnType<typeof f.artifact>) => { a.candidate.files[0].content = Buffer.from('tampered').toString('base64') },
  ]) {
    const artifact = f.artifact(); mutate(artifact)
    assert.throws(() => authenticateDeliveryArtifact(artifact, f.trust, f.now, f.expected()))
  }
  for (const change of [{ scopeHash: 'a'.repeat(64) }, { criteriaTotal: 2 }, { allowedPaths: ['src/other.mjs'] }]) {
    assert.throws(() => authenticateDeliveryArtifact(f.artifact(), f.trust, f.now, { ...f.expected(), ...change }))
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  for (const changed of [{ publicKey }, { publicKey: privateKey }, { authorityRevision: 2 }, { expiresAt: f.now }, { validFrom: f.now + 1 }, { nativeRuntimeQualified: false }]) {
    assert.throws(() => authenticateDeliveryArtifact(f.artifact(), { ...f.trust, ...changed } as typeof f.trust, f.now, f.expected()))
  }
})

test('failed/error checks stay visible but cannot assert all criteria passed as a successful delivery', () => {
  const f = deliveryFixture()
  f.claim.verdict = 'fail'; f.claim.criteriaPassed = 0
  assert.equal(authenticateDeliveryArtifact(f.artifact(), f.trust, f.now, f.expected()).passed, false)
  f.claim.verdict = 'error'
  assert.equal(authenticateDeliveryArtifact(f.artifact(), f.trust, f.now, f.expected()).passed, false)
  f.claim.verdict = 'pass'
  assert.throws(() => authenticateDeliveryArtifact(f.artifact(), f.trust, f.now, f.expected()))
})

test('restored or stale delivery heads, wrong current keys and extended freshness windows deny', () => {
  const f = deliveryFixture()
  for (const state of [f.current({ issuedAt: f.now - 16, expiresAt: f.now - 1 }),
    f.current({ expiresAt: f.now + 16 }), f.current({ issuedAt: f.now + 1 }), f.current({ authorityRevision: 2 })]) {
    assert.throws(() => authenticateCurrentDelivery(state, f.trust, f.claim.taskKey, f.now))
  }
  const current = f.current(); current.state.artifactHash = 'f'.repeat(64)
  assert.throws(() => authenticateCurrentDelivery(current, f.trust, f.claim.taskKey, f.now))
})
