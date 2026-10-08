import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
export type SourceRecord = { id: string; type: string; locale: string; title: string; body?: string; state?: string; visibility?: string; authorId?: string }
export type Fixture = { synthetic: boolean; fixtureId: string; sourceSystem: string; sourceInstance: string; authors: { id: string; name: string }[]; content: SourceRecord[]; negativeCases: { caseId: string; record: SourceRecord; expected: string }[] }
export interface SourceAdapter {
  id: string
  capabilities: { revisions: boolean; incremental: boolean; deletionDetection: boolean; media: boolean }
  load(): Promise<Fixture>
}
export class SyntheticDrupalAdapter implements SourceAdapter {
  id = 'synthetic-drupal-v1'
  capabilities = { revisions: false, incremental: false, deletionDetection: false, media: false }
  constructor(private filename = 'fixtures/drupal/synthetic-site.json') {}
  async load(): Promise<Fixture> {
    const raw = await readFile(this.filename, 'utf8')
    if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Fixture exceeds 1 MB limit.')
    const data = JSON.parse(raw) as Fixture
    if (data.synthetic !== true || data.sourceSystem !== 'drupal' || !data.sourceInstance || !Array.isArray(data.content) || !Array.isArray(data.authors))
      throw new Error('Only explicitly synthetic Drupal-style fixtures are supported.')
    return data
  }
}
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const sourceKey = (fixture: Fixture, record: SourceRecord) => JSON.stringify([fixture.sourceSystem, fixture.sourceInstance, record.type, record.id, record.locale])
export function validate(record: SourceRecord, fixture: Fixture): string | undefined {
  if (record.type !== 'article' || record.locale !== 'en') return 'unsupported-type-or-locale'
  if (!record.id || !record.title?.trim() || record.title.length > 200) return 'required-or-invalid-title'
  if (!fixture.authors.some(a => a.id === record.authorId)) return 'unresolved-author'
  if (typeof record.body !== 'string' || !record.body.trim() || record.body.length > 50_000) return 'required-or-invalid-body'
  if (/[<>]/.test(record.body)) return 'unsafe-html-not-supported'
  return undefined
}
