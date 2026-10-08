import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const sha = data => createHash('sha256').update(data).digest('hex')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const files = []
for (const filename of paths) {
  if (filename === 'docs/evidence/implementation-manifest.json') continue
  files.push({ path: filename, sha256: sha(await readFile(filename)) })
}
const buildFiles = []
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(filename)
    else buildFiles.push({ path: filename.replaceAll('\\', '/'), sha256: sha(await readFile(filename)) })
  }
}
await walk('.next/server')
await walk('.next/static')
buildFiles.sort((a, b) => a.path.localeCompare(b.path))
const manifest = {
  evidenceId: 'EVD-IMPL-001', recordedAt: new Date().toISOString(), implementationCommit: commit,
  scope: 'SP-001 local synthetic MVP; human code/outcome/MVP acceptance pending',
  buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(),
  buildInventoryHash: sha(JSON.stringify(buildFiles)),
  verification: { integration: 'docs/evidence/integration-tests.log', browser: 'docs/evidence/browser-check.json', dependencyAudit: 'docs/evidence/dependency-audit.json', build: 'docs/evidence/build.log', typecheck: 'docs/evidence/typecheck.log' },
  limitations: ['Local evidence storage; not immutable external audit storage', 'CI workflow configured but not executed remotely', 'Synthetic source only; no production acceptance'],
  files, buildFiles,
}
await writeFile('docs/evidence/implementation-manifest.json', JSON.stringify(manifest, null, 2))
console.log(`Evidence manifest created for ${commit}; ${files.length} repository files and ${buildFiles.length} built files hashed.`)
