import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const template = JSON.parse(await readFile(new URL('../infra/azure/recovery-storage.json', import.meta.url)))

test('authority storage excludes anonymous/key authentication and public network bypasses', () => {
  const account = template.resources.find(resource => resource.type === 'Microsoft.Storage/storageAccounts')
  assert.equal(account.sku.name, 'Standard_LRS')
  assert.equal(account.properties.allowBlobPublicAccess, false)
  assert.equal(account.properties.allowSharedKeyAccess, false)
  assert.equal(account.properties.supportsHttpsTrafficOnly, true)
  assert.equal(account.properties.minimumTlsVersion, 'TLS1_2')
  assert.equal(account.properties.networkAcls.defaultAction, 'Deny')
  assert.equal(account.properties.networkAcls.bypass, 'None')
  assert.equal(account.properties.networkAcls.ipRules, "[parameters('allowedIpRules')]")
  assert.equal(template.parameters.allowedIpRules.maxLength, 3)
  assert.equal(template.resources.some(resource => resource.type.includes('roleAssignments')), false)
  assert.equal(template.resources.some(resource => resource.type.includes('virtualMachines')), false)
})

test('external ledger retains versions and permits protected append without policy locking', () => {
  const service = template.resources.find(resource => resource.type.endsWith('/blobServices'))
  assert.equal(service.properties.isVersioningEnabled, true)
  assert.deepEqual(service.properties.deleteRetentionPolicy, { enabled: true, days: 2, allowPermanentDelete: false })
  const container = template.resources.find(resource => resource.type.endsWith('/containers'))
  assert.equal(container.properties.publicAccess, 'None')
  const policy = template.resources.find(resource => resource.type.endsWith('/immutabilityPolicies'))
  assert.equal(policy.properties.allowProtectedAppendWrites, true)
  assert.equal(policy.properties.allowProtectedAppendWritesAll, false)
  assert.equal(policy.properties.immutabilityPeriodSinceCreationInDays, 2)
  assert.equal(Object.hasOwn(policy.properties, 'state'), false)
  assert.match(template.outputs.ledgerUrl.value, /ledger-v1\.jsonl/)
})
