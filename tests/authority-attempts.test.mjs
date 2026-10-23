import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { AzureAuthorityLedger } from '../scripts/azure-authority-ledger.mjs'
import { AttemptAuthority } from '../scripts/authority-attempts.mjs'
import { AttemptEvidenceVerifier, attemptEvidenceSigningBytes } from '../scripts/attempt-evidence.mjs'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const hash = value => createHash('sha256').update(value).digest('hex')
const taskKey = hash('synthetic-project:stable-story-key')
const hostId = randomUUID(), bootId = randomUUID()
function fixture() {
  const keys = generateKeyPairSync('ed25519')
  let bytes = Buffer.alloc(0), revision = 1, writes = 0, clock = 1800000000
  const controls = { authorized: true, evidenceValid: true, loseNextAck: false, beforeSign: null, authorizeMutation: null }
  const transport = async (_, options) => {
      const etag = `"0x${revision.toString(16)}"`
      if (options.method === 'GET') return new Response(Buffer.from(bytes), { headers: { etag, 'content-length': String(bytes.length) } })
      writes++
      if (options.headers['If-Match'] !== etag || options.headers['x-ms-blob-condition-appendpos'] !== String(bytes.length)) return new Response(null, { status: 412 })
      const offset = bytes.length
      bytes = Buffer.concat([bytes, options.body]); revision++
      if (controls.loseNextAck) { controls.loseNextAck = false; throw new Error('Synthetic acknowledgement loss') }
      return new Response(null, { status: 201, headers: { etag: `"0x${revision.toString(16)}"`, 'x-ms-blob-append-offset': String(offset) } })
    }
  const ledger = new AzureAuthorityLedger({ accountName: 'syntheticattempts', publicKey: keys.publicKey,
    token: async () => 'synthetic-token', transport })
  const construct = () => new AttemptAuthority({ ledger, now: () => clock,
    signRecord: async data => { await controls.beforeSign?.(); return sign(null, data, keys.privateKey).toString('base64') },
    authorizeCurrent: async context => { controls.authorizeMutation?.(context); return controls.authorized },
    verifyEvidence: async (proof, context) => {
      if (controls.verifier) return controls.verifier.verify(proof, context)
      const value = JSON.parse(Buffer.from(proof).toString('utf8'))
      if (!controls.evidenceValid || value.attemptId !== context.attempt?.attemptId) return false
      if (context.action === 'repair') return value.verdict === 'fail' && value.candidateHash === context.attempt.candidateHash
      return value.terminated === true && value.hostId === context.attempt.runtime.hostId
        && value.bootId === context.attempt.runtime.bootId && value.unit === context.attempt.runtime.unit
    } })
  const policy = () => ({ taskKey, scopeHash: hash('scope'), approvalHash: hash('gates'), runtimeHash: hash('runtime'),
    expiresAt: clock + 3600, maxAttempts: 3, subscriptionOnly: true, additionalChargesAllowed: false,
    model: 'gpt-6-sol', maxTurnsPerAttempt: 1 })
  return { authority: construct(), construct, controls, policy, transport, keys, writes: () => writes, now: () => clock,
    advance: seconds => { clock += seconds }, corrupt: () => { bytes[0] ^= 1 } }
}
async function begin(state, authority = state.authority, extra = {}) {
  const { task } = await authority.inspect(taskKey)
  return authority.begin({ taskKey, registrationId: task.registrationId, attempt: task.attempts.length + 1,
    reservationHash: hash('reservation'), hostId, bootId, deadline: state.now() + 100, ...extra })
}
async function current(state) { return (await state.authority.inspect(taskKey)).task.attempts.at(-1) }
async function admit(state) {
  return state.authority.admit({ taskKey, attemptId: (await current(state)).attemptId, challengeNonce: randomUUID() })
}
async function settle(state, extra = {}, proofExtra = {}) {
  const attempt = await current(state)
  const proof = Buffer.from(JSON.stringify({ attemptId: attempt.attemptId, ...attempt.runtime, terminated: true, ...proofExtra }))
  return state.authority.settle({ taskKey, attemptId: attempt.attemptId, terminationHash: hash(proof),
    outcome: attempt.candidateHash ? 'candidate' : 'failed', usage: null, ...extra }, proof)
}

