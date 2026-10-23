import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { authenticateShowcase } from '../src/sdlc/delivery-showcase'
import { deliveryFixture } from './helpers/delivery-evidence'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
test('recorded case replay is bound to the already authenticated artifact receipt and source', () => {
  const f = deliveryFixture(), claim = { ...f.claim }
  const report = { candidateHash: claim.candidateHash, checkPolicyHash: claim.checkPolicyHash, verifierHash: claim.verifierHash,
    image: claim.image, verdict: claim.verdict, cleanupVerified: true, casesTotal: 1, casesPassed: 1, elapsedMs: 30, exitCode: 0,
    replay: [{ id: 'synthetic-vector', input: { text: '<script>never execute</script>' }, expected: [], observed: [], passed: true }] }
  const provenance = { record: { candidateHash: claim.candidateHash, attemptId: claim.attemptId, taskKey: claim.taskKey, usage: null } }
  const proof = { record: { version: 2, kind: 'verification', evidenceHash: hash(report), provenanceHash: hash(provenance),
    taskKey: claim.taskKey, attemptId: claim.attemptId, candidateHash: claim.candidateHash, runtimeHash: claim.runtimeHash,
    verifierHash: claim.verifierHash, qualificationHash: claim.qualificationHash, image: claim.image, verdict: claim.verdict }, signature: 'synthetic-vector' }
  claim.verificationHash = hash(proof)
  const evidence = { proof, report, provenance }
  const replay = authenticateShowcase(evidence, claim)
  assert.equal(replay.cases[0].id, 'synthetic-vector'); assert.equal(replay.usage, null)
  for (const mutate of [
    (v: any) => { v.report.replay[0].passed = false }, (v: any) => { v.provenance.record.usage = { totalTokens: 0 } },
    (v: any) => { v.proof.record.candidateHash = 'f'.repeat(64) }, (v: any) => { v.proof.signature = 'substitute' },
  ]) {
    const changed = structuredClone(evidence); mutate(changed)
    assert.throws(() => authenticateShowcase(changed, claim))
  }
  assert.throws(() => authenticateShowcase(evidence, { ...claim, verificationHash: 'f'.repeat(64) }))
})
