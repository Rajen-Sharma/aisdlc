import type { Payload } from 'payload'

/** Atomic triage reservation across processes and machines sharing this database.
 * No automatic recovery: a crashed reservation stays running for human investigation.
 * This is not the coding-task lease/fencing protocol required by NB-002.
 */
export async function claimTriage(payload: Payload) {
  const result = await payload.db.pool.query<{ id: number }>(`
    UPDATE sdlc_runs SET status = 'running', updated_at = NOW()
    WHERE id = (
      SELECT id FROM sdlc_runs WHERE status = 'queued'
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) AND status = 'queued' RETURNING id
  `)
  return result.rows.length ? payload.findByID({ collection: 'sdlc-runs', id: result.rows[0].id, overrideAccess: true, depth: 0 }) : null
}
