import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { Payload } from 'payload'
import { digest } from './contracts'
import { activeProject } from './project'
import { validateTaskContract } from './delivery'
import { bindArtifacts, validateBinding, validateBoundCandidate, type BindingArtifacts, type BindingGate, type BindingReceipt, type TaskBindingRecord } from './task-binding'
import { authenticateVerifierEvidence, supervisorIdentity, validateChallenge, type ChallengeReceipt, type SupervisorPolicy, type VerifierChallenge } from './verifier-evidence'

const maxAttempts = 3
const executionAllowed = false as const // No qualified executor or verifier is attached.
type Task = { id: number; story_id: number; project_key: string; scope_hash: string; status: string; owner: string | null; fence: number; attempt_count: number; result_hash?: string | null }
export type Reservation = { taskId: number; owner: string; fence: number; attempt: number; executionAllowed: false }
async function transaction<T>(payload: Payload, work: (db: PoolClient) => Promise<T>) {
  const db = await payload.db.pool.connect()
  try {
    await db.query('BEGIN')
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='10s'")
    const result = await work(db); await db.query('COMMIT'); return result
  }
  catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
}
async function lock(db: PoolClient, project: string, key: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${project}:${key}`])
}
async function eligible(db: PoolClient, storyId: number) {
  const { rows } = await db.query('SELECT * FROM sdlc_stories WHERE id=$1', [storyId])
  const story = rows[0]
  if (!story) throw new Error('Story not found.')
  const project = await activeProject()
  if (story.project_key !== project.key || story.context_hash !== digest(project)) throw new Error('Project scope is stale.')
  validateTaskContract(story.contract)
  const scope = digest({ projectKey: story.project_key, contextHash: story.context_hash, storyKey: story.story_key, revision: Number(story.revision), title: story.title, contract: story.contract, supersedes: story.supersedes_id ?? null })
  if (scope !== story.scope_hash) throw new Error('Story integrity failed.')
  const latest = await db.query('SELECT id FROM sdlc_stories WHERE project_key=$1 AND story_key=$2 ORDER BY revision DESC LIMIT 1', [project.key, story.story_key])
  if (latest.rows[0]?.id !== storyId) throw new Error('Story is superseded.')
  const gates = await db.query(`SELECT g.id,g.kind,g.actor_id,g.decision_key FROM sdlc_gates g JOIN users u ON u.id=g.actor_id
    WHERE g.story_id=$1 AND g.scope_hash=$2 AND g.project_key=$3 AND g.decision='accept'
    AND u.role='admin' AND g.decision_key=concat(g.story_id, ':', g.scope_hash, ':', g.kind)`, [storyId, scope, project.key])
  for (const kind of ['sprint', 'design-security']) if (!gates.rows.some(g => g.kind === kind)) throw new Error(`${kind} acceptance required.`)
  const approvalGates: BindingGate[] = (['sprint', 'design-security'] as const).map(kind => {
    const gate = gates.rows.find(g => g.kind === kind)!
    return { id: Number(gate.id), kind, actorId: Number(gate.actor_id), decisionKey: gate.decision_key }
  })
  return { ...story, approvalGates }
}
async function lockedTask(db: PoolClient, id: number): Promise<Task> {
  const lookup = await db.query('SELECT s.project_key,s.story_key FROM sdlc_tasks t JOIN sdlc_stories s ON s.id=t.story_id WHERE t.id=$1', [id])
  if (!lookup.rows[0]) throw new Error('Task not found.')
  await lock(db, lookup.rows[0].project_key, lookup.rows[0].story_key)
  const result = await db.query<Task>('SELECT * FROM sdlc_tasks WHERE id=$1 FOR UPDATE', [id])
  return taskRow(result.rows[0])
}
function taskRow(value: Task): Task {
  if (!value) throw new Error('Task not found.')
  const row = { ...value, fence: Number(value.fence), attempt_count: Number(value.attempt_count) }
  if (!Number.isSafeInteger(row.fence) || row.fence < 0 || !Number.isSafeInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count > maxAttempts) throw new Error('Task counter integrity failed.')
  return row
}
async function event(db: PoolClient, task: Task, kind: string, evidenceHash?: string, actor?: number) {
  await db.query(`INSERT INTO sdlc_task_events (event_key,task_id,attempt,fence,owner,kind,evidence_hash,actor_id,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),clock_timestamp())`, [randomUUID(), task.id, task.attempt_count, task.fence, task.owner, kind, evidenceHash ?? null, actor ?? null])
}
function leaseSeconds(value: number) { if (!Number.isInteger(value) || value < 1 || value > 300) throw new Error('Lease must be 1–300 seconds.'); return value }
function evidence(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Evidence SHA-256 required.'); return value }
function validateReservation(value: Reservation) {
  if (!Number.isSafeInteger(value.taskId) || value.taskId < 1 || typeof value.owner !== 'string' || !/^[a-f0-9-]{36}$/.test(value.owner) || !Number.isSafeInteger(value.fence) || value.fence < 1 || !Number.isSafeInteger(value.attempt) || value.attempt < 1 || value.attempt > maxAttempts || value.executionAllowed !== false) throw new Error('Invalid reservation.')
}

export async function queueReservation(payload: Payload, storyId: number) {
  return transaction(payload, async db => {
    const lookup = await db.query('SELECT project_key,story_key FROM sdlc_stories WHERE id=$1', [storyId])
    if (!lookup.rows[0]) throw new Error('Story not found.')
    await lock(db, lookup.rows[0].project_key, lookup.rows[0].story_key)
    const story = await eligible(db, storyId)
    const inserted = await db.query<Task>(`INSERT INTO sdlc_tasks (task_key,story_id,project_key,scope_hash,status,fence,attempt_count,created_at,updated_at)
      VALUES ($1,$2,$3,$4,'queued',0,0,clock_timestamp(),clock_timestamp()) ON CONFLICT (task_key) DO NOTHING RETURNING *`, [story.scope_hash, storyId, story.project_key, story.scope_hash])
    if (inserted.rows[0]) { await event(db, inserted.rows[0], 'queued'); return inserted.rows[0].id }
    const existing = await db.query('SELECT id FROM sdlc_tasks WHERE task_key=$1', [story.scope_hash])
    return existing.rows[0].id as number
  })
}

export async function reserveTask(payload: Payload, id: number, seconds = 30): Promise<Reservation | null> {
  leaseSeconds(seconds)
  return transaction(payload, async db => {
    const task = await lockedTask(db, id)
    if (task.status !== 'queued' || task.attempt_count >= maxAttempts) return null
    const story = await eligible(db, task.story_id)
    if (task.scope_hash !== story.scope_hash || task.project_key !== story.project_key) throw new Error('Task scope is stale.')
    const owner = randomUUID()
    const claimed = await db.query<Task>(`UPDATE sdlc_tasks SET status='reserved',owner=$2,fence=fence+1,attempt_count=attempt_count+1,
      lease_expires_at=clock_timestamp()+$3*INTERVAL '1 second',deadline_at=clock_timestamp()+INTERVAL '300 seconds',updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [id, owner, seconds])
    const row = taskRow(claimed.rows[0])
    await event(db, row, 'claimed')
    return { taskId: id, owner, fence: row.fence, attempt: row.attempt_count, executionAllowed }
  })
}

