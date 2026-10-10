import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { digest } from '../src/sdlc/contracts'
import { verifierImage } from '../src/sdlc/task-binding'
import { SupervisorRegistry, registrySigningBytes, type RegistryCatalog, type RegistryEntry } from '../src/sdlc/supervisor-registry'
import { syntheticRegistry } from './supervisor-registry-fixture'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function fixture() {
  const keys = generateKeyPairSync('ed25519')
  return syntheticRegistry({ supervisorKey: 'synthetic-supervisor', keyId: 'test-key-one', publicKey: keys.publicKey, verifierHash: hash('verifier'), qualificationHash: hash('qualification'), image: verifierImage }, 1000)
}
test('operator-anchored registry resolves only signed current active supervisor keys', () => {
  const f = fixture(), result = f.registry.resolve(f.entry.supervisorKey, 1000)
  assert.equal(result.registryHash, digest(f.catalog))
  assert.equal(result.registryRevision, 1)
  assert.equal(result.validUntil, 1600)
  assert.equal(result.policy.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), f.entry.publicKey)
  const old = f.current
  f.replace([{ ...f.entry, status: 'revoked' }])
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  f.supply(old)
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  f.replace([f.entry])
  assert.equal(f.registry.resolve(f.entry.supervisorKey, 1000).registryRevision, 3)
  f.supply(f.snapshot({ ...f.catalog, entries: [{ ...f.entry, notAfter: 1599 }] }))
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
})
test('registry denies old signed catalogs against independent current anchors and wrong roots', () => {
  const f = fixture(), old = f.current
  f.replace([{ ...f.entry, status: 'revoked' }])
  const latest = f.current
  f.supply({ anchor: latest.anchor, document: old.document })
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  assert.throws(() => new SupervisorRegistry(() => ({ anchor: latest.anchor, document: old.document })).resolve(f.entry.supervisorKey, 1000))
  f.supply({ anchor: old.anchor, document: latest.document })
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  for (const rootPublicKey of [generateKeyPairSync('ed25519').publicKey, f.root.privateKey]) {
    f.supply({ ...old, anchor: { ...old.anchor, rootPublicKey } })
    assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  }
  const changed = { ...f.catalog, entries: [f.entry] }
  f.supply({ anchor: { ...latest.anchor, catalogHash: digest(changed) }, document: JSON.stringify({ catalog: changed, signature: JSON.parse(latest.document).signature }) })
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
})
test('registry rejects malformed catalogs, ambiguous entries and invalid validity windows', () => {
  const f = fixture()
  for (const change of [
    { entries: [] }, { entries: Array(33).fill(f.entry) }, { entries: [f.entry, f.entry] },
    { entries: [f.entry, { ...f.entry, keyId: 'test-key-two' }] },
    { entries: [{ ...f.entry, publicKey: 'a'.repeat(60) }] },
    { entries: [{ ...f.entry, verifierHash: [f.entry.verifierHash] }] },
    { entries: [{ ...f.entry, notBefore: 999, notAfter: 999 }] },
    { entries: [{ ...f.entry, notBefore: 939 }] }, { entries: [{ ...f.entry, notAfter: 1601 }] },
    { executionAllowed: true }, { expiresAt: 100000 }, { extra: true },
  ]) {
    const catalog = { ...f.catalog, ...change } as RegistryCatalog
    f.supply(f.snapshot(catalog))
    assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  }
  for (const document of ['null', '{}', 'not JSON', 'x'.repeat(32769)]) {
    f.supply({ ...f.snapshot(f.catalog), document })
    assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1000))
  }
})
test('registry checks key/catalog expiry and lookup freshness on every resolution', () => {
  const f = fixture()
  for (const now of [939, 1600, NaN, 1000.5]) assert.throws(() => f.registry.resolve(f.entry.supervisorKey, now))
  assert.throws(() => f.registry.resolve('unknown-supervisor', 1000))
  const limited: RegistryEntry = { ...f.entry, notBefore: 1050, notAfter: 1100 }
  f.replace([limited])
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1049))
  assert.equal(f.registry.resolve(f.entry.supervisorKey, 1050).validUntil, 1100)
  assert.throws(() => f.registry.resolve(f.entry.supervisorKey, 1100))
  const snapshot = f.current
  const crossProtocol = { ...snapshot, document: JSON.stringify({ catalog: f.catalog, signature: sign(null, Buffer.from(digest(f.catalog)), f.root.privateKey).toString('base64') }) }
  assert.throws(() => new SupervisorRegistry(() => crossProtocol).resolve(f.entry.supervisorKey, 1050))
  assert.deepEqual(registrySigningBytes(f.catalog), Buffer.from(`ai-sdlc/supervisor-registry/v1\n${digest(f.catalog)}`))
})
