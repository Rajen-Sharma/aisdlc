import { chromium, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:3000'
const credentials = JSON.parse(await readFile('.local/demo-credentials.json', 'utf8'))
const browser = await chromium.launch()
const results = []
const contexts = []
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: base } })
  contexts.push(context)
  const page = await context.newPage()
  const account = credentials.find(c => c.role === role)
  await page.goto(`${base}/admin/login`, { timeout: 60_000 })
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await page.waitForURL('**/admin', { timeout: 60_000 })
  return { page, context }
}
await mkdir('.local/screenshots', { recursive: true })
let id
let adminContext
try {
  const editor = await login('editor')
  const list = await editor.context.request.get(`${base}/api/authors`)
  assert.equal(list.status(), 200)
  const authors = await list.json()
  const sourceAuthor = authors.docs.find(a => a.name === 'Demo Author')
  assert.ok(sourceAuthor)
  const created = await editor.context.request.post(`${base}/api/articles?draft=true`, { data: { title: 'Browser acceptance draft', body: 'Initial browser test text', author: sourceAuthor.id } })
  assert.equal(created.status(), 201)
  id = (await created.json()).doc.id
  await editor.page.goto(`${base}/admin/collections/articles/${id}`)
  await expect(editor.page.locator('#field-title')).toHaveValue('Browser acceptance draft')
  await expect(editor.page.locator('#action-save')).toHaveCount(0)
  await editor.page.locator('#field-title').fill('Browser reviewed article')
  await editor.page.locator('#field-body').fill('Edited and published through the studio during acceptance testing.')
  const saved = editor.page.waitForResponse(r => r.url().includes(`/api/articles/${id}`) && r.request().method() === 'PATCH')
  await editor.page.locator('#action-save-draft').click()
  assert.equal((await saved).status(), 200)
  await editor.page.reload()
  await expect(editor.page.locator('#field-title')).toHaveValue('Browser reviewed article')
  await editor.page.screenshot({ path: '.local/screenshots/editor-draft.png', fullPage: true })
  results.push({ criterion: 'AC-001', outcome: 'pass', behavior: 'Editor logs in, edits, saves and reloads a draft; publish action absent.' })
  const forbidden = await editor.context.request.patch(`${base}/api/articles/${id}`, { data: { _status: 'published' } })
  assert.equal(forbidden.status(), 403)
  const self = await editor.context.request.get(`${base}/api/users/me`)
  const selfID = (await self.json()).user.id
  const escalation = await editor.context.request.patch(`${base}/api/users/${selfID}`, { data: { role: 'admin' } })
  assert.equal(escalation.status(), 403)
  const anonymous = await browser.newContext()
  contexts.push(anonymous)
  const hidden = await anonymous.request.get(`${base}/api/articles/${id}?draft=true`)
  assert.ok([403, 404].includes(hidden.status()))
  const versions = await anonymous.request.get(`${base}/api/articles/versions`)
  assert.equal(versions.status(), 403)
  results.push({ criterion: 'AC-002', outcome: 'pass', behavior: 'REST rejects editor publishing/role escalation and anonymous draft/version access.' })
  const pub = await login('publisher')
  await pub.page.goto(`${base}/admin/collections/articles/${id}`)
  console.log('Publisher visibility control:', await pub.page.locator('#field-visibility').innerText())
  await pub.page.locator('#field-visibility .rs__control').click()
  await pub.page.getByText('public', { exact: true }).last().click()
  const published = pub.page.waitForResponse(r => r.url().includes(`/api/articles/${id}`) && r.request().method() === 'PATCH')
  await pub.page.locator('#action-save').click()
  assert.equal((await published).status(), 200)
  const visible = await anonymous.request.get(`${base}/api/articles/${id}`)
  assert.equal(visible.status(), 200)
  assert.equal((await visible.json()).title, 'Browser reviewed article')
  const home = await anonymous.newPage()
  await home.goto(base)
  await expect(home.getByRole('heading', { name: 'Browser reviewed article' })).toBeVisible()
  results.push({ criterion: 'AC-002', outcome: 'pass', behavior: 'Publisher publishes public content through UI; anonymous API and page show it.' })
  const admin = await login('admin')
  adminContext = admin.context
} catch (error) {
  results.push({ outcome: 'fail', message: error.message, location: error.stack?.split('\n').slice(1, 3).join('\n') })
  process.exitCode = 1
} finally {
  if (id) {
    if (!adminContext) adminContext = (await login('admin')).context
    const removed = await adminContext.request.delete(`${base}/api/articles/${id}`)
    if (removed.status() !== 200) { results.push({ outcome: 'fail', message: 'Test record cleanup failed' }); process.exitCode = 1 }
  }
  const home = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await home.goto(base)
  await home.screenshot({ path: '.local/screenshots/home.png', fullPage: true })
  await home.setViewportSize({ width: 390, height: 844 })
  await home.screenshot({ path: '.local/screenshots/mobile.png', fullPage: true })
  assert.ok(await home.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  results.push({ outcome: 'pass', behavior: 'Mobile page has no horizontal overflow.' })
  for (const context of contexts) await context.close()
  await browser.close()
  await writeFile('docs/evidence/browser-check.json', JSON.stringify({ timestamp: new Date().toISOString(), synthetic: true, results }, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