export async function heartbeat(payload: Payload, reservation: Reservation, seconds = 30) {
  validateReservation(reservation); leaseSeconds(seconds)
  return transaction(payload, async db => {
    const task = await lockedTask(db, reservation.taskId)
    const story = await eligible(db, task.story_id)
    if (story.scope_hash !== task.scope_hash) throw new Error('Task scope is stale.')
    const renewed = await db.query<Task>(`UPDATE sdlc_tasks SET lease_expires_at=LEAST(deadline_at,clock_timestamp()+$4*INTERVAL '1 second'),updated_at=clock_timestamp()
      WHERE id=$1 AND owner=$2 AND fence=$3 AND attempt_count=$5 AND status='reserved' AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() RETURNING *`, [task.id, reservation.owner, reservation.fence, seconds, reservation.attempt])
    if (!renewed.rows[0]) throw new Error('Reservation is stale or expired.')
    await event(db, renewed.rows[0], 'heartbeat')
  })
}

export async function finishReservation(payload: Payload, reservation: Reservation, outcome: 'candidate' | 'failed', evidenceHash: string) {
  return completeReservation(payload, reservation, outcome, evidenceHash)
}

/** Trusted internal caller supplies retained binding digest and independently expected material.
 * This records candidate integrity only, never a verifier verdict or execution authority.
 */
export async function submitBoundCandidate(payload: Payload, reservation: Reservation, bindingHash: string, candidate: unknown, expected: BindingArtifacts & { recoveryKey: string }) {
  evidence(bindingHash)
  return completeReservation(payload, reservation, 'candidate', bindingHash, { candidate, expected })
}

