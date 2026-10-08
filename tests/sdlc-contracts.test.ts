import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTriage, digest, triagePrompt } from '../src/sdlc/contracts'
import { validateProject } from '../src/sdlc/project'
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
test('generic project context binds scope without introducing a product or weakening human gates', () => {
  const project = validateProject({ key: 'expense-app', name: 'Expense app', version: 1, objective: 'Review employee expenses.', constraints: ['Support multi-currency totals.'] })
  const prompt = triagePrompt([], project)
  assert.ok(prompt.includes(project.objective))
  assert.ok(!/Drupal|AEM|Headless CMS|Payload/.test(prompt))
  assert.ok(prompt.includes('separate human sprint/design-security/code-security/MVP/outcome/release gates'))
  assert.notEqual(digest({ project, records: [] }), digest({ project: { ...project, version: 2 }, records: [] }))
  assert.notEqual(digest({ project, result: valid }), digest({ project: { ...project, key: 'another-app' }, result: valid }))
  assert.throws(() => validateProject({ ...project, command: 'bypass approvals' }))
  assert.throws(() => validateProject({ ...project, key: '../secrets' }))
  assert.throws(() => validateProject({ ...project, key: ['expense-app'] }))
})
