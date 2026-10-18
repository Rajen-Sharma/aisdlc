import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { test } from 'node:test'
import { AzureAuthorityLedger, authoritySigningBytes, inspectAuthorityLedger } from '../scripts/azure-authority-ledger.mjs'

const keys = generateKeyPairSync('ed25519')
const envelope = (head, extra = {}) => {
  const record = { version: 1, sequence: head.records.length + 1, previousHash: head.tipHash,
    operationId: randomUUID(), issuedAt: 1792321200, kind: 'intent', payload: { taskId: 1, fence: 1 }, ...extra }
  return JSON.stringify({ record, signature: sign(null, authoritySigningBytes(record), keys.privateKey).toString('base64') })
}
const empty = { records: [], tipHash: '0'.repeat(64), bytes: 0 }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture({ loseAcknowledgement = false } = {}) {
  let bytes = Buffer.alloc(0), revision = 1, writes = 0
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticauthority', publicKey: keys.publicKey,
    token: async () => 'synthetic-credential', transport: async (url, options) => {
      assert.match(url, /^https:\/\/syntheticauthority\.blob\.core\.windows\.net\/authority\/ledger-v1\.jsonl(?:\?comp=appendblock)?$/)
      assert.equal(options.redirect, 'error')
      assert.equal(options.headers.Authorization, 'Bearer synthetic-credential')
      assert.ok(options.signal instanceof AbortSignal)
      const etag = `"0x${revision.toString(16)}"`
      if (options.method === 'GET') return new Response(Buffer.from(bytes), { headers: { etag, 'content-length': String(bytes.length) } })
      writes++
      assert.equal(options.headers['x-ms-blob-condition-maxsize'], '1048576')
      if (options.headers['If-Match'] !== etag || options.headers['x-ms-blob-condition-appendpos'] !== String(bytes.length)) {
        return new Response(null, { status: 412 })
      }
      const offset = bytes.length
      bytes = Buffer.concat([bytes, options.body])
      revision++
      if (loseAcknowledgement) throw new Error('Simulated disconnect after server commit')
      return new Response(null, { status: 201, headers: { etag: `"0x${revision.toString(16)}"`, 'x-ms-blob-append-offset': String(offset) } })
    } })
  return { ledger, bytes: () => bytes, writes: () => writes }
}

test('external ledger authenticates exact signed bytes and appends using ETag plus byte offset', async () => {
  const state = fixture(), head = await state.ledger.read()
  const text = envelope(head)
  const result = await state.ledger.append(head, text)
  assert.equal(result.tipHash, hash(text + '\n'))
  assert.equal(result.bytes, Buffer.byteLength(text + '\n'))
  assert.equal(result.executionAllowed, false)
  assert.equal(result.retryAuthorized, false)
  const reread = await state.ledger.read()
  assert.equal(reread.records.length, 1)
  assert.equal(reread.tipHash, result.tipHash)
  assert.equal(state.writes(), 1)
})

test('valid signatures cannot conceal truncation, reordered records, wrong keys or duplicate operation IDs', () => {
  const first = envelope(empty), firstBytes = Buffer.from(first + '\n')
  const head = inspectAuthorityLedger(firstBytes, keys.publicKey)
  const second = envelope(head)
  assert.equal(inspectAuthorityLedger(Buffer.from(first + '\n' + second + '\n'), keys.publicKey).records.length, 2)
  for (const text of [first, first + '\n\n', second + '\n' + first + '\n', first + '\n' + first + '\n',
    first + '\n' + envelope(head, { operationId: JSON.parse(first).record.operationId }) + '\n']) {
    assert.throws(() => inspectAuthorityLedger(Buffer.from(text), keys.publicKey))
  }
  const tampered = JSON.parse(first)
  tampered.record.payload.fence++
  assert.throws(() => inspectAuthorityLedger(Buffer.from(JSON.stringify(tampered) + '\n'), keys.publicKey))
  assert.throws(() => inspectAuthorityLedger(firstBytes, generateKeyPairSync('ed25519').publicKey))
  assert.throws(() => inspectAuthorityLedger(Buffer.from([0xff, 10]), keys.publicKey))
})

test('stale local head rejects before writing and concurrent append has one winner', async () => {
  const state = fixture(), head = await state.ledger.read()
  const a = envelope(head), b = envelope(head)
  const outcomes = await Promise.allSettled([state.ledger.append(head, a), state.ledger.append(head, b)])
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1)
  const writes = state.writes()
  await assert.rejects(state.ledger.append(head, envelope(head)))
  assert.equal(state.writes(), writes)
  assert.equal((await state.ledger.read()).records.length, 1)
})

test('lost append acknowledgement remains uncertain, never automatically retries or replays effects', async () => {
  const state = fixture({ loseAcknowledgement: true }), head = await state.ledger.read()
  const text = envelope(head)
  await assert.rejects(state.ledger.append(head, text), /uncertain; reconciliation required/)
  assert.equal(state.writes(), 1)
  const current = await state.ledger.read()
  assert.equal(current.records[0].operationId, JSON.parse(text).record.operationId)
  await assert.rejects(state.ledger.append(current, text))
  assert.equal(state.writes(), 1)
})

test('oversized or ambiguous external responses reject and cancel their body', async () => {
  let cancelled = false
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticauthority', publicKey: keys.publicKey,
    token: async () => 'synthetic', transport: async () => new Response(new ReadableStream({ cancel() { cancelled = true } }),
      { headers: { etag: '"0x1"', 'content-length': '1048577' } }) })
  await assert.rejects(ledger.read())
  assert.equal(cancelled, true)
  for (const [status, headers] of [[302, { etag: '"0x1"' }], [200, {}], [200, { etag: 'W/"0x1"' }]]) {
    const invalid = new AzureAuthorityLedger({ accountName: 'syntheticauthority', publicKey: keys.publicKey,
      token: async () => 'synthetic', transport: async () => new Response('', { status, headers }) })
    await assert.rejects(invalid.read())
  }
})

test('untrusted callers cannot select endpoints, private trust keys or invalid record shapes', async () => {
  for (const accountName of ['https://evil.test', '../account', 'UPPERCASE', 'account?key=secret']) {
    assert.throws(() => new AzureAuthorityLedger({ accountName, publicKey: keys.publicKey, token: async () => 'synthetic' }))
  }
  assert.throws(() => new AzureAuthorityLedger({ accountName: 'safeaccount', publicKey: keys.privateKey, token: async () => 'synthetic' }))
  const state = fixture(), head = await state.ledger.read()
  for (const extra of [{ sequence: 0 }, { kind: 'approve-human' }, { executionAllowed: true }, { operationId: 'invented' }]) {
    await assert.rejects(state.ledger.append(head, envelope(head, extra)))
  }
  assert.equal(state.writes(), 0)
})
