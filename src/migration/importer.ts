import type { Payload } from 'payload'
import { randomUUID } from 'node:crypto'
import { hash, sourceKey, validate, type Fixture, type SourceRecord } from './adapter'

function contentHash(doc: { title?: unknown; body?: unknown; author?: unknown; visibility?: unknown; _status?: unknown; relatedArticles?: unknown }) {
  const author = doc.author && typeof doc.author === 'object' && 'id' in doc.author ? doc.author.id : doc.author
  return hash({ title: doc.title, body: doc.body, visibility: doc.visibility, _status: doc._status, author, relatedArticles: doc.relatedArticles || [] })
}
export async function importRecords(payload: Payload, fixture: Fixture, records: SourceRecord[]) {
  const report = { runId: randomUUID(), timestamp: new Date().toISOString(), fixtureId: fixture.fixtureId, synthetic: true,
    selected: records.length, created: 0, updated: 0, skipped: 0, rejected: 0, conflicted: 0, failed: 0,
    outcomes: [] as { sourceKey: string; outcome: string; reason?: string }[] }
  const seen = new Set<string>()
  for (const record of records) {
    const key = sourceKey(fixture, record)
    const reject = validate(record, fixture)
    if (reject || seen.has(key)) {
      report.rejected++; report.outcomes.push({ sourceKey: key, outcome: 'rejected', reason: reject || 'duplicate-source-identity' }); continue
    }
    seen.add(key)
    try {
      const authorKey = JSON.stringify([fixture.sourceSystem, fixture.sourceInstance, 'author', record.authorId])
      const authors = await payload.find({ collection: 'authors', where: { sourceKey: { equals: authorKey } }, limit: 1, overrideAccess: true })
      const author = authors.docs[0] || await payload.create({ collection: 'authors', overrideAccess: true,
        data: { sourceKey: authorKey, name: fixture.authors.find(a => a.id === record.authorId)!.name } })
      const existing = await payload.find({ collection: 'articles', where: { sourceKey: { equals: key } }, depth: 0, limit: 1, draft: true, overrideAccess: true })
      const doc = existing.docs[0]
      const sourceHash = hash(record)
      if (doc && (!doc.importedHash || contentHash(doc) !== doc.importedHash)) {
        report.conflicted++; report.outcomes.push({ sourceKey: key, outcome: 'conflicted', reason: 'destination-edited-since-import' }); continue
      }
      if (doc && doc.sourceHash === sourceHash) {
        report.skipped++; report.outcomes.push({ sourceKey: key, outcome: 'skipped' }); continue
      }
      const data = { title: record.title.trim(), body: record.body!, author: author.id, relatedArticles: [],
        visibility: record.visibility === 'public' ? 'public' as const : 'private' as const,
        _status: record.state === 'published' ? 'published' as const : 'draft' as const,
        sourceKey: key, sourceHash, importedHash: '' }
      data.importedHash = contentHash(data)
      if (doc) { await payload.update({ collection: 'articles', id: doc.id, data, overrideAccess: true }); report.updated++ }
      else { await payload.create({ collection: 'articles', data, overrideAccess: true }); report.created++ }
      report.outcomes.push({ sourceKey: key, outcome: doc ? 'updated' : 'created' })
    } catch {
      report.failed++; report.outcomes.push({ sourceKey: key, outcome: 'failed', reason: 'destination-operation-failed; inspect restricted local logs' })
    }
  }
  if (report.selected !== report.created + report.updated + report.skipped + report.rejected + report.conflicted + report.failed) throw new Error('Unreconciled report.')
  return report
}
