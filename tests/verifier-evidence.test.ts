import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { digest } from '../src/sdlc/contracts'
import { verifierImage } from '../src/sdlc/task-binding'
import { authenticateVerifierEvidence, supervisorIdentity, validateChallenge, verifierSigningBytes, type SupervisorPolicy, type VerifierChallenge, type VerifierClaim } from '../src/sdlc/verifier-evidence'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const policy: SupervisorPolicy = { supervisorKey: 'synthetic-supervisor', keyId: 'test-key-one', publicKey, verifierHash: hash('verifier'), qualificationHash: hash('qualification'), image: verifierImage }
  const record: VerifierChallenge = { version: 1, nonce: randomUUID(), bindingHash: hash('binding'), ...supervisorIdentity(policy), issuedAt: 1000, expiresAt: 1300, syntheticOnly: true, executionAllowed: false }
  const receipt = validateChallenge(record, digest(record)), bytes = Buffer.from('Synthetic evidence only; no code was executed.')
  const claim: VerifierClaim = { version: 1, challengeHash: receipt.challengeHash, evidenceHash: hash(bytes), evidenceBytes: bytes.length, verdict: 'pass', syntheticOnly: true, executionAllowed: false }
  const signed = (body: VerifierClaim = claim) => JSON.stringify({ claim: body, signature: sign(null, verifierSigningBytes(body), privateKey).toString('base64') })
  return { policy, record, receipt, bytes, claim, signed, privateKey }
}
test('signed verifier evidence authenticates exact bounded bytes without granting acceptance', () => {
  const f = fixture(), result = authenticateVerifierEvidence(f.receipt, f.policy, f.signed(), f.bytes, 1000)
  assert.equal(result.authenticated, true)
  assert.equal(result.executionAllowed, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(Buffer.from(result.evidenceBase64, 'base64').toString(), f.bytes.toString())
  // Canonical JSON signing survives JSONB key reordering, never arbitrary signature text.
  const reordered = JSON.parse(f.signed())
  reordered.claim = Object.fromEntries(Object.entries(reordered.claim).reverse())
  assert.equal(authenticateVerifierEvidence(f.receipt, f.policy, JSON.stringify(reordered), f.bytes, 1299).resultHash, result.resultHash)
  for (const verdict of ['pass', 'fail', 'error'] as const) assert.equal(authenticateVerifierEvidence(f.receipt, f.policy, f.signed({ ...f.claim, verdict }), f.bytes, 1200).envelope.claim.verdict, verdict)
})
test('verifier authentication denies forgery, policy substitution, wrong challenge and stale clocks', () => {
  const f = fixture(), other = fixture()
  for (const now of [999, 1300, NaN, 1200.5]) assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, f.signed(), f.bytes, now))
  for (const change of [{ publicKey: other.policy.publicKey }, { keyId: 'rotated-key' }, { supervisorKey: 'other-supervisor' }, { verifierHash: hash('other verifier') }, { qualificationHash: hash('other qualification') }, { image: 'node:latest' }, { publicKey: f.privateKey }]) assert.throws(() => authenticateVerifierEvidence(f.receipt, { ...f.policy, ...change }, f.signed(), f.bytes, 1200))
  assert.throws(() => authenticateVerifierEvidence(other.receipt, f.policy, f.signed(), f.bytes, 1200))
  assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, f.signed(), Buffer.from('swapped evidence'), 1200))
  for (const claim of [{ ...f.claim, executionAllowed: true }, { ...f.claim, evidenceBytes: f.bytes.length + 1 }, { ...f.claim, challengeHash: hash('wrong challenge') }, { ...f.claim, extra: 'unexpected' }]) assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, f.signed(claim as VerifierClaim), f.bytes, 1200))
  const forged = JSON.parse(f.signed()); forged.claim.verdict = 'fail'
  assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, JSON.stringify(forged), f.bytes, 1200))
  const crossProtocol = JSON.stringify({ claim: f.claim, signature: sign(null, Buffer.from(digest(f.claim)), f.privateKey).toString('base64') })
  assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, crossProtocol, f.bytes, 1200))
})
test('verifier evidence rejects malformed or oversized transport and challenge material', () => {
  const f = fixture()
  for (const text of ['not json', 'null', '{}', 'x'.repeat(4097), JSON.stringify({ ...JSON.parse(f.signed()), extra: true })]) assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, text, f.bytes, 1200))
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(65537)]) assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, f.signed(), bytes, 1200))
  for (const signature of ['a'.repeat(88), Buffer.alloc(63).toString('base64'), Buffer.alloc(64).toString('base64'), JSON.parse(f.signed()).signature.replace(/=$/, '')]) assert.throws(() => authenticateVerifierEvidence(f.receipt, f.policy, JSON.stringify({ claim: f.claim, signature }), f.bytes, 1200))
  for (const record of [{ ...f.record, expiresAt: 1301 }, { ...f.record, executionAllowed: true }, { ...f.record, nonce: randomUUID(), extra: 1 }]) assert.throws(() => validateChallenge(record, digest(record)))
  assert.throws(() => validateChallenge(f.record, hash('not retained digest')))
})
