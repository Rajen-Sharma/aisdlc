import { chromium, expect } from '@playwright/test'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const base = 'http://127.0.0.1:3000'
const root = process.argv.find(arg => arg.startsWith('--evidence-dir='))?.slice('--evidence-dir='.length) || '.local/artifact-review-browser'
await mkdir(root, { recursive: true })
const payload = await getPayload({ config }), browser = await chromium.launch(), results: string[] = []
let userId: number | undefined
try {
  // A dedicated temporary account avoids invalidating the signed-in human's session.
  const email = `artifact-browser-${randomUUID()}@example.invalid`, password = randomBytes(32).toString('hex')
  const user = await payload.create({ collection: 'users', overrideAccess: true, data: { email, password, role: 'admin' } })
  userId = user.id
  const anonymous = await browser.newContext()
  for (const slug of ['sdlc-delivery-artifacts', 'sdlc-delivery-feedback']) {
    const response = await anonymous.request.get(`${base}/api/${slug}`)
    if (![401, 403].includes(response.status())) throw new Error('Anonymous artifact access was not denied.')
  }
  const context = await browser.newContext({ extraHTTPHeaders: { Origin: base }, viewport: { width: 1440, height: 1000 } })
  const login = await context.request.post(`${base}/api/users/login`, { data: { email, password } })
  if (login.status() !== 200) throw new Error('Dedicated test account login failed.')
  const denied = await context.request.post(`${base}/api/sdlc-delivery-artifacts`, { data: { artifactHash: 'f'.repeat(64) } })
  if (denied.status() !== 403) throw new Error('Browser artifact writer was not denied.')
  const page = await context.newPage()
  await page.goto(`${base}/pipeline`, { timeout: 60000 })
  await expect(page.getByRole('heading', { name: 'Code, showcase & outcome', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Coding run progress', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No verified delivery yet', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept code security', exact: true })).toHaveCount(0)
  results.push('Anonymous records and authenticated browser writes denied; no acceptance without verified evidence')
  await page.screenshot({ path: `${root}/artifact-review-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error('Mobile overflow.')
  await page.screenshot({ path: `${root}/artifact-review-mobile.png`, fullPage: true })
  results.push('Empty review state visible at desktop and 390px without horizontal overflow')
} catch {
  results.push('FAIL: artifact review browser check; no credentials or response bodies retained')
  process.exitCode = 1
} finally {
  await browser.close()
  if (userId) await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
  await payload.destroy()
  await writeFile(`${root}/artifact-review-browser.json`, JSON.stringify({ synthetic: true, actualHumanApprovals: 0,
    populatedReviewSecurity: 'database tests', results }, null, 2))
  console.log(JSON.stringify(results))
}
process.exit(process.exitCode || 0)
