import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { digest } from '../src/sdlc/contracts'
import { activeProject } from '../src/sdlc/project'
import { queueReservation, reserveTask, heartbeat, finishReservation, expireReservation, recoverReservation, type Reservation } from '../src/sdlc/task-coordinator'

test('ownership is atomic, fenced, scope-bound and capped across coordinator calls', async () => {
  const payload = await getPayload({ config })
  const records: { collection: 'sdlc-stories' | 'sdlc-gates'; id: number }[] = []
  let taskId: number | undefined
  const taskIds: number[] = []
  try {
    const project = await activeProject()
    const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 20, depth: 0 })
    const admin = users.docs.find(user => user.role === 'admin')!, editor = users.docs.find(user => user.role === 'editor')!
    const data = { projectKey: project.key, contextHash: digest(project), storyKey: `ownership-${Date.now()}`, title: 'Synthetic ownership protocol test', contract: { sourceHash: digest('source'), checkPolicyHash: digest('checks'), designHash: digest('design'), sprintHash: digest('sprint'), allowedPaths: ['src/filter.ts'], acceptanceCriteria: ['Preserve order.'] }, actor: admin.id, revision: 1, versionKey: '', scopeHash: '' }
    const story = await payload.create({ collection: 'sdlc-stories', data, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: story.id })
    await assert.rejects(queueReservation(payload, story.id), /acceptance required/)
    for (const kind of ['sprint', 'design-security'] as const) {
      const gate = await payload.create({ collection: 'sdlc-gates', user: admin, overrideAccess: false, depth: 0, data: { story: story.id, projectKey: project.key, scopeHash: story.scopeHash, kind, decision: 'accept', notes: 'Synthetic test approval, removed after test.', actor: admin.id, decisionKey: '' } })
      records.push({ collection: 'sdlc-gates', id: gate.id })
    }
    const queued = await Promise.all([queueReservation(payload, story.id), queueReservation(payload, story.id)])
    assert.equal(queued[0], queued[1]); taskId = queued[0]
    taskIds.push(taskId)
    await assert.rejects(payload.update({ collection: 'sdlc-tasks', id: taskId, user: admin, overrideAccess: false, data: { status: 'queued' } }))
    const claims = await Promise.all([reserveTask(payload, taskId), reserveTask(payload, taskId)])
    assert.equal(claims.filter(Boolean).length, 1)
    const first = claims.find(Boolean)!
    assert.equal(first.executionAllowed, false); assert.equal(first.attempt, 1)
    await assert.rejects(heartbeat(payload, { ...first, fence: first.fence + 1 }), /stale/)
    await heartbeat(payload, first)
    // Hold the task row until a heartbeat is waiting, then expire its lease.
    // Transaction-start NOW() would wrongly renew it; wall-clock checks must deny it.
    const blocker = await payload.db.pool.connect()
    let blockedHeartbeat: Promise<unknown> | undefined
    try {
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM sdlc_tasks WHERE id=$1 FOR UPDATE', [taskId])
      blockedHeartbeat = heartbeat(payload, first).catch(error => error)
      let waiting = false
      for (let index = 0; index < 100; index++) {
        await blocker.query('SELECT pg_stat_clear_snapshot()')
        const activity = await blocker.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query='SELECT * FROM sdlc_tasks WHERE id=$1 FOR UPDATE'")
        if (activity.rowCount) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(waiting, 'Heartbeat must have begun before lease expiry.')
      await blocker.query('UPDATE sdlc_tasks SET lease_expires_at=clock_timestamp() WHERE id=$1', [taskId])
      await blocker.query('COMMIT')
    } catch (error) { await blocker.query('ROLLBACK'); throw error }
    finally { blocker.release() }
    const blockedResult = await blockedHeartbeat
    assert.ok(blockedResult instanceof Error); assert.match(blockedResult.message, /expired/)
    await assert.rejects(finishReservation(payload, first, 'candidate', digest('candidate')), /expired/)
    assert.equal(await reserveTask(payload, taskId), null, 'Expired reservation is not automatically reassigned.')
    assert.equal(await expireReservation(payload, taskId), true)
    assert.equal(await expireReservation(payload, taskId), false)
    await assert.rejects(heartbeat(payload, first), /stale/)
    assert.equal(await reserveTask(payload, taskId), null, 'Uncertain reservation requires recovery.')
    await assert.rejects(recoverReservation(payload, taskId, editor.id, digest('recovery')), /administrator/)
    assert.equal(await recoverReservation(payload, taskId, admin.id, digest('reservation-only-no-child')), 'queued')
    for (const attempt of [2, 3]) {
      let next: Reservation | null
      if (attempt === 2) {
        // A fresh trusted coordinator process must see the consumed first attempt.
        // This process reserves ownership only; it never launches generated code.
        const script = `import {getPayload} from 'payload'; import config from './src/payload.config.ts'; import {reserveTask} from './src/sdlc/task-coordinator.ts'; const payload=await getPayload({config}); const ticket=await reserveTask(payload,${taskId}); await payload.destroy(); console.log('RESERVATION:'+JSON.stringify(ticket)); process.exit(0);`
        const child = await promisify(execFile)(process.execPath, ['--env-file=.env', '--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, NODE_ENV: 'production' }, timeout: 30000, maxBuffer: 64000, encoding: 'utf8', windowsHide: true })
        const marker = child.stdout.split('\n').find(line => line.startsWith('RESERVATION:'))
        assert.ok(marker); next = JSON.parse(marker.slice('RESERVATION:'.length)) as Reservation
      } else next = await reserveTask(payload, taskId)
      assert.ok(next); assert.equal(next.attempt, attempt); assert.ok(next.fence > first.fence)
      await assert.rejects(finishReservation(payload, first, 'candidate', digest('stale')), /stale/)
      await finishReservation(payload, next, 'failed', digest(`failure-${attempt}`))
      assert.equal(await recoverReservation(payload, taskId, admin.id, digest(`no-child-${attempt}`)), attempt === 3 ? 'exhausted' : 'queued')
    }
    assert.equal(await reserveTask(payload, taskId), null)
    const ledger = await payload.find({ collection: 'sdlc-task-events', user: admin, overrideAccess: false, depth: 0, where: { task: { equals: taskId } }, limit: 100 })
    assert.equal(ledger.docs.filter(item => item.kind === 'claimed').length, 3)
    assert.equal(ledger.docs.filter(item => item.kind === 'recovered').length, 3)
    await assert.rejects(payload.delete({ collection: 'sdlc-task-events', id: ledger.docs[0].id, user: admin, overrideAccess: false }))
    const revision = await payload.create({ collection: 'sdlc-stories', data: { ...data, supersedes: story.id }, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: revision.id })
    await assert.rejects(queueReservation(payload, story.id), /superseded/)
    await assert.rejects(queueReservation(payload, revision.id), /acceptance required/)
    for (const kind of ['sprint', 'design-security'] as const) {
      const gate = await payload.create({ collection: 'sdlc-gates', user: admin, overrideAccess: false, depth: 0, data: { story: revision.id, projectKey: project.key, scopeHash: revision.scopeHash, kind, decision: 'accept', notes: 'Synthetic revised scope.', actor: admin.id, decisionKey: '' } })
      records.push({ collection: 'sdlc-gates', id: gate.id })
    }
    const secondTask = await queueReservation(payload, revision.id); taskIds.push(secondTask)
    const inFlight = await reserveTask(payload, secondTask); assert.ok(inFlight)
    const changed = await payload.create({ collection: 'sdlc-stories', data: { ...data, supersedes: revision.id }, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: changed.id })
    await assert.rejects(heartbeat(payload, inFlight), /superseded/)
    await assert.rejects(finishReservation(payload, inFlight, 'candidate', digest('stale-scope')), /superseded/)
    assert.equal((await payload.findByID({ collection: 'sdlc-tasks', id: secondTask, overrideAccess: true, depth: 0 })).status, 'reserved')
  } finally {
    for (const cleanupId of taskIds.reverse()) {
      const events = await payload.find({ collection: 'sdlc-task-events', overrideAccess: true, where: { task: { equals: cleanupId } }, limit: 100, depth: 0 })
      for (const item of events.docs) await payload.delete({ collection: 'sdlc-task-events', id: item.id, overrideAccess: true })
      await payload.delete({ collection: 'sdlc-tasks', id: cleanupId, overrideAccess: true })
    }
    for (const record of records.reverse()) await payload.delete({ ...record, overrideAccess: true })
    await payload.destroy()
  }
})
