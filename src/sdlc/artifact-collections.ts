import { APIError, type CollectionConfig, type PayloadRequest } from 'payload'
import { admin, role } from '../security'
import { digest } from './contracts'
import { authenticateDeliveryArtifact } from './delivery-artifact'
import { currentDelivery } from './delivery-current'
import { lockStory } from './story-lock'
import { activeProject } from './project'
import type { SdlcStory } from '../payload-types'

const immutable = { read: admin, create: () => false, update: () => false, delete: () => false }
export const DeliveryArtifacts: CollectionConfig = {
  slug: 'sdlc-delivery-artifacts', admin: { group: 'AI delivery', useAsTitle: 'artifactHash' }, access: immutable,
  hooks: { beforeChange: [() => { throw new APIError('Delivery artifacts require the trusted evidence importer.', 403) }],
    beforeDelete: [() => { throw new APIError('Delivery artifacts are immutable.', 403) }] },
  fields: [
    { name: 'story', type: 'relationship', relationTo: 'sdlc-stories', required: true },
    { name: 'projectKey', type: 'text', required: true }, { name: 'scopeHash', type: 'text', required: true },
    { name: 'artifactHash', type: 'text', required: true, unique: true }, { name: 'candidateHash', type: 'text', required: true },
    { name: 'attemptId', type: 'text', required: true, unique: true }, { name: 'record', type: 'json', required: true },
  ],
}

export async function reviewArtifact(req: PayloadRequest, story: SdlcStory, artifactHash: unknown) {
  if (typeof artifactHash !== 'string' || !/^[a-f0-9]{64}$/.test(artifactHash)) throw new APIError('Artifact review requires an exact verified artifact.', 409)
  const project = await activeProject()
  if (story.projectKey !== project.key || story.contextHash !== digest(project)) throw new APIError('Artifact project scope is stale.', 409)
  const scope = digest({ projectKey: story.projectKey, contextHash: story.contextHash, storyKey: story.storyKey, revision: story.revision,
    title: story.title, contract: story.contract, supersedes: story.supersedes ?? null, ...(story.feedback ? { feedback: story.feedback } : {}) })
  if (scope !== story.scopeHash) throw new APIError('Artifact story integrity failed.', 409)
  const latest = await req.payload.find({ collection: 'sdlc-stories', user: req.user, overrideAccess: false, req, depth: 0,
    where: { and: [{ projectKey: { equals: story.projectKey } }, { storyKey: { equals: story.storyKey } }] }, sort: '-revision', limit: 1 })
  if (latest.docs[0]?.id !== story.id) throw new APIError('Artifact story is superseded.', 409)
  const taskKey = digest({ projectKey: story.projectKey, storyKey: story.storyKey })
  const { state, trust } = await currentDelivery(taskKey)
  if (state.artifactHash !== artifactHash || state.scopeHash !== story.scopeHash) throw new APIError('Artifact review scope is stale.', 409)
  const gates = await req.payload.find({ collection: 'sdlc-gates', user: req.user, overrideAccess: false, req, depth: 0,
    where: { and: [{ story: { equals: story.id } }, { scopeHash: { equals: story.scopeHash } }] }, limit: 100 })
  const planning = await Promise.all((['sprint', 'design-security'] as const).map(async kind => {
    const gate = gates.docs.find(g => g.kind === kind && g.decision === 'accept' && g.decisionKey === `${story.id}:${story.scopeHash}:${kind}`)
    if (!gate) throw new APIError('Artifact review requires accepted sprint and design scope.', 409)
    const actorId = typeof gate.actor === 'number' ? gate.actor : gate.actor.id
    const actor = await req.payload.findByID({ collection: 'users', id: actorId, user: req.user, overrideAccess: false, req, depth: 0 })
    if (actor.role !== 'admin') throw new APIError('Planning reviewer is no longer authorized.', 409)
    return { id: gate.id, kind, actorId, decisionKey: gate.decisionKey }
  }))
  const contract = story.contract as { sourceHash: string; checkPolicyHash: string; allowedPaths: string[]; acceptanceCriteria: string[] }
  const artifacts = await req.payload.find({ collection: 'sdlc-delivery-artifacts', user: req.user, overrideAccess: false, req, depth: 0,
    where: { and: [{ story: { equals: story.id } }, { artifactHash: { equals: artifactHash } }] }, limit: 1 })
  const row = artifacts.docs[0]
  if (!row || row.scopeHash !== story.scopeHash || row.projectKey !== story.projectKey) throw new APIError('Artifact review requires retained verified evidence.', 409)
  const result = authenticateDeliveryArtifact(row.record, trust, Math.floor(Date.now() / 1000), { storyId: story.id, taskKey,
    scopeHash: story.scopeHash, approvalHash: digest(planning), sourceHash: contract.sourceHash, checkPolicyHash: contract.checkPolicyHash,
    allowedPaths: contract.allowedPaths, criteriaTotal: contract.acceptanceCriteria.length })
  const c = result.artifact.envelope.claim
  if (result.artifactHash !== artifactHash || c.approvalHash !== state.approvalHash || c.attemptId !== state.attemptId
    || c.terminationHash !== state.terminationHash || c.verificationHash !== state.verificationHash) throw new APIError('Artifact review evidence has changed.', 409)
  return { ...result, gates: gates.docs, state }
}

export const DeliveryFeedback: CollectionConfig = {
  slug: 'sdlc-delivery-feedback', admin: { group: 'AI delivery', useAsTitle: 'feedbackHash' },
  access: { read: admin, create: admin, update: () => false, delete: () => false },
  hooks: { beforeValidate: [async ({ data, req, operation }) => {
    if (operation !== 'create') return data
    if (!data || role(req.user) !== 'admin') throw new APIError('Authenticated human feedback required.', 403)
    const story = await req.payload.findByID({ collection: 'sdlc-stories', id: data.story, user: req.user, overrideAccess: false, depth: 0, req })
    await lockStory(req, story.projectKey, story.storyKey)
    const latest = await req.payload.find({ collection: 'sdlc-stories', user: req.user, overrideAccess: false, req, depth: 0,
      where: { and: [{ projectKey: { equals: story.projectKey } }, { storyKey: { equals: story.storyKey } }] }, sort: '-revision', limit: 1 })
    if (latest.docs[0]?.id !== story.id) throw new APIError('Feedback must target the current story version.', 409)
    await reviewArtifact(req, story, data.artifactHash)
    data.actor = req.user!.id; data.projectKey = story.projectKey; data.scopeHash = story.scopeHash
    data.feedbackHash = digest({ storyId: story.id, scopeHash: story.scopeHash, artifactHash: data.artifactHash, content: data.content, actor: data.actor })
    return data
  }] },
  fields: [
    { name: 'story', type: 'relationship', relationTo: 'sdlc-stories', required: true },
    { name: 'projectKey', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'scopeHash', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'artifactHash', type: 'text', required: true }, { name: 'content', type: 'textarea', required: true, maxLength: 4000 },
    { name: 'feedbackHash', type: 'text', required: true, unique: true, admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
  ],
}
