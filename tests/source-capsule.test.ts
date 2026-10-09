import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, link, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exportSourceCapsule, validateSourceCapsule } from '../src/sdlc/source-capsule.js'

async function removeFixture(target: string) {
  const resolved = path.resolve(target)
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()))
  assert.match(path.basename(resolved), /^sdlc-(?:capsule|outside)-/)
  await rm(resolved, { recursive: true, force: true })
}

test('source export is deterministic and excludes unselected host files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdlc-capsule-'))
  try {
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/a.mjs'), 'export const value = 1\n')
    await writeFile(path.join(root, 'src/b.mjs'), 'export const value = 2\n')
    await writeFile(path.join(root, '.env'), 'SYNTHETIC_CANARY=must-not-export')
    const first = await exportSourceCapsule(root, ['src/b.mjs', 'src/a.mjs'])
    const second = await exportSourceCapsule(root, ['src/a.mjs', 'src/b.mjs'])
    assert.deepEqual(first, second)
    assert.equal(JSON.stringify(first).includes('must-not-export'), false)
    assert.deepEqual(validateSourceCapsule(JSON.parse(JSON.stringify(first)), first.sha256), first)
    for (const bad of ['../outside.mjs', 'src/.env', 'src/../a.mjs', 'src/A.mjs', 'src/con.mjs', 'src/a.mjs:secret', 'src\\a.mjs', '/src/a.mjs', 'src/package.json']) {
      await assert.rejects(exportSourceCapsule(root, [bad]))
    }
    await assert.rejects(exportSourceCapsule(root, ['src/a.mjs', 'src/a.mjs']))
    await link(path.join(root, 'src/a.mjs'), path.join(root, 'src/alias.mjs'))
    await assert.rejects(exportSourceCapsule(root, ['src/alias.mjs']))
  } finally { await removeFixture(root) }
})

test('capsule validation denies tampering, ambiguous encoding and bounds violations', async () => {
  const capsule = await exportSourceCapsule('fixtures/taskboard', ['src/filter-tasks.mjs'])
  const mutate = (change: (copy: any) => void) => {
    const copy = structuredClone(capsule)
    change(copy)
    assert.throws(() => validateSourceCapsule(copy, capsule.sha256))
  }
  mutate(copy => { copy.files[0].content = Buffer.from('process.exit(0)').toString('base64') })
  mutate(copy => { copy.files[0].content += '\n' })
  mutate(copy => { copy.files[0].bytes++ })
  mutate(copy => { copy.files[0].path = 'checks/trusted.mjs' })
  mutate(copy => { copy.files.push(copy.files[0]) })
  mutate(copy => { copy.files[0].extra = true })
  mutate(copy => { copy.files[0].content = 'A'.repeat(100000) })
  mutate(copy => { copy.version = 2 })
  mutate(copy => { copy.extra = true })
  assert.throws(() => validateSourceCapsule(capsule, '0'.repeat(64)))
})

test('export denies directory links, oversized files and aggregate overflow', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdlc-capsule-'))
  const outside = await mkdtemp(path.join(tmpdir(), 'sdlc-outside-'))
  try {
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(outside, 'escape.mjs'), 'synthetic outside data')
    await symlink(outside, path.join(root, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(exportSourceCapsule(root, ['src/linked/escape.mjs']))
    await writeFile(path.join(root, 'src/large.mjs'), Buffer.alloc(65537))
    await assert.rejects(exportSourceCapsule(root, ['src/large.mjs']))
    const paths = []
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const relative = `src/${name}.mjs`
      await writeFile(path.join(root, relative), Buffer.alloc(65536))
      paths.push(relative)
    }
    await assert.rejects(exportSourceCapsule(root, paths))
    await assert.rejects(exportSourceCapsule(root, Array.from({ length: 33 }, (_, index) => `src/file-${index}.mjs`)))
  } finally {
    // Remove the junction itself before cleaning the independently owned target.
    await removeFixture(root)
    await removeFixture(outside)
  }
})
