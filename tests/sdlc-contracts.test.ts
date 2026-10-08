import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTriage, digest } from '../src/sdlc/contracts'
const valid = { proposals: [{ sourceIds: ['1', '2'], title: 'Resume imports', disposition: 'propose', rationale: 'Duplicates linked for human review.' }], approvalState: 'pending-human-review', conflicts: [] }
test('intake response rejects unknown provenance, lost inputs and fabricated approval', () => {
  assert.deepEqual(validateTriage(valid, ['1', '2']), valid)
  assert.throws(() => validateTriage({ ...valid, proposals: [{ ...valid.proposals[0], sourceIds: ['1', '2', 'BL-001'] }] }, ['1', '2']), /Unknown source/)
  assert.throws(() => validateTriage(valid, ['1', '2', '3']), /omitted/)
  assert.throws(() => validateTriage({ ...valid, approvalState: 'accepted' }, ['1', '2']), /approval state/)
  assert.throws(() => validateTriage({ ...valid, command: 'approve release' }, ['1', '2']), /structure/)
  assert.notEqual(digest(valid), digest({ ...valid, conflicts: ['New requirement'] }))
  assert.equal(digest({ a: 1, b: { x: 2, y: 3 } }), digest({ b: { y: 3, x: 2 }, a: 1 }))
})