async function completeReservation(payload: Payload, reservation: Reservation, outcome: 'candidate' | 'failed', evidenceHash: string, bound?: { candidate: unknown; expected: BindingArtifacts & { recoveryKey: string } }) {
  validateReservation(reservation); evidence(evidenceHash)
  if (!['candidate', 'failed'].includes(outcome)) throw new Error('Invalid reservation outcome.')
  return transaction(payload, async db => {
    const task = await lockedTask(db, reservation.taskId)
    const story = await eligible(db, task.story_id)
    if (story.scope_hash !== task.scope_hash) throw new Error('Task scope is stale.')
    await bindingStillCurrent(db, reservation)
    if (outcome === 'candidate') {
      if (!bound) throw new Error('Candidate completion requires a bound candidate handoff.')
      const receipt = await inspectBinding(db, reservation, evidenceHash)
      validateBoundCandidate(receipt, bound.candidate, bound.expected)
    }
    const result = await db.query<Task>(`UPDATE sdlc_tasks SET status=$4,owner=NULL,fence=fence+1,lease_expires_at=NULL,updated_at=clock_timestamp(),result_hash=$5
      WHERE id=$1 AND owner=$2 AND fence=$3 AND attempt_count=$6 AND status='reserved' AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() RETURNING *`, [task.id, reservation.owner, reservation.fence, outcome === 'candidate' ? 'awaiting-verification' : 'uncertain', evidenceHash, reservation.attempt])
    if (!result.rows[0]) throw new Error('Reservation is stale or expired.')
    await event(db, { ...result.rows[0], owner: reservation.owner }, outcome === 'candidate' ? 'candidate' : 'uncertain', evidenceHash)
  })
}

export async function expireReservation(payload: Payload, id: number) {
  return transaction(payload, async db => {
    const task = await lockedTask(db, id)
    const expired = await db.query<Task>(`UPDATE sdlc_tasks SET status='uncertain',owner=NULL,fence=fence+1,lease_expires_at=NULL,updated_at=clock_timestamp()
      WHERE id=$1 AND status='reserved' AND (lease_expires_at<=clock_timestamp() OR deadline_at<=clock_timestamp()) RETURNING *`, [id])
    if (!expired.rows[0]) return false
    await event(db, { ...expired.rows[0], owner: task.owner }, 'uncertain')
    return true
  })
}

/** Recovery for reservations only: no executor is attached and no child was launched.
 * This must be replaced with verified backend termination before enabling real coding.
 * Trusted control-plane callers must supply the authenticated human's ID, not intake data.
 */
export async function recoverReservation(payload: Payload, id: number, humanId: number, evidenceHash: string) {
  evidence(evidenceHash)
  return transaction(payload, async db => {
    const task = await lockedTask(db, id)
    const human = await db.query('SELECT id FROM users WHERE id=$1 AND role=\'admin\'', [humanId])
    if (!human.rows[0]) throw new Error('Human administrator recovery required.')
    if (task.status !== 'uncertain') throw new Error('Only uncertain reservations can be recovered.')
    const status = task.attempt_count >= maxAttempts ? 'exhausted' : 'queued'
    const result = await db.query<Task>('UPDATE sdlc_tasks SET status=$2,fence=fence+1,result_hash=NULL,deadline_at=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *', [id, status])
    await event(db, result.rows[0], 'recovered', evidenceHash, humanId)
    return status
  })
}

async function bindingContext(db: PoolClient, reservation: Reservation) {
  const task = await lockedTask(db, reservation.taskId)
  const story = await eligible(db, task.story_id)
  if (task.scope_hash !== story.scope_hash || task.project_key !== story.project_key) throw new Error('Task scope is stale.')
  // Wall clock is read after every story/gate/row lock wait.
  await bindingStillCurrent(db, reservation)
  return { task, story, bindingKey: digest({ taskId: task.id, fence: reservation.fence, attempt: reservation.attempt }) }
}
async function bindingStillCurrent(db: PoolClient, reservation: Reservation) {
  const current = await db.query(`SELECT id FROM sdlc_tasks WHERE id=$1 AND owner=$2 AND fence=$3 AND attempt_count=$4
    AND status='reserved' AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp()`, [reservation.taskId, reservation.owner, reservation.fence, reservation.attempt])
  if (!current.rows[0]) throw new Error('Reservation is stale or expired.')
}

