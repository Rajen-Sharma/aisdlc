// Explicit trial-host qualification. Writes synthetic signed records only.
// Authentication and the private signing key never appear in output or evidence.
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { AzureAuthorityLedger, authoritySigningBytes } from './azure-authority-ledger.mjs'
import { authorityStorageToken } from './azure-authority-identity.mjs'

assert.equal(process.platform, 'linux')
assert.equal(process.env.AISDLC_QUALIFICATION_HOST, 'azure-tools-trial')
assert.equal(process.getuid(), Number(process.env.AISDLC_AUTHORITY_UID))
assert.ok(process.getuid() > 0)
assert.ok(Date.now() + 120000 < Date.parse('2026-10-20T11:12:11.753Z'), 'Approved trial window ended or too short')
const accountName = 'aisdlctrialb7c13fa8'
const url = `https://${accountName}.blob.core.windows.net/authority/ledger-v1.jsonl`
const privateKey = createPrivateKey(await readFile('/var/lib/aisdlc-authority/signing-key.pem'))
const publicKey = createPublicKey({ key: await readFile('/opt/aisdlc-authority/root-public-key.der'), type: 'spki', format: 'der' })
assert.deepEqual(createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
  publicKey.export({ type: 'spki', format: 'der' }))
const token = authorityStorageToken
const access = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: { Authorization: `Bearer ${await token()}`, 'x-ms-version': '2023-11-03',
    'x-ms-date': new Date().toUTCString() } })
await access.body?.cancel()
if (access.status !== 200) {
  const code = access.headers.get('x-ms-error-code') ?? 'Unknown'
  assert.match(code, /^[A-Za-z]{1,80}$/)
  throw new Error(`Authority access probe: HTTP ${access.status} ${code}`)
}
const ledger = new AzureAuthorityLedger({ accountName, publicKey, token })
const initial = await ledger.read()
assert.ok(initial.records.length <= 125 && initial.records.every(record => record.payload.syntheticOnly === true),
  'Qualification requires space in a synthetic-only ledger')
const qualificationId = randomUUID()
const envelope = (head, test) => {
  const record = { version: 1, sequence: head.records.length + 1, previousHash: head.tipHash,
    operationId: randomUUID(), issuedAt: Math.floor(Date.now() / 1000), kind: 'registry',
    payload: { qualificationId, test, syntheticOnly: true, executionAllowed: false, retryAuthorized: false } }
  return JSON.stringify({ record, signature: sign(null, authoritySigningBytes(record), privateKey).toString('base64') })
}
const first = await ledger.append(initial, envelope(initial, 'read-sign-append'))
assert.equal(first.executionAllowed, false)
assert.equal(first.retryAuthorized, false)
await assert.rejects(ledger.append(initial, envelope(initial, 'stale-head')))
const head = await ledger.read()
assert.equal(head.records.length, initial.records.length + 1)
const race = await Promise.allSettled([
  ledger.append(head, envelope(head, 'race-a')),
  ledger.append(head, envelope(head, 'race-b')),
])
assert.equal(race.filter(result => result.status === 'fulfilled').length, 1)
assert.equal(race.filter(result => result.status === 'rejected').length, 1)
const afterRace = await ledger.read()
assert.equal(afterRace.records.length, initial.records.length + 2)
let writes = 0
const uncertain = new AzureAuthorityLedger({ accountName, publicKey, token, transport: async (target, options) => {
  const response = await fetch(target, options)
  if (options.method === 'PUT') {
    writes++
    assert.equal(response.status, 201)
    await response.body?.cancel()
    throw new Error('Synthetic acknowledgement loss after Azure commit')
  }
  return response
} })
await assert.rejects(uncertain.append(afterRace, envelope(afterRace, 'lost-acknowledgement')),
  /uncertain; reconciliation required/)
assert.equal(writes, 1)
const final = await ledger.read()
assert.equal(final.records.length, initial.records.length + 3)
assert.equal(final.records.at(-1).payload.test, 'lost-acknowledgement')
// An impossible ETag protects the ledger even if the role is accidentally broadened.
// Success requires authorization denial, rather than merely a failed precondition.
const denied = await fetch(url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: { Authorization: `Bearer ${await token()}`, 'x-ms-version': '2023-11-03',
    'x-ms-date': new Date().toUTCString(), 'x-ms-blob-type': 'AppendBlob', 'If-Match': '"0x0"' },
  body: Buffer.alloc(0) })
await denied.body?.cancel()
assert.equal(denied.status, 403, 'Managed identity must lack blob overwrite permission')
assert.equal((await ledger.read()).tipHash, final.tipHash)
console.log(JSON.stringify({ version: 1, host: 'azure-tools-trial', qualificationId,
  checkedAt: new Date().toISOString(), initialRecords: initial.records.length, finalRecords: final.records.length,
  signedReadAppend: true, staleHeadDenied: true, concurrentWinnerCount: 1,
  lostAcknowledgementReconciled: true, uncertainWriteCount: writes, overwriteDeniedStatus: denied.status,
  tipHash: final.tipHash, executionAllowed: false, retryAuthorized: false, realModelCalls: 0 }))
