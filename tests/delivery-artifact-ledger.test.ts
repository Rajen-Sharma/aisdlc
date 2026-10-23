import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { activeProject } from '../src/sdlc/project'
import { digest } from '../src/sdlc/contracts'
import { inspectExecutionEligibility, retainDeliveryArtifact } from '../src/sdlc/task-coordinator'
import { storyReadiness } from '../src/sdlc/eligibility'
import { deliveryFixture } from './helpers/delivery-evidence'

test('exact artifact reviews stay separate; stale proof, failed checks and feedback revisions cannot inherit acceptance', async () => {
  const payload = await getPayload({ config })
  const directory = await mkdtemp(path.join(tmpdir(), 'aisdlc-delivery-review-'))
  const priorDirectory = process.env.AISDLC_DELIVERY_STATE_DIRECTORY
  process.env.AISDLC_DELIVERY_STATE_DIRECTORY = directory
  const f = deliveryFixture(), files = new Set<string>(), storyIds: number[] = [], feedbackIds: number[] = []
  const write = async (name: string, value: unknown) => {
    const file = path.join(directory, name); files.add(file)
    await writeFile(file, JSON.stringify(value), { mode: 0o600 })
  }
  try {
    const project = await activeProject()
    const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 20 })
    const human = users.docs.find(user => user.role === 'admin')!, editor = users.docs.find(user => user.role === 'editor')!
    const contract = { sourceHash: f.claim.sourceHash, checkPolicyHash: f.claim.checkPolicyHash, designHash: digest('design'), sprintHash: digest('sprint'),
      allowedPaths: ['src/synthetic.mjs'], acceptanceCriteria: ['Synthetic protocol control; never a real model delivery.'] }
    const story = await payload.create({ collection: 'sdlc-stories', user: human, overrideAccess: false, depth: 0, data: {
      projectKey: project.key, contextHash: digest(project), storyKey: `test-artifact-${Date.now()}`, title: 'Synthetic artifact review vector', contract,
      revision: 0, scopeHash: '', versionKey: '', actor: human.id,
    } })
    storyIds.push(story.id)
    const gate = (kind: 'sprint' | 'design-security' | 'code-security' | 'outcome' | 'mvp', artifactHash?: string, decision: 'accept' | 'reject' = 'accept') =>
      ({ story: story.id, scopeHash: story.scopeHash, kind, artifactHash, decision, notes: 'Synthetic test assertion, not a real human decision.', actor: editor.id, projectKey: '', decisionKey: '' })
    for (const kind of ['sprint', 'design-security'] as const) await payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate(kind) })
    const eligible = await inspectExecutionEligibility(payload, story.id)
    Object.assign(f.claim, { storyId: story.id, scopeHash: story.scopeHash, taskKey: eligible.record.taskKey, approvalHash: eligible.record.approvalHash })
    const artifact = f.artifact(), artifactHash = digest(artifact)
    await write('delivery-trust.json', f.publicConfig())
    const refresh = (changes = {}) => write(`delivery-current-${f.claim.taskKey}.json`, f.current(changes))
    await refresh()
    await assert.rejects(payload.create({ collection: 'sdlc-delivery-artifacts', user: human, overrideAccess: false, data: {
      story: story.id, projectKey: project.key, scopeHash: story.scopeHash, artifactHash, candidateHash: f.claim.candidateHash, attemptId: f.claim.attemptId, record: artifact,
    } }))
    await assert.rejects(payload.create({ collection: 'sdlc-delivery-artifacts', overrideAccess: true, data: {
      story: story.id, projectKey: project.key, scopeHash: story.scopeHash, artifactHash, candidateHash: f.claim.candidateHash, attemptId: f.claim.attemptId, record: artifact,
    } }), /trusted evidence importer/)
    const retained = await retainDeliveryArtifact(payload, story.id, artifact)
    assert.deepEqual(await retainDeliveryArtifact(payload, story.id, artifact), retained)
    await assert.rejects(payload.create({ collection: 'sdlc-gates', user: editor, overrideAccess: false, data: gate('code-security', artifactHash) }))
    await assert.rejects(payload.create({ collection: 'sdlc-gates', overrideAccess: true, data: gate('code-security', artifactHash) }))
    await assert.rejects(payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate('outcome', artifactHash) }), /code-security acceptance/)
    await assert.rejects(payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate('code-security', 'a'.repeat(64)) }), /stale/)
    const now = Math.floor(Date.now() / 1000)
    await refresh({ issuedAt: now - 16, expiresAt: now - 1 })
    await assert.rejects(payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate('code-security', artifactHash) }), /authority is unavailable/)
    await refresh()
    for (const kind of ['code-security', 'outcome', 'mvp'] as const) {
      const reviewed = await payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, depth: 0, data: gate(kind, artifactHash) })
      assert.equal(reviewed.actor, human.id)
      assert.equal(reviewed.decisionKey, `${story.id}:${story.scopeHash}:${kind}:${artifactHash}`)
      await assert.rejects(payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate(kind, artifactHash) }))
    }
    const feedback = await payload.create({ collection: 'sdlc-delivery-feedback', user: human, overrideAccess: false, depth: 0,
      data: { story: story.id, artifactHash, content: 'Synthetic feedback: add another acceptance criterion.', actor: editor.id, projectKey: '', scopeHash: '', feedbackHash: '' } })
    feedbackIds.push(feedback.id)
    assert.equal(feedback.actor, human.id)
    const revision = await payload.create({ collection: 'sdlc-stories', user: human, overrideAccess: false, depth: 0, data: {
      projectKey: project.key, contextHash: digest(project), storyKey: story.storyKey, title: story.title,
      contract: { ...contract, acceptanceCriteria: [...contract.acceptanceCriteria, 'Changed synthetic requirement.'] },
      supersedes: story.id, feedback: feedback.id, revision: 0, scopeHash: '', versionKey: '', actor: human.id,
    } })
    storyIds.push(revision.id)
    assert.equal(revision.revision, 2); assert.notEqual(revision.scopeHash, story.scopeHash)
    const readiness = await storyReadiness(payload, revision.id)
    assert.equal(readiness.planningReady, false)
    assert.equal(readiness.blockers.includes('Story integrity failed.'), false)
    for (const kind of ['sprint', 'design-security'] as const) await payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false,
      data: { ...gate(kind), story: revision.id, scopeHash: revision.scopeHash } })
    const reapproved = await inspectExecutionEligibility(payload, revision.id)
    assert.equal(reapproved.record.taskKey, eligible.record.taskKey)
    assert.equal(reapproved.record.feedbackHash, feedback.feedbackHash)
    assert.equal(reapproved.record.supersedes, story.id)
    assert.notEqual(reapproved.record.approvalHash, eligible.record.approvalHash)
    await assert.rejects(payload.create({ collection: 'sdlc-gates', user: human, overrideAccess: false, data: gate('mvp', artifactHash) }), /Superseded/)
    await assert.rejects(inspectExecutionEligibility(payload, story.id), /superseded/)
  } finally {
    // Delete only this test's records and fixed public-policy fixture files.
    for (const id of [...storyIds].reverse()) {
      await payload.db.pool.query('DELETE FROM sdlc_gates WHERE story_id=$1', [id])
      await payload.db.pool.query('DELETE FROM sdlc_delivery_artifacts WHERE story_id=$1', [id])
      if (id === storyIds[0]) for (const feedbackId of feedbackIds) await payload.delete({ collection: 'sdlc-delivery-feedback', id: feedbackId, overrideAccess: true })
      await payload.delete({ collection: 'sdlc-stories', id, overrideAccess: true })
    }
    for (const file of files) await unlink(file)
    await rmdir(directory)
    if (priorDirectory === undefined) delete process.env.AISDLC_DELIVERY_STATE_DIRECTORY
    else process.env.AISDLC_DELIVERY_STATE_DIRECTORY = priorDirectory
    await payload.destroy()
  }
})
