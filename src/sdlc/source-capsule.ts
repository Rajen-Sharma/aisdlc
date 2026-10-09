import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'

// A deliberately narrow first export format. Broader language support needs review.
const MAX_FILES = 32
const MAX_FILE_BYTES = 65536
const MAX_TOTAL_BYTES = 262144
export type SourceCapsule = {
  version: 1
  files: { path: string; bytes: number; sha256: string; content: string }[]
  sha256: string
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const fail = (): never => { throw new Error('Source capsule rejected.') }
const keys = (value: unknown, expected: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === expected.sort().join(',')

function validPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 160 || !/^src\/(?:[a-z][a-z0-9-]*\/)*[a-z][a-z0-9-]*\.mjs$/.test(value)) return false
  return !value.split('/').some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/.test(part))
}

function digest(files: SourceCapsule['files']) {
  return hash(JSON.stringify({ version: 1, files }))
}

/** The expected digest must come from a trusted task/artifact record, never the capsule itself. */
export function validateSourceCapsule(input: unknown, expectedDigest: string): SourceCapsule {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest) || !keys(input, ['version', 'files', 'sha256'])) return fail()
  if (input.version !== 1 || !Array.isArray(input.files) || input.files.length < 1 || input.files.length > MAX_FILES) return fail()
  const files: SourceCapsule['files'] = []
  let total = 0
  let previous = ''
  for (const entry of input.files) {
    if (!keys(entry, ['path', 'bytes', 'sha256', 'content']) || !validPath(entry.path) || entry.path <= previous) return fail()
    if (typeof entry.content !== 'string' || entry.content.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || !Number.isSafeInteger(entry.bytes)) return fail()
    const content = Buffer.from(entry.content, 'base64')
    if (content.toString('base64') !== entry.content || content.length !== entry.bytes || content.length > MAX_FILE_BYTES || hash(content) !== entry.sha256) return fail()
    total += content.length
    if (total > MAX_TOTAL_BYTES) return fail()
    files.push({ path: entry.path, bytes: content.length, sha256: hash(content), content: entry.content })
    previous = entry.path
  }
  const sha256 = digest(files)
  if (sha256 !== input.sha256 || sha256 !== expectedDigest) return fail()
  return { version: 1, files, sha256 }
}

/** Export explicitly selected regular files from an operator-owned, quiescent fixture checkout.
 * This is not a hostile live-filesystem sandbox: isolated execution remains a separate gate.
 */
export async function exportSourceCapsule(root: string, selected: string[]): Promise<SourceCapsule> {
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > MAX_FILES || new Set(selected).size !== selected.length || selected.some(file => !validPath(file))) return fail()
  const resolvedRoot = path.resolve(root)
  const rootStat = await lstat(resolvedRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(resolvedRoot) !== resolvedRoot) return fail()
  const files: SourceCapsule['files'] = []
  for (const relative of [...selected].sort()) {
    let current = resolvedRoot
    const parts = relative.split('/')
    for (const [index, part] of parts.entries()) {
      current = path.join(current, part)
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || await realpath(current) !== current) return fail()
      if (index < parts.length - 1 && !stat.isDirectory()) return fail()
      if (index === parts.length - 1 && (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES)) return fail()
    }
    const handle = await open(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE_BYTES) return fail()
      // Bounded reads even if a concurrent writer grows the file.
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
      let bytes = 0
      while (bytes < buffer.length) {
        const read = await handle.read(buffer, bytes, buffer.length - bytes, bytes)
        if (!read.bytesRead) break
        bytes += read.bytesRead
      }
      const after = await handle.stat()
      const final = await lstat(current)
      if (bytes > MAX_FILE_BYTES || bytes !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== final.ino || before.dev !== final.dev || final.isSymbolicLink() || final.nlink !== 1) return fail()
      const content = buffer.subarray(0, bytes)
      files.push({ path: relative, bytes, sha256: hash(content), content: content.toString('base64') })
    } finally { await handle.close() }
  }
  const capsule: SourceCapsule = { version: 1, files, sha256: digest(files) }
  return validateSourceCapsule(capsule, capsule.sha256)
}
