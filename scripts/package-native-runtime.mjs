// Local packaging only: no login data, deployment, signing keys or execution policy.
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const root = path.resolve('.local/native-runtime')
await mkdir(root, { recursive: true })
const directory = await mkdtemp(path.join(root, 'package-'))
const entries = {
  'guardian.mjs': 'scripts/private-codex-guardian.ts',
  'guardian-engine.mjs': 'scripts/systemd-attempt-guardian.mjs',
  'broker.mjs': 'scripts/private-codex-broker.mjs',
  'verifier.mjs': 'src/sdlc/taskboard-verifier.ts',
  'authority.mjs': 'scripts/private-native-authority.ts',
  'qualify-host.mjs': 'scripts/qualify-private-native-host.mjs',
  'qualify-delivery.mjs': 'scripts/qualify-native-delivery.mjs',
  'qualify-tools.mjs': 'scripts/qualify-private-tools.mjs',
}
const sources = new Set(), files = []
for (const [name, entry] of Object.entries(entries)) {
  const result = await build({ entryPoints: [entry], outfile: path.join(directory, name), bundle: true,
    platform: 'node', format: 'esm', target: 'node24.14', sourcemap: false, metafile: true, logLevel: 'silent' })
  for (const source of Object.keys(result.metafile.inputs)) {
    if (!/^(?:scripts|src\/sdlc)\/[a-z0-9/-]+\.(?:ts|mjs)$/.test(source)) throw new Error('Unexpected runtime dependency; package rejected.')
    sources.add(source)
  }
  const bytes = await readFile(path.join(directory, name))
  files.push({ name, bytes: bytes.length, sha256: hash(bytes) })
}
for (const [name, source] of [
  ['runner.mjs', 'scripts/taskboard-isolated-runner.mjs'],
  ['prepare-client.sh', 'scripts/prepare-private-codex-client.sh'],
  ['prepare-authority.sh', 'scripts/prepare-private-authority.sh'],
  ['metadata-preflight.py', 'scripts/private-codex-preflight.py'],
  ['install-runtime.py', 'scripts/install-native-runtime.py'],
]) {
  // Explicit public source allowlist; no recursive repository or home-directory copy.
  // Linux scripts/runner are packaged with stable LF bytes on every checkout.
  // Source hashes below still retain the actual local input bytes separately.
  const bytes = Buffer.from((await readFile(source, 'utf8')).replaceAll('\r\n', '\n'))
  await writeFile(path.join(directory, name), bytes, { flag: 'wx' })
  sources.add(source)
  files.push({ name, bytes: bytes.length, sha256: hash(bytes) })
}
const sourceFiles = await Promise.all([...sources].sort().map(async file => ({ file, sha256: hash(await readFile(file)) })))
const manifest = { version: 1, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  sourceFiles, files, node: '24.14.0', codex: '0.155.1', model: 'gpt-6-sol',
  deployed: false, nativeRuntimeQualified: false, executionAllowed: false, realModelCalls: 0 }
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ directory, files: files.length, sourceFiles: sourceFiles.length, manifestHash: hash(await readFile(path.join(directory, 'manifest.json'))),
  executionAllowed: false, nativeRuntimeQualified: false }))
