import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

export async function lockStory(req: PayloadRequest, projectKey: string, storyKey: string) {
  if (typeof storyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(storyKey)) throw new Error('Invalid story key.')
  const id = await req.transactionID
  // Payload's generic adapter type omits the PostgreSQL transaction methods.
  const transaction = id == null ? undefined : (req.payload.db as unknown as Pick<PostgresAdapter, 'sessions'>).sessions[String(id)]?.db
  if (!transaction || !('execute' in transaction)) throw new Error('Story mutation requires a PostgreSQL transaction.')
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectKey}:${storyKey}`}, 0))`)
}
