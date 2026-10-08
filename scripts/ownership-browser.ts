import { chromium, expect } from '@playwright/test'
import { getPayload } from 'payload'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import config from '../src/payload.config'
import { activeProject } from '../src/sdlc/project'
import { digest } from '../src/sdlc/contracts'
const root = process.argv.find(arg => arg.startsWith('--evidence-dir='))?.slice('--evidence-dir='.length) || 'docs/evidence/ownership-checkpoint'
await mkdir(root, { recursive: true })
const base = 'http://127.0.0.1:3000', results: string[] = []
const payload = await getPayload({ config }), browser = await chromium.launch()
let storyId: number | undefined
try {
  const project = await activeProject()
  const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 20, depth: 0 })
  const admin = users.docs.find(user => user.role === 'admin')!
  const key = `browser-ownership-${Date.now()}`
  const story = await payload.create({ collection: 'sdlc-stories', user: admin, overrideAccess: false, depth: 0, data: {
    projectKey: project.key, contextHash: digest(project), storyKey: key, title: 'Synthetic ownership browser fixture',
    contract: { sourceHash: digest('synthetic source'), checkPolicyHash: digest('synthetic checks'), designHash: digest('synthetic design'), sprintHash: digest('synthetic sprint'), allowedPaths: ['src/filter.ts'], acceptanceCriteria: ['Synthetic UI test only. No code executes.'] }, actor: admin.id, revision: 1, versionKey: '', scopeHash: '',
  } })
  storyId = story.id
  const anon = await browser.newContext()
  for (const slug of ['sdlc-tasks', 'sdlc-task-events']) assert.ok([401, 403].includes((await anon.request.get(`${base}/api/${slug}`)).status()))
  results.push('Anonymous ownership records denied')
  const accounts = JSON.parse(await readFile('.local/demo-credentials.json', 'utf8')) as { role: string; email: string; password: string }[]
  const editor = await browser.newContext({ extraHTTPHeaders: { Origin: base } }), editorAccount = accounts.find(account => account.role === 'editor')!
  assert.equal((await editor.request.post(`${base}/api/users/login`, { data: { email: editorAccount.email, password: editorAccount.password } })).status(), 200)
  assert.equal((await editor.request.get(`${base}/api/sdlc-tasks`)).status(), 403)
  assert.equal((await editor.request.post(`${base}/api/sdlc-tasks`, { data: { taskKey: 'forged', story: storyId, status: 'reserved', owner: 'model' } })).status(), 403)
  results.push('Editor ownership access and forged creation denied')
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), account = accounts.find(account => account.role === 'admin')!
  await page.goto(`${base}/admin/login`)
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await page.waitForURL('**/admin', { timeout: 60000 })
  await page.goto(`${base}/pipeline`)
  const card = page.locator('article.run-card').filter({ has: page.getByRole('heading', { name: `${key} · v1`, exact: true }) })
  await expect(card.getByRole('button', { name: 'Queue reservation only' })).toHaveCount(0)
  for (const [button, label] of [['Accept sprint scope', 'sprint'], ['Accept security design', 'design-security']]) {
    const form = card.locator('form').filter({ has: page.getByRole('button', { name: button, exact: true }) })
    await form.locator('textarea').fill('Synthetic browser acceptance test; records are removed. No actual human governance acceptance.')
    await form.getByRole('button', { name: button, exact: true }).click()
    await expect(card.getByText(`${label}: accept`, { exact: true })).toBeVisible()
  }
  await expect(card.getByRole('button', { name: 'Queue reservation only' })).toBeVisible()
  results.push('Separate populated sprint/design forms record exact-scope synthetic decisions')
  for (let index = 0; index < 2; index++) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/pipeline' && r.request().method() === 'POST')
    await card.getByRole('button', { name: 'Queue reservation only' }).click()
    assert.equal((await response).status(), 200)
  }
  const tasks = await payload.find({ collection: 'sdlc-tasks', overrideAccess: true, depth: 0, where: { story: { equals: storyId } }, limit: 10 })
  assert.equal(tasks.totalDocs, 1); assert.equal(tasks.docs[0].status, 'queued'); assert.equal(tasks.docs[0].attemptCount, 0)
  await expect(page.getByRole('heading', { name: `TASK-${tasks.docs[0].id}`, exact: true })).toBeVisible()
  const ledger = await payload.find({ collection: 'sdlc-task-events', overrideAccess: true, depth: 0, where: { task: { equals: tasks.docs[0].id } }, limit: 10 })
  assert.equal(ledger.totalDocs, 1); assert.equal(ledger.docs[0].kind, 'queued')
  results.push('Repeated queue submission is idempotent and displays a zero-attempt reservation')
  await page.screenshot({ path: `${root}/ownership-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false)
  await page.screenshot({ path: `${root}/ownership-mobile.png`, fullPage: true })
  results.push('Populated review and ownership layout fits 390px viewport')
} catch {
  results.push('FAIL: ownership browser journey; inspect local environment without publishing credentials.')
  process.exitCode = 1
} finally {
  await browser.close()
  if (storyId) {
    const tasks = await payload.find({ collection: 'sdlc-tasks', overrideAccess: true, where: { story: { equals: storyId } }, limit: 10, depth: 0 })
    for (const task of tasks.docs) {
      const events = await payload.find({ collection: 'sdlc-task-events', overrideAccess: true, where: { task: { equals: task.id } }, limit: 100, depth: 0 })
      for (const event of events.docs) await payload.delete({ collection: 'sdlc-task-events', id: event.id, overrideAccess: true })
      await payload.delete({ collection: 'sdlc-tasks', id: task.id, overrideAccess: true })
    }
    const gates = await payload.find({ collection: 'sdlc-gates', overrideAccess: true, where: { story: { equals: storyId } }, limit: 10, depth: 0 })
    for (const gate of gates.docs) await payload.delete({ collection: 'sdlc-gates', id: gate.id, overrideAccess: true })
    await payload.delete({ collection: 'sdlc-stories', id: storyId, overrideAccess: true })
  }
  await payload.destroy()
  await writeFile(`${root}/ownership-browser.json`, JSON.stringify({ checkedAt: new Date().toISOString(), synthetic: true, actualHumanApprovals: 0, executionAllowed: false, results }, null, 2))
  console.log(JSON.stringify(results))
}
process.exit(process.exitCode || 0)
