import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { SyntheticDrupalAdapter, sourceKey } from '../src/migration/adapter'
import { importRecords } from '../src/migration/importer'

test('CMS permissions and migration acceptance', async t => {
  const payload = await getPayload({ config })
  const run = randomUUID()
  const createdIds: (string | number)[] = []
  const fixture = await new SyntheticDrupalAdapter().load()
  fixture.sourceInstance = `test-${run}`
  const author = await payload.create({ collection: 'authors', overrideAccess: true, data: { name: 'Test author', sourceKey: `test-${run}` } })
  const editor = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `editor-${run}@example.invalid`, password: randomUUID(), role: 'editor' } })
  const publisher = await payload.create({ collection: 'users', overrideAccess: true, data: { email: `publisher-${run}@example.invalid`, password: randomUUID(), role: 'publisher' } })
  try {
    await t.test('editor creates and reloads a private draft; cannot publish or escalate role', async () => {
      const doc = await payload.create({ collection: 'articles', user: editor, overrideAccess: false, data: { title: 'Editor draft', body: 'Plain text', author: author.id, visibility: 'private' } })
      createdIds.push(doc.id)
      const loaded = await payload.findByID({ collection: 'articles', id: doc.id, user: editor, overrideAccess: false })
      assert.equal(loaded.title, 'Editor draft'); assert.equal(loaded.visibility, 'private')
      await assert.rejects(payload.update({ collection: 'articles', id: doc.id, user: editor, overrideAccess: false, data: { _status: 'published' } }))
      await assert.rejects(payload.update({ collection: 'users', id: editor.id, user: editor, overrideAccess: false, data: { role: 'admin' } }))
      const unchanged = await payload.findByID({ collection: 'users', id: editor.id, overrideAccess: true })
      assert.equal(unchanged.role, 'editor')
    })
    await t.test('public reads hide private/draft/revision/nested content; publisher can publish', async () => {
      const draft = await payload.create({ collection: 'articles', overrideAccess: true, data: { title: 'Hidden draft', body: 'Never public', author: author.id, visibility: 'public', _status: 'draft' } })
      const privateDoc = await payload.create({ collection: 'articles', overrideAccess: true, data: { title: 'Private published', body: 'Never public', author: author.id, visibility: 'private', _status: 'published' } })
      const live = await payload.create({ collection: 'articles', user: publisher, overrideAccess: false, data: { title: 'Public live', body: 'Visible', author: author.id, visibility: 'public', _status: 'published', relatedArticles: [draft.id, privateDoc.id] } })
      createdIds.push(live.id, draft.id, privateDoc.id)
      const publicList = await payload.find({ collection: 'articles', overrideAccess: false, user: null, draft: true, depth: 2, limit: 100 })
      assert.ok(publicList.docs.every(d => d.visibility === 'public' && d._status === 'published'))
      for (const id of [draft.id, privateDoc.id]) await assert.rejects(payload.findByID({ collection: 'articles', id, user: null, overrideAccess: false, draft: true }))
      const publicDoc = await payload.findByID({ collection: 'articles', id: live.id, user: null, overrideAccess: false, depth: 2 })
      assert.equal(publicDoc.author, undefined)
      assert.ok(!JSON.stringify(publicDoc).includes('Never public'))
      await assert.rejects(payload.findVersions({ collection: 'articles', overrideAccess: false, user: null }))
      const edited = await payload.update({ collection: 'articles', id: draft.id, user: publisher, overrideAccess: false, data: { _status: 'published' } })
      assert.equal(edited._status, 'published')
    })
    await t.test('fresh import creates two; rerun skips; destination edits conflict; source changes update', async () => {
      const records = fixture.content.filter(r => r.type === 'article' && r.locale === 'en')
      const first = await importRecords(payload, fixture, records)
      assert.equal(first.created, 2); assert.equal(first.failed, 0)
      const rerun = await importRecords(payload, fixture, records)
      assert.equal(rerun.skipped, 2); assert.equal(rerun.created, 0)
      const found = await payload.find({ collection: 'articles', overrideAccess: true, where: { sourceKey: { equals: sourceKey(fixture, records[1]) } }, depth: 0 })
      await payload.update({ collection: 'articles', id: found.docs[0].id, overrideAccess: false, user: editor, data: { title: 'Human edited' } })
      const conflict = await importRecords(payload, fixture, records)
      assert.equal(conflict.conflicted, 1); assert.equal(conflict.skipped, 1)
      const still = await payload.findByID({ collection: 'articles', id: found.docs[0].id, overrideAccess: true, draft: true })
      assert.equal(still.title, 'Human edited')
      const changed = await importRecords(payload, fixture, [{ ...records[0], title: 'Source updated' }])
      assert.equal(changed.updated, 1)
    })
    await t.test('invalid and hostile samples rejected; injected instructions remain plain text', async () => {
      const invalid = fixture.negativeCases.slice(0, 3).map(c => ({ ...c.record, body: c.record.body || 'Text' }))
      const report = await importRecords(payload, fixture, invalid)
      assert.equal(report.rejected, 3); assert.equal(report.created, 0); assert.equal(report.failed, 0)
      const injected = { ...fixture.negativeCases[3].record, authorId: 'a1' }
      const textReport = await importRecords(payload, fixture, [injected])
      assert.equal(textReport.created, 1)
      const doc = await payload.find({ collection: 'articles', where: { sourceKey: { equals: sourceKey(fixture, injected) } }, overrideAccess: true })
      assert.equal(doc.docs[0].body, injected.body)
      assert.equal(doc.docs[0]._status, 'draft'); assert.equal(doc.docs[0].visibility, 'private')
    })
  } finally {
    for (const id of createdIds) await payload.delete({ collection: 'articles', id, overrideAccess: true })
    // Delete only IDs created by this test or the uniquely namespaced test adapter.
    const imported = await payload.find({ collection: 'articles', where: { sourceKey: { contains: fixture.sourceInstance } }, overrideAccess: true, limit: 100 })
    for (const doc of imported.docs) await payload.delete({ collection: 'articles', id: doc.id, overrideAccess: true })
    const testAuthor = await payload.find({ collection: 'authors', where: { sourceKey: { contains: fixture.sourceInstance } }, overrideAccess: true })
    for (const doc of testAuthor.docs) await payload.delete({ collection: 'authors', id: doc.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: editor.id, overrideAccess: true })
    await payload.delete({ collection: 'users', id: publisher.id, overrideAccess: true })
    await payload.destroy()
  }
})
