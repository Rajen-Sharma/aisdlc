import type { Payload } from 'payload'
import { digest } from './contracts'
import { activeProject } from './project'
import { validateTaskContract } from './delivery'

// Readiness is advisory. The future claim transaction must repeat these checks under lock.
// No caller can turn this result into permission to execute unqualified coding tools.
export async function storyReadiness(payload: Payload, id: number) {
  const story = await payload.findByID({ collection: 'sdlc-stories', id, overrideAccess: true, depth: 0 })
  const project = await activeProject()
  const blockers: string[] = []
  if (story.projectKey !== project.key || story.contextHash !== digest(project)) blockers.push('Project context changed.')
  validateTaskContract(story.contract)
  if (digest({ projectKey: story.projectKey, contextHash: story.contextHash, storyKey: story.storyKey, revision: story.revision, title: story.title, contract: story.contract, supersedes: story.supersedes ?? null }) !== story.scopeHash) blockers.push('Story integrity failed.')
  const latest = await payload.find({ collection: 'sdlc-stories', overrideAccess: true, where: { and: [{ projectKey: { equals: story.projectKey } }, { storyKey: { equals: story.storyKey } }] }, sort: '-revision', limit: 1, depth: 0 })
  if (latest.docs[0]?.id !== story.id) blockers.push('Story is superseded.')
  const gates = await payload.find({ collection: 'sdlc-gates', overrideAccess: true, where: { story: { equals: id } }, limit: 10, depth: 0 })
  for (const kind of ['sprint', 'design-security']) {
    if (!gates.docs.some(gate => gate.kind === kind && gate.decision === 'accept' && gate.scopeHash === story.scopeHash && gate.projectKey === story.projectKey && gate.actor)) blockers.push(`${kind} acceptance required for this exact story version.`)
  }
  return { storyId: id, scopeHash: story.scopeHash, planningReady: !blockers.length, executionReady: false as const, blockers, executionBlocker: 'Coding worker, atomic claim and independent verifier are not yet qualified.' }
}
