import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { claimTriage } from '../src/sdlc/claim'

test('concurrent database claimers reserve a queued triage run exactly once', async () => {
  const payload = await getPayload({ config })
  let id: number | undefined
  try {
    const pending = await payload.find({ collection: 'sdlc-runs', overrideAccess: true, where: { status: { equals: 'queued' } }, limit: 1 })
    assert.equal(pending.totalDocs, 0, 'Run this test against an idle synthetic database.')
    const run = await payload.create({ collection: 'sdlc-runs', overrideAccess: true, data: { taskKey: `claim-test-${Date.now()}`, snapshot: [], status: 'queued' } })
    id = run.id
    const claims = await Promise.all([claimTriage(payload), claimTriage(payload)])
    assert.equal(claims.filter(Boolean).length, 1)
    assert.equal(claims.find(Boolean)!.id, id)
    assert.equal((await payload.findByID({ collection: 'sdlc-runs', id, overrideAccess: true })).status, 'running')
    assert.equal(await claimTriage(payload), null, 'A running task cannot be reclaimed automatically.')
  } finally {
    if (id) await payload.delete({ collection: 'sdlc-runs', id, overrideAccess: true })
    await payload.destroy()
  }
})
