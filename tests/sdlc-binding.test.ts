import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID, generateKeyPairSync, sign } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config'
import { digest } from '../src/sdlc/contracts'
import { activeProject } from '../src/sdlc/project'
import { verifierImage, validateBoundCandidate } from '../src/sdlc/task-binding'
import { queueReservation, reserveTask, bindReservationArtifacts, inspectReservationBinding, finishReservation, recoverReservation, submitBoundCandidate, issueVerifierChallenge, recordVerifierEvidence } from '../src/sdlc/task-coordinator'
import { verifierSigningBytes, type VerifierClaim } from '../src/sdlc/verifier-evidence'

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
    const expected = { sourceHash: receipt.record.sourceHash, candidateHash: receipt.record.candidateHash, checkPolicyHash: receipt.record.checkPolicyHash, verifierHash: receipt.record.verifierHash, qualificationHash: receipt.record.qualificationHash, image: receipt.record.image, supervisorKey: receipt.record.supervisorKey, recoveryKey: receipt.record.recoveryKey }
    await assert.rejects(finishReservation(payload, reservation, 'candidate', candidate.sha256), /bound candidate handoff/)
    await assert.rejects(submitBoundCandidate(payload, reservation, hash('wrong receipt'), candidate, expected), /mismatch/)
    await assert.rejects(submitBoundCandidate(payload, reservation, receipt.bindingHash, capsule('swapped candidate'), expected))
    await assert.rejects(submitBoundCandidate(payload, reservation, receipt.bindingHash, candidate, { ...expected, verifierHash: hash('swapped verifier') }))
    assert.equal((await payload.db.pool.query('SELECT status FROM sdlc_tasks WHERE id=$1', [taskId])).rows[0].status, 'reserved')
    assert.equal((await payload.db.pool.query("SELECT count(*)::int AS count FROM sdlc_task_events WHERE task_id=$1 AND kind='candidate'", [taskId])).rows[0].count, 0)
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
    const nextExpected = { ...expected, recoveryKey: newReceipt.record.recoveryKey }
    await assert.rejects(submitBoundCandidate(payload, next, receipt.bindingHash, candidate, expected), /mismatch/)
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
    await assert.rejects(submitBoundCandidate(payload, next, newReceipt.bindingHash, candidate, nextExpected), /expired/)
    await payload.db.pool.query("UPDATE sdlc_tasks SET lease_expires_at=clock_timestamp()+INTERVAL '300 seconds' WHERE id=$1", [taskId])
    const revision = await payload.create({ collection: 'sdlc-stories', data: { ...data, supersedes: story.id }, user: admin, overrideAccess: false, depth: 0 })
    records.push({ collection: 'sdlc-stories', id: revision.id })
    await assert.rejects(inspectReservationBinding(payload, next, newReceipt.bindingHash), /superseded/)
    await assert.rejects(bindReservationArtifacts(payload, next, material), /superseded/)
    await assert.rejects(submitBoundCandidate(payload, next, newReceipt.bindingHash, candidate, nextExpected), /superseded/)
    assert.equal((await payload.findByID({ collection: 'sdlc-tasks', id: taskId, overrideAccess: true, depth: 0 })).status, 'reserved')
    // Remove only this test's superseding revision to exercise a valid integrity handoff.
    await payload.delete({ collection: 'sdlc-stories', id: revision.id, overrideAccess: true })
    records.pop()
    const submissions = await Promise.allSettled([
      submitBoundCandidate(payload, next, newReceipt.bindingHash, candidate, nextExpected),
      submitBoundCandidate(payload, next, newReceipt.bindingHash, candidate, nextExpected),
    ])
    assert.equal(submissions.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(submissions.filter(result => result.status === 'rejected').length, 1)
    const completed = (await payload.db.pool.query('SELECT status,owner,fence,result_hash FROM sdlc_tasks WHERE id=$1', [taskId])).rows[0]
    assert.equal(completed.status, 'awaiting-verification')
    assert.equal(completed.owner, null)
    assert.equal(Number(completed.fence), next.fence + 1)
    assert.equal(completed.result_hash, newReceipt.bindingHash)
    const events = await payload.db.pool.query("SELECT evidence_hash,owner FROM sdlc_task_events WHERE task_id=$1 AND kind='candidate'", [taskId])
    assert.equal(events.rows.length, 1)
    assert.equal(events.rows[0].evidence_hash, newReceipt.bindingHash)
    assert.equal(events.rows[0].owner, next.owner)
    await assert.rejects(submitBoundCandidate(payload, next, newReceipt.bindingHash, candidate, nextExpected), /stale/)
    await assert.rejects(recoverReservation(payload, taskId, admin.id, hash('not uncertain')), /Only uncertain/)
    const keys = generateKeyPairSync('ed25519')
    const policy = { supervisorKey: expected.supervisorKey, keyId: 'synthetic-test-key', publicKey: keys.publicKey, verifierHash: expected.verifierHash, qualificationHash: expected.qualificationHash, image: expected.image }
    await assert.rejects(issueVerifierChallenge(payload, taskId, receipt.bindingHash, policy), /stale/)
    await assert.rejects(issueVerifierChallenge(payload, taskId, newReceipt.bindingHash, { ...policy, verifierHash: hash('unqualified verifier') }), /policy/)
    const challenge = await issueVerifierChallenge(payload, taskId, newReceipt.bindingHash, policy)
    await assert.rejects(issueVerifierChallenge(payload, taskId, newReceipt.bindingHash, policy), /already/)
    const proof = Buffer.from('Synthetic signed proof; no verifier execution or human approval.')
    const claim: VerifierClaim = { version: 1, challengeHash: challenge.challengeHash, evidenceHash: hash(proof.toString()), evidenceBytes: proof.length, verdict: 'pass', syntheticOnly: true, executionAllowed: false }
    const envelope = JSON.stringify({ claim, signature: sign(null, verifierSigningBytes(claim), keys.privateKey).toString('base64') })
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, hash('wrong challenge'), policy, envelope, proof), /absent/)
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, Buffer.from('swapped')))
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, { ...policy, publicKey: generateKeyPairSync('ed25519').publicKey }, envelope, proof))
    await payload.db.pool.query("UPDATE sdlc_gates SET actor_id=$2 WHERE story_id=$1 AND kind='design-security'", [story.id, editor.id])
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof), /acceptance required/)
    await payload.db.pool.query("UPDATE sdlc_gates SET actor_id=$2 WHERE story_id=$1 AND kind='design-security'", [story.id, admin.id])
    assert.equal((await payload.db.pool.query('SELECT status FROM sdlc_verifier_challenges WHERE challenge_hash=$1', [challenge.challengeHash])).rows[0].status, 'issued')
    assert.equal((await payload.db.pool.query('SELECT count(*)::int AS count FROM sdlc_verifier_evidence WHERE task_id=$1', [taskId])).rows[0].count, 0)
    await payload.db.pool.query('UPDATE sdlc_task_bindings SET record=$2 WHERE binding_hash=$1', [newReceipt.bindingHash, JSON.stringify({ ...newReceipt.record, supervisorKey: 'forged-supervisor' })])
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof))
    await payload.db.pool.query('UPDATE sdlc_task_bindings SET record=$2 WHERE binding_hash=$1', [newReceipt.bindingHash, JSON.stringify(newReceipt.record)])
    // Test-only shortened challenge exercises database wall clock after a real lock wait.
    const clock = Number((await payload.db.pool.query('SELECT floor(extract(epoch FROM clock_timestamp()))::bigint AS now')).rows[0].now)
    const shortRecord = { ...challenge.record, issuedAt: clock, expiresAt: clock + 2 }, shortHash = digest(shortRecord)
    await payload.db.pool.query('UPDATE sdlc_verifier_challenges SET record=$2,challenge_hash=$3,expires_at=to_timestamp($4) WHERE binding_hash=$1', [newReceipt.bindingHash, JSON.stringify(shortRecord), shortHash, shortRecord.expiresAt])
    const shortClaim = { ...claim, challengeHash: shortHash }
    const shortEnvelope = JSON.stringify({ claim: shortClaim, signature: sign(null, verifierSigningBytes(shortClaim), keys.privateKey).toString('base64') })
    const verifierBlocker = await payload.db.pool.connect()
    let delayedIntake: Promise<unknown>
    try {
      await verifierBlocker.query('BEGIN')
      await verifierBlocker.query('SELECT id FROM sdlc_tasks WHERE id=$1 FOR UPDATE', [taskId])
      delayedIntake = recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, shortHash, policy, shortEnvelope, proof).catch(error => error)
      let waiting = false
      for (let index = 0; index < 100; index++) {
        await verifierBlocker.query('SELECT pg_stat_clear_snapshot()')
        const activity = await verifierBlocker.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query='SELECT * FROM sdlc_tasks WHERE id=$1 FOR UPDATE'")
        if (activity.rowCount) { waiting = true; break }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(waiting, 'Verifier intake must wait on the candidate task lock.')
      await new Promise(resolve => setTimeout(resolve, 2100))
      await verifierBlocker.query('COMMIT')
    } catch (error) { await verifierBlocker.query('ROLLBACK'); throw error } finally { verifierBlocker.release() }
    const delayed = await delayedIntake!
    assert.ok(delayed instanceof Error); assert.match(delayed.message, /rejected|expired/)
    assert.equal((await payload.db.pool.query('SELECT status FROM sdlc_verifier_challenges WHERE binding_hash=$1', [newReceipt.bindingHash])).rows[0].status, 'issued')
    await payload.db.pool.query('UPDATE sdlc_verifier_challenges SET record=$2,challenge_hash=$3,expires_at=to_timestamp($4) WHERE binding_hash=$1', [newReceipt.bindingHash, JSON.stringify(challenge.record), challenge.challengeHash, challenge.record.expiresAt])
    // Real transaction, test-only SQL-client fault after consumption but before evidence insertion.
    const faultyPayload = { db: { pool: { connect: async () => {
      const client = await payload.db.pool.connect()
      return {
        query: (sql: string, parameters?: unknown[]) => sql.startsWith('INSERT INTO sdlc_verifier_evidence') ? Promise.reject(new Error('Synthetic evidence insert failure.')) : client.query(sql, parameters),
        release: () => client.release(),
      }
    } } } } as unknown as Payload
    await assert.rejects(recordVerifierEvidence(faultyPayload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof), /Synthetic evidence insert failure/)
    assert.equal((await payload.db.pool.query('SELECT status FROM sdlc_verifier_challenges WHERE binding_hash=$1', [newReceipt.bindingHash])).rows[0].status, 'issued')
    assert.equal((await payload.db.pool.query('SELECT count(*)::int AS count FROM sdlc_verifier_evidence WHERE task_id=$1', [taskId])).rows[0].count, 0)
    const intake = await Promise.allSettled([
      recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof),
      recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof),
    ])
    assert.equal(intake.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(intake.filter(result => result.status === 'rejected').length, 1)
    const accepted = intake.find(result => result.status === 'fulfilled')!
    assert.equal(accepted.value.authenticated, true)
    assert.equal(accepted.value.reviewRequired, true)
    assert.equal(accepted.value.executionAllowed, false)
    assert.equal(accepted.value.retryAuthorized, false)
    await assert.rejects(recordVerifierEvidence(payload, taskId, newReceipt.bindingHash, challenge.challengeHash, policy, envelope, proof), /consumed/)
    const stored = await payload.find({ collection: 'sdlc-verifier-evidence', user: admin, overrideAccess: false, depth: 0, where: { task: { equals: taskId } } })
    assert.equal(stored.docs.length, 1)
    assert.equal(Buffer.from(stored.docs[0].evidenceBase64, 'base64').toString(), proof.toString())
    assert.equal(stored.docs[0].resultHash, accepted.value.resultHash)
    const persistedCheck = `import {getPayload} from 'payload'; import config from './src/payload.config.ts'; import {createPublicKey} from 'node:crypto'; import {authenticateVerifierEvidence} from './src/sdlc/verifier-evidence.ts'; const payload=await getPayload({config}); const row=(await payload.find({collection:'sdlc-verifier-evidence',overrideAccess:true,depth:0,where:{task:{equals:${taskId}}}})).docs[0]; const policy=${JSON.stringify({ ...policy, publicKey: undefined })}; policy.publicKey=createPublicKey({key:Buffer.from(${JSON.stringify(keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))},'base64'),type:'spki',format:'der'}); const result=authenticateVerifierEvidence(${JSON.stringify(challenge)},policy,JSON.stringify(row.record),Buffer.from(row.evidenceBase64,'base64'),Math.floor(Date.now()/1000)); await payload.destroy(); console.log('EVIDENCE:'+result.resultHash); process.exit(0);`
    const freshEvidence = await promisify(execFile)(process.execPath, ['--env-file=.env', '--import', 'tsx', '--input-type=module', '-e', persistedCheck], { env: { ...process.env, NODE_ENV: 'production' }, timeout: 60000, maxBuffer: 64000, windowsHide: true })
    assert.ok(freshEvidence.stdout.includes(`EVIDENCE:${accepted.value.resultHash}`))
    assert.equal((await payload.db.pool.query("SELECT count(*)::int AS count FROM sdlc_task_events WHERE task_id=$1 AND kind='verifier-evidence'", [taskId])).rows[0].count, 1)
    assert.equal((await payload.db.pool.query('SELECT status,result_hash FROM sdlc_tasks WHERE id=$1', [taskId])).rows[0].status, 'awaiting-verification')
    await assert.rejects(payload.find({ collection: 'sdlc-verifier-evidence', user: editor, overrideAccess: false }), /not allowed/)
    await assert.rejects(payload.find({ collection: 'sdlc-verifier-challenges', overrideAccess: false }), /not allowed/)
    await assert.rejects(payload.update({ collection: 'sdlc-verifier-evidence', id: stored.docs[0].id, overrideAccess: true, data: { evidenceBase64: 'forged' } }), /internal coordinator/)
    await assert.rejects(payload.delete({ collection: 'sdlc-verifier-evidence', id: stored.docs[0].id, overrideAccess: true }), /immutable/)
    const challengeDocument = await payload.find({ collection: 'sdlc-verifier-challenges', user: admin, overrideAccess: false, depth: 0, where: { task: { equals: taskId } } })
    assert.equal(challengeDocument.docs.length, 1)
    assert.equal(challengeDocument.docs[0].status, 'consumed')
    await assert.rejects(payload.update({ collection: 'sdlc-verifier-challenges', id: challengeDocument.docs[0].id, overrideAccess: true, data: { status: 'issued' } }), /internal coordinator/)
    await assert.rejects(payload.create({ collection: 'sdlc-verifier-evidence', overrideAccess: true, data: { task: taskId, challenge: challengeDocument.docs[0].id, bindingHash: newReceipt.bindingHash, resultHash: hash('forged'), record: JSON.parse(envelope), evidenceBase64: proof.toString('base64') } }), /internal coordinator/)
  } finally {
    if (taskId) {
      // Test-owned synthetic records only. Immutable API hooks intentionally forbid cleanup writes.
      await payload.db.pool.query('DELETE FROM sdlc_verifier_evidence WHERE task_id=$1', [taskId])
      await payload.db.pool.query('DELETE FROM sdlc_verifier_challenges WHERE task_id=$1', [taskId])
      await payload.db.pool.query('DELETE FROM sdlc_task_bindings WHERE task_id=$1', [taskId])
      await payload.db.pool.query('DELETE FROM sdlc_task_events WHERE task_id=$1', [taskId])
      await payload.delete({ collection: 'sdlc-tasks', id: taskId, overrideAccess: true })
    }
    for (const record of records.reverse()) await payload.delete({ ...record, overrideAccess: true })
    await payload.destroy()
  }
})
