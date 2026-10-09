import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { digest } from '../src/sdlc/contracts'
import { bindArtifacts, validateBinding, validateBoundCandidate, verifierImage, type TaskBindingRecord } from '../src/sdlc/task-binding'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function capsule(entries: [string, string][]) {
  const files = entries.map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text), content: Buffer.from(text).toString('base64') })).sort((a, b) => a.path.localeCompare(b.path))
  return { version: 1 as const, files, sha256: hash(JSON.stringify({ version: 1, files })) }
}
test('artifact binding preserves approved source and protected dependencies', () => {
  const source = capsule([['src/input.mjs', 'export default 1'], ['src/readonly.mjs', 'export default 2']])
  const candidate = capsule([['src/input.mjs', 'export default 3'], ['src/readonly.mjs', 'export default 2']])
  const contract = { sourceHash: source.sha256, checkPolicyHash: hash('trusted checks'), allowedPaths: ['src/input.mjs'] }
  const material = { sourceCapsule: source, candidateCapsule: candidate, checkPolicy: 'trusted checks', verifierSource: 'trusted verifier', qualificationHash: hash('qualification'), image: verifierImage, supervisorKey: 'synthetic-supervisor' }
  const bound = bindArtifacts(contract, material)
  assert.equal(bound.candidateHash, candidate.sha256)
  for (const changed of [
    { ...material, sourceCapsule: candidate }, { ...material, checkPolicy: 'altered checks' },
    { ...material, image: 'node:latest' }, { ...material, execute: true },
    { ...material, verifierSource: 'x'.repeat(65537) }, { ...material, supervisorKey: '../other' },
    { ...material, candidateCapsule: capsule([['src/input.mjs', 'export default 3'], ['src/readonly.mjs', 'modified dependency']]) },
    { ...material, candidateCapsule: capsule([['src/input.mjs', 'export default 3']]) },
    { ...material, candidateCapsule: capsule([['src/input.mjs', 'export default 3'], ['src/readonly.mjs', 'export default 2'], ['src/extra.mjs', 'extra']]) },
  ]) assert.throws(() => bindArtifacts(contract, changed))
})
test('exact binding denies replaced artifacts, identities and forged execution flags', () => {
  const source = capsule([['src/input.mjs', 'export default 1']])
  const contract = { sourceHash: source.sha256, checkPolicyHash: hash('checks'), allowedPaths: ['src/input.mjs'] }
  const artifacts = bindArtifacts(contract, { sourceCapsule: source, candidateCapsule: source, checkPolicy: 'checks', verifierSource: 'verifier', qualificationHash: hash('qualification'), image: verifierImage, supervisorKey: 'synthetic-supervisor' })
  const scopeHash = hash('scope')
  const record: TaskBindingRecord = { ...artifacts, version: 1, executionAllowed: false, syntheticOnly: true, taskId: 1, storyId: 2, storyRevision: 1, projectKey: 'synthetic-project', scopeHash, owner: randomUUID(), recoveryKey: randomUUID(), fence: 1, attempt: 1, approvalGates: [{ id: 3, kind: 'sprint', actorId: 4, decisionKey: `2:${scopeHash}:sprint` }, { id: 5, kind: 'design-security', actorId: 4, decisionKey: `2:${scopeHash}:design-security` }] }
  const receipt = validateBinding(record, digest(record))
  const expected = { ...artifacts, recoveryKey: record.recoveryKey }
  assert.deepEqual(validateBoundCandidate(receipt, source, expected), { artifactsMatch: true, executionAllowed: false, retryAuthorized: false })
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) assert.throws(() => validateBoundCandidate(receipt, source, { ...expected, [key]: 'different' }))
  assert.throws(() => validateBoundCandidate(receipt, capsule([['src/input.mjs', 'different bytes']]), expected))
  for (const key of ['taskId', 'storyId', 'storyRevision', 'projectKey', 'scopeHash', 'owner', 'fence', 'attempt', 'recoveryKey']) assert.throws(() => validateBinding({ ...record, [key]: 'forged' }, receipt.bindingHash))
  for (const change of [{ executionAllowed: true }, { syntheticOnly: false }, { attempt: 4 }, { unknown: true }, { approvalGates: [record.approvalGates[0], record.approvalGates[0]] }]) {
    const modified = { ...record, ...change }
    assert.throws(() => validateBinding(modified, digest(modified)))
  }
})
