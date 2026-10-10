import { generateKeyPairSync, sign } from 'node:crypto'
import { digest } from '../src/sdlc/contracts'
import { SupervisorRegistry, registrySigningBytes, type RegistryCatalog, type RegistryEntry, type RegistrySnapshot } from '../src/sdlc/supervisor-registry'
import type { SupervisorPolicy } from '../src/sdlc/verifier-evidence'

// Ephemeral test root only. Never used to configure an application supervisor.
export function syntheticRegistry(policy: SupervisorPolicy, now = Math.floor(Date.now() / 1000)) {
  const root = generateKeyPairSync('ed25519')
  const entry: RegistryEntry = { supervisorKey: policy.supervisorKey, keyId: policy.keyId, publicKey: policy.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), verifierHash: policy.verifierHash, qualificationHash: policy.qualificationHash, image: policy.image, status: 'active', notBefore: now - 60, notAfter: now + 600 }
  let catalog: RegistryCatalog = { version: 1, revision: 1, issuedAt: now - 60, expiresAt: now + 600, entries: [entry], syntheticOnly: true, executionAllowed: false }
  const snapshot = (value: RegistryCatalog): RegistrySnapshot => ({ anchor: { revision: value.revision, catalogHash: digest(value), rootPublicKey: root.publicKey }, document: JSON.stringify({ catalog: value, signature: sign(null, registrySigningBytes(value), root.privateKey).toString('base64') }) })
  let current = snapshot(catalog)
  const registry = new SupervisorRegistry(() => current)
  return {
    registry, entry, root, snapshot,
    get catalog() { return JSON.parse(JSON.stringify(catalog)) as RegistryCatalog },
    get current() { return current },
    replace(entries: RegistryEntry[]) { catalog = { ...catalog, revision: catalog.revision + 1, entries }; current = snapshot(catalog) },
    supply(value: RegistrySnapshot) { current = value },
  }
}
