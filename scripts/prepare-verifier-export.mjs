// Export trusted verifier code without installing third-party packages on its host.
// Candidate source is copied as inert bytes; it is never imported or evaluated.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.match(revision, /^[a-f0-9]{40}$/)
const root = path.resolve('.local/azure-verifier-export')
await mkdir(root, { recursive: true })
assert.equal(await realpath(root), root)
const sources = [
  'src/sdlc/contracts.ts', 'src/sdlc/source-capsule.ts', 'src/sdlc/codex-candidate.ts', 'src/sdlc/task-binding.ts',
  'scripts/taskboard-verifier-qualification.mjs', 'scripts/taskboard-isolated-runner.mjs',
  'checks/taskboard-filter-policy.json', 'fixtures/taskboard/src/filter-tasks.mjs',
]
const entries = []
const hash = value => createHash('sha256').update(value).digest('hex')
for (const source of sources) {
  const original = execFileSync('git', ['show', `${revision}:${source}`], { maxBuffer: 262144 })
  const target = source.replace(/\.ts$/, '.mjs')
  let bytes = original
  if (source.endsWith('.ts')) {
    let compiled = stripTypeScriptTypes(original.toString('utf8'), { mode: 'strip' })
    compiled = compiled.replace(/from '(\.\/[^']+)'/g, (_, name) => `from '${name}.mjs'`)
    bytes = Buffer.from(compiled)
  } else if (source === 'scripts/taskboard-verifier-qualification.mjs') {
    bytes = Buffer.from(original.toString('utf8').replace(/from '(\.\.\/src\/sdlc\/[^']+)\.ts'/g, "from '$1.mjs'"))
  }
  const destination = path.join(root, target)
  await mkdir(path.dirname(destination), { recursive: true })
  assert.equal(await realpath(path.dirname(destination)), path.dirname(destination))
  try { const prior = await lstat(destination); assert.ok(prior.isFile() && !prior.isSymbolicLink()) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await writeFile(destination, bytes)
  entries.push({ source, path: target, sourceBytes: original.length, sourceHash: hash(original), bytes: bytes.length, sha256: hash(bytes) })
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, sourceRevision: revision,
  transformation: 'Node 24 stripTypeScriptTypes plus fixed relative module extension rewrites; exact Git blobs otherwise.',
  candidateExecuted: false, files: entries }, null, 2) + '\n')
console.log(JSON.stringify({ sourceRevision: revision, trustedFilesExported: entries.length, candidateExecuted: false }))