/** Internal integrity handoff only. No child process, provider call or execution transition. */
export async function bindReservationArtifacts(payload: Payload, reservation: Reservation, input: unknown): Promise<BindingReceipt> {
  validateReservation(reservation)
  return transaction(payload, async db => {
    const { task, story, bindingKey } = await bindingContext(db, reservation)
    const artifacts = bindArtifacts(story.contract, input)
    const existing = await db.query('SELECT binding_hash,record,recovery_key FROM sdlc_task_bindings WHERE binding_key=$1', [bindingKey])
    const recoveryKey = existing.rows[0]?.recovery_key ?? randomUUID()
    const record: TaskBindingRecord = { version: 1, executionAllowed: false, syntheticOnly: true, taskId: task.id, storyId: story.id, storyRevision: Number(story.revision), projectKey: task.project_key, scopeHash: task.scope_hash, owner: reservation.owner, fence: reservation.fence, attempt: reservation.attempt, recoveryKey, approvalGates: story.approvalGates, ...artifacts }
    const receipt = validateBinding(record, digest(record))
    if (existing.rows[0]) {
      validateBinding(existing.rows[0].record, existing.rows[0].binding_hash)
      if (existing.rows[0].binding_hash !== receipt.bindingHash) throw new Error('Reservation already binds different artifacts.')
      await bindingStillCurrent(db, reservation)
      return receipt
    }
    const inserted = await db.query(`INSERT INTO sdlc_task_bindings (task_id,binding_key,binding_hash,recovery_key,record,created_at,updated_at)
      SELECT $1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp() FROM sdlc_tasks WHERE id=$1 AND owner=$6 AND fence=$7 AND attempt_count=$8
      AND status='reserved' AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() RETURNING id`, [task.id, bindingKey, receipt.bindingHash, recoveryKey, JSON.stringify(record), reservation.owner, reservation.fence, reservation.attempt])
    if (!inserted.rows[0]) throw new Error('Reservation is stale or expired.')
    await event(db, task, 'artifacts-bound', receipt.bindingHash)
    return receipt
  })
}

/** Expected hash must come from a trusted retained receipt, not the row or candidate sender. */
export async function inspectReservationBinding(payload: Payload, reservation: Reservation, expectedHash: string): Promise<BindingReceipt> {
  validateReservation(reservation); evidence(expectedHash)
  return transaction(payload, db => inspectBinding(db, reservation, expectedHash))
}

async function inspectBinding(db: PoolClient, reservation: Reservation, expectedHash: string): Promise<BindingReceipt> {
    const { task, story, bindingKey } = await bindingContext(db, reservation)
    const result = await db.query('SELECT binding_hash,recovery_key,record FROM sdlc_task_bindings WHERE binding_key=$1 AND task_id=$2', [bindingKey, task.id])
    const row = result.rows[0]
    if (!row || row.binding_hash !== expectedHash || row.recovery_key !== row.record?.recoveryKey) throw new Error('Task binding receipt mismatch.')
    const receipt = validateBinding(row.record, expectedHash)
    const r = receipt.record
    if (r.taskId !== task.id || r.owner !== reservation.owner || r.fence !== reservation.fence || r.attempt !== reservation.attempt || r.storyId !== story.id || r.storyRevision !== Number(story.revision) || r.projectKey !== task.project_key || r.scopeHash !== task.scope_hash || digest(r.approvalGates) !== digest(story.approvalGates) || r.sourceHash !== story.contract.sourceHash || r.checkPolicyHash !== story.contract.checkPolicyHash) throw new Error('Task binding context mismatch.')
    await bindingStillCurrent(db, reservation)
    return receipt
}

async function awaitingBinding(db: PoolClient, taskId: number, expectedHash: string, policy: SupervisorPolicy) {
  const task = await lockedTask(db, taskId)
  const story = await eligible(db, task.story_id)
  if (task.status !== 'awaiting-verification' || task.owner !== null || task.result_hash !== expectedHash || task.scope_hash !== story.scope_hash || task.project_key !== story.project_key) throw new Error('Candidate binding is stale.')
  const result = await db.query('SELECT record,recovery_key FROM sdlc_task_bindings WHERE task_id=$1 AND binding_hash=$2', [taskId, expectedHash])
  const row = result.rows[0]
  if (!row || row.recovery_key !== row.record?.recoveryKey) throw new Error('Candidate binding receipt mismatch.')
  const receipt = validateBinding(row.record, expectedHash), r = receipt.record
  if (r.taskId !== task.id || r.storyId !== story.id || r.storyRevision !== Number(story.revision) || r.projectKey !== task.project_key || r.scopeHash !== task.scope_hash || r.fence + 1 !== task.fence || r.attempt !== task.attempt_count || digest(r.approvalGates) !== digest(story.approvalGates) || r.sourceHash !== story.contract.sourceHash || r.checkPolicyHash !== story.contract.checkPolicyHash) throw new Error('Candidate binding context mismatch.')
  const identity = supervisorIdentity(policy)
  for (const key of ['supervisorKey', 'verifierHash', 'qualificationHash', 'image'] as const) if (identity[key] !== r[key]) throw new Error('Supervisor policy does not match candidate binding.')
  return { task, receipt, identity }
}
async function databaseSeconds(db: PoolClient) {
  const result = await db.query('SELECT floor(extract(epoch FROM clock_timestamp()))::bigint AS now')
  return Number(result.rows[0].now)
}

