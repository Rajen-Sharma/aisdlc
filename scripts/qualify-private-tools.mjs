// Fixed service-account qualification. No model or native-auth access. Named
// reference/negative controls remain inert test data until isolated verification.
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { trustedHostFile } from './trusted-host-files.mjs'
import { qualifyNativeDelivery } from './qualify-native-delivery.mjs'
import { decodeCodexCandidate } from '../src/sdlc/codex-candidate'
import { validateSourceCapsule } from '../src/sdlc/source-capsule'
import { verifierImage } from '../src/sdlc/task-binding'
import { digest } from '../src/sdlc/contracts'

assert.equal(process.platform, 'linux'); assert.notEqual(process.getuid(), 0)
assert.equal(process.execPath, '/opt/aisdlc-node/24.14.0/node'); assert.equal(process.argv.length, 2)
const base = '/opt/aisdlc-authority'
const installed = JSON.parse((await trustedHostFile(`${base}/installed-runtime.json`)).toString())
assert.equal(installed.role, 'tools')
const input = JSON.parse((await trustedHostFile(`${base}/qualification-input.json`, { maximumBytes: 131072 })).toString())
const source = validateSourceCapsule(input.source, input.sourceHash)
const policyText = (await trustedHostFile(`${base}/taskboard-policy.json`, { maximumBytes: 65536 })).toString('utf8')
const runnerSource = (await trustedHostFile(`${base}/runner.mjs`, { maximumBytes: 65536 })).toString('utf8')
const hash = value => createHash('sha256').update(value).digest('hex')
assert.equal(hash(policyText), input.checkPolicyHash); assert.equal(hash(runnerSource), installed.files['runner.mjs'])
// Required by the reusable qualification harness. This process was selected by
// the trusted operator; the marker never grants private native execution.
process.env.AISDLC_QUALIFICATION_HOST = 'azure-tools-trial'
const controls = []
for (const [label, content, shouldPass] of [
  ['reference-control', 'export function filterTasks(tasks,status){if(!["todo","doing","done"].includes(status))throw new TypeError("status");return tasks.filter(task=>task.status===status)}', true],
  ['wrong-empty', 'export function filterTasks(){return []}', false],
]) {
  const decoded = decodeCodexCandidate(JSON.stringify({ version: 1, sourceHash: source.sha256,
    files: [{ path: 'src/filter-tasks.mjs', content }] }), source, { sourceHash: source.sha256, allowedPaths: ['src/filter-tasks.mjs'] })
  controls.push({ label, ...await qualifyNativeDelivery({ source, candidate: decoded.capsule, policyText, runnerSource,
    verifierHash: hash(runnerSource), image: verifierImage, shouldPass }) })
}
const hashes = {}
for (const [name, file] of Object.entries({ nodeHash: '/opt/aisdlc-node/24.14.0/node', authorityBundleHash: `${base}/native-authority.mjs`,
  qualificationBundleHash: `${base}/qualify-tools.mjs`, protocolBundleHash: `${base}/qualify-delivery.mjs` })) {
  const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); hashes[name] = hash.digest('hex')
}
assert.equal(hashes.authorityBundleHash, installed.files['native-authority.mjs'])
assert.equal(hashes.qualificationBundleHash, installed.files['qualify-tools.mjs'])
assert.equal(hashes.protocolBundleHash, installed.files['qualify-delivery.mjs'])
const key = createPrivateKey(await trustedHostFile('/var/lib/aisdlc-authority/signing-key.pem', {
  maximumBytes: 4096, privateMode: true, ownerUid: process.getuid() }))
const publicKeyDer = createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64')
assert.equal((await trustedHostFile(`${base}/root-public-key.der`)).toString('base64'), publicKeyDer)
const record = { version: 1, kind: 'private-tools-verifier', observedAt: Math.floor(Date.now() / 1000),
  bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  manifestHash: installed.manifestHash, hashes, publicKeyDer, sourceHash: source.sha256, policyHash: hash(policyText),
  runnerHash: hash(runnerSource), image: verifierImage, controls, modelCalls: 0,
  nativeAuthenticationUsedForMetadata: false, nativeAuthenticationExported: false, executionAllowed: false }
console.log(JSON.stringify({ record, signature: sign(null, Buffer.from('ai-sdlc/private-tools-verifier/v1\n' + digest(record)), key).toString('base64') }))
