import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcile, reconcileAfterDrain } from '../scripts/verifier-container-recovery.mjs'

const token = '12345678-1234-1234-1234-123456789abc'
const record = { version: 1, token, name: `sdlc-crash-${token}` }
const id = 'a'.repeat(64)
test('pending writers deny recovery before any daemon query, even if inventory would be empty', async () => {
  let queried = false
  const docker = async () => { queried = true; return { stdout: '' } }
  for (const missing of ['controllerClosed', 'operationClientsClosed', 'proxyClosed']) {
    const proof = { controllerClosed: true, operationClientsClosed: true, proxyClosed: true, [missing]: false }
    await assert.rejects(reconcileAfterDrain(record, token, docker, proof))
  }
  await assert.rejects(reconcileAfterDrain(record, token, docker))
  assert.equal(queried, false)
  assert.deepEqual(await reconcileAfterDrain(record, token, docker, { controllerClosed: true, operationClientsClosed: true, proxyClosed: true }), { containerAbsent: true, retryAuthorized: false })
})
test('recovery confirms absence but never authorizes retry', async () => {
  const result = await reconcile(record, token, async () => ({ stdout: '' }))
  assert.deepEqual(result, { containerAbsent: true, retryAuthorized: false })
})
test('recovery refuses wrong identity before removal', async () => {
  let removed = false
  await assert.rejects(reconcile(record, token, async ([command]) => {
    if (command === 'ps') return { stdout: id }
    if (command === 'inspect') return { stdout: JSON.stringify([{ Id: id, Name: `/${record.name}`, Config: { Labels: { 'sdlc.qualification.owner': 'other-owner' } } }]) }
    removed = true
  }))
  assert.equal(removed, false)
})
test('failed removal, daemon failure and surviving inventory all fail closed', async () => {
  for (const failure of ['remove', 'inventory', 'survives']) {
    await assert.rejects(reconcile(record, token, async ([command]) => {
      if (command === 'ps') { if (failure === 'inventory') throw new Error('daemon unavailable'); return { stdout: id } }
      if (command === 'inspect') return { stdout: JSON.stringify([{ Id: id, Name: `/${record.name}`, Config: { Labels: { 'sdlc.qualification.owner': token } } }]) }
      if (failure === 'remove') throw new Error('removal failed')
      return { stdout: '' }
    }))
  }
})