/** One bounded, synthetic-only challenge per candidate. No launch permission or automatic renewal. */
export async function issueVerifierChallenge(payload: Payload, taskId: number, bindingHash: string, policy: SupervisorPolicy): Promise<ChallengeReceipt> {
  if (!Number.isSafeInteger(taskId) || taskId < 1) throw new Error('Invalid task.')
  evidence(bindingHash)
  return transaction(payload, async db => {
    const { task, identity } = await awaitingBinding(db, taskId, bindingHash, policy)
    const exists = await db.query('SELECT id FROM sdlc_verifier_challenges WHERE binding_hash=$1', [bindingHash])
    if (exists.rows[0]) throw new Error('Candidate already has a verifier challenge.')
    const issuedAt = await databaseSeconds(db)
    const record: VerifierChallenge = { version: 1, nonce: randomUUID(), bindingHash, ...identity, issuedAt, expiresAt: issuedAt + 300, syntheticOnly: true, executionAllowed: false }
    const receipt = validateChallenge(record, digest(record))
    await db.query(`INSERT INTO sdlc_verifier_challenges (task_id,binding_hash,challenge_hash,nonce,expires_at,status,record,created_at,updated_at)
      VALUES ($1,$2,$3,$4,to_timestamp($5),'issued',$6,clock_timestamp(),clock_timestamp())`, [taskId, bindingHash, receipt.challengeHash, record.nonce, record.expiresAt, JSON.stringify(record)])
    await event(db, task, 'verifier-challenge', receipt.challengeHash)
    return receipt
  })
}

/** Trusted policy and retained hashes are not sender input. Authenticates provenance, not correctness. */
export async function recordVerifierEvidence(payload: Payload, taskId: number, bindingHash: string, challengeHash: string, policy: SupervisorPolicy, envelope: string, evidenceBytes: Uint8Array) {
  if (!Number.isSafeInteger(taskId) || taskId < 1) throw new Error('Invalid task.')
  evidence(bindingHash); evidence(challengeHash)
  // Bound and snapshot before any lock wait; external transports must bound before allocating too.
  if (typeof envelope !== 'string' || Buffer.byteLength(envelope) > 4096 || !(evidenceBytes instanceof Uint8Array) || evidenceBytes.byteLength < 1 || evidenceBytes.byteLength > 65536) throw new Error('Verifier evidence rejected.')
  const bytes = Buffer.from(evidenceBytes)
  return transaction(payload, async db => {
    const { task } = await awaitingBinding(db, taskId, bindingHash, policy)
    const result = await db.query(`SELECT id,record,nonce,status,extract(epoch FROM expires_at)::bigint AS expiry
      FROM sdlc_verifier_challenges WHERE task_id=$1 AND binding_hash=$2 AND challenge_hash=$3 FOR UPDATE`, [taskId, bindingHash, challengeHash])
    const row = result.rows[0]
    if (!row || row.status !== 'issued') throw new Error('Verifier challenge is absent or consumed.')
    const receipt = validateChallenge(row.record, challengeHash)
    if (receipt.record.bindingHash !== bindingHash || receipt.record.nonce !== row.nonce || receipt.record.expiresAt !== Number(row.expiry)) throw new Error('Verifier challenge context mismatch.')
    const authenticated = authenticateVerifierEvidence(receipt, policy, envelope, bytes, await databaseSeconds(db))
    const consumed = await db.query(`UPDATE sdlc_verifier_challenges SET status='consumed',updated_at=clock_timestamp()
      WHERE id=$1 AND status='issued' AND expires_at>clock_timestamp() RETURNING id`, [row.id])
    if (!consumed.rows[0]) throw new Error('Verifier challenge expired.')
    await db.query(`INSERT INTO sdlc_verifier_evidence (task_id,challenge_id,binding_hash,result_hash,record,evidence_base64,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp())`, [taskId, row.id, bindingHash, authenticated.resultHash, JSON.stringify(authenticated.envelope), authenticated.evidenceBase64])
    await event(db, task, 'verifier-evidence', authenticated.resultHash)
    return { resultHash: authenticated.resultHash, authenticated: true as const, reviewRequired: true as const, executionAllowed: false as const, retryAuthorized: false as const }
  })
}
