import { createPublicKey, verify } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { digest } from './contracts'
import type { DeliveryTrust } from './delivery-artifact'

const reject = (): never => { throw new Error('Current delivery authority is unavailable.') }
const exact = (input: unknown, fields: string[]): input is Record<string, unknown> => !!input && typeof input === 'object'
  && !Array.isArray(input) && Object.keys(input).sort().join(',') === [...fields].sort().join(',')
export type CurrentDelivery = {
  version: 1; keyId: string; authorityRevision: number; taskKey: string; artifactHash: string; scopeHash: string
  approvalHash: string; attemptId: string; terminationHash: string; verificationHash: string; issuedAt: number; expiresAt: number
}
export const currentDeliverySigningBytes = (state: CurrentDelivery) => Buffer.from(`ai-sdlc/delivery-current/v1\n${digest(state)}`)

export function authenticateCurrentDelivery(envelope: unknown, trust: DeliveryTrust, taskKey: string, now: number): CurrentDelivery {
  if (!exact(envelope, ['state', 'signature']) || !exact(envelope.state, ['version', 'keyId', 'authorityRevision', 'taskKey',
    'artifactHash', 'scopeHash', 'approvalHash', 'attemptId', 'terminationHash', 'verificationHash', 'issuedAt', 'expiresAt'])) return reject()
  const s = envelope.state
  if (s.version !== 1 || s.keyId !== trust.keyId || s.authorityRevision !== trust.authorityRevision || s.taskKey !== taskKey
    || !Number.isSafeInteger(s.issuedAt) || !Number.isSafeInteger(s.expiresAt) || !Number.isSafeInteger(now)
    || (s.issuedAt as number) < trust.validFrom || (s.issuedAt as number) > now || (s.expiresAt as number) <= now
    || (s.expiresAt as number) - (s.issuedAt as number) > 15 || trust.expiresAt <= now || trust.nativeRuntimeQualified !== true
    || typeof s.attemptId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s.attemptId)) return reject()
  for (const key of ['taskKey', 'artifactHash', 'scopeHash', 'approvalHash', 'terminationHash', 'verificationHash']) if (typeof s[key] !== 'string' || !/^[a-f0-9]{64}$/.test(s[key] as string)) return reject()
  if (trust.publicKey?.type !== 'public' || trust.publicKey.asymmetricKeyType !== 'ed25519'
    || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)
    || !verify(null, currentDeliverySigningBytes(s as CurrentDelivery), trust.publicKey, Buffer.from(envelope.signature, 'base64'))) return reject()
  return structuredClone(s) as CurrentDelivery
}

async function readBounded(file: string) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16384) return reject()
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || before.size > 16384 || before.ino !== info.ino || before.dev !== info.dev) return reject()
    const buffer = Buffer.alloc(16385)
    let size = 0
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, size)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    const after = await handle.stat(), bytes = buffer.subarray(0, size)
    if (size > 16384 || size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs || !bytes.equals(Buffer.from(bytes.toString('utf8')))) return reject()
    return JSON.parse(bytes.toString('utf8')) as unknown
  } finally { await handle.close() }
}

/** Operator-owned public policy and short-lived signed state. No credential or sender-selected root.
 * The independent authority publishes these files; the web process only reads them.
 * Missing/expired state blocks decisions. A restored SQL database cannot refresh it.
 */
export async function currentDelivery(taskKey: string) {
  if (!/^[a-f0-9]{64}$/.test(taskKey)) return reject()
  try {
    const directory = process.env.AISDLC_DELIVERY_STATE_DIRECTORY || path.resolve('.local')
    if (!path.isAbsolute(directory)) return reject()
    const config = await readBounded(path.join(directory, 'delivery-trust.json'))
    if (!exact(config, ['keyId', 'authorityRevision', 'publicKeyDer', 'nativeRuntimeQualified', 'runtimeHash', 'verifierHash', 'qualificationHash', 'image', 'validFrom', 'expiresAt'])
      || typeof config.publicKeyDer !== 'string' || config.publicKeyDer.length > 128
      || config.nativeRuntimeQualified !== true || typeof config.keyId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(config.keyId)
      || !Number.isSafeInteger(config.authorityRevision) || (config.authorityRevision as number) < 1
      || !Number.isSafeInteger(config.validFrom) || !Number.isSafeInteger(config.expiresAt)) return reject()
    const der = Buffer.from(config.publicKeyDer, 'base64')
    if (der.toString('base64') !== config.publicKeyDer) return reject()
    const publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' })
    if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') return reject()
    const { publicKeyDer: _, ...policy } = config
    const trust = { ...policy, publicKey } as DeliveryTrust
    const envelope = await readBounded(path.join(directory, `delivery-current-${taskKey}.json`))
    const state = authenticateCurrentDelivery(envelope, trust, taskKey, Math.floor(Date.now() / 1000))
    return { trust, state }
  } catch { return reject() }
}
