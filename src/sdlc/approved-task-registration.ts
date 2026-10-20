import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import type { User } from '../payload-types'
import proposal from '../../docs/planning/taskboard-first-delivery.json'
import decision from '../../docs/governance/taskboard-filter-approval.json'
import { digest } from './contracts'
import { activeProject } from './project'
import { lockStory } from './story-lock'

export const approvedTaskScope = '9e60b3e20539bf90070dfd52e0e53aa4898e7e2da838857e3645ced9e26ecdcb'

// Called only after the administrator's authenticated registration action.
// This imports the existing decision; it does not run a model or approve artifacts.
export async function registerApprovedTask(payload: Payload, user: User, scopeHash: string) {
  if (user.role !== 'admin') throw new Error('Delivery-administrator sign-in required to register your recorded decision.')
  const project = await activeProject()
  const story = proposal.proposedStory
  if (scopeHash !== approvedTaskScope || proposal.proposedScopeHash !== approvedTaskScope
    || decision.scopeHash !== approvedTaskScope || decision.statement !== "Approve this task's sprint/design scope"
    || decision.decisions.sprint.decision !== 'accepted' || decision.decisions.designSecurity.decision !== 'accepted'
    || digest(story) !== approvedTaskScope || project.key !== story.projectKey || digest(project) !== story.contextHash) {
    throw new Error('Recorded task scope or active project changed. Registration stopped.')
  }
  const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
  if (!await initTransaction(req)) throw new Error('Registration requires an independent database transaction.')
  try {
    await lockStory(req, project.key, story.storyKey)
    const prior = await payload.find({ collection: 'sdlc-stories', req, user, overrideAccess: false,
      where: { and: [{ projectKey: { equals: project.key } }, { storyKey: { equals: story.storyKey } }] },
      sort: '-revision', limit: 1, depth: 0 })
    let registered = prior.docs[0]
    if (registered && (registered.scopeHash !== approvedTaskScope || registered.revision !== 1)) {
      throw new Error('A different task version exists. Registration cannot overwrite it.')
    }
    if (!registered) registered = await payload.create({ collection: 'sdlc-stories', req, user, overrideAccess: false, depth: 0,
      data: { ...story, actor: user.id, scopeHash: approvedTaskScope, versionKey: `${project.key}:${story.storyKey}:1` } })
    if (registered.scopeHash !== approvedTaskScope) throw new Error('Registered task does not match the recorded decision.')
    const gates = await payload.find({ collection: 'sdlc-gates', req, user, overrideAccess: false,
      where: { story: { equals: registered.id } }, limit: 10, depth: 0 })
    for (const kind of ['sprint', 'design-security'] as const) {
      const priorGate = gates.docs.find(gate => gate.kind === kind)
      if (priorGate) {
        if (priorGate.decision !== 'accept' || priorGate.scopeHash !== approvedTaskScope) {
          throw new Error('An existing decision conflicts with registration. It cannot be overwritten.')
        }
        continue
      }
      await payload.create({ collection: 'sdlc-gates', req, user, overrideAccess: false, depth: 0, data: {
        story: registered.id, scopeHash: approvedTaskScope, kind, decision: 'accept', actor: user.id,
        projectKey: project.key, decisionKey: `${registered.id}:${approvedTaskScope}:${kind}`,
        notes: 'Authenticated registration of the chat user’s recorded 18 October 2026 decision: “Approve this task\'s sprint/design scope”. APP-SP-TASKBOARD-001 / APP-DES-TASKBOARD-001. No code, outcome, MVP or release approval.',
      } })
    }
    await commitTransaction(req)
    return { storyId: registered.id, scopeHash: approvedTaskScope, executionAllowed: false as const }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
