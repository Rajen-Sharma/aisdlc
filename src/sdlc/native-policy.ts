// Trusted operator construction only; this module is never a public approval API.
import { createHash, createPublicKey, verify } from 'node:crypto'
import { digest } from './contracts'
import { validateSourceCapsule } from './source-capsule'
import { nativeUnitProperties } from '../../scripts/systemd-attempt-guardian.mjs'
import type { NativeExecutorConfiguration } from './native-transport'

const reject = (): never => { throw new Error('Private runtime qualification or current task binding rejected.') }
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function authenticated(input: any, domain: string, anchor: string) {
  if (!input || Object.keys(input).sort().join(',') !== 'record,signature' || !input.record
    || typeof input.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(input.signature)
    || Buffer.byteLength(JSON.stringify(input)) > 131072 || input.record.publicKeyDer !== anchor) return reject()
  const key = createPublicKey({ key: Buffer.from(anchor, 'base64'), format: 'der', type: 'spki' })
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(domain + '\n' + digest(input.record)), key,
    Buffer.from(input.signature, 'base64'))) return reject()
  return input.record
}
export function buildNativePolicies(input: {
  plan: any; snapshot: any; manifest: any; manifestHash: string; window: any; client: unknown; tools: unknown
  clientPublicKeyDer: string; authorityPublicKeyDer: string; metadata: any
  ci: { conclusion: string; head_sha: string; status: string; path: string }; now: number
}) {
  const { plan, snapshot, manifest, manifestHash, window: w, now, metadata, ci } = input, r = snapshot?.record
  if (!Number.isSafeInteger(now) || !w || w.mode !== 'protected-trial' || w.trialCreditsOnly !== true
    || w.additionalChargesAllowed !== false || w.payAsYouGoAllowed !== false || w.planningCeilingUsd !== 10
    || w.subscriptionId !== 'b7c13fa8-f215-42a7-b04b-b48e78f1ba72' || !Number.isSafeInteger(w.issuedAt)
    || !Number.isSafeInteger(w.expiresAt) || w.issuedAt > now || w.expiresAt <= now || w.expiresAt - w.issuedAt > 172800
    || !r || digest(r) !== snapshot.snapshotHash || r.scopeHash !== digest(plan.task) || r.storyId !== plan.storyId
    || r.taskKey !== digest({ projectKey: plan.task.projectKey, storyKey: plan.task.storyKey })
    || r.approvalHash !== digest(r.approvalGates) || r.approvalGates?.length !== 2
    || !['sprint', 'design-security'].every(kind => r.approvalGates.some((g: any) => g.kind === kind && Number.isInteger(g.actorId) && g.actorId > 0))
    || r.maxAttempts !== 3 || r.subscriptionOnly !== true || r.additionalChargesAllowed !== false || r.executionAllowed !== false
    || r.sourceHash !== plan.task.contract.sourceHash || r.checkPolicyHash !== plan.task.contract.checkPolicyHash
    || !sha(manifestHash) || manifest?.version !== 1 || manifest.node !== '24.14.0' || manifest.codex !== '0.155.1' || manifest.model !== 'gpt-6-sol'
    || manifest.nativeRuntimeQualified !== false || manifest.executionAllowed !== false || manifest.sourceTreeClean !== true
    || createHash('sha256').update(JSON.stringify(manifest, null, 2) + '\n').digest('hex') !== manifestHash
    || ci.status !== 'completed' || ci.conclusion !== 'success' || ci.head_sha !== manifest.sourceRevision || ci.path !== '.github/workflows/verify.yml'
    || metadata?.metadataOnly !== true || metadata.authentication !== 'chatgpt' || metadata.model !== 'gpt-6-sol'
    || metadata.effectiveConfigChecked !== true || metadata.selectedModelListed !== true || metadata.threadPolicyChecked !== true || metadata.realModelCalls !== 0) return reject()
  validateSourceCapsule(plan.source, r.sourceHash)
  if (plan.task.feedback && (!r.feedbackContext || r.feedbackContext.id !== plan.task.feedback || r.feedbackContext.record.storyId !== plan.task.supersedes
    || digest(r.feedbackContext.record) !== r.feedbackHash || r.feedbackContext.feedbackHash !== r.feedbackHash
    || typeof r.feedbackContext.record.content !== 'string' || r.feedbackContext.record.content.length > 4000)) return reject()
  if (!plan.task.feedback && (r.feedbackHash || r.feedbackContext)) return reject()
  const client = authenticated(input.client, 'ai-sdlc/private-client-profile/v1', input.clientPublicKeyDer)
  const tools = authenticated(input.tools, 'ai-sdlc/private-tools-verifier/v1', input.authorityPublicKeyDer)
  for (const q of [client, tools]) {
    if (q.version !== 1 || q.manifestHash !== manifestHash || !Number.isSafeInteger(q.observedAt) || q.observedAt < w.issuedAt
      || q.observedAt > now || now - q.observedAt > 3600 || q.modelCalls !== 0 || q.nativeAuthenticationExported !== false || q.executionAllowed !== false
      || typeof q.bootId !== 'string' || !/^[a-f0-9-]{36}$/.test(q.bootId)) return reject()
  }
  if (client.kind !== 'private-client-profile' || tools.kind !== 'private-tools-verifier'
    || client.unlaunchedRecovery?.fencedAbsentUnit !== true || client.unlaunchedRecovery.duplicateFenceDenied !== true
    || client.unlaunchedRecovery.existingLaunchClaimDenied !== true || client.unlaunchedRecovery.realModelCalls !== 0
    || client.nativeAuthenticationUsedForMetadata !== true || tools.nativeAuthenticationUsedForMetadata !== false
    || client.nativeMetadata?.metadataOnly !== true || client.nativeMetadata.threadPolicyChecked !== true || client.nativeMetadata.realModelCalls !== 0
    || client.profileHash !== digest(nativeUnitProperties) || tools.sourceHash !== r.sourceHash || tools.policyHash !== r.checkPolicyHash
    || !Array.isArray(client.reports) || client.reports.length !== 2
    || !['explicit-stop', 'controller-disconnect'].every(scenario => client.reports.some((q: any) => q.scenario === scenario
      && ['hostCanariesHidden', 'brokerSyntheticDataReadable', 'loopbackBlocked', 'metadataBlocked', 'detachedDescendantsStopped', 'cgroupEmpty'].every(k => q[k] === true)))
    || !Array.isArray(tools.controls) || tools.controls.length !== 2
    || ![['reference-control', 'pass'], ['wrong-empty', 'fail']].every(([label, verdict]) => tools.controls.some((q: any) => q.label === label
      && q.verdict === verdict && q.replayCases === 22 && q.syntheticOnly === true && q.realModelCalls === 0
      && q.actualHumanApprovals === 0 && q.nativeRuntimeQualified === false && q.executionAllowed === false))) return reject()
  const files = new Map<string, string>(manifest.files.map((f: any) => [f.name, f.sha256]))
  for (const [actual, file] of [[client.hashes?.brokerHash, 'broker.mjs'], [client.hashes?.guardianHash, 'guardian.mjs'],
    [client.hashes?.qualificationBundleHash, 'qualify-host.mjs'], [tools.hashes?.authorityBundleHash, 'authority.mjs'],
    [tools.hashes?.qualificationBundleHash, 'qualify-tools.mjs'], [tools.hashes?.protocolBundleHash, 'qualify-delivery.mjs'], [tools.runnerHash, 'runner.mjs']]) {
    if (!sha(actual) || actual !== files.get(file)) return reject()
  }
  if (!sha(client.hashes.nodeHash) || !sha(client.hashes.codexHash) || !sha(client.hashes.configHash) || tools.hashes.nodeHash !== client.hashes.nodeHash
    || typeof client.hostId !== 'string' || !/^[a-f0-9-]{36}$/.test(client.hostId) || !/^node@sha256:[a-f0-9]{64}$/.test(tools.image)) return reject()
  const runtimeMaterial = { nodeHash: client.hashes.nodeHash, codexHash: client.hashes.codexHash, configHash: client.hashes.configHash, brokerHash: client.hashes.brokerHash,
    guardianHash: client.hashes.guardianHash, profileHash: client.profileHash, feedbackHash: r.feedbackHash ?? null,
    guardianKeyFingerprint: createHash('sha256').update(Buffer.from(input.clientPublicKeyDer, 'base64')).digest('hex') }
  const runtimeHash = digest(runtimeMaterial), qualificationHash = digest({ client: input.client, tools: input.tools, ci })
  const trust = { keyId: 'azure-native-authority', authorityRevision: 1, publicKeyDer: input.authorityPublicKeyDer,
    nativeRuntimeQualified: true as const, runtimeHash, verifierHash: tools.runnerHash, qualificationHash, image: tools.image,
    validFrom: w.issuedAt, expiresAt: w.expiresAt }
  const guardian = { keyId: 'azure-native-guardian', revision: 1, publicKeyDer: input.clientPublicKeyDer }
  const clientPolicy = { version: 1, hostId: client.hostId, qualifiedBootId: client.bootId, storyId: plan.storyId,
    policy: { taskKey: r.taskKey, scopeHash: r.scopeHash, approvalHash: r.approvalHash, runtimeHash, keyId: trust.keyId,
      authorityRevision: trust.authorityRevision, publicKeyDer: trust.publicKeyDer, nativeRuntimeQualified: true, expiresAt: w.expiresAt },
    task: plan.task, source: plan.source, runtimeMaterial, guardian, ...(r.feedbackContext ? { feedbackContext: r.feedbackContext } : {}) }
  const authorityPolicy = { version: 1, nativeRuntimeQualified: true, issuedAt: w.issuedAt, expiresAt: w.expiresAt,
    authorityBundleHash: tools.hashes.authorityBundleHash, nodeHash: tools.hashes.nodeHash, guardianValidFrom: w.issuedAt,
    toolsBootId: tools.bootId, delivery: { storyId: plan.storyId, taskKey: r.taskKey, scopeHash: r.scopeHash, approvalHash: r.approvalHash,
      source: plan.source, contract: plan.task.contract, guardian, trust, workspaceRoot: '/var/lib/aisdlc-authority/verifier-work',
      ...(r.feedbackHash ? { feedbackHash: r.feedbackHash } : {}) } }
  const executor: NativeExecutorConfiguration = { version: 1, enabled: true, nativeRuntimeQualified: true, storyId: plan.storyId,
    taskKey: r.taskKey, scopeHash: r.scopeHash, approvalHash: r.approvalHash, runtimeHash, clientHost: '20.53.249.58', toolsHost: '20.213.88.10',
    issuedAt: w.issuedAt, expiresAt: w.expiresAt, trust }
  return { clientPolicy, authorityPolicy, executor }
}
