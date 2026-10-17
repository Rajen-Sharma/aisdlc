import { createHash } from 'node:crypto'
import { validateSourceCapsule, type SourceCapsule } from './source-capsule'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const reject = (): never => { throw new Error('Codex candidate rejected.') }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')

/** Decode untrusted text into inert source bytes. Never write, import, or execute it.
 * The source digest and allowed paths must come from the trusted task contract.
 * This does not establish provider provenance, task approval, or verification.
 */
export function decodeCodexCandidate(text: string, source: unknown,
  contract: { sourceHash: string; allowedPaths: string[] }) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) return reject()
  const base = validateSourceCapsule(source, contract.sourceHash)
  if (!Array.isArray(contract.allowedPaths) || !contract.allowedPaths.length ||
      contract.allowedPaths.length > 32 || new Set(contract.allowedPaths).size !== contract.allowedPaths.length ||
      contract.allowedPaths.some(path => !base.files.some(file => file.path === path))) return reject()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return reject() }
  if (!exact(parsed, ['version', 'sourceHash', 'files']) || parsed.version !== 1 ||
      parsed.sourceHash !== contract.sourceHash || !Array.isArray(parsed.files) ||
      parsed.files.length < 1 || parsed.files.length > contract.allowedPaths.length) return reject()
  const changes = new Map<string, string>()
  for (const file of parsed.files) {
    if (!exact(file, ['path', 'content']) || typeof file.path !== 'string' ||
        !contract.allowedPaths.includes(file.path) || changes.has(file.path) ||
        typeof file.content !== 'string' || file.content.includes('\0') ||
        Buffer.byteLength(file.content) > 65536 || Buffer.from(file.content).toString('utf8') !== file.content) return reject()
    changes.set(file.path, file.content)
  }
  const files: SourceCapsule['files'] = base.files.map(file => {
    const replacement = changes.get(file.path)
    if (replacement === undefined) return { ...file }
    const bytes = Buffer.from(replacement, 'utf8')
    return { path: file.path, bytes: bytes.length, sha256: hash(bytes), content: bytes.toString('base64') }
  })
  const capsule: SourceCapsule = { version: 1, files, sha256: hash(JSON.stringify({ version: 1, files })) }
  if (capsule.sha256 === base.sha256) return reject()
  validateSourceCapsule(capsule, capsule.sha256)
  return { capsule, candidateHash: capsule.sha256, executionAllowed: false as const,
    retryAuthorized: false as const, providerProvenanceVerified: false as const }
}
