import { createPublicKey, KeyObject, verify } from 'node:crypto'
import { digest } from './contracts'
import { supervisorIdentity, type SupervisorPolicy } from './verifier-evidence'

const sha = /^[a-f0-9]{64}$/
const slug = /^[a-z][a-z0-9-]{2,63}$/
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const reject = (): never => { throw new Error('Supervisor registry rejected.') }
export type RegistryEntry = {
  supervisorKey: string; keyId: string; publicKey: string; status: 'active' | 'revoked'
  verifierHash: string; qualificationHash: string; image: string; notBefore: number; notAfter: number
}
export type RegistryCatalog = { version: 1; revision: number; issuedAt: number; expiresAt: number; entries: RegistryEntry[]; syntheticOnly: true; executionAllowed: false }
export type RegistryAnchor = { revision: number; catalogHash: string; rootPublicKey: KeyObject }
export type RegistrySnapshot = { anchor: RegistryAnchor; document: string }
export const registrySigningBytes = (catalog: RegistryCatalog) => Buffer.from(`ai-sdlc/supervisor-registry/v1\n${digest(catalog)}`, 'utf8')

/** Construct only in trusted operator configuration. The latest anchor must be independent
 * of sender data and application DB rollback. No default keys or ambient file/network lookup.
 */
export class SupervisorRegistry {
  #readCurrent: () => RegistrySnapshot
  #revision = 0
  #catalogHash = ''
  constructor(readCurrent: () => RegistrySnapshot) {
    if (typeof readCurrent !== 'function') throw new Error('Supervisor registry rejected.')
    this.#readCurrent = readCurrent
  }
  resolve(supervisorKey: string, now: number) {
    if (typeof supervisorKey !== 'string' || !slug.test(supervisorKey) || !Number.isSafeInteger(now) || now < 1) return reject()
    // Invoke anew for every issuance/receipt. Never cache a policy across transaction waits.
    const { anchor, document } = this.#readCurrent()
    if (!anchor || !Number.isSafeInteger(anchor.revision) || anchor.revision < 1 || typeof anchor.catalogHash !== 'string' || !sha.test(anchor.catalogHash) || !(anchor.rootPublicKey instanceof KeyObject) || anchor.rootPublicKey.type !== 'public' || anchor.rootPublicKey.asymmetricKeyType !== 'ed25519' || typeof document !== 'string' || Buffer.byteLength(document) > 32768) return reject()
    let envelope: unknown
    try { envelope = JSON.parse(document) } catch { return reject() }
    if (!exact(envelope, ['catalog', 'signature']) || !exact(envelope.catalog, ['version', 'revision', 'issuedAt', 'expiresAt', 'entries', 'syntheticOnly', 'executionAllowed'])) return reject()
    const catalog = envelope.catalog
    if (catalog.version !== 1 || catalog.syntheticOnly !== true || catalog.executionAllowed !== false || catalog.revision !== anchor.revision || !Number.isSafeInteger(catalog.issuedAt) || !Number.isSafeInteger(catalog.expiresAt) || (catalog.issuedAt as number) < 1 || (catalog.expiresAt as number) <= (catalog.issuedAt as number) || (catalog.expiresAt as number) - (catalog.issuedAt as number) > 86400 || digest(catalog) !== anchor.catalogHash || !Array.isArray(catalog.entries) || catalog.entries.length < 1 || catalog.entries.length > 32) return reject()
    if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) return reject()
    const signature = Buffer.from(envelope.signature, 'base64')
    if (signature.length !== 64 || signature.toString('base64') !== envelope.signature || !verify(null, registrySigningBytes(catalog as RegistryCatalog), anchor.rootPublicKey, signature)) return reject()
    let previous = ''
    const active = new Set<string>()
    let selected: { policy: SupervisorPolicy; validFrom: number; validUntil: number } | undefined
    for (const entry of catalog.entries) {
      if (!exact(entry, ['supervisorKey', 'keyId', 'publicKey', 'status', 'verifierHash', 'qualificationHash', 'image', 'notBefore', 'notAfter']) || typeof entry.supervisorKey !== 'string' || !slug.test(entry.supervisorKey) || typeof entry.keyId !== 'string' || !slug.test(entry.keyId) || !['active', 'revoked'].includes(entry.status as string) || typeof entry.publicKey !== 'string' || !/^[A-Za-z0-9+/]{59}=$/.test(entry.publicKey) || !Number.isSafeInteger(entry.notBefore) || !Number.isSafeInteger(entry.notAfter) || (entry.notBefore as number) < (catalog.issuedAt as number) || (entry.notAfter as number) > (catalog.expiresAt as number) || (entry.notAfter as number) <= (entry.notBefore as number)) return reject()
      const order = `${entry.supervisorKey}:${entry.keyId}`
      if (order <= previous) return reject()
      previous = order
      let publicKey: KeyObject
      try {
        const bytes = Buffer.from(entry.publicKey, 'base64')
        if (bytes.toString('base64') !== entry.publicKey) return reject()
        publicKey = createPublicKey({ key: bytes, type: 'spki', format: 'der' })
        if (publicKey.export({ type: 'spki', format: 'der' }).toString('base64') !== entry.publicKey) return reject()
      } catch { return reject() }
      const policy = { supervisorKey: entry.supervisorKey, keyId: entry.keyId, publicKey, verifierHash: entry.verifierHash, qualificationHash: entry.qualificationHash, image: entry.image } as SupervisorPolicy
      supervisorIdentity(policy)
      if (entry.status === 'active') {
        if (active.has(entry.supervisorKey)) return reject()
        active.add(entry.supervisorKey)
        if (entry.supervisorKey === supervisorKey) {
          selected = { policy, validFrom: entry.notBefore as number, validUntil: entry.notAfter as number }
        }
      }
    }
    // Remember authenticated catalogs even when lookup is revoked/expired. This latch is
    // process-local only; a new process still requires an independently current anchor.
    if (anchor.revision < this.#revision || (anchor.revision === this.#revision && anchor.catalogHash !== this.#catalogHash)) return reject()
    this.#revision = anchor.revision
    this.#catalogHash = anchor.catalogHash
    if (!selected || now < (catalog.issuedAt as number) || now >= (catalog.expiresAt as number) || now < selected.validFrom || now >= selected.validUntil) return reject()
    return { ...selected, registryHash: anchor.catalogHash, registryRevision: anchor.revision }
  }
}