test('external intents consume at most three attempts across fresh authority processes and never grant execution', async () => {
  const state = fixture()
  await state.authority.register(state.policy())
  for (let attempt = 1; attempt <= 3; attempt++) {
    const authority = state.construct()
    const result = await begin(state, authority)
    assert.equal(result.executionAllowed, false)
    assert.equal(result.retryAuthorized, false)
    const entry = await current(state)
    assert.equal(entry.attempt, attempt); assert.equal(entry.fence, attempt)
    assert.equal(entry.terminal, null)
    await assert.rejects(begin(state), /rejected/)
    await settle(state)
  }
  await assert.rejects(begin(state, state.construct()), /rejected/)
  await assert.rejects(state.construct().register(state.policy()), /rejected/)
  const { task, accounting } = await state.construct().inspect(taskKey)
  assert.equal(task.attempts.length, 3)
  assert.ok(task.attempts.every(attempt => attempt.terminal.usage === null))
  assert.equal(accounting.attemptsSpent, 3)
  assert.equal(accounting.remainingAttempts, 0)
  assert.equal(accounting.usage.unknownAttempts, 3)
  assert.equal(accounting.usage.complete, false)
})

test('accounting accepts signed current cleanup and failed-verdict proof through the concrete evidence verifier', async () => {
  const state = fixture(), guardian = generateKeyPairSync('ed25519')
  const image = 'node@sha256:' + hash('pinned-image')
  state.controls.verifier = new AttemptEvidenceVerifier({ now: state.now, resolveCurrent: async ({ kind, runtimeHash }) => ({
    kind, runtimeHash, publicKey: guardian.publicKey, keyId: 'trial-guardian', revision: 1,
    validFrom: state.now() - 100, validUntil: state.now() + 3600,
    verifierHash: hash('verifier'), qualificationHash: hash('qualified'), image,
  }) })
  const proof = (attempt, kind) => {
    const record = { version: 1, kind, keyId: 'trial-guardian', authorityRevision: 1, taskKey,
      attemptId: attempt.attemptId, reservationHash: attempt.reservationHash, runtimeHash: hash('runtime'),
      ...attempt.runtime, observedAt: state.now(), expiresAt: state.now() + 20,
      ...(kind === 'termination' ? { rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
        : { candidateHash: attempt.candidateHash, verdict: 'fail', verifierHash: hash('verifier'),
          qualificationHash: hash('qualified'), image }) }
    return Buffer.from(JSON.stringify({ record, signature: sign(null, attemptEvidenceSigningBytes(record), guardian.privateKey).toString('base64') }))
  }
  await state.authority.register(state.policy()); await begin(state)
  let attempt = await current(state)
  await admit(state)
  await state.authority.candidate({ taskKey, attemptId: attempt.attemptId, candidateHash: hash('candidate') })
  attempt = await current(state)
  const cleanup = proof(attempt, 'termination')
  await state.authority.settle({ taskKey, attemptId: attempt.attemptId, terminationHash: hash(cleanup),
    outcome: 'candidate', usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } }, cleanup)
  await assert.rejects(begin(state), /rejected/)
  const verdict = proof(attempt, 'verification')
  await state.authority.repair({ taskKey, attemptId: attempt.attemptId, candidateHash: attempt.candidateHash,
    verifierEvidenceHash: hash(verdict) }, verdict)
  await begin(state)
  assert.equal((await state.authority.inspect(taskKey)).accounting.attemptsSpent, 2)
})

test('concurrent begin has one durable winner; lost acknowledgement remains spent after restart', async () => {
  const state = fixture()
  await state.authority.register(state.policy())
  const attempts = await Promise.allSettled([begin(state), begin(state, state.construct())])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await state.authority.inspect(taskKey)).task.attempts.length, 1)
  await settle(state)
  state.controls.loseNextAck = true
  const before = state.writes()
  await assert.rejects(begin(state), /uncertain; reconciliation required/)
  assert.equal(state.writes(), before + 1)
  assert.equal((await state.construct().inspect(taskKey)).task.attempts.length, 2)
  await assert.rejects(begin(state, state.construct()), /rejected/)
})

test('one durable admission per attempt binds a fresh guardian challenge and never becomes replay permission', async () => {
  const state = fixture()
  await state.authority.register(state.policy()); await begin(state)
  const attempt = await current(state), challengeNonce = randomUUID()
  await assert.rejects(state.authority.candidate({ taskKey, attemptId: attempt.attemptId, candidateHash: hash('candidate') }), /rejected/)
  const admissions = await Promise.allSettled([
    state.authority.admit({ taskKey, attemptId: attempt.attemptId, challengeNonce }),
    state.construct().admit({ taskKey, attemptId: attempt.attemptId, challengeNonce: randomUUID() }),
  ])
  assert.equal(admissions.filter(value => value.status === 'fulfilled').length, 1)
  assert.ok(admissions.find(value => value.status === 'fulfilled').value.executionAllowed === false)
  await assert.rejects(admit(state), /rejected/)
  await settle(state); await begin(state)
  state.advance(101)
  await assert.rejects(admit(state), /rejected/)
})

