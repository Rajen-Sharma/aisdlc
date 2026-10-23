import { APIError, type CollectionConfig } from 'payload'
import { admin, role } from '../security'
import { digest } from './contracts'
import { activeProject } from './project'
import { lockStory } from './story-lock'
import { reviewArtifact } from './artifact-collections'
import { nativeAuthorityCall, nativeExecutorConfiguration } from './native-transport'

const immutable = { read: admin, create: admin, update: () => false, delete: () => false }
const hashPattern = /^[a-f0-9]{64}$/
export const gateKinds = ['sprint', 'design-security', 'code-security', 'outcome', 'mvp'] as const

export function validateTaskContract(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Task contract must be an object.')
  const task = value as Record<string, unknown>
  const expected = ['sourceHash', 'checkPolicyHash', 'designHash', 'sprintHash', 'allowedPaths', 'acceptanceCriteria']
  if (Object.keys(task).length !== expected.length || expected.some(key => !(key in task))) throw new Error('Task contract contains missing or unknown fields.')
  for (const key of expected.slice(0, 4)) if (typeof task[key] !== 'string' || !hashPattern.test(task[key])) throw new Error(`${key} must be a SHA-256 hash.`)
  for (const key of ['allowedPaths', 'acceptanceCriteria']) {
    const list = task[key]
    if (!Array.isArray(list) || !list.length || list.length > 30 || list.some(item => typeof item !== 'string' || !item.trim() || item.length > 2000)) throw new Error(`${key} must contain bounded, nonempty strings.`)
  }
  for (const path of task.allowedPaths as string[]) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') || path.startsWith('.')) throw new Error('Allowed paths must be explicit relative paths without traversal.')
  }
  return task
}

