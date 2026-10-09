// Qualification-only reconciliation. Never grants task ownership or retry permission.
import assert from 'node:assert/strict'

export async function reconcileAfterDrain(record, expectedToken, docker, proof) {
  // Qualification-only proof from the surviving trusted observer, never candidate/journal data.
  assert.equal(proof?.controllerClosed, true, 'Controller may still issue operations.')
  assert.equal(proof?.operationClientsClosed, true, 'Pending operation client may still write.')
  assert.equal(proof?.proxyClosed, true, 'Pending proxy may still forward operations.')
  return reconcile(record, expectedToken, docker)
}

export async function reconcile(record, expectedToken, docker) {
  assert.match(expectedToken, /^[a-f0-9-]{36}$/)
  assert.equal(record.version, 1)
  assert.equal(record.token, expectedToken)
  assert.equal(record.name, `sdlc-crash-${expectedToken}`)
  const inventory = async () => (await docker(['ps', '--all', '--no-trunc', '--quiet', '--filter', `name=^/${record.name}$`])).stdout.trim().split('\n').filter(Boolean)
  let ids = await inventory()
  assert.ok(ids.length <= 1, 'Ambiguous inventory; cleanup uncertain.')
  if (ids.length) {
    assert.match(ids[0], /^[a-f0-9]{64}$/)
    const container = JSON.parse((await docker(['inspect', ids[0]])).stdout)[0]
    assert.equal(container.Id, ids[0])
    assert.equal(container.Name, `/${record.name}`)
    assert.equal(container.Config.Labels['sdlc.qualification.owner'], expectedToken)
    // Remove by immutable ID only after verifying ownership, never a caller-selected arbitrary name.
    await docker(['rm', '--force', ids[0]])
    ids = await inventory()
    assert.equal(ids.length, 0, 'Container remains; cleanup uncertain.')
  }
  return { containerAbsent: true, retryAuthorized: false }
}
