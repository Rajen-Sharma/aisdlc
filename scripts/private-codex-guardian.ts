// Root-only private-host controller. Public policy is installed by the trusted
// operator after qualification. No API, native auth or personal SSH key is read.
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { boundedJsonChannel } from './bounded-json-channel.mjs'
import { trustedHostFile, trustedHostHash } from './trusted-host-files.mjs'
import { launchGuardedAttempt, nativeUnitProperties } from './systemd-attempt-guardian.mjs'
import { authenticateTurnPermit } from './turn-permit.mjs'
import { attemptEvidenceSigningBytes } from './attempt-evidence.mjs'
import { digest } from '../src/sdlc/contracts'
import { decodeCodexCandidate } from '../src/sdlc/codex-candidate'
import { validateSourceCapsule, type SourceCapsule } from '../src/sdlc/source-capsule'
import { nativeCandidateSigningBytes, type NativeCandidate } from '../src/sdlc/native-candidate'

type Configuration = {
  version: 1; hostId: string; qualifiedBootId: string; storyId: number
  policy: { taskKey: string; scopeHash: string; approvalHash: string; runtimeHash: string; keyId: string; authorityRevision: number;
    publicKeyDer: string; nativeRuntimeQualified: true; expiresAt: number }
  task: { projectKey: string; contextHash: string; storyKey: string; revision: number; supersedes: number | null; feedback?: number;
    title: string; contract: { sourceHash: string; checkPolicyHash: string; allowedPaths: string[]; acceptanceCriteria: string[] } }
  source: SourceCapsule
  runtimeMaterial: { nodeHash: string; codexHash: string; configHash: string; brokerHash: string; guardianHash: string; profileHash: string; guardianKeyFingerprint: string; feedbackHash: string | null }
  feedbackContext?: { id: number; feedbackHash: string; record: { storyId: number; scopeHash: string; artifactHash: string; content: string; actor: number } }
  guardian: { keyId: string; revision: number; publicKeyDer: string }
}
const exact = (value: unknown, fields: string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',')
const write = (value: unknown) => new Promise<void>((resolve, reject) => process.stdout.write(JSON.stringify(value) + '\n', error => error ? reject(error) : resolve()))

