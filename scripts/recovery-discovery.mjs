// Read-only preflight. Caller must obtain a complete, current inventory from an
// independent authority. This function cannot establish that authority/freshness.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const hash = /^[a-f0-9]{64}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')

export function discoverRecovery(expected, documents) {
  assert.ok(Array.isArray(expected) && expected.length <= 128, 'Invalid inventory bound.')
  assert.ok(Array.isArray(documents) && documents.length <= 128, 'Invalid journal count.')
  const inventory = new Map()
  for (const entry of expected) {
    assert.ok(exact(entry, ['token', 'journalHash']))
    assert.ok(typeof entry.token === 'string' && uuid.test(entry.token))
    assert.ok(typeof entry.journalHash === 'string' && hash.test(entry.journalHash))
    assert.ok(!inventory.has(entry.token), 'Conflicting expected identity.')
    inventory.set(entry.token, entry.journalHash)
  }
  const observed = new Map()
  let malformed = 0
  for (const document of documents) {
    // Transport bound BEFORE parsing. Never echo journal content or parse errors.
    assert.ok(typeof document === 'string' && Buffer.byteLength(document) > 0 && Buffer.byteLength(document) <= 4096, 'Invalid journal transport bound.')
    let record
    try { record = JSON.parse(document) } catch { malformed++; continue }
    if (!exact(record, ['version', 'token', 'name', 'state']) || record.version !== 1
      || typeof record.token !== 'string' || !uuid.test(record.token)
      || record.name !== `sdlc-crash-${record.token}` || record.state !== 'uncertain') {
      malformed++; continue
    }
    const hashes = observed.get(record.token) ?? []
    hashes.push(createHash('sha256').update(document).digest('hex'))
    observed.set(record.token, hashes)
  }
  const records = [...inventory].sort(([a], [b]) => a.localeCompare(b)).map(([token, journalHash]) => {
    const matches = observed.get(token)
    return { token, status: !matches ? 'missing' : matches.length !== 1 || matches[0] !== journalHash ? 'conflicting' : 'quarantined' }
  })
  const unexpected = [...observed.keys()].filter(token => !inventory.has(token)).length
  return {
    version: 1, records, malformed, unexpected,
    inventoryMatched: malformed === 0 && unexpected === 0 && records.every(record => record.status === 'quarantined'),
    authorityVerified: false, executionAllowed: false, retryAuthorized: false,
  }
}
