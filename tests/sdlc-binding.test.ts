import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { digest } from '../src/sdlc/contracts'
import { activeProject } from '../src/sdlc/project'
import { verifierImage, validateBoundCandidate } from '../src/sdlc/task-binding'
import { queueReservation, reserveTask, bindReservationArtifacts, inspectReservationBinding, finishReservation, recoverReservation } from '../src/sdlc/task-coordinator'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function capsule(text: string) {
  const files = [{ path: 'src/synthetic.mjs', bytes: Buffer.byteLength(text), sha256: hash(text), content: Buffer.from(text).toString('base64') }]
  return { version: 1 as const, files, sha256: hash(JSON.stringify({ version: 1, files })) }
}

test('persisted artifact bindings are atomic, immutable and exact to the current gated attempt', async () => {
  const payload = await getPayload({ config })
  const records: { collection: 'sdlc-stories' | 'sdlc-gates'; id: number }[] = []
  let taskId: number | undefined
  try {
    const project = await activeProject()
    const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 20, depth: 0 })
    const admin = users.docs.find(user => user.role === 'admin')!, editor = users.docs.find(user => user.role === 'editor')!
    assert.ok(admin && editor)
    const source = capsule('export default "synthetic source"')
    const candidate = capsule('export default "synthetic candidate"')
    const material = { sourceCapsule: source, candidateCapsule: candidate, checkPolicy: 'synthetic protected checks', verifierSource: 'synthetic protected verifier', image: verifierImage, supervisorKey: 'synthetic-supervisor', qualificationHash: hash('synthetic qualification evidence') }
    const contract = { sourceHash: source.sha256, checkPolicyHash: hash(material.checkPolicy), designHash: hash('design'), sprintHash: hash('sprint'), allowedPaths: ['src/synthetic.mjs'], acceptanceCriteria: ['Synthetic artifact integrity scenario; no implementation run.'] }
    const data = { projectKey: project.key, contextHash: digest(project), storyKey: `binding-${randomUUID()}`, title: 'Synthetic artifact-binding test', contract, actor: admin.id, revision: 1, versionKey: '', scopeHash: '' }
    const story = await payload.create({ collection: 'sdlc-stories', data, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: story.id })
    for (const kind of ['sprint', 'design-security'] as const) {
      const gate = await payload.create({ collection: 'sdlc-gates', user: admin, overrideAccess: false, depth: 0, data: { story: story.id, projectKey: project.key, scopeHash: story.scopeHash, kind, decision: 'accept', notes: 'Synthetic test only; not actual human approval. Removed after test.', actor: admin.id, decisionKey: '' } })
      records.push({ collection: 'sdlc-gates', id: gate.id })
    }
    taskId = await queueReservation(payload, story.id)
    const reservation = await reserveTask(payload, taskId, 300)
    assert.ok(reservation)
    await assert.rejects(bindReservationArtifacts(payload, { ...reservation, fence: reservation.fence + 1 }, material), /stale/)
    await assert.rejects(bindReservationArtifacts(payload, reservation, { ...material, checkPolicy: 'untrusted checks' }))
    const receipts = await Promise.all([bindReservationArtifacts(payload, reservation, material), bindReservationArtifacts(payload, reservation, material)])
    assert.deepEqual(receipts[0], receipts[1])
    const receipt = receipts[0]
    assert.equal(receipt.record.executionAllowed, false)
    assert.notEqual(receipt.record.recoveryKey, reservation.owner)
    assert.equal(receipt.record.approvalGates.length, 2)
    assert.equal((await payload.db.pool.query('SELECT count(*)::int AS count FROM sdlc_task_bindings WHERE task_id=$1', [taskId])).rows[0].count, 1)
    assert.equal((await payload.db.pool.query("SELECT count(*)::int AS count FROM sdlc_task_events WHERE task_id=$1 AND kind='artifacts-bound'", [taskId])).rows[0].count, 1)
    await assert.rejects(bindReservationArtifacts(payload, reservation, { ...material, candidateCapsule: capsule('another candidate') }), /different artifacts/)
    await assert.rejects(inspectReservationBinding(payload, reservation, hash('wrong receipt')), /mismatch/)
    assert.deepEqual(await inspectReservationBinding(payload, reservation, receipt.bindingHash), receipt)
    assert.deepEqual(validateBoundCandidate(receipt, candidate, { sourceHash: receipt.record.sourceHash, candidateHash: receipt.record.candidateHash, checkPolicyHash: receipt.record.checkPolicyHash, verifierHash: receipt.record.verifierHash, qualificationHash: receipt.record.qualificationHash, image: verifierImage, supervisorKey: receipt.record.supervisorKey, recoveryKey: receipt.record.recoveryKey }), { artifactsMatch: true, executionAllowed: false, retryAuthorized: false })
    const document = await payload.find({ collection: 'sdlc-task-bindings', user: admin, overrideAccess: false, depth: 0, where: { task: { equals: taskId } } })
    assert.equal(document.docs.length, 1)
    await assert.rejects(payload.find({ collection: 'sdlc-task-bindings', user: editor, overrideAccess: false, depth: 0 }), /not allowed/)
    await assert.rejects(payload.find({ collection: 'sdlc-task-bindings', overrideAccess: false, depth: 0 }), /not allowed/)
    await assert.rejects(payload.create({ collection: 'sdlc-task-bindings', overrideAccess: true, data: { task: taskId, bindingKey: hash('forged slot'), bindingHash: hash('forged binding'), recoveryKey: randomUUID(), record: receipt.record } }), /internal coordinator/)
    await assert.rejects(payload.update({ collection: 'sdlc-task-bindings', id: document.docs[0].id, user: admin, overrideAccess: true, data: { record: { executionAllowed: true } } }), /internal coordinator/)
    await assert.rejects(payload.delete({ collection: 'sdlc-task-bindings', id: document.docs[0].id, user: admin, overrideAccess: true }), /immutable/)
    // Fresh coordinator process reloads the same durable identity and exact receipt.
    const script = `import {getPayload} from 'payload'; import config from './src/payload.config.ts'; import {inspectReservationBinding} from './src/sdlc/task-coordinator.ts'; const payload=await getPayload({config}); const receipt=await inspectReservationBinding(payload,${JSON.stringify(reservation)},${JSON.stringify(receipt.bindingHash)}); await payload.destroy(); console.log('BINDING:'+JSON.stringify(receipt)); process.exit(0);`
    const child = await promisify(execFile)(process.execPath, ['--env-file=.env', '--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, NODE_ENV: 'production' }, timeout: 30000, maxBuffer: 64000, windowsHide: true })
    const marker = child.stdout.split('\n').find(line => line.startsWith('BINDING:'))
    assert.ok(marker); assert.deepEqual(JSON.parse(marker.slice('BINDING:'.length)), receipt)
    // A privileged-row corruption cannot pass the independently retained receipt digest.
    await payload.db.pool.query('UPDATE sdlc_task_bindings SET record=$2 WHERE task_id=$1', [taskId, JSON.stringify({ ...receipt.record, supervisorKey: 'forged-supervisor' })])
    await assert.rejects(inspectReservationBinding(payload, reservation, receipt.bindingHash))
    await payload.db.pool.query('UPDATE sdlc_task_bindings SET record=$2 WHERE task_id=$1', [taskId, JSON.stringify(receipt.record)])
    await payload.db.pool.query("UPDATE sdlc_gates SET actor_id=$2 WHERE story_id=$1 AND kind='design-security'", [story.id, editor.id])
    await assert.rejects(inspectReservationBinding(payload, reservation, receipt.bindingHash), /acceptance required/)
    await payload.db.pool.query("UPDATE sdlc_gates SET actor_id=$2 WHERE story_id=$1 AND kind='design-security'", [story.id, admin.id])
    await finishReservation(payload, reservation, 'failed', hash('no-child-synthetic-failure'))
    assert.equal(await recoverReservation(payload, taskId, admin.id, hash('no-child-reservation-only')), 'queued')
    const next = await reserveTask(payload, taskId, 300)
    assert.ok(next); assert.equal(next.attempt, 2)
    await assert.rejects(inspectReservationBinding(payload, reservation, receipt.bindingHash), /stale/)
    await assert.rejects(inspectReservationBinding(payload, next, receipt.bindingHash), /mismatch/)
    const newReceipt = await bindReservationArtifacts(payload, next, material)
    assert.notEqual(newReceipt.bindingHash, receipt.bindingHash)
    assert.notEqual(newReceipt.record.recoveryKey, receipt.record.recoveryKey)
    // Waiting on a task row cannot use an earlier transaction clock to evade expiry.
    const blocker = await payload.db.pool.connect()
    let pending: Promise<unknown>
    try {
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM sdlc_tasks WHERE id=$1 FOR UPDATE', [taskId])
      pending = inspectReservationBinding(payload, next, newReceipt.bindingHash).catch(error => error)
      let waiting = false
      for (let index = 0; index < 100; index++) {
        await blocker.query('SELECT pg_stat_clear_snapshot()')
        const activity = await blocker.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query='SELECT * FROM sdlc_tasks WHERE id=$1 FOR UPDATE'")
        if (activity.rowCount) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(waiting, 'Binding reader must wait before lease expiry.')
      await blocker.query('UPDATE sdlc_tasks SET lease_expires_at=clock_timestamp() WHERE id=$1', [taskId])
      await blocker.query('COMMIT')
    } catch (error) { await blocker.query('ROLLBACK'); throw error } finally { blocker.release() }
    const expired = await pending!
    assert.ok(expired instanceof Error); assert.match(expired.message, /expired/)
    await assert.rejects(bindReservationArtifacts(payload, next, material), /expired/)
    await payload.db.pool.query("UPDATE sdlc_tasks SET lease_expires_at=clock_timestamp()+INTERVAL '300 seconds' WHERE id=$1", [taskId])
    const revision = await payload.create({ collection: 'sdlc-stories', data: { ...data, supersedes: story.id }, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: revision.id })
    await assert.rejects(inspectReservationBinding(payload, next, newReceipt.bindingHash), /superseded/)
    await assert.rejects(bindReservationArtifacts(payload, next, material), /superseded/)
    assert.equal((await payload.findByID({ collection: 'sdlc-tasks', id: taskId, overrideAccess: true, depth: 0 })).status, 'reserved')
  } finally {
    if (taskId) {
      // Test-owned synthetic records only. Immutable API hooks intentionally forbid cleanup writes.
      await payload.db.pool.query('DELETE FROM sdlc_task_bindings WHERE task_id=$1', [taskId])
      await payload.db.pool.query('DELETE FROM sdlc_task_events WHERE task_id=$1', [taskId])
      await payload.delete({ collection: 'sdlc-tasks', id: taskId, overrideAccess: true })
    }
    for (const record of records.reverse()) await payload.delete({ ...record, overrideAccess: true })
    await payload.destroy()
  }
})
