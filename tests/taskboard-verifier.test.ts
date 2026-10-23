import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import proposal from '../docs/planning/taskboard-first-delivery.json'
import { taskboardCases, verifyTaskboardCandidate } from '../src/sdlc/taskboard-verifier'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
test('the accepted policy generates bounded positive and empty/populated negative cases without candidate inputs', () => {
  const { cases, expected } = taskboardCases(proposal.checkPolicy, proposal.proposedStory.contract.checkPolicyHash)
  assert.equal(cases.length, 22); assert.equal(expected.length, 22)
  assert.deepEqual(expected.find(entry => entry.id === 'mixed-order')?.indexes, [0, 2])
  assert.equal(cases.filter(entry => entry.invalid && entry.tasks.length === 0).length, 8)
  assert.equal(cases.filter(entry => entry.invalid && entry.tasks.length > 0).length, 8)
  assert.throws(() => taskboardCases(proposal.checkPolicy + ' ', proposal.proposedStory.contract.checkPolicyHash))
  for (const mutate of [(p: any) => { p.cases[0].expectedIndexes = [999] }, (p: any) => { p.cases.push(p.cases[0]) },
    (p: any) => { p.invalidStatuses = Array(33).fill('invalid') }, (p: any) => { p.exportName = 'candidateSelectedTest' }]) {
    const policy = JSON.parse(proposal.checkPolicy); mutate(policy)
    const text = JSON.stringify(policy)
    assert.throws(() => taskboardCases(text, hash(text)))
  }
})

test('untrusted verifier bytes deny before filesystem materialization or Docker invocation', async () => {
  await assert.rejects(verifyTaskboardCandidate({ capsule: proposal.sourceCapsule, candidateHash: proposal.sourceCapsule.sha256,
    policyText: proposal.checkPolicy, policyHash: proposal.proposedStory.contract.checkPolicyHash,
    runnerSource: 'tampered runner', runnerHash: '0'.repeat(64), workspaceRoot: '/nonexistent' }), /rejected/)
})
