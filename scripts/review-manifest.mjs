import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const target = 'docs/evidence/review-2026-10-08/manifest.json'
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(file => file && file !== target)
const records = []
for (const file of files) {
  const bytes = await readFile(file)
  records.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const baseline = JSON.parse(await readFile('docs/evidence/review-2026-10-08/baseline-integrity.json', 'utf8'))
await writeFile(target, JSON.stringify({ recordedAt: new Date().toISOString(), sourceCommit, reviewedBaselineCommit: baseline.sourceCommit, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), definition: 'Tracked working-file bytes, including local line endings; review artifact index, not immutable storage or human acceptance.', files: records }, null, 2))
console.log(`Review manifest: ${records.length} files; source ${sourceCommit}.`)
