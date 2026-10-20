import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { getPayload, type Payload } from 'payload'
import { approvedTaskScope, registerApprovedTask } from '../src/sdlc/approved-task-registration'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

test('recorded approval registration is authenticated, atomic and idempotent in an isolated database', async () => {
  // Never create synthetic approvals for the real task in the operator's database.
  const original = process.env.DATABASE_URL!
  const url = new URL(original)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  const database = `registration_test_${randomUUID().replaceAll('-', '')}`
  assert.match(database, /^registration_test_[a-f0-9]{32}$/)
  const childDatabase = process.env.AISDLC_REGISTRATION_TEST_DATABASE
  if (!childDatabase) {
    const control = new pg.Pool({ connectionString: original })
    try {
      await control.query(`CREATE DATABASE "${database}"`)
      url.pathname = `/${database}`
      await promisify(execFile)(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit',
        '--test-isolation=none', fileURLToPath(import.meta.url)], { timeout: 120000, maxBuffer: 262144,
        env: { ...process.env, DATABASE_URL: url.toString(), AISDLC_REGISTRATION_TEST_DATABASE: database } })
    } finally {
      // The child must close before deletion: this Payload adapter retains a pool
      // connection even after destroy(). No live operator connection is targeted.
      await control.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await control.end()
    }
    return
  }
  assert.match(childDatabase, /^registration_test_[a-f0-9]{32}$/)
  assert.equal(url.pathname, `/${childDatabase}`)
  let payload: Payload | undefined
  try {
    const config = (await import('../src/payload.config')).default
    payload = await getPayload({ config })
    const personal = await payload.create({ collection: 'users', overrideAccess: true,
      data: { email: 'registration-fixture@example.invalid', password: randomUUID(), role: 'admin' } })
    await assert.rejects(registerApprovedTask(payload, { ...personal, role: 'editor' }, approvedTaskScope), /Delivery-administrator sign-in/)
    await assert.rejects(registerApprovedTask(payload, personal, '0'.repeat(64)), /scope or active project changed/)
    let gateWrites = 0
    const actual = payload
    const failing = new Proxy(payload, { get(target, key) {
      if (key === 'create') return async (options: Parameters<Payload['create']>[0]) => {
        if (options.collection === 'sdlc-gates' && ++gateWrites === 2) throw new Error('Synthetic transaction interruption')
        return actual.create(options)
      }
      return Reflect.get(target, key)
    } })
    await assert.rejects(registerApprovedTask(failing, personal, approvedTaskScope), /Synthetic transaction interruption/)
    assert.equal((await payload.count({ collection: 'sdlc-stories', overrideAccess: true })).totalDocs, 0)
    assert.equal((await payload.count({ collection: 'sdlc-gates', overrideAccess: true })).totalDocs, 0)
    const [first, concurrent] = await Promise.all([
      registerApprovedTask(payload, personal, approvedTaskScope),
      registerApprovedTask(payload, personal, approvedTaskScope),
    ])
    assert.equal(first.storyId, concurrent.storyId)
    assert.equal(first.executionAllowed, false)
    assert.equal((await payload.count({ collection: 'sdlc-stories', overrideAccess: true })).totalDocs, 1)
    const gates = await payload.find({ collection: 'sdlc-gates', overrideAccess: true, depth: 0 })
    assert.equal(gates.totalDocs, 2)
    assert.ok(gates.docs.every(gate => gate.actor === personal.id && gate.scopeHash === approvedTaskScope))
    await payload.delete({ collection: 'sdlc-gates', id: gates.docs[0].id, overrideAccess: true })
    await payload.create({ collection: 'sdlc-gates', user: personal, overrideAccess: false, data: {
      story: first.storyId, scopeHash: approvedTaskScope, kind: gates.docs[0].kind,
      decision: 'reject', notes: 'Synthetic conflicting decision in isolated test database.',
      actor: personal.id, projectKey: '', decisionKey: '',
    } })
    await assert.rejects(registerApprovedTask(payload, personal, approvedTaskScope), /conflicts with registration/)
  } finally {
    await payload?.destroy()
  }
})
