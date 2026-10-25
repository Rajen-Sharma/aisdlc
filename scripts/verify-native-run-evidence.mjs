// Historical, read-only verification. These archived proofs never enable a run.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { inspectAuthorityLedger } from './azure-authority-ledger.mjs'
import { attemptEvidenceSigningBytes } from './attempt-evidence.mjs'
const root = new URL('../docs/evidence/native-runtime-2026-10-25/', import.meta.url)
const bytes = file => readFile(new URL(file, root))
const json = async file => JSON.parse(await bytes(file))
const hash = value => createHash('sha256').update(value).digest('hex')
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v)
const key = async file => createPublicKey({ key: Buffer.from((await json(file)).publicKeyDer, 'base64'), format: 'der', type: 'spki' })
const run = await json('run.json'), authority = await key('authority-public.json'), guardian = await key('client-public.json')
const ledger = inspectAuthorityLedger(await bytes('authority-ledger.jsonl'), authority)
assert.equal(ledger.tipHash, run.ledgerTipHash); assert.equal(ledger.records.length, run.ledgerRecords)
assert.equal(hash(await bytes('runtime-manifest.json')), run.manifestHash)
const related = ledger.records.filter(r => r.payload.taskKey === run.taskKey)
assert.equal(related.filter(r => r.payload.action === 'begin').length, 3)
assert.equal(related.filter(r => r.payload.action === 'admit').length, 2)
assert.equal(related.filter(r => r.payload.action === 'settle').length, 3)
assert.equal(related.filter(r => ['candidate', 'verification', 'delivery'].includes(r.payload.action)).length, 0)
for (let n = 1; n <= 3; n++) {
  const handoff = await json(`attempt-${n}.json`), proof = handoff.terminationProof
  assert.equal(verify(null, attemptEvidenceSigningBytes(proof.record), guardian, Buffer.from(proof.signature, 'base64')), true)
  assert.equal(proof.record.taskKey, run.taskKey); assert.equal(proof.record.attemptId, handoff.attemptId)
  assert.equal(proof.record.cgroupEmpty, true); assert.equal(proof.record.rootExited, true); assert.equal(proof.record.launchWritersDrained, true)
  const terminal = related.find(r => r.payload.action === 'settle' && r.payload.attemptId === handoff.attemptId)
  assert.equal(terminal.payload.terminationHash, hash(JSON.stringify(proof))); assert.equal(terminal.payload.outcome, 'failed')
  assert.equal(handoff.candidate, null)
}
for (const [file, domain, publicKey] of [['client-qualification.json', 'ai-sdlc/private-client-profile/v1', guardian],
  ['tools-qualification.json', 'ai-sdlc/private-tools-verifier/v1', authority]]) {
  const q = await json(file)
  assert.equal(q.record.manifestHash, run.manifestHash)
  assert.equal(verify(null, Buffer.from(domain + '\n' + hash(canonical(q.record))), publicKey, Buffer.from(q.signature, 'base64')), true)
}
console.log(JSON.stringify({ historicalOnly: true, signaturesVerified: true, attemptsSpent: 3, remainingAttempts: 0,
  deliveries: 0, humanArtifactApprovals: 0, executionAllowed: false, modelCalls: 0 }))
