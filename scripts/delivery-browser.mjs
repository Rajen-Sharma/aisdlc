import { chromium, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const base = 'http://127.0.0.1:3000'
const root = process.argv.find(arg => arg.startsWith('--evidence-dir='))?.slice('--evidence-dir='.length) || 'docs/evidence/build-eng-002'
await mkdir(root, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  const anonymous = await browser.newPage()
  await anonymous.goto(`${base}/pipeline`)
  await expect(anonymous.getByRole('heading', { name: 'Versioned stories & security gates' })).toHaveCount(0)
  results.push({ check: 'Anonymous cannot view story reviews', passed: true })
  const account = JSON.parse(await readFile('.local/demo-credentials.json', 'utf8')).find(item => item.role === 'admin')
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${base}/admin/login`)
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await page.waitForURL('**/admin', { timeout: 60000 })
  await page.goto(`${base}/pipeline`)
  await expect(page.getByRole('heading', { name: 'Versioned stories & security gates' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Prepare a story version →' })).toHaveAttribute('href', '/admin/collections/sdlc-stories/create')
  await page.screenshot({ path: `${root}/story-reviews-desktop.png`, fullPage: true })
  results.push({ check: 'Authenticated story review section and preparation link', passed: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Versioned stories & security gates' })).toBeVisible()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error('Mobile horizontal overflow.')
  await page.screenshot({ path: `${root}/story-reviews-mobile.png`, fullPage: true })
  results.push({ check: '390px layout without horizontal overflow', passed: true })
} catch (error) {
  results.push({ check: 'Browser execution', passed: false, error: error.message })
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(`${root}/browser.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Navigation/authentication/empty review section; populated gate form security exercised in database tests, not browser automation.', results }, null, 2))
}
console.log(JSON.stringify(results))
