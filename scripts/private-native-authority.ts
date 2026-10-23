// Fixed private SSH/sudo command, never a public server. The trusted controller
// attests a current eligibility snapshot while holding the story lock. No caller
// chooses a key, ledger account, verifier, command, policy file or callback.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { boundedJsonChannel } from './bounded-json-channel.mjs'
import { trustedHostFile, trustedHostHash } from './trusted-host-files.mjs'
import { AzureAuthorityLedger } from './azure-authority-ledger.mjs'
import { authorityStorageToken } from './azure-authority-identity.mjs'
import { AttemptAuthority } from './authority-attempts.mjs'
import { AttemptEvidenceVerifier } from './attempt-evidence.mjs'
import { TurnPermitIssuer } from './turn-permit.mjs'
import { NativeDeliveryAuthority, type NativeDeliveryConfiguration } from '../src/sdlc/native-delivery-authority'
import { authenticateDeliveryArtifact } from '../src/sdlc/delivery-artifact'
import { digest } from '../src/sdlc/contracts'

const fail = (): never => { throw new Error('Private authority rejected.') }
const now = () => Math.floor(Date.now() / 1000)
const write = (value: unknown) => new Promise<void>((resolve, reject) => process.stdout.write(JSON.stringify(value) + '\n', error => error ? reject(error) : resolve()))
type RawConfiguration = {
  version: 1; nativeRuntimeQualified: true; issuedAt: number; expiresAt: number
  authorityBundleHash: string; nodeHash: string; guardianValidFrom: number
  delivery: Omit<NativeDeliveryConfiguration, 'trust' | 'guardian' | 'policyText' | 'runnerSource'> & {
    trust: Omit<NativeDeliveryConfiguration['trust'], 'publicKey'> & { publicKeyDer: string }
    guardian: Omit<NativeDeliveryConfiguration['guardian'], 'publicKey'>
  }
}
async function main() {
  if (process.platform !== 'linux' || process.getuid!() === 0 || process.argv.length !== 2) fail()
  const raw = JSON.parse((await trustedHostFile('/opt/aisdlc-authority/native-policy.json')).toString('utf8')) as RawConfiguration
  if (raw.version !== 1 || raw.nativeRuntimeQualified !== true || raw.delivery.trust.nativeRuntimeQualified !== true
    || !Number.isSafeInteger(raw.issuedAt) || !Number.isSafeInteger(raw.expiresAt) || !Number.isSafeInteger(raw.guardianValidFrom)
    || raw.guardianValidFrom < 1 || raw.guardianValidFrom > now()
    || raw.issuedAt > now() || raw.expiresAt <= raw.issuedAt || raw.expiresAt - raw.issuedAt > 172800 || raw.delivery.trust.expiresAt > raw.expiresAt) fail()
  await trustedHostHash('/opt/aisdlc-authority/native-authority.mjs', raw.authorityBundleHash)
  await trustedHostHash('/opt/aisdlc-node/24.14.0/node', raw.nodeHash)
  const privateKey = createPrivateKey(await trustedHostFile('/var/lib/aisdlc-authority/signing-key.pem', { maximumBytes: 4096, privateMode: true, ownerUid: process.getuid!() }))
  const publicKey = createPublicKey(privateKey)
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.export({ format: 'der', type: 'spki' }).toString('base64') !== raw.delivery.trust.publicKeyDer) fail()
  const configuration: NativeDeliveryConfiguration = { ...raw.delivery, trust: { ...raw.delivery.trust, publicKey },
    guardian: { ...raw.delivery.guardian, publicKey: createPublicKey({ key: Buffer.from(raw.delivery.guardian.publicKeyDer, 'base64'), format: 'der', type: 'spki' }) },
    policyText: (await trustedHostFile('/opt/aisdlc-authority/taskboard-policy.json', { maximumBytes: 65536 })).toString('utf8'),
    runnerSource: (await trustedHostFile('/opt/aisdlc-authority/runner.mjs', { maximumBytes: 65536 })).toString('utf8'),
  }
  const channel = boundedJsonChannel(process.stdin)
  try {
    const request = await channel.read(Date.now() + 10000)
    if (!request || Object.keys(request).sort().join(',') !== 'action,eligibility,input' || typeof request.action !== 'string') fail()
    const permitted = ['inspect', 'register', 'revise', 'begin', 'launch', 'admit', 'finish', 'verify', 'head', 'repair', 'revoke', 'settle-cleanup']
    if (!permitted.includes(request.action) || (now() >= raw.expiresAt && !['inspect', 'revoke', 'settle-cleanup'].includes(request.action))) fail()
    const signRecord = async (bytes: Uint8Array) => sign(null, bytes, privateKey).toString('base64')
    const authorizeCurrent = async () => {
      // SSH/sudo is a control-plane trust boundary. This is not an approval API:
      // only the qualified controller may invoke it under its database story lock.
      const e = request.eligibility as { observedAt: number; snapshotHash: string; record: Record<string, any> } | null
      const r = e?.record
      return !!e && !!r && Number.isSafeInteger(e.observedAt) && now() >= e.observedAt && now() - e.observedAt <= 15
        && digest(r) === e.snapshotHash && r.version === 1 && r.storyId === configuration.storyId
        && r.taskKey === configuration.taskKey && r.scopeHash === configuration.scopeHash && r.approvalHash === configuration.approvalHash
        && digest(r.approvalGates) === configuration.approvalHash && r.sourceHash === configuration.contract.sourceHash
        && r.checkPolicyHash === configuration.contract.checkPolicyHash && r.maxAttempts === 3 && r.subscriptionOnly === true
        && r.additionalChargesAllowed === false && r.executionAllowed === false && now() < raw.expiresAt
    }
    const ledger = new AzureAuthorityLedger({ accountName: 'aisdlctrialb7c13fa8', publicKey, token: () => authorityStorageToken() })
    let attempts: AttemptAuthority
    const proof = new AttemptEvidenceVerifier({ resolveCurrent: async ({ kind, runtimeHash }: { kind: string; runtimeHash: string }) => {
      if (runtimeHash !== configuration.trust.runtimeHash) return null
      const inspected = await attempts.inspect(configuration.taskKey)
      if (!inspected.task || (kind !== 'termination' && inspected.task.revoked)) return null
      return { kind, runtimeHash, keyId: kind === 'termination' ? configuration.guardian.keyId : configuration.trust.keyId,
        revision: kind === 'termination' ? configuration.guardian.revision : configuration.trust.authorityRevision,
        publicKey: kind === 'termination' ? configuration.guardian.publicKey : publicKey,
        validFrom: raw.guardianValidFrom, validUntil: raw.expiresAt + 300,
        verifierHash: configuration.trust.verifierHash, qualificationHash: configuration.trust.qualificationHash, image: configuration.trust.image }
    } })
    attempts = new AttemptAuthority({ ledger, signRecord, authorizeCurrent,
      verifyEvidence: async (bytes: Uint8Array, context: any) => {
        if (context.action !== 'delivery') return proof.verify(bytes, context)
        try {
          const artifact = JSON.parse(Buffer.from(bytes).toString('utf8'))
          const checked = authenticateDeliveryArtifact(artifact, configuration.trust, now(), { storyId: configuration.storyId,
            taskKey: configuration.taskKey, scopeHash: configuration.scopeHash, approvalHash: configuration.approvalHash,
            sourceHash: configuration.contract.sourceHash, checkPolicyHash: configuration.contract.checkPolicyHash,
            allowedPaths: configuration.contract.allowedPaths, criteriaTotal: configuration.contract.acceptanceCriteria.length })
          return checked.artifactHash === context.payload.artifactHash
        } catch { return false }
      } })
    const issuer = new TurnPermitIssuer({ authority: attempts, signPermit: signRecord, authorizeCurrent,
      resolveQualified: async () => ({ ...configuration.trust, nativeRuntimeQualified: raw.nativeRuntimeQualified && now() < raw.expiresAt }) })
    const delivery = new NativeDeliveryAuthority({ attempts, proofVerifier: proof, signRecord, configuration })
    const input = request.input as any
    let result
    switch (request.action) {
      case 'inspect': result = await attempts.inspect(configuration.taskKey); break
      case 'register': {
        if (!await authorizeCurrent()) fail()
        const existing = await attempts.inspect(configuration.taskKey)
        if (existing.task) {
          if (existing.task.policy.scopeHash !== configuration.scopeHash || existing.task.policy.approvalHash !== configuration.approvalHash
            || existing.task.policy.runtimeHash !== configuration.trust.runtimeHash || existing.task.revoked) fail()
          result = existing
        } else result = await attempts.register({ taskKey: configuration.taskKey, scopeHash: configuration.scopeHash, approvalHash: configuration.approvalHash,
          runtimeHash: configuration.trust.runtimeHash, expiresAt: Math.min(raw.expiresAt, now() + 86400),
          maxAttempts: 3, model: 'gpt-6-sol', maxTurnsPerAttempt: 1, subscriptionOnly: true, additionalChargesAllowed: false })
        break
      }
      case 'begin': {
        const current = await attempts.inspect(configuration.taskKey)
        if (!current.task) fail()
        result = await attempts.begin({ taskKey: configuration.taskKey, registrationId: current.task.registrationId,
          attempt: current.task.attempts.length + 1, reservationHash: input.reservationHash, hostId: input.hostId, bootId: input.bootId,
          deadline: Math.min(now() + 120, current.task.policy.expiresAt, raw.expiresAt) }); break
      }
      case 'revise': {
        if (!await authorizeCurrent()) fail()
        const current = await attempts.inspect(configuration.taskKey), r = request.eligibility?.record
        if (!current.task?.revoked || !r || !Number.isSafeInteger(r.supersedes) || r.supersedes < 1
          || typeof r.feedbackHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.feedbackHash)) fail()
        result = await attempts.revise({ taskKey: configuration.taskKey, previousRegistrationId: current.task.registrationId,
          feedbackHash: r.feedbackHash, policy: { taskKey: configuration.taskKey, scopeHash: configuration.scopeHash,
            approvalHash: configuration.approvalHash, runtimeHash: configuration.trust.runtimeHash,
            expiresAt: Math.min(raw.expiresAt, now() + 86400), maxAttempts: 3, model: 'gpt-6-sol', maxTurnsPerAttempt: 1,
            subscriptionOnly: true, additionalChargesAllowed: false } }); break
      }
      case 'launch': result = await issuer.launch({ ...input, taskKey: configuration.taskKey }); break
      case 'admit': result = await issuer.admit({ ...input, taskKey: configuration.taskKey }); break
      case 'finish': result = await delivery.finish(input); break
      case 'verify': result = await delivery.verify(input); break
      case 'head': if (!await authorizeCurrent()) fail(); result = await delivery.head(); break
      case 'repair': {
        const current = await attempts.inspect(configuration.taskKey), attempt = current.task?.attempts.at(-1)
        if (!attempt?.verification || attempt.verification.verdict !== 'fail' || attempt.attemptId !== input.attemptId) fail()
        const retainedProof = Buffer.from(JSON.stringify(attempt.verification.evidence.proof))
        result = await attempts.repair({ taskKey: configuration.taskKey, attemptId: attempt.attemptId, candidateHash: attempt.candidateHash,
          verifierEvidenceHash: attempt.verification.verificationHash }, retainedProof); break
      }
      case 'revoke': result = await attempts.revoke({ taskKey: configuration.taskKey, reasonHash: input.reasonHash }); break
      case 'settle-cleanup': {
        const current = await attempts.inspect(configuration.taskKey), attempt = current.task?.attempts.at(-1)
        if (!attempt || attempt.attemptId !== input.attemptId) fail()
        const bytes = Buffer.from(JSON.stringify(input.terminationProof))
        result = await attempts.settle({ taskKey: configuration.taskKey, attemptId: attempt.attemptId, terminationHash: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),
          outcome: attempt.candidateHash ? 'candidate' : 'failed', usage: null }, bytes); break
      }
    }
    await write({ ok: true, result })
  } finally { channel.dispose() }
}
process.stdout.on('error', () => { process.exitCode = 1 })
main().catch(async () => { process.exitCode = 1; try { await write({ ok: false, error: 'Private authority denied or state uncertain; no request was retried.' }) } catch { /* No effects retried. */ } })