test('lease expiry, observer loss, wrong host and self-declared termination cannot release an attempt', async () => {
  const state = fixture()
  await state.authority.register(state.policy()); await begin(state)
  state.advance(101)
  await assert.rejects(begin(state), /rejected/)
  for (const proof of [{ terminated: false }, { hostId: randomUUID() }, { bootId: randomUUID() }, { unit: 'other.service' }]) {
    await assert.rejects(settle(state, {}, proof), /rejected/)
  }
  const attempt = await current(state), proof = Buffer.from('{}')
  await assert.rejects(state.authority.settle({ taskKey, attemptId: attempt.attemptId,
    terminationHash: hash('different'), outcome: 'failed', usage: null }, proof), /rejected/)
  state.controls.evidenceValid = false
  await assert.rejects(settle(state), /rejected/)
  assert.equal((await current(state)).terminal, null)
  state.controls.evidenceValid = true
  await settle(state)
  await begin(state)
})

test('a candidate requires a verified failed verdict before a repair attempt and preserves usage', async () => {
  const state = fixture()
  await state.authority.register(state.policy()); await begin(state)
  const attempt = await current(state), candidateHash = hash('candidate')
  await admit(state)
  await state.authority.candidate({ taskKey, attemptId: attempt.attemptId, candidateHash })
  await assert.rejects(state.authority.candidate({ taskKey, attemptId: attempt.attemptId, candidateHash }), /rejected/)
  await settle(state, { usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 } })
  await assert.rejects(begin(state), /rejected/)
  const proof = Buffer.from(JSON.stringify({ attemptId: attempt.attemptId, candidateHash, verdict: 'fail' }))
  const repair = { taskKey, attemptId: attempt.attemptId, candidateHash, verifierEvidenceHash: hash(proof) }
  state.controls.evidenceValid = false
  await assert.rejects(state.authority.repair(repair, proof), /rejected/)
  state.controls.evidenceValid = true
  await state.authority.repair(repair, proof)
  await assert.rejects(state.authority.repair(repair, proof), /rejected/)
  await begin(state)
  assert.deepEqual((await state.authority.inspect(taskKey)).task.attempts[0].terminal.usage,
    { inputTokens: 8, outputTokens: 3, totalTokens: 11 })
  assert.deepEqual((await state.authority.inspect(taskKey)).accounting.usage,
    { knownInputTokens: 8, knownOutputTokens: 3, knownTotalTokens: 11, unknownAttempts: 1, complete: false })
})

test('expiry and revocation deny effects while permitting independently proven cleanup', async () => {
  const state = fixture()
  await state.authority.register(state.policy()); await begin(state)
  const attempt = await current(state)
  await state.authority.revoke({ taskKey, reasonHash: hash('revoked') })
  await assert.rejects(state.authority.candidate({ taskKey, attemptId: attempt.attemptId, candidateHash: hash('candidate') }), /rejected/)
  state.controls.authorized = false
  state.advance(3601)
  await settle(state)
  await assert.rejects(begin(state), /rejected/)
  assert.equal((await state.authority.inspect(taskKey)).task.revoked, true)
})

test('changed eligibility, evidence revocation and slow or backwards signing deny before append', async () => {
  for (const mutate of [state => { state.controls.authorized = false }, state => state.advance(6), state => state.advance(-1)]) {
    const state = fixture(); await state.authority.register(state.policy())
    state.controls.beforeSign = () => mutate(state)
    const writes = state.writes()
    await assert.rejects(begin(state), /rejected/)
    assert.equal(state.writes(), writes)
  }
  const state = fixture(); await state.authority.register(state.policy()); await begin(state)
  state.controls.beforeSign = () => { state.controls.evidenceValid = false }
  await assert.rejects(settle(state), /rejected/)
  assert.equal((await current(state)).terminal, null)
  const delayed = fixture(); await delayed.authority.register(delayed.policy())
  let authorizations = 0
  delayed.controls.authorizeMutation = context => { if (context.action === 'begin' && ++authorizations === 2) delayed.advance(6) }
  const writes = delayed.writes()
  await assert.rejects(begin(delayed), /rejected/)
  assert.equal(delayed.writes(), writes)
})

