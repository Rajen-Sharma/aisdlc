// Fixed root recovery command. It can only fence an expired, never-claimed ID.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { trustedHostFile, trustedHostHash } from './trusted-host-files.mjs'
import { boundedJsonChannel } from './bounded-json-channel.mjs'
import { fenceUnlaunchedAttempt } from './unlaunched-fence.mjs'
import { attemptEvidenceSigningBytes } from './attempt-evidence.mjs'
async function main() {
  if (process.platform !== 'linux' || process.getuid!() !== 0 || process.argv.length !== 2) throw Error('Recovery denied.')
  const base = '/opt/aisdlc-codex/guarded'
  const installed = JSON.parse((await trustedHostFile(base + '/installed-runtime.json')).toString())
  await trustedHostHash(base + '/recover-unlaunched.mjs', installed.files['recover-unlaunched.mjs'])
  const config = JSON.parse((await trustedHostFile(base + '/policy.json')).toString())
  await trustedHostHash('/opt/aisdlc-node/24.14.0/node', config.runtimeMaterial.nodeHash)
  const channel = boundedJsonChannel(process.stdin)
  try {
    const input = await channel.read(Date.now() + 10000)
    if (input.taskKey !== config.policy.taskKey || input.runtimeHash !== config.policy.runtimeHash
      || input.bootId !== config.qualifiedBootId || input.hostId !== config.hostId) throw Error('Recovery denied.')
    const cleanup = await fenceUnlaunchedAttempt(input)
    const privateKey = createPrivateKey(await trustedHostFile('/var/lib/aisdlc-guardian/signing-key.pem', { maximumBytes: 4096, privateMode: true }))
    if (createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64') !== config.guardian.publicKeyDer) throw Error('Recovery denied.')
    const observedAt = Math.floor(Date.now() / 1000)
    const record = { version: 2, kind: 'termination', keyId: config.guardian.keyId, authorityRevision: config.guardian.revision,
      taskKey: input.taskKey, attemptId: input.attemptId, reservationHash: input.reservationHash, runtimeHash: input.runtimeHash,
      hostId: input.hostId, bootId: input.bootId, unit: input.unit, observedAt, expiresAt: observedAt + 30, ...cleanup, usage: null }
    console.log(JSON.stringify({ record, signature: sign(null, attemptEvidenceSigningBytes(record), privateKey).toString('base64') }))
  } finally { channel.dispose() }
}
main().catch(() => { console.error('Unlaunched recovery denied. No launch or retry was authorized.'); process.exitCode = 1 })
