import { getPayload } from 'payload'
import config from '../src/payload.config'
import { mkdir, writeFile } from 'node:fs/promises'
import { digest, validateTriage } from '../src/sdlc/contracts'
import { activeProject } from '../src/sdlc/project'
const payload = await getPayload({ config })
try {
  const project = await activeProject()
  const result = await payload.find({ collection: 'sdlc-runs', where: { projectKey: { equals: project.key } }, overrideAccess: true, depth: 0, limit: 20, sort: '-id' })
  const runs = result.docs.filter(run => /^[a-f0-9]{64}$/.test(run.taskKey)).map(run => {
    let valid = false
    if (run.status === 'awaiting-review' && Array.isArray(run.snapshot)) {
      validateTriage(run.result, run.snapshot.map(x => String((x as { id: number }).id)))
      valid = run.projectContext ? digest({ project: run.projectContext, records: run.snapshot }) === run.taskKey && digest({ project: run.projectContext, result: run.result }) === run.resultHash : digest(run.snapshot) === run.taskKey && digest(run.result) === run.resultHash
    }
    return { id: run.id, projectKey: run.projectKey, projectContext: run.projectContext, contextHash: run.contextHash, status: run.status, snapshot: run.snapshot, taskKey: run.taskKey, result: run.result, resultHash: run.resultHash, valid, failure: run.failure, elapsedMs: run.elapsedMs, toolVersion: run.toolVersion, exitCode: run.exitCode, createdAt: run.createdAt, updatedAt: run.updatedAt }
  })
  await mkdir('docs/evidence', { recursive: true })
  await writeFile('docs/evidence/generic-engine-runs.json', JSON.stringify({ recordedAt: new Date().toISOString(), classification: 'synthetic showcase', runs, humanDecisionsGrantedByAutomation: 0, productionReady: false, codeExecution: 'blocked-on-verified-isolation', cost: 'unavailable' }, null, 2))
  console.log(JSON.stringify(runs.map(({ id, status, valid }) => ({ id, status, valid }))))
} finally { await payload.destroy() }
process.exit(0)
