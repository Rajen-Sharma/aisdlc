import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { AttemptEvidenceVerifier, attemptEvidenceSigningBytes } from '../scripts/attempt-evidence.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
function fixture(kind = 'termination') {
  const keys = generateKeyPairSync('ed25519')
  let now = 1800000010
  const attemptId = randomUUID()
  const attempt = { attemptId, issuedAt: now - 10, reservationHash: hash('reservation'), candidateHash: hash('candidate'),
    runtime: { hostId: randomUUID(), bootId: randomUUID(), unit: `aisdlc-attempt-${attemptId}.service` } }
  const context = { action: kind === 'termination' ? 'settle' : 'repair',
    policy: { taskKey: hash('task'), runtimeHash: hash('runtime') }, attempt }
  const policy = { kind, runtimeHash: context.policy.runtimeHash, keyId: 'guardian-one', revision: 1,
    publicKey: keys.publicKey, validFrom: now - 100, validUntil: now + 100,
    verifierHash: hash('verifier'), qualificationHash: hash('qualification'), image: 'node@sha256:' + hash('image') }
  const record = { version: 1, kind, keyId: policy.keyId, authorityRevision: 1,
    taskKey: context.policy.taskKey, attemptId, reservationHash: attempt.reservationHash,
    runtimeHash: context.policy.runtimeHash, ...attempt.runtime, observedAt: now, expiresAt: now + 20,
    ...(kind === 'termination' ? { rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
      : { candidateHash: attempt.candidateHash, verdict: 'fail', verifierHash: policy.verifierHash,
        qualificationHash: policy.qualificationHash, image: policy.image }) }
  const envelope = (extra = {}, key = keys.privateKey) => {
    const value = { ...record, ...extra }
    return Buffer.from(JSON.stringify({ record: value, signature: sign(null, attemptEvidenceSigningBytes(value), key).toString('base64') }))
  }
  const verifier = new AttemptEvidenceVerifier({ resolveCurrent: async selected => {
    assert.deepEqual(selected, { kind, runtimeHash: context.policy.runtimeHash })
    return policy
  }, now: () => now })
  return { context, policy, record, envelope, verifier, advance: seconds => { now += seconds } }
}

test('current independently selected Ed25519 key authenticates exact runtime and candidate evidence', async () => {
  for (const kind of ['termination', 'verification']) {
    const state = fixture(kind)
    assert.equal(await state.verifier.verify(state.envelope(), state.context), true)
    const wrong = generateKeyPairSync('ed25519')
    assert.equal(await state.verifier.verify(state.envelope({}, wrong.privateKey), state.context), false)
    state.policy.publicKey = wrong.publicKey
    assert.equal(await state.verifier.verify(state.envelope(), state.context), false)
  }
})

test('root exit without cgroup absence and drained launch writers cannot settle an attempt', async () => {
  const state = fixture()
  for (const extra of [{ rootExited: false }, { cgroupEmpty: false }, { launchWritersDrained: false },
    { launchWritersDrained: 'true' }, { rootExited: 1 }, { publicKey: 'sender-selected' },
    { hostId: randomUUID() }, { bootId: randomUUID() }, { unit: 'other.service' },
    { attemptId: randomUUID() }, { taskKey: hash('other') }, { reservationHash: hash('old') }, { runtimeHash: hash('new') }]) {
    assert.equal(await state.verifier.verify(state.envelope(extra), state.context), false)
  }
})

test('signed cleanup retains known usage even without a candidate and denies changed accounting', async () => {
  const state = fixture(), usage = { inputTokens: 7, outputTokens: 3, totalTokens: 10 }
  const evidence = state.envelope({ version: 2, usage })
  assert.equal(await state.verifier.verify(evidence, { ...state.context, payload: { usage } }), true)
  for (const changed of [null, { ...usage, totalTokens: 11 }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }]) {
    assert.equal(await state.verifier.verify(evidence, { ...state.context, payload: { usage: changed } }), false)
  }
  assert.equal(await state.verifier.verify(state.envelope({ version: 2, usage: { ...usage, totalTokens: 11 } }), state.context), false)
  assert.equal(await state.verifier.verify(state.envelope({ version: 2, usage: null }), { ...state.context, payload: { usage: null } }), true)
})

test('replayed revision, expired evidence, future observation and withdrawn key deny', async () => {
  const state = fixture()
  for (const extra of [{ authorityRevision: 2 }, { keyId: 'guardian-other' },
    { observedAt: state.record.observedAt + 1 }, { observedAt: state.context.attempt.issuedAt - 1 },
    { expiresAt: state.record.observedAt }, { expiresAt: state.record.observedAt + 31 }]) {
    assert.equal(await state.verifier.verify(state.envelope(extra), state.context), false)
  }
  state.policy.revision = 2
  assert.equal(await state.verifier.verify(state.envelope(), state.context), false)
  state.policy.revision = 1
  state.advance(20)
  assert.equal(await state.verifier.verify(state.envelope(), state.context), false)
})

test('repair evidence must be a failed verdict for the exact candidate and reviewed verifier', async () => {
  const state = fixture('verification')
  for (const extra of [{ verdict: 'pass' }, { verdict: 'error' }, { candidateHash: hash('other') },
    { verifierHash: hash('other') }, { qualificationHash: hash('other') }, { image: 'node:latest' }, { image: null }]) {
    assert.equal(await state.verifier.verify(state.envelope(extra), state.context), false)
  }
  state.policy.image = null
  assert.equal(await state.verifier.verify(state.envelope({ image: null }), state.context), false)
})

test('bounded transport, public-only keys and unavailable current policy fail closed', async () => {
  const state = fixture()
  for (const bytes of [Buffer.alloc(32769), Buffer.from([255]), Buffer.from('{}'), Buffer.from('[]')]) {
    assert.equal(await state.verifier.verify(bytes, state.context), false)
  }
  state.policy.publicKey = generateKeyPairSync('ed25519').privateKey
  assert.equal(await state.verifier.verify(state.envelope(), state.context), false)
  const missing = new AttemptEvidenceVerifier({ resolveCurrent: async () => { throw new Error('Unavailable') } })
  assert.equal(await missing.verify(state.envelope(), state.context), false)
})

test('policy resolution cannot extend evidence lifetime or hide backwards clock movement', async () => {
  const state = fixture()
  for (const delta of [21, -1]) {
    const verifier = new AttemptEvidenceVerifier({ now: () => state.record.observedAt,
      resolveCurrent: async () => state.policy })
    assert.equal(await verifier.verify(state.envelope(), state.context), true)
    let reads = 0
    const changing = new AttemptEvidenceVerifier({ now: () => state.record.observedAt + (reads++ ? delta : 0),
      resolveCurrent: async () => state.policy })
    assert.equal(await changing.verify(state.envelope(), state.context), false)
  }
})
