// Ephemeral signed policy vectors; no private host, native login or human action.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildNativePolicies } from '../src/sdlc/native-policy'
import { nativeUnitProperties } from '../scripts/systemd-attempt-guardian.mjs'
import { digest } from '../src/sdlc/contracts'

function vector() {
  const proposal = JSON.parse(readFileSync('docs/planning/taskboard-first-delivery.json', 'utf8'))
  const now = Math.floor(Date.now() / 1000), g = generateKeyPairSync('ed25519'), a = generateKeyPairSync('ed25519')
  const der = (key: typeof g.publicKey) => key.export({ format: 'der', type: 'spki' }).toString('base64')
  const files = ['broker.mjs', 'guardian.mjs', 'qualify-host.mjs', 'authority.mjs', 'qualify-tools.mjs', 'qualify-delivery.mjs', 'runner.mjs'].map(name => ({ name, sha256: digest(name) }))
  const manifest = { version: 1, node: '24.14.0', codex: '0.155.1', model: 'gpt-6-sol', sourceRevision: 'd'.repeat(40),
    files, sourceTreeClean: true, nativeRuntimeQualified: false, executionAllowed: false }
  const manifestHash = createHash('sha256').update(JSON.stringify(manifest, null, 2) + '\n').digest('hex')
  const gates = ['sprint', 'design-security'].map((kind, i) => ({ id: i + 1, actorId: 999, kind, decisionKey: `synthetic-${kind}` }))
  const record = { version: 1, storyId: 84, taskKey: digest({ projectKey: proposal.proposedStory.projectKey, storyKey: proposal.proposedStory.storyKey }),
    scopeHash: digest(proposal.proposedStory), approvalHash: digest(gates), approvalGates: gates, sourceHash: proposal.proposedStory.contract.sourceHash,
    checkPolicyHash: proposal.proposedStory.contract.checkPolicyHash, maxAttempts: 3, subscriptionOnly: true, additionalChargesAllowed: false, executionAllowed: false }
  const clientRecord = { version: 1, kind: 'private-client-profile', publicKeyDer: der(g.publicKey), manifestHash, observedAt: now,
    hostId: randomUUID(), bootId: randomUUID(), profileHash: digest(nativeUnitProperties), modelCalls: 0,
    nativeAuthenticationUsedForMetadata: true, nativeAuthenticationExported: false, executionAllowed: false,
    nativeMetadata: { metadataOnly: true, threadPolicyChecked: true, realModelCalls: 0 },
    unlaunchedRecovery: { fencedAbsentUnit: true, duplicateFenceDenied: true, existingLaunchClaimDenied: true, realModelCalls: 0 },
    hashes: { nodeHash: digest('node'), codexHash: digest('codex'), configHash: digest('config'), brokerHash: digest('broker.mjs'),
      guardianHash: digest('guardian.mjs'), qualificationBundleHash: digest('qualify-host.mjs') },
    reports: ['explicit-stop', 'controller-disconnect'].map(scenario => ({ scenario, hostCanariesHidden: true, brokerSyntheticDataReadable: true,
      loopbackBlocked: true, metadataBlocked: true, detachedDescendantsStopped: true, cgroupEmpty: true })) }
  const toolsRecord = { version: 1, kind: 'private-tools-verifier', publicKeyDer: der(a.publicKey), manifestHash, observedAt: now, bootId: randomUUID(),
    sourceHash: record.sourceHash, policyHash: record.checkPolicyHash, runnerHash: digest('runner.mjs'), image: `node@sha256:${digest('image')}`,
    hashes: { nodeHash: digest('node'), authorityBundleHash: digest('authority.mjs'), qualificationBundleHash: digest('qualify-tools.mjs'), protocolBundleHash: digest('qualify-delivery.mjs') },
    controls: [['reference-control', 'pass'], ['wrong-empty', 'fail']].map(([label, verdict]) => ({ label, verdict, replayCases: 22,
      syntheticOnly: true, realModelCalls: 0, actualHumanApprovals: 0, nativeRuntimeQualified: false, executionAllowed: false })),
    modelCalls: 0, nativeAuthenticationUsedForMetadata: false, nativeAuthenticationExported: false, executionAllowed: false }
  const signed = <T>(record: T, key: typeof g.privateKey, domain: string) => ({ record,
    signature: sign(null, Buffer.from(domain + '\n' + digest(record)), key).toString('base64') })
  const input = { now, plan: { storyId: 84, task: proposal.proposedStory, source: proposal.sourceCapsule },
    snapshot: { record, snapshotHash: digest(record) }, manifest, manifestHash,
    window: { mode: 'protected-trial', trialCreditsOnly: true, payAsYouGoAllowed: false, additionalChargesAllowed: false,
      planningCeilingUsd: 10, subscriptionId: 'b7c13fa8-f215-42a7-b04b-b48e78f1ba72', issuedAt: now - 10, expiresAt: now + 100 },
    client: signed(clientRecord, g.privateKey, 'ai-sdlc/private-client-profile/v1'),
    tools: signed(toolsRecord, a.privateKey, 'ai-sdlc/private-tools-verifier/v1'), clientPublicKeyDer: der(g.publicKey), authorityPublicKeyDer: der(a.publicKey),
    metadata: { metadataOnly: true, authentication: 'chatgpt', model: 'gpt-6-sol', effectiveConfigChecked: true, selectedModelListed: true, threadPolicyChecked: true, realModelCalls: 0 },
    ci: { conclusion: 'success', status: 'completed', head_sha: manifest.sourceRevision, path: '.github/workflows/verify.yml' } }
  return input
}
test('activation binds independently selected anchors, exact package, boot, scope, checks and successful CI', () => {
  const input = vector(), result = buildNativePolicies(input)
  assert.equal(result.executor.runtimeHash, result.clientPolicy.policy.runtimeHash)
  assert.equal(result.authorityPolicy.toolsBootId, input.tools.record.bootId)
  assert.equal(result.clientPolicy.qualifiedBootId, input.client.record.bootId)
  assert.equal(result.executor.trust.publicKeyDer, input.authorityPublicKeyDer)
  for (const change of [
    (v: any) => { v.client.record.reports[0].metadataBlocked = false },
    (v: any) => { v.tools.record.controls[1].verdict = 'pass' },
    (v: any) => { v.authorityPublicKeyDer = v.clientPublicKeyDer },
    (v: any) => { v.manifest.sourceTreeClean = false },
    (v: any) => { v.manifest.sourceRevision = 'e'.repeat(40) },
    (v: any) => { v.ci.conclusion = 'failure' },
    (v: any) => { v.ci.head_sha = 'e'.repeat(40) },
    (v: any) => { v.now += 3601 },
    (v: any) => { v.window.payAsYouGoAllowed = true },
    (v: any) => { v.snapshot.record.approvalHash = digest('old gates') },
    (v: any) => { v.metadata.authentication = 'apiKey' },
  ]) { const changed = structuredClone(input); change(changed); assert.throws(() => buildNativePolicies(changed)) }
})