test('strict policy, immutable callback inputs, tampering and malformed usage cannot invent authority', async () => {
  for (const extra of [{ maxAttempts: 4 }, { additionalChargesAllowed: true }, { subscriptionOnly: false },
    { expiresAt: 1900000000 }, { executionAllowed: true }, { scopeHash: [] }, { model: 'unqualified' }, { maxTurnsPerAttempt: 2 }]) {
    const state = fixture()
    await assert.rejects(state.authority.register({ ...state.policy(), ...extra }), /rejected/)
    assert.equal(state.writes(), 0)
  }
  const state = fixture()
  state.controls.authorizeMutation = context => { context.policy.maxAttempts = 99; context.payload.taskKey = hash('forged') }
  await state.authority.register(state.policy()); await begin(state)
  assert.equal((await state.authority.inspect(taskKey)).task.policy.maxAttempts, 3)
  for (const usage of [{ inputTokens: 1, outputTokens: 2, totalTokens: 4 }, {}, [], -1]) await assert.rejects(settle(state, { usage }), /rejected/)
  const inspection = await state.authority.inspect(taskKey)
  inspection.task.attempts.length = 0
  assert.equal((await state.authority.inspect(taskKey)).task.attempts.length, 1)
  state.corrupt()
  await assert.rejects(state.authority.inspect(taskKey), /ledger rejected/)
})

test('separate Node processes share external spent accounting without inheriting application credentials', async () => {
  const state = fixture()
  await state.authority.register(state.policy())
  const directory = await mkdtemp(path.join(tmpdir(), 'aisdlc-attempt-fixture-'))
  const keyFile = path.join(directory, 'synthetic-key.pem')
  await writeFile(keyFile, state.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  const server = createServer(async (request, response) => {
    try {
      const parts = []; let size = 0
      for await (const part of request) { size += part.length; assert.ok(size <= 32768); parts.push(part) }
      const result = await state.transport('', { method: request.method, body: Buffer.concat(parts), headers: {
        'If-Match': request.headers['if-match'], 'x-ms-blob-condition-appendpos': request.headers['x-ms-blob-condition-appendpos'],
      } })
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(Buffer.from(await result.arrayBuffer()))
    } catch { response.writeHead(500); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const source = `
      import {readFileSync} from 'node:fs';
      import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
      import {AzureAuthorityLedger} from ${JSON.stringify(new URL('../scripts/azure-authority-ledger.mjs', import.meta.url).href)};
      import {AttemptAuthority} from ${JSON.stringify(new URL('../scripts/authority-attempts.mjs', import.meta.url).href)};
      const key=createPrivateKey(readFileSync(process.env.FIXTURE_KEY));
      const ledger=new AzureAuthorityLedger({accountName:'syntheticattempts',publicKey:createPublicKey(key),token:async()=>'synthetic',
        transport:(_,options)=>fetch(process.env.FIXTURE_URL,options)});
      const authority=new AttemptAuthority({ledger,now:()=>${state.now()},authorizeCurrent:async()=>true,verifyEvidence:async()=>false,
        signRecord:async bytes=>sign(null,bytes,key).toString('base64')});
      const state=await authority.inspect(${JSON.stringify(taskKey)});
      try { const result=await authority.begin({taskKey:${JSON.stringify(taskKey)},registrationId:state.task.registrationId,
        attempt:state.task.attempts.length+1,reservationHash:${JSON.stringify(hash('reservation'))},hostId:${JSON.stringify(hostId)},
        bootId:${JSON.stringify(bootId)},deadline:${state.now()+100}});
        console.log(JSON.stringify({began:true,executionAllowed:result.executionAllowed}));
      } catch {console.log(JSON.stringify({began:false,spent:state.accounting.attemptsSpent}));}
    `
    const environment = { FIXTURE_KEY: keyFile, FIXTURE_URL: `http://127.0.0.1:${server.address().port}` }
    if (process.env.SYSTEMROOT) environment.SYSTEMROOT = process.env.SYSTEMROOT
    for (let index = 1; index <= 3; index++) {
      const child = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source],
        { env: environment, timeout: 15000, maxBuffer: 4096, windowsHide: true })
      assert.deepEqual(JSON.parse(child.stdout), { began: true, executionAllowed: false })
      assert.equal((await state.authority.inspect(taskKey)).accounting.attemptsSpent, index)
      await settle(state)
    }
    const child = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source],
      { env: environment, timeout: 15000, maxBuffer: 4096, windowsHide: true })
    assert.deepEqual(JSON.parse(child.stdout), { began: false, spent: 3 })
  } finally {
    await new Promise(resolve => server.close(resolve))
    await unlink(keyFile); await rmdir(directory)
  }
})
