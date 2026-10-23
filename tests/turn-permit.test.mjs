import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { AzureAuthorityLedger } from '../scripts/azure-authority-ledger.mjs'
import { AttemptAuthority } from '../scripts/authority-attempts.mjs'
import { authenticateTurnPermit, TurnPermitIssuer } from '../scripts/turn-permit.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')
async function fixture() {
  const keys = generateKeyPairSync('ed25519')
  let bytes = Buffer.alloc(0), revision = 1, clock = 1800000000
  const controls = { eligible: true, qualified: true, beforeSign: async () => {} }
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticpermits', publicKey: keys.publicKey, token: async () => 'synthetic-token',
    transport: async (_, options) => {
      const etag = `"0x${revision.toString(16)}"`
      if (options.method === 'GET') return new Response(Buffer.from(bytes), { headers: { etag } })
      if (options.headers['If-Match'] !== etag || options.headers['x-ms-blob-condition-appendpos'] !== String(bytes.length)) return new Response(null, { status: 412 })
      const offset = bytes.length; bytes = Buffer.concat([bytes, options.body]); revision++
      return new Response(null, { status: 201, headers: { etag: `"0x${revision.toString(16)}"`, 'x-ms-blob-append-offset': String(offset) } })
    } })
  const authority = new AttemptAuthority({ ledger, signRecord: async data => sign(null, data, keys.privateKey).toString('base64'),
    authorizeCurrent: async () => controls.eligible, verifyEvidence: async () => false, now: () => clock })
  const policy = { taskKey: hash('task'), scopeHash: hash('scope'), approvalHash: hash('approvals'), runtimeHash: hash('runtime'),
    expiresAt: clock + 3600, maxAttempts: 3, subscriptionOnly: true, additionalChargesAllowed: false, model: 'gpt-6-sol', maxTurnsPerAttempt: 1 }
  const qualified = { publicKey: keys.publicKey, nativeRuntimeQualified: true, runtimeHash: policy.runtimeHash, keyId: 'synthetic-permit-root', authorityRevision: 1, expiresAt: clock + 600 }
  const registration = await authority.register(policy), hostId = randomUUID(), bootId = randomUUID()
  const intent = await authority.begin({ taskKey: policy.taskKey, registrationId: registration.operationId, attempt: 1,
    reservationHash: hash('reservation'), hostId, bootId, deadline: clock + 100 })
  const issuer = new TurnPermitIssuer({ authority, now: () => clock, authorizeCurrent: async () => controls.eligible,
    resolveQualified: async () => ({ ...qualified, nativeRuntimeQualified: controls.qualified }),
    signPermit: async bytes => { await controls.beforeSign(); return sign(null, bytes, keys.privateKey).toString('base64') } })
  const request = (threadId = null) => ({ taskKey: policy.taskKey, attemptId: intent.operationId, challengeNonce: randomUUID(), threadId })
  const context = (request, kind) => ({ policy: { ...qualified, ...policy }, hostId, bootId, kind,
    challengeNonce: request.challengeNonce, threadId: request.threadId, attemptId: request.attemptId })
  return { authority, issuer, controls, policy, request, context, now: () => clock, advance: seconds => { clock += seconds } }
}

test('separate launch and admission permits bind actual host/boot, fresh challenge and one thread', async () => {
  const f = await fixture(), launch = f.request()
  const ticket = await f.issuer.launch(launch)
  assert.equal(authenticateTurnPermit(ticket, f.context(launch, 'launch'), f.now()).attempt, 1)
  assert.equal((await f.authority.inspect(f.policy.taskKey)).task.attempts[0].admission, null)
  const request = f.request('thread_one'), admission = await f.issuer.admit(request)
  const admitted = authenticateTurnPermit(admission, f.context(request, 'admission'), f.now())
  assert.equal(admitted.maxTurns, 1); assert.notEqual(admitted.admissionId, admitted.attemptId)
  await assert.rejects(f.issuer.admit(f.request('thread_two')))
  await assert.rejects(f.issuer.launch(f.request()))
  for (const change of [{ bootId: randomUUID() }, { challengeNonce: randomUUID() }, { threadId: 'other' }, { kind: 'launch' }]) {
    assert.throws(() => authenticateTurnPermit(admission, { ...f.context(request, 'admission'), ...change }, f.now()))
  }
  const changed = structuredClone(admission); changed.lease.maxTurns = 2
  assert.throws(() => authenticateTurnPermit(changed, f.context(request, 'admission'), f.now()))
  f.advance(15)
  assert.throws(() => authenticateTurnPermit(admission, f.context(request, 'admission'), f.now()))
})

test('concurrent admission has one signed winner and never refunds the losing request', async () => {
  const f = await fixture()
  const results = await Promise.allSettled([f.issuer.admit(f.request('thread_one')), f.issuer.admit(f.request('thread_two'))])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal((await f.authority.inspect(f.policy.taskKey)).accounting.attemptsSpent, 1)
})

test('qualification, eligibility, signing delay and post-admission loss deny a usable permit', async () => {
  for (const control of ['eligible', 'qualified']) {
    const f = await fixture(); f.controls[control] = false
    await assert.rejects(f.issuer.admit(f.request('thread_one')))
    assert.equal((await f.authority.inspect(f.policy.taskKey)).task.attempts[0].admission, null)
  }
  for (const change of [f => { f.controls.eligible = false }, f => f.advance(6)]) {
    const f = await fixture(); f.controls.beforeSign = async () => change(f)
    await assert.rejects(f.issuer.admit(f.request('thread_one')))
    assert.ok((await f.authority.inspect(f.policy.taskKey)).task.attempts[0].admission)
    assert.equal((await f.authority.inspect(f.policy.taskKey)).accounting.remainingAttempts, 2)
  }
})
