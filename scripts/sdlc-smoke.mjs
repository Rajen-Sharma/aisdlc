import { chromium, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser = await chromium.launch()
const checks = []
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3000/sdlc', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'From idea to reviewed release.' })).toBeVisible()
  const stageButtons = page.locator('.stage-list button')
  assert.equal(await stageButtons.count(), 10)
  let templateCount = 0
  for (let stage = 0; stage < 10; stage++) {
    await stageButtons.nth(stage).click()
    const templates = page.locator('.template-list button')
    for (let item = 0; item < await templates.count(); item++) {
      await templates.nth(item).click()
      await expect(page.locator('.template-content')).toContainText('#')
      await page.getByRole('button', { name: 'Project example', exact: true }).click()
      await expect(page.locator('.example-warning')).toContainText('not an executed result')
      await page.getByRole('button', { name: 'Blank template', exact: true }).click()
      templateCount++
    }
  }
  assert.equal(templateCount, 14)
  checks.push({ check: 'Stage/template navigation', result: 'pass', stages: 10, templates: 14 })
  await stageButtons.nth(2).click()
  await expect(page.locator('.gate-label')).toHaveText('Human security approval')
  const content = await page.locator('.template-content').innerText()
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.locator('.copy-notice')).toContainText('Copied')
  const normalise = value => value.replaceAll('\r\n', '\n')
  assert.equal(normalise(await page.evaluate(() => navigator.clipboard.readText())), normalise(content))
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .md' }).click()
  const download = await downloading
  assert.equal(download.suggestedFilename(), 'design-security-review.md')
  assert.equal(normalise(await readFile(await download.path(), 'utf8')), normalise(content))
  checks.push({ check: 'Copy/download preserve selected template', result: 'pass' })
  await page.screenshot({ path: 'docs/evidence/generic-sdlc-guide.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'docs/evidence/generic-sdlc-guide-mobile.png', fullPage: true })
  checks.push({ check: 'Mobile layout has no horizontal overflow', result: 'pass' })
  await page.goto('http://127.0.0.1:3000')
  await page.getByRole('link', { name: 'Explore AI SDLC & templates' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:3000/sdlc')
  checks.push({ check: 'Homepage entry works at mobile width', result: 'pass' })
} catch (error) {
  checks.push({ check: 'Guide verification', result: 'fail', message: error.message }); process.exitCode = 1
} finally {
  await browser.close()
  await writeFile('docs/evidence/generic-sdlc-guide-check.json', JSON.stringify({ recordedAt: new Date().toISOString(), checks }, null, 2))
  console.log(JSON.stringify(checks, null, 2))
}
