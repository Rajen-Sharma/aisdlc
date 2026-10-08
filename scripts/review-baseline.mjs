import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const output = 'docs/evidence/review-2026-10-08'
await mkdir(output, { recursive: true })
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const manifest = JSON.parse(await readFile('docs/evidence/generic-engine-manifest.json', 'utf8'))
const failures = []
for (const item of manifest.files) {
  try {
    const bytes = await readFile(item.file)
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256 || bytes.length !== item.bytes) failures.push({ file: item.file, outcome: 'hash-mismatch' })
  } catch { failures.push({ file: item.file, outcome: 'missing' }) }
}
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const brokenLinks = []
let checkedLinks = 0
for (const file of tracked.filter(x => x.endsWith('.md'))) {
  const content = await readFile(file, 'utf8')
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0]
    if (!target || /^(https?:|mailto:|app:|\/)/.test(target) || target.includes(' ')) continue
    checkedLinks++
    try { await access(path.resolve(path.dirname(file), target)) }
    catch { brokenLinks.push({ file, target }) }
  }
}
const result = { recordedAt: new Date().toISOString(), sourceCommit, manifestSourceCommit: manifest.sourceCommit, filesChecked: manifest.files.length, failures, checkedLinks, brokenLinks, scope: 'Working-file checksums and local Markdown link targets; no claim of immutable archive, digital signature or external link availability.' }
await writeFile(`${output}/baseline-integrity.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
process.exitCode = failures.length || brokenLinks.length ? 1 : 0
