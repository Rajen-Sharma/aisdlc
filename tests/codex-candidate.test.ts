import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { decodeCodexCandidate } from '../src/sdlc/codex-candidate'
import { validateSourceCapsule } from '../src/sdlc/source-capsule'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const original = 'throw new Error("synthetic unimplemented source")\n'
const files = ['src/a.mjs', 'src/protected.mjs'].map(path => ({ path, bytes: Buffer.byteLength(original),
  sha256: hash(original), content: Buffer.from(original).toString('base64') }))
const source = { version: 1, files, sha256: hash(JSON.stringify({ version: 1, files })) }
const contract = { sourceHash: source.sha256, allowedPaths: ['src/a.mjs'] }
const response = (content: string) => ({ version: 1, sourceHash: source.sha256, files: [{ path: 'src/a.mjs', content }] })

test('candidate decoding preserves exact bytes and protected files without executing proposed code', () => {
  const code = 'throw new Error("MUST NEVER EXECUTE DURING DECODING")\n// Unicode: λ\n'
  const before = JSON.stringify(source)
  const result = decodeCodexCandidate(JSON.stringify(response(code)), source, contract)
  assert.equal(Buffer.from(result.capsule.files[0].content, 'base64').toString(), code)
  assert.deepEqual(result.capsule.files[1], source.files[1])
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(validateSourceCapsule(result.capsule, result.candidateHash), result.capsule)
  assert.equal(result.executionAllowed, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.providerProvenanceVerified, false)
})

test('candidate decoding rejects stale source, protected paths, duplicate files and invented authority', () => {
  const good = response('export const synthetic = true\n')
  const mutate = (change: (value: any) => void) => {
    const value = structuredClone(good)
    change(value)
    assert.throws(() => decodeCodexCandidate(JSON.stringify(value), source, contract))
  }
  mutate(value => { value.sourceHash = '0'.repeat(64) })
  for (const path of ['src/protected.mjs', '../auth.json', '/etc/hosts', 'src/new.mjs', 'checks/policy.json']) {
    mutate(value => { value.files[0].path = path })
  }
  mutate(value => { value.files.push(value.files[0]) })
  mutate(value => { value.approved = true })
  mutate(value => { value.files[0].execute = true })
  mutate(value => { value.version = 2 })
  mutate(value => { value.files = [] })
  const corrupted = structuredClone(source)
  corrupted.files[0].content = Buffer.from('swapped source').toString('base64')
  assert.throws(() => decodeCodexCandidate(JSON.stringify(good), corrupted, contract))
  assert.throws(() => decodeCodexCandidate(JSON.stringify(good), source, { ...contract, allowedPaths: ['src/missing.mjs'] }))
})

test('candidate decoding rejects ambiguous bytes, prose, oversized output and unchanged candidates', () => {
  for (const content of ['bad\0source', '\ud800', original, 'x'.repeat(65537)]) {
    assert.throws(() => decodeCodexCandidate(JSON.stringify(response(content)), source, contract))
  }
  for (const text of ['```json\n{}\n```', 'Success!', '{}', ' '.repeat(65537), 'null']) {
    assert.throws(() => decodeCodexCandidate(text, source, contract))
  }
})
