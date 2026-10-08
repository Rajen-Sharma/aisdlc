import { getPayload } from 'payload'
import config from '../src/payload.config'
import { SyntheticDrupalAdapter } from '../src/migration/adapter'
import { importRecords } from '../src/migration/importer'
import { mkdir, writeFile } from 'node:fs/promises'
const payload = await getPayload({ config })
try {
  const adapter = new SyntheticDrupalAdapter()
  const fixture = await adapter.load()
  const records = fixture.content.filter(r => r.type === 'article' && r.locale === 'en')
  const report = await importRecords(payload, fixture, records)
  await mkdir('.local/reports', { recursive: true })
  await writeFile(`.local/reports/${report.runId}.json`, JSON.stringify({ ...report, excluded: fixture.content.length - records.length, adapter: adapter.id, capabilities: adapter.capabilities }, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (report.failed) process.exitCode = 1
} finally { await payload.destroy() }
process.exit(process.exitCode || 0)
