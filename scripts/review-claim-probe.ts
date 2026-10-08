import { getPayload } from 'payload'
import config from '../src/payload.config'
import { activeProject } from '../src/sdlc/project'
import { digest } from '../src/sdlc/contracts'
import { writeFile } from 'node:fs/promises'
// Reproduce the DB claim sequence used by workers with separate filesystem lock roots.
// No model invocation, real approvals, or existing run mutations.
const payload = await getPayload({ config })
let id: number | undefined
try {
  const project = await activeProject()
  const run = await payload.create({ collection: 'sdlc-runs', overrideAccess: true, data: {
    taskKey: `review-claim-${Date.now()}`, status: 'queued', snapshot: [], projectKey: project.key, projectContext: project, contextHash: digest(project),
  } })
  id = run.id
  const read = () => payload.find({ collection: 'sdlc-runs', where: { and: [{ id: { equals: id } }, { status: { equals: 'queued' } }] }, limit: 1, overrideAccess: true, depth: 0 })
  const [a, b] = await Promise.all([read(), read()])
  const first = await payload.update({ collection: 'sdlc-runs', id, data: { status: 'running' }, overrideAccess: true })
  const second = await payload.update({ collection: 'sdlc-runs', id, data: { status: 'running' }, overrideAccess: true })
  const reproduced = a.docs[0]?.id === id && b.docs[0]?.id === id && first.status === 'running' && second.status === 'running'
  const result = { recordedAt: new Date().toISOString(), finding: 'REV-003', bothReadersSawQueued: a.docs[0]?.id === id && b.docs[0]?.id === id, bothUnconditionalClaimsAccepted: first.status === 'running' && second.status === 'running', reproduced, modelInvocations: 0, realApprovals: 0, scope: 'DB primitive probe emulating distinct worker lock roots. The existing same-root filesystem lock is bypassed in this diagnostic; this is not a claim that two current same-root workers run simultaneously.' }
  await writeFile('docs/evidence/review-2026-10-08/claim-probe.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  if (!reproduced) process.exitCode = 1
} finally {
  if (id !== undefined) await payload.delete({ collection: 'sdlc-runs', id, overrideAccess: true })
  await payload.destroy()
}
process.exit(process.exitCode || 0)
