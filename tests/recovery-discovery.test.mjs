import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { discoverRecovery } from '../scripts/recovery-discovery.mjs'

const token = '12345678-1234-1234-1234-123456789abc'
const journal = JSON.stringify({ version: 1, token, name: `sdlc-crash-${token}`, state: 'uncertain' })
const expected = [{ token, journalHash: createHash('sha256').update(journal).digest('hex') }]

test('matching discovery quarantines; even empty or matching inventory never grants authority', () => {
  for (const report of [discoverRecovery(expected, [journal]), discoverRecovery([], [])]) {
    assert.equal(report.inventoryMatched, true)
    assert.equal(report.authorityVerified, false)
    assert.equal(report.executionAllowed, false)
    assert.equal(report.retryAuthorized, false)
  }
  assert.deepEqual(discoverRecovery(expected, [journal]).records, [{ token, status: 'quarantined' }])
})

test('missing, duplicate, changed and unexpected journals deny complete matching', () => {
  assert.equal(discoverRecovery(expected, []).records[0].status, 'missing')
  for (const documents of [[journal, journal], [journal + ' ']]) {
    const report = discoverRecovery(expected, documents)
    assert.equal(report.inventoryMatched, false)
    assert.equal(report.records[0].status, 'conflicting')
  }
  assert.equal(discoverRecovery([], [journal]).unexpected, 1)
  assert.equal(discoverRecovery([], [journal]).inventoryMatched, false)
})

test('malformed and self-declared completed journals cannot become termination proof', () => {
  for (const document of ['{', journal.replace('uncertain', 'recovered'), journal.replace('"version":1', '"version":2'), JSON.stringify({ ...JSON.parse(journal), retryAuthorized: true })]) {
    const report = discoverRecovery(expected, [document])
    assert.equal(report.malformed, 1)
    assert.equal(report.inventoryMatched, false)
    assert.equal(report.retryAuthorized, false)
    assert.equal(report.records[0].status, 'missing')
  }
})

test('transport and expected-authority ambiguity reject before discovery', () => {
  for (const documents of [['x'.repeat(4097)], [''], [Buffer.from(journal)], Array(129).fill(journal)]) assert.throws(() => discoverRecovery(expected, documents))
  for (const inventory of [[...expected, ...expected], [{ ...expected[0], token: '../escape' }], [{ ...expected[0], journalHash: 'bad' }], [{ ...expected[0], trusted: true }], Array(129).fill(expected[0])]) assert.throws(() => discoverRecovery(inventory, [journal]))
})