async function main() {
  if (process.platform !== 'linux' || process.getuid!() !== 0 || process.argv.length !== 2) throw new Error()
  const config = JSON.parse((await trustedHostFile('/opt/aisdlc-codex/guarded/policy.json')).toString('utf8')) as Configuration
  const window = JSON.parse((await trustedHostFile('/opt/aisdlc-codex/trial-window.json', { maximumBytes: 4096 })).toString('utf8'))
  const now = Math.floor(Date.now() / 1000)
  if (config.version !== 1 || config.policy.nativeRuntimeQualified !== true || config.policy.expiresAt <= now
    || window.mode !== 'protected-trial' || window.additionalChargesAllowed !== false || !Number.isSafeInteger(window.issuedAt)
    || !Number.isSafeInteger(window.expiresAt) || window.issuedAt > now || window.expiresAt <= now || window.expiresAt - window.issuedAt > 172800
    || config.policy.expiresAt > window.expiresAt || config.policy.scopeHash !== digest(config.task)
    || config.policy.taskKey !== digest({ projectKey: config.task.projectKey, storyKey: config.task.storyKey })
    || config.policy.runtimeHash !== digest(config.runtimeMaterial) || config.runtimeMaterial.profileHash !== digest(nativeUnitProperties)
    || !Number.isSafeInteger(config.storyId) || config.storyId < 1) throw new Error()
  validateSourceCapsule(config.source, config.task.contract.sourceHash)
  if (config.runtimeMaterial.feedbackHash !== (config.feedbackContext?.feedbackHash ?? null)
    || (!!config.task.feedback !== !!config.feedbackContext) || (config.feedbackContext && (config.task.feedback !== config.feedbackContext.id
      || config.task.supersedes !== config.feedbackContext.record.storyId || digest(config.feedbackContext.record) !== config.feedbackContext.feedbackHash))) throw new Error()
  for (const [file, hash] of [
    ['/opt/aisdlc-node/24.14.0/node', config.runtimeMaterial.nodeHash], ['/opt/aisdlc-codex/0.155.1/codex', config.runtimeMaterial.codexHash],
    ['/var/lib/aisdlc-codex-broker/.codex/config.toml', config.runtimeMaterial.configHash],
    ['/opt/aisdlc-codex/guarded/broker.mjs', config.runtimeMaterial.brokerHash], ['/opt/aisdlc-codex/guarded/guardian.mjs', config.runtimeMaterial.guardianHash],
  ]) await trustedHostHash(file, hash)
  if (config.hostId !== (await readFile('/sys/class/dmi/id/product_uuid', 'utf8')).trim().toLowerCase()) throw new Error()
  const bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  if (bootId !== config.qualifiedBootId) throw new Error()
  const privateKey = createPrivateKey(await trustedHostFile('/var/lib/aisdlc-guardian/signing-key.pem', { maximumBytes: 4096, privateMode: true }))
  const publicDer = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicDer.toString('base64') !== config.guardian.publicKeyDer
    || createHash('sha256').update(publicDer).digest('hex') !== config.runtimeMaterial.guardianKeyFingerprint) throw new Error()
  const policy = { ...config.policy, publicKey: createPublicKey({ key: Buffer.from(config.policy.publicKeyDer, 'base64'), format: 'der', type: 'spki' }) }
  const challengeNonce = randomUUID(), controller = boundedJsonChannel(process.stdin)
  await write({ kind: 'hello', hostId: config.hostId, bootId, runtimeHash: policy.runtimeHash, challengeNonce })
  try {
    const launch = await controller.read(Date.now() + 15000)
    if (!exact(launch, ['kind', 'permit']) || launch.kind !== 'launch') throw new Error()
    const context = { policy, hostId: config.hostId, bootId, kind: 'launch', challengeNonce }
    const lease = authenticateTurnPermit(launch.permit, context, Math.floor(Date.now() / 1000))
    const work = await launchGuardedAttempt(launch.permit, context)
    if (!work) throw new Error()
    let result: Record<string, unknown> | undefined, admission: ReturnType<typeof authenticateTurnPermit> | undefined
    let cleanup
    try {
      const prompt = `Implement the approved task as JSON source replacements only. Use no tools or external dependencies.\n${JSON.stringify({
        title: config.task.title, acceptanceCriteria: config.task.contract.acceptanceCriteria, sourceHash: config.source.sha256,
        ...(config.feedbackContext ? { humanFeedback: config.feedbackContext.record.content, reviewedArtifactHash: config.feedbackContext.record.artifactHash } : {}),
        files: config.source.files.map(file => ({ path: file.path, content: Buffer.from(file.content, 'base64').toString('utf8') })),
      })}`
      work.send({ kind: 'task', unit: lease.unit, prompt, sourceHash: config.source.sha256, allowedPaths: config.task.contract.allowedPaths, deadlineAt: lease.deadline * 1000 })
      let event = await work.read(lease.deadline * 1000)
      if (event.kind === 'admission-challenge') {
        if (!exact(event, ['kind', 'threadId', 'challengeNonce'])) throw new Error()
        await write({ ...event, attemptId: lease.attemptId })
        const response = await controller.read(Math.min(lease.deadline * 1000, Date.now() + 15000))
        if (!exact(response, ['kind', 'permit']) || response.kind !== 'admission') throw new Error()
        admission = authenticateTurnPermit(response.permit, { policy, hostId: config.hostId, bootId, kind: 'admission',
          challengeNonce: event.challengeNonce as string, threadId: event.threadId as string, attemptId: lease.attemptId }, Math.floor(Date.now() / 1000))
        if (admission.reservationHash !== lease.reservationHash || admission.deadline !== lease.deadline || admission.attempt !== lease.attempt) throw new Error()
        work.send({ kind: 'admission', approved: true })
        event = await work.read(lease.deadline * 1000)
      }
      if (!exact(event, ['kind', 'result']) || event.kind !== 'result' || !event.result || typeof event.result !== 'object' || Array.isArray(event.result)) throw new Error()
      result = event.result as Record<string, unknown>
      if (result.completed === true && (!admission || result.turnSent !== true || result.threadId !== admission.threadId)) throw new Error()
    } finally { cleanup = await work.stop() }
    const observedAt = Math.floor(Date.now() / 1000)
    const termination = { version: 2, kind: 'termination', keyId: config.guardian.keyId, authorityRevision: config.guardian.revision,
      taskKey: policy.taskKey, attemptId: lease.attemptId, reservationHash: lease.reservationHash, runtimeHash: policy.runtimeHash,
      hostId: config.hostId, bootId, unit: lease.unit, observedAt, expiresAt: observedAt + 30, ...cleanup, usage: result?.usage ?? null }
    const terminationProof = { record: termination, signature: sign(null, attemptEvidenceSigningBytes(termination), privateKey).toString('base64') }
    let candidate = null, provenance = null
    if (result?.completed === true && admission) {
      try { candidate = decodeCodexCandidate(result.candidateText as string, config.source, config.task.contract).capsule }
      catch { /* Invalid candidate data is a failed attempt with independently proven cleanup. */ }
    }
    if (candidate && result && admission) {
      const record: NativeCandidate = { version: 1, keyId: config.guardian.keyId, authorityRevision: config.guardian.revision,
        taskKey: policy.taskKey, attemptId: lease.attemptId, admissionId: admission.admissionId, challengeNonce: admission.challengeNonce,
        reservationHash: lease.reservationHash, runtimeHash: policy.runtimeHash, hostId: config.hostId, bootId, unit: lease.unit,
        sourceHash: config.source.sha256, candidateHash: candidate.sha256, threadId: admission.threadId, turnId: result.turnId as string,
        observedAt, provider: 'openai', authentication: 'chatgpt', model: 'gpt-6-sol', maxTurns: 1, usage: result.usage as NativeCandidate['usage'] }
      provenance = { record, signature: sign(null, nativeCandidateSigningBytes(record), privateKey).toString('base64') }
    }
    await write({ kind: 'finished', attemptId: lease.attemptId, candidate, provenance, terminationProof })
  } finally { controller.dispose() }
}
process.stdout.on('error', () => { process.exitCode = 1 })
main().catch(async () => {
  process.exitCode = 1
  try { await write({ kind: 'uncertain', candidate: null, retryAuthorized: false }) } catch { /* The external intent remains spent. */ }
})
