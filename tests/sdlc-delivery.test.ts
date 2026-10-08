import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { activeProject } from '../src/sdlc/project'
import { digest } from '../src/sdlc/contracts'
import { validateTaskContract } from '../src/sdlc/delivery'
import { storyReadiness } from '../src/sdlc/eligibility'

test('versioned delivery rejects forged authority and invalidates earlier approvals', async () => {
  const payload = await getPayload({ config })
  const created: { collection: 'sdlc-stories' | 'sdlc-gates'; id: number }[] = []
  try {
    const project = await activeProject()
    const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 20 })
    const admin = users.docs.find(user => user.role === 'admin')!
    const editor = users.docs.find(user => user.role === 'editor')!
    const contract = { sourceHash: digest('source'), checkPolicyHash: digest('checks'), designHash: digest('design'), sprintHash: digest('sprint'), allowedPaths: ['src/filter.ts'], acceptanceCriteria: ['Preserve input order.'] }
    assert.throws(() => validateTaskContract({ ...contract, allowedPaths: ['../secret'] }))
    assert.throws(() => validateTaskContract({ ...contract, approve: true }))
    const data = { projectKey: project.key, contextHash: digest(project), storyKey: `test-${Date.now()}`, title: 'Filter tasks', contract, revision: 99, versionKey: 'forged', scopeHash: 'forged', actor: editor.id }
    await assert.rejects(payload.create({ collection: 'sdlc-stories', data, user: editor, overrideAccess: false }))
    await assert.rejects(payload.create({ collection: 'sdlc-stories', data, overrideAccess: true }))
    await assert.rejects(payload.create({ collection: 'sdlc-stories', data: { ...data, projectKey: 'wrong-project' }, user: admin, overrideAccess: false }), /stale/)
    const story = await payload.create({ collection: 'sdlc-stories', data, user: admin, overrideAccess: false, depth: 0 })
    created.push({ collection: 'sdlc-stories', id: story.id })
    assert.equal(story.revision, 1); assert.equal(story.actor, admin.id)
    assert.equal((await storyReadiness(payload, story.id)).planningReady, false)
    for (const kind of ['sprint', 'design-security'] as const) {
      const gateData = { story: story.id, projectKey: 'forged', scopeHash: story.scopeHash, kind, decision: 'accept' as const, notes: 'Synthetic test decision, not real approval.', actor: editor.id, decisionKey: 'forged' }
      await assert.rejects(payload.create({ collection: 'sdlc-gates', data: gateData, overrideAccess: true }))
      await assert.rejects(payload.create({ collection: 'sdlc-gates', data: { ...gateData, scopeHash: 'stale' }, user: admin, overrideAccess: false }))
      const gate = await payload.create({ collection: 'sdlc-gates', data: gateData, user: admin, overrideAccess: false, depth: 0 })
      created.push({ collection: 'sdlc-gates', id: gate.id })
      assert.equal(gate.actor, admin.id)
      await assert.rejects(payload.create({ collection: 'sdlc-gates', data: gateData, user: admin, overrideAccess: false }))
    }
    const ready = await storyReadiness(payload, story.id)
    assert.equal(ready.planningReady, true); assert.equal(ready.executionReady, false)
    await assert.rejects(payload.update({ collection: 'sdlc-stories', id: story.id, data: { title: 'Overwrite' }, user: admin, overrideAccess: false }))
    const next = await payload.create({ collection: 'sdlc-stories', data: { ...data, supersedes: story.id, contract: { ...contract, acceptanceCriteria: ['Changed scope.'] } }, user: admin, overrideAccess: false, depth: 0 })
    created.push({ collection: 'sdlc-stories', id: next.id })
    assert.equal(next.revision, 2); assert.notEqual(next.scopeHash, story.scopeHash)
    assert.equal((await storyReadiness(payload, next.id)).planningReady, false)
    const returned = await payload.create({ collection: 'sdlc-gates', data: { story: next.id, scopeHash: next.scopeHash, kind: 'design-security', decision: 'reject', notes: 'Synthetic denial test.', actor: editor.id, projectKey: 'forged', decisionKey: 'forged' }, user: admin, overrideAccess: false, depth: 0 })
    created.push({ collection: 'sdlc-gates', id: returned.id })
    assert.equal((await storyReadiness(payload, next.id)).planningReady, false)
    await assert.rejects(payload.create({ collection: 'sdlc-gates', data: { story: next.id, scopeHash: next.scopeHash, kind: 'code-security', decision: 'accept', notes: 'No verified artifact.', actor: admin.id, projectKey: project.key, decisionKey: 'artifact' }, user: admin, overrideAccess: false }), /Artifact review/)
    assert.ok((await storyReadiness(payload, story.id)).blockers.includes('Story is superseded.'))
    await assert.rejects(payload.create({ collection: 'sdlc-gates', data: { story: story.id, scopeHash: story.scopeHash, kind: 'sprint', decision: 'reject', notes: 'Stale', actor: admin.id, projectKey: project.key, decisionKey: 'stale' }, user: admin, overrideAccess: false }), /Superseded/)
  } finally {
    for (const record of created.reverse()) await payload.delete({ ...record, overrideAccess: true })
    await payload.destroy()
  }
})
