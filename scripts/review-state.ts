import { getPayload } from 'payload'
import config from '../src/payload.config'
import { activeProject, validateProject } from '../src/sdlc/project'
import { digest, validateTriage } from '../src/sdlc/contracts'
import { writeFile } from 'node:fs/promises'
const payload = await getPayload({ config })
try {
  const project = await activeProject()
  const [intake, runs, decisions] = await Promise.all([
    payload.find({ collection: 'sdlc-intake', where: { projectKey: { equals: project.key } }, overrideAccess: true, limit: 100, depth: 0 }),
    payload.find({ collection: 'sdlc-runs', where: { projectKey: { equals: project.key } }, overrideAccess: true, limit: 100, depth: 0 }),
    payload.find({ collection: 'sdlc-decisions', where: { projectKey: { equals: project.key } }, overrideAccess: true, limit: 100, depth: 0 }),
  ])
  const checks = runs.docs.map(run => {
    try {
      const context = validateProject(run.projectContext)
      const snapshotValid = digest({ project: context, records: run.snapshot }) === run.taskKey
      let resultValid: boolean | null = null
      if (run.result && Array.isArray(run.snapshot)) {
        validateTriage(run.result, run.snapshot.map(x => String((x as { id: number }).id)))
        resultValid = digest({ project: context, result: run.result }) === run.resultHash
      }
      return { id: run.id, status: run.status, contextValid: digest(context) === run.contextHash, snapshotValid, resultValid, toolVersion: run.toolVersion, elapsedMs: run.elapsedMs, cost: 'unavailable' }
    } catch { return { id: run.id, status: run.status, valid: false } }
  })
  const result = { recordedAt: new Date().toISOString(), projectKey: project.key, counts: { intake: intake.totalDocs, runs: runs.totalDocs, humanAnalysisDecisions: decisions.totalDocs }, checks, freshModelCalls: 0, humanDecisionsGranted: 0, scope: 'Live persisted state inspected; fresh AI execution, coding and production actions not performed.' }
  await writeFile('docs/evidence/review-2026-10-08/live-state.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await payload.destroy() }
process.exit(0)
