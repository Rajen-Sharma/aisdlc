import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
const implementationCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const files = execFileSync('git', ['show', '--format=', '--name-only', implementationCommit], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
const root = 'docs/evidence/build-eng-002'
files.push(...(await readdir(root)).filter(name => name !== 'manifest.json').map(name => `${root}/${name}`))
const hashes = []
for (const file of [...new Set(files)].sort()) hashes.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') })
const data = { implementationCommit, createdAt: new Date().toISOString(), hashBasis: 'Working filesystem bytes; Git CRLF normalization may differ.', buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), results: { integrationLeafScenarios: 9, nodeReportedResults: 10, browserChecks: 3, optimizedBuild: 'passed', remoteGithubCI: 'not-run', linuxIsolation: 'not-run', realAICoding: 'not-run', humanCodeSecurityAcceptance: 'pending', productionReady: false }, files: hashes }
await writeFile(`${root}/manifest.json`, JSON.stringify(data, null, 2))
console.log(`Checkpoint manifest: ${hashes.length} files, implementation ${implementationCommit}`)
