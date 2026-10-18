// Trusted authority primitive. No provider calls, execution permits or retry grants.
import { createHash, KeyObject, verify } from 'node:crypto'
import { TextDecoder } from 'node:util'

const maximumBytes = 1048576
const maximumRecords = 128
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const etag = /^"0x[0-9a-fA-F]{1,32}"$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const reject = () => { throw new Error('Authority ledger rejected.') }
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)

export const authoritySigningBytes = record => Buffer.from('ai-sdlc/authority-ledger/v1\n' + hash(canonical(record)))

function validateRecord(record) {
  if (!exact(record, ['version', 'sequence', 'previousHash', 'operationId', 'issuedAt', 'kind', 'payload'])
    || record.version !== 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 1 || record.sequence > maximumRecords
    || typeof record.previousHash !== 'string' || !sha.test(record.previousHash)
    || typeof record.operationId !== 'string' || !uuid.test(record.operationId)
    || !Number.isSafeInteger(record.issuedAt) || record.issuedAt < 1
    || !['registry', 'intent', 'candidate', 'terminal'].includes(record.kind)
    || !record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) reject()
}

export function inspectAuthorityLedger(bytes, publicKey) {
  if (!(publicKey instanceof KeyObject) || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519'
    || !(bytes instanceof Uint8Array) || bytes.byteLength > maximumBytes) reject()
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { reject() }
  if (text.length && !text.endsWith('\n')) reject()
  const lines = text ? text.slice(0, -1).split('\n') : []
  if (lines.length > maximumRecords) reject()
  const records = [], operationIds = new Set()
  let tipHash = '0'.repeat(64)
  for (const line of lines) {
    if (Buffer.byteLength(line) > 32768) reject()
    let envelope
    try { envelope = JSON.parse(line) } catch { reject() }
    if (!exact(envelope, ['record', 'signature'])) reject()
    const { record, signature } = envelope
    validateRecord(record)
    if (record.sequence !== records.length + 1 || record.previousHash !== tipHash || operationIds.has(record.operationId)
      || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) reject()
    const decoded = Buffer.from(signature, 'base64')
    if (decoded.length !== 64 || decoded.toString('base64') !== signature
      || !verify(null, authoritySigningBytes(record), publicKey, decoded)) reject()
    records.push(record)
    operationIds.add(record.operationId)
    tipHash = hash(line + '\n')
  }
  return { records, tipHash, bytes: bytes.byteLength }
}

async function boundedBody(response) {
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    await response.body?.cancel().catch(() => {})
    reject()
  }
  if (!response.body) reject()
  const reader = response.body.getReader(), chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumBytes) reject()
      chunks.push(value)
    }
    if (declared !== null && total !== Number(declared)) reject()
    return Buffer.concat(chunks, total)
  } catch {
    await reader.cancel().catch(() => {})
    reject()
  } finally { reader.releaseLock() }
}

export class AzureAuthorityLedger {
  #url; #key; #token; #fetch
  constructor({ accountName, publicKey, token, transport = fetch }) {
    if (typeof accountName !== 'string' || !/^[a-z0-9]{3,24}$/.test(accountName) || typeof token !== 'function'
      || typeof transport !== 'function' || !(publicKey instanceof KeyObject)
      || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') reject()
    this.#url = `https://${accountName}.blob.core.windows.net/authority/ledger-v1.jsonl`
    this.#key = publicKey
    this.#token = token
    this.#fetch = transport
  }

  async #request(method, suffix, headers = {}, body) {
    const credential = await this.#token()
    if (typeof credential !== 'string' || credential.length < 1 || credential.length > 16384 || /[\r\n]/.test(credential)) reject()
    return this.#fetch(this.#url + suffix, { method, body,
      headers: { Authorization: `Bearer ${credential}`, 'x-ms-version': '2023-11-03',
        'x-ms-date': new Date().toUTCString(), 'Cache-Control': 'no-store', ...headers },
      redirect: 'error', signal: AbortSignal.timeout(10000) })
  }

  async read() {
    try {
      const response = await this.#request('GET', '')
      if (response.status !== 200 || !etag.test(response.headers.get('etag') ?? '')) {
        await response.body?.cancel().catch(() => {})
        reject()
      }
      const bytes = await boundedBody(response)
      return { ...inspectAuthorityLedger(bytes, this.#key), etag: response.headers.get('etag') }
    } catch { reject() }
  }

  async append(head, envelopeText) {
    // Re-read and authenticate the entire current log before deriving a new CAS.
    // Never trust a supplied byte offset or local database snapshot as current.
    const current = await this.read()
    if (!head || current.etag !== head.etag || current.tipHash !== head.tipHash || current.bytes !== head.bytes
      || current.records.length >= maximumRecords || typeof envelopeText !== 'string'
      || Buffer.byteLength(envelopeText) > 32768 || envelopeText.includes('\n')) reject()
    let envelope
    try { envelope = JSON.parse(envelopeText) } catch { reject() }
    // Validate against the authenticated tip without reserializing the prefix:
    // CAS offsets always refer to exact bytes read from the external service.
    if (!exact(envelope, ['record', 'signature'])) reject()
    validateRecord(envelope.record)
    const record = envelope.record
    const signature = typeof envelope.signature === 'string' ? Buffer.from(envelope.signature, 'base64') : Buffer.alloc(0)
    if (record.sequence !== current.records.length + 1 || record.previousHash !== current.tipHash
      || current.records.some(prior => prior.operationId === record.operationId)
      || signature.length !== 64 || signature.toString('base64') !== envelope.signature
      || !verify(null, authoritySigningBytes(record), this.#key, signature)) reject()
    const bytes = Buffer.from(envelopeText + '\n')
    if (current.bytes + bytes.length > maximumBytes) reject()
    let response
    try {
      response = await this.#request('PUT', '?comp=appendblock', {
        'If-Match': current.etag, 'Content-Type': 'application/octet-stream',
        'x-ms-blob-condition-appendpos': String(current.bytes),
        'x-ms-blob-condition-maxsize': String(maximumBytes),
      }, bytes)
      const next = response.headers.get('etag')
      await response.body?.cancel().catch(() => {})
      if (response.status !== 201 || !etag.test(next ?? '') || next === current.etag
        || response.headers.get('x-ms-blob-append-offset') !== String(current.bytes)) throw new Error()
      return { operationId: record.operationId, sequence: record.sequence, etag: next,
        tipHash: hash(bytes), bytes: current.bytes + bytes.length, executionAllowed: false, retryAuthorized: false }
    } catch {
      // The append may have committed remotely. Never retry a write automatically
      // or treat a missing acknowledgement as permission to perform task effects.
      throw new Error('Authority append uncertain; reconciliation required.')
    }
  }
}
