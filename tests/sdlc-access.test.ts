import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { digest } from '../src/sdlc/contracts'
test('delivery records enforce human authority, immutable provenance and exact review scope', async () => {
  const payload = await getPayload({ config })
  const key = `access-${Date.now()}`
  const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 10 })
  const admin = users.docs.find(x => x.role === 'admin')!, editor = users.docs.find(x => x.role === 'editor')!
  assert.ok(admin && editor, 'Synthetic accounts must be seeded.')
  const data = { title: 'Security test input', content: 'Resume without duplicates', kind: 'requirement' as const, target: 'ENG-002', origin: 'security-test', submissionKey: key, actor: editor.id, sourceHash: 'forged' }
  const created: { collection: 'sdlc-intake' | 'sdlc-runs' | 'sdlc-decisions'; id: number }[] = []
  try {
    await assert.rejects(payload.create({ collection: 'sdlc-intake', data, user: editor, overrideAccess: false }))
    const item = await payload.create({ collection: 'sdlc-intake', data, user: admin, overrideAccess: false, depth: 0 })
    created.push({ collection: 'sdlc-intake', id: item.id })
    assert.equal(item.actor, admin.id); assert.notEqual(item.sourceHash, 'forged')
    await assert.rejects(payload.findByID({ collection: 'sdlc-intake', id: item.id, overrideAccess: false, user: null }))
    await assert.rejects(payload.update({ collection: 'sdlc-intake', id: item.id, user: admin, overrideAccess: false, data: { content: 'Silent overwrite' } }))
    await assert.rejects(payload.delete({ collection: 'sdlc-intake', id: item.id, user: admin, overrideAccess: false }))
    const result = { proposals: [{ sourceIds: [String(item.id)], title: 'Resume', disposition: 'propose', rationale: 'Human review required.' }], approvalState: 'pending-human-review', conflicts: [] }
    const run = await payload.create({ collection: 'sdlc-runs', overrideAccess: true, data: { taskKey: key, status: 'awaiting-review', snapshot: [item], result, resultHash: digest(result) } })
    created.push({ collection: 'sdlc-runs', id: run.id })
    const decision = { run: run.id, decision: 'accept-triage' as const, scopeHash: 'stale', notes: 'Security test', actor: editor.id, decisionKey: 'forged' }
    await assert.rejects(payload.create({ collection: 'sdlc-decisions', user: admin, overrideAccess: false, data: decision }), /stale/)
    await assert.rejects(payload.create({ collection: 'sdlc-decisions', user: editor, overrideAccess: false, data: { ...decision, scopeHash: run.resultHash! } }))
    await assert.rejects(payload.update({ collection: 'sdlc-runs', id: run.id, user: admin, overrideAccess: false, data: { status: 'failed' } }))
    const accepted = await payload.create({ collection: 'sdlc-decisions', user: admin, overrideAccess: false, depth: 0, data: { ...decision, scopeHash: run.resultHash! } })
    created.push({ collection: 'sdlc-decisions', id: accepted.id }); assert.equal(accepted.actor, admin.id)
    await assert.rejects(payload.create({ collection: 'sdlc-decisions', user: admin, overrideAccess: false, data: { ...decision, scopeHash: run.resultHash! } }))
    await assert.rejects(payload.update({ collection: 'sdlc-decisions', id: accepted.id, user: admin, overrideAccess: false, data: { decision: 'return-findings' } }))
  } finally {
    for (const item of created.reverse()) await payload.delete({ ...item, overrideAccess: true })
    await payload.destroy()
  }
})