export const Stories: CollectionConfig = {
  slug: 'sdlc-stories', admin: { group: 'AI delivery', useAsTitle: 'title' }, access: immutable,
  hooks: { beforeValidate: [async ({ data, req, operation }) => {
    if (operation !== 'create') return data
    if (!data || role(req.user) !== 'admin') throw new APIError('Authenticated human story submission required.', 403)
    const project = await activeProject()
    if (data.projectKey !== project.key || data.contextHash !== digest(project)) throw new APIError('Story project context is stale.', 409)
    await lockStory(req, project.key, data.storyKey)
    try { validateTaskContract(data.contract) } catch (error) { throw new APIError((error as Error).message, 400) }
    let revision = 1
    if (data.supersedes) {
      const previous = await req.payload.findByID({ collection: 'sdlc-stories', id: data.supersedes, user: req.user, overrideAccess: false, depth: 0, req })
      if (previous.projectKey !== project.key || previous.storyKey !== data.storyKey) throw new APIError('Revision must supersede the same project and story.', 409)
      revision = previous.revision + 1
    }
    if (data.feedback) {
      const feedback = await req.payload.findByID({ collection: 'sdlc-delivery-feedback', id: data.feedback, user: req.user, overrideAccess: false, req, depth: 0 })
      if (feedback.projectKey !== project.key || feedback.story !== data.supersedes) throw new APIError('Feedback revision must supersede the reviewed story.', 409)
    }
    data.revision = revision
    data.versionKey = `${project.key}:${data.storyKey}:${revision}`
    data.actor = req.user!.id
    data.scopeHash = digest({ projectKey: project.key, contextHash: data.contextHash, storyKey: data.storyKey, revision, title: data.title, contract: data.contract, supersedes: data.supersedes ?? null, ...(data.feedback ? { feedback: data.feedback } : {}) })
    return data
  }], beforeChange: [async ({ data, req, operation }) => {
    if (operation !== 'create' || !data.supersedes) return data
    // Validation and story locking precede the external revocation. If SQL later
    // fails, revocation remains restrictive; it never refunds or resets a budget.
    const native = await nativeExecutorConfiguration()
    if (!native || native.taskKey !== digest({ projectKey: data.projectKey, storyKey: data.storyKey })) return data
    try {
      const current = await nativeAuthorityCall(native, 'inspect', null)
      if (current.task && !current.task.revoked) await nativeAuthorityCall(native, 'revoke', {
        reasonHash: digest({ previousStory: data.supersedes, nextScope: data.scopeHash, actor: req.user!.id }),
      })
    } catch { throw new APIError('Native task revocation must be recorded before this story can change.', 409) }
    return data
  }] },
  fields: [
    { name: 'projectKey', type: 'text', required: true }, { name: 'contextHash', type: 'text', required: true },
    { name: 'storyKey', type: 'text', required: true, maxLength: 100 }, { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'contract', type: 'json', required: true }, { name: 'supersedes', type: 'relationship', relationTo: 'sdlc-stories' },
    { name: 'feedback', type: 'relationship', relationTo: 'sdlc-delivery-feedback' },
    { name: 'revision', type: 'number', required: true, admin: { readOnly: true } },
    { name: 'versionKey', type: 'text', required: true, unique: true, admin: { readOnly: true } },
    { name: 'scopeHash', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
  ],
}

export const Gates: CollectionConfig = {
  slug: 'sdlc-gates', admin: { group: 'AI delivery', useAsTitle: 'decisionKey' }, access: immutable,
  hooks: { beforeValidate: [async ({ data, req, operation }) => {
    if (operation !== 'create') return data
    if (!data || role(req.user) !== 'admin') throw new APIError('Authenticated human gate decision required.', 403)
    const story = await req.payload.findByID({ collection: 'sdlc-stories', id: data.story, user: req.user, overrideAccess: false, depth: 0, req })
    await lockStory(req, story.projectKey, story.storyKey)
    const project = await activeProject()
    if (story.projectKey !== project.key || story.contextHash !== digest(project) || data.scopeHash !== story.scopeHash) throw new APIError('Gate scope is stale or belongs to another project.', 409)
    const revisions = await req.payload.find({ collection: 'sdlc-stories', user: req.user, overrideAccess: false, where: { and: [{ projectKey: { equals: project.key } }, { storyKey: { equals: story.storyKey } }] }, sort: '-revision', limit: 1, depth: 0, req })
    if (revisions.docs[0]?.id !== story.id) throw new APIError('Superseded story cannot receive approvals.', 409)
    if (!['sprint', 'design-security'].includes(data.kind)) {
      if (!['code-security', 'outcome', 'mvp'].includes(data.kind)) throw new APIError('Unknown review gate.', 400)
      const artifact = await reviewArtifact(req, story, data.artifactHash)
      if (data.decision === 'accept' && !artifact.passed) throw new APIError('Failed checks cannot receive artifact acceptance.', 409)
      const required = data.kind === 'mvp' ? ['code-security', 'outcome'] : data.kind === 'outcome' ? ['code-security'] : []
      for (const kind of required) if (!artifact.gates.some(g => g.kind === kind && g.decision === 'accept' && g.artifactHash === data.artifactHash)) throw new APIError(`${kind} acceptance required for this exact artifact.`, 409)
      // A short-lived independent state must still be current after the database reads.
      if (Math.floor(Date.now() / 1000) >= artifact.state.expiresAt) throw new APIError('Current delivery evidence expired. Refresh the review.', 409)
    } else if (data.artifactHash) throw new APIError('Planning approvals must not contain an artifact.', 400)
    data.actor = req.user!.id
    data.projectKey = project.key
    data.decisionKey = `${story.id}:${story.scopeHash}:${data.kind}${data.artifactHash ? `:${data.artifactHash}` : ''}`
    return data
  }] },
  fields: [
    { name: 'story', type: 'relationship', relationTo: 'sdlc-stories', required: true },
    { name: 'projectKey', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'scopeHash', type: 'text', required: true },
    { name: 'artifactHash', type: 'text' },
    { name: 'kind', type: 'select', required: true, options: [...gateKinds] },
    { name: 'decision', type: 'select', required: true, options: ['accept', 'reject'] },
    { name: 'notes', type: 'textarea', required: true, maxLength: 4000 },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
    { name: 'decisionKey', type: 'text', required: true, unique: true, admin: { readOnly: true } },
  ],
}
