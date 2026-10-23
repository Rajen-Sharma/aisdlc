// Host-side accounting over authenticated, externally current append-only state.
// This module never launches a provider or turns accounting into an execution permit.
import { createHash, randomUUID } from 'node:crypto'
import { AzureAuthorityLedger, authoritySigningBytes } from './azure-authority-ledger.mjs'

const protocol = 'ai-sdlc/attempt-authority/v1'
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const positive = value => Number.isSafeInteger(value) && value > 0
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const reject = () => { throw new Error('Attempt authority rejected.') }
const copy = value => structuredClone(value)
const fixed = ['protocol', 'action', 'taskKey']
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')

function runtime(value) {
  return exact(value, ['hostId', 'bootId', 'unit']) && uuid(value.hostId) && uuid(value.bootId)
    && typeof value.unit === 'string' && /^aisdlc-attempt-[a-f0-9-]{36}\.service$/.test(value.unit)
    && uuid(value.unit.slice(15, -8))
}
function usage(value) {
  return value === null || (exact(value, ['inputTokens', 'outputTokens', 'totalTokens'])
    && ['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 10000000)
    && value.totalTokens === value.inputTokens + value.outputTokens)
}
function legacyQualification(record) {
  const p = record.payload
  return record.kind === 'registry' && exact(p, ['qualificationId', 'test', 'syntheticOnly', 'executionAllowed', 'retryAuthorized'])
    && uuid(p.qualificationId) && ['read-sign-append', 'race-a', 'race-b', 'lost-acknowledgement'].includes(p.test)
    && p.syntheticOnly === true && p.executionAllowed === false && p.retryAuthorized === false
}

// Input must have been signature/chain authenticated by AzureAuthorityLedger.read().
// No state snapshot, local counter, lease expiry or application row is authoritative.
function reduce(records) {
  const tasks = new Map(), admissions = new Set()
  for (const record of records) {
    const p = record.payload
    if (legacyQualification(record)) continue
    if (p.protocol !== protocol || !sha(p.taskKey) || !positive(record.issuedAt)) reject()
    let task = tasks.get(p.taskKey)
    if (p.action === 'register') {
      if (task || record.kind !== 'registry' || !exact(p, [...fixed, 'scopeHash', 'approvalHash', 'runtimeHash', 'expiresAt', 'maxAttempts', 'subscriptionOnly', 'additionalChargesAllowed', 'model', 'maxTurnsPerAttempt'])
        || ![p.scopeHash, p.approvalHash, p.runtimeHash].every(sha) || p.maxAttempts !== 3
        || p.model !== 'gpt-6-sol' || p.maxTurnsPerAttempt !== 1
        || p.subscriptionOnly !== true || p.additionalChargesAllowed !== false
        || !positive(p.expiresAt) || p.expiresAt <= record.issuedAt || p.expiresAt - record.issuedAt > 86400) reject()
      task = { registrationId: record.operationId, policy: copy(p), scopeHistory: [p.scopeHash], generationStart: 0, attempts: [], revoked: false, lastAt: record.issuedAt }
      tasks.set(p.taskKey, task)
      continue
    }
    if (!task || record.issuedAt < task.lastAt) reject()
    task.lastAt = record.issuedAt
    const previous = task.attempts.at(-1)
    if (p.action === 'revise') {
      const next = p.policy
      if (record.kind !== 'registry' || !exact(p, [...fixed, 'previousRegistrationId', 'feedbackHash', 'policy'])
        || !task.revoked || p.previousRegistrationId !== task.registrationId || !sha(p.feedbackHash)
        || task.attempts.length >= 3 || (previous && !previous.terminal)
        || !exact(next, [...fixed, 'scopeHash', 'approvalHash', 'runtimeHash', 'expiresAt', 'maxAttempts', 'subscriptionOnly', 'additionalChargesAllowed', 'model', 'maxTurnsPerAttempt'])
        || next.protocol !== protocol || next.action !== 'register' || next.taskKey !== p.taskKey
        || ![next.scopeHash, next.approvalHash, next.runtimeHash].every(sha) || task.scopeHistory.includes(next.scopeHash)
        || next.approvalHash === task.policy.approvalHash || next.maxAttempts !== 3 || next.model !== 'gpt-6-sol'
        || next.maxTurnsPerAttempt !== 1 || next.subscriptionOnly !== true || next.additionalChargesAllowed !== false
        || !positive(next.expiresAt) || next.expiresAt <= record.issuedAt || next.expiresAt - record.issuedAt > 86400) reject()
      // A new, reapproved scope supersedes the revoked scope. Spent intents and
      // fencing remain global to the stable task key, including across revisions.
      task.policy = copy(next); task.registrationId = record.operationId
      task.scopeHistory.push(next.scopeHash); task.generationStart = task.attempts.length; task.revoked = false
    } else if (p.action === 'revoke') {
      if (record.kind !== 'registry' || !exact(p, [...fixed, 'reasonHash']) || !sha(p.reasonHash) || task.revoked) reject()
      task.revoked = true
    } else if (p.action === 'begin') {
      if (record.kind !== 'intent' || !exact(p, [...fixed, 'registrationId', 'attempt', 'fence', 'reservationHash', 'runtime', 'deadline'])
        || task.revoked || p.registrationId !== task.registrationId || !sha(p.reservationHash) || !runtime(p.runtime)
        || p.runtime.unit !== `aisdlc-attempt-${record.operationId}.service`
        || p.attempt !== task.attempts.length + 1 || p.attempt > 3 || p.fence !== p.attempt
        || !positive(p.deadline) || p.deadline <= record.issuedAt || p.deadline > task.policy.expiresAt || p.deadline - record.issuedAt > 120
        || (previous && (!previous.terminal || (task.attempts.length > task.generationStart && previous.candidateHash && !previous.repair)))) reject()
      // An intent is immediately spent and uncertain, even if a launch never happens.
      task.attempts.push({ attemptId: record.operationId, attempt: p.attempt, fence: p.fence,
        issuedAt: record.issuedAt,
        reservationHash: p.reservationHash, runtime: copy(p.runtime), deadline: p.deadline,
        admission: null, candidateHash: null, terminal: null, verification: null, delivery: null, repair: null })
    } else if (p.action === 'admit') {
      if (record.kind !== 'intent' || !exact(p, [...fixed, 'attemptId', 'challengeNonce'])
        || task.revoked || !previous || previous.attemptId !== p.attemptId || previous.terminal || previous.admission
        || record.issuedAt >= previous.deadline || !uuid(p.challengeNonce) || admissions.has(p.challengeNonce)) reject()
      previous.admission = { operationId: record.operationId, challengeNonce: p.challengeNonce }
      admissions.add(p.challengeNonce)
    } else if (p.action === 'candidate') {
      if (record.kind !== 'candidate' || !exact(p, [...fixed, 'attemptId', 'candidateHash'])
        || !previous || previous.attemptId !== p.attemptId || task.revoked || previous.terminal || previous.candidateHash || !previous.admission
        || record.issuedAt >= previous.deadline || !sha(p.candidateHash)) reject()
      previous.candidateHash = p.candidateHash
    } else if (p.action === 'settle') {
      if (record.kind !== 'terminal' || !exact(p, [...fixed, 'attemptId', 'terminationHash', 'outcome', 'usage'])
        || !previous || previous.attemptId !== p.attemptId || previous.terminal || !sha(p.terminationHash) || !usage(p.usage)
        || !['failed', 'cancelled', 'candidate'].includes(p.outcome)
        || (p.outcome === 'candidate') !== !!previous.candidateHash) reject()
      // Settlement after expiry/revocation is allowed so cleanup can be recorded.
      // It cannot restore a consumed attempt or certify the candidate's correctness.
      previous.terminal = { terminationHash: p.terminationHash, outcome: p.outcome, usage: copy(p.usage) }
    } else if (p.action === 'verification') {
      if (record.kind !== 'registry' || !exact(p, [...fixed, 'attemptId', 'candidateHash', 'verificationHash', 'evidence'])
        || task.revoked || !previous || previous.attemptId !== p.attemptId || previous.terminal?.outcome !== 'candidate' || previous.verification
        || p.candidateHash !== previous.candidateHash || !sha(p.verificationHash)
        || !exact(p.evidence, ['proof', 'report', 'provenance']) || !exact(p.evidence.proof, ['record', 'signature'])
        || p.evidence.proof.record?.version !== 2 || p.evidence.proof.record?.kind !== 'verification'
        || !['pass', 'fail', 'error'].includes(p.evidence.proof.record?.verdict)
        || createHash('sha256').update(JSON.stringify(p.evidence.proof)).digest('hex') !== p.verificationHash
        || createHash('sha256').update(JSON.stringify(p.evidence.report)).digest('hex') !== p.evidence.proof.record.evidenceHash
        || createHash('sha256').update(JSON.stringify(p.evidence.provenance)).digest('hex') !== p.evidence.proof.record.provenanceHash
        || p.evidence.proof.record.candidateHash !== p.candidateHash || p.evidence.report?.candidateHash !== p.candidateHash
        || p.evidence.provenance?.record?.candidateHash !== p.candidateHash) reject()
      previous.verification = { verificationHash: p.verificationHash, verdict: p.evidence.proof.record.verdict, evidence: copy(p.evidence) }
    } else if (p.action === 'delivery') {
      if (record.kind !== 'registry' || !exact(p, [...fixed, 'attemptId', 'artifactHash', 'artifact'])
        || task.revoked || !previous || previous.attemptId !== p.attemptId || !previous.verification || previous.delivery
        || !sha(p.artifactHash) || digest(p.artifact) !== p.artifactHash
        || !exact(p.artifact, ['envelope', 'source', 'candidate']) || !exact(p.artifact.envelope, ['claim', 'signature'])) reject()
      const c = p.artifact.envelope.claim
      if (!c || c.version !== 1 || c.nativeCodex !== true || c.taskKey !== p.taskKey || c.attemptId !== previous.attemptId
        || c.scopeHash !== task.policy.scopeHash || c.approvalHash !== task.policy.approvalHash || c.runtimeHash !== task.policy.runtimeHash
        || c.candidateHash !== previous.candidateHash || c.terminationHash !== previous.terminal.terminationHash
        || c.verificationHash !== previous.verification.verificationHash || c.verdict !== previous.verification.verdict
        || p.artifact.candidate?.sha256 !== previous.candidateHash || p.artifact.source?.sha256 !== c.sourceHash) reject()
      previous.delivery = { artifactHash: p.artifactHash, artifact: copy(p.artifact) }
    } else if (p.action === 'repair') {
      if (record.kind !== 'registry' || !exact(p, [...fixed, 'attemptId', 'candidateHash', 'verifierEvidenceHash'])
        || task.revoked || !previous || previous.attemptId !== p.attemptId || !previous.terminal
        || previous.terminal.outcome !== 'candidate' || previous.repair || p.candidateHash !== previous.candidateHash
        || !sha(p.verifierEvidenceHash) || record.issuedAt >= task.policy.expiresAt) reject()
      previous.repair = p.verifierEvidenceHash
    } else reject()
  }
  return tasks
}

export class AttemptAuthority {
  #ledger; #sign; #authorize; #verifyEvidence; #now
  constructor({ ledger, signRecord, authorizeCurrent, verifyEvidence, now = () => Math.floor(Date.now() / 1000) }) {
    if (!(ledger instanceof AzureAuthorityLedger) || ![signRecord, authorizeCurrent, verifyEvidence, now].every(value => typeof value === 'function')) reject()
    this.#ledger = ledger; this.#sign = signRecord; this.#authorize = authorizeCurrent; this.#verifyEvidence = verifyEvidence; this.#now = now
  }
  async inspect(taskKey) {
    if (!sha(taskKey)) reject()
    const head = await this.#ledger.read(), task = reduce(head.records).get(taskKey)
    const usage = { knownInputTokens: 0, knownOutputTokens: 0, knownTotalTokens: 0, unknownAttempts: 0 }
    for (const attempt of task?.attempts ?? []) {
      const value = attempt.terminal?.usage
      if (!value) usage.unknownAttempts++
      else { usage.knownInputTokens += value.inputTokens; usage.knownOutputTokens += value.outputTokens; usage.knownTotalTokens += value.totalTokens }
    }
    return { task: task ? copy(task) : null, tipHash: head.tipHash, sequence: head.records.length,
      accounting: { attemptsSpent: task?.attempts.length ?? 0, remainingAttempts: task ? 3 - task.attempts.length : 0,
        usage: { ...usage, complete: usage.unknownAttempts === 0 } },
      executionAllowed: false, retryAuthorized: false }
  }
  async #append(kind, payload, proof) {
    // JSON-only detached values: asynchronous callbacks cannot mutate caller state.
    let p
    try { p = JSON.parse(JSON.stringify(payload)) } catch { reject() }
    const head = await this.#ledger.read(), records = head.records
    const state = reduce(records), before = state.get(p.taskKey)
    const issuedAt = this.#now()
    if (!positive(issuedAt)) reject()
    const record = { version: 1, sequence: records.length + 1, previousHash: head.tipHash,
      operationId: p.action === 'begin' ? p.runtime?.unit?.slice(15, -8) : randomUUID(), issuedAt, kind, payload: p }
    if (!uuid(record.operationId)) reject()
    // Replay validation runs before signing and before any external write.
    reduce([...records, record])
    const context = { action: p.action, policy: p.action === 'register' ? p : p.action === 'revise' ? p.policy : before.policy,
      attempt: before?.attempts.at(-1) ?? null, payload: p }
    const cleanup = p.action === 'settle'
    const restrictive = cleanup || p.action === 'revoke'
    if (!restrictive && (issuedAt >= context.policy.expiresAt || await this.#authorize(copy(context)) !== true)) reject()
    const needsProof = ['settle', 'repair', 'verification', 'delivery'].includes(p.action)
    const proofHash = !needsProof ? null : cleanup ? p.terminationHash : p.action === 'repair' ? p.verifierEvidenceHash
      : p.action === 'verification' ? p.verificationHash : createHash('sha256').update(JSON.stringify(p.artifact)).digest('hex')
    if (needsProof && (!(proof instanceof Uint8Array) || !proof.byteLength || proof.byteLength > 65536
      || createHash('sha256').update(proof).digest('hex') !== proofHash
      || await this.#verifyEvidence(copy(proof), copy(context)) !== true)) reject()
    const signature = await this.#sign(authoritySigningBytes(record))
    const checkedAt = this.#now()
    if (!positive(checkedAt) || checkedAt < issuedAt || checkedAt - issuedAt > 5
      || (!restrictive && (checkedAt >= context.policy.expiresAt || await this.#authorize(copy(context)) !== true))
      || (p.action === 'begin' && checkedAt >= p.deadline)
      || (p.action === 'admit' && checkedAt >= context.attempt.deadline)
      || (p.action === 'candidate' && checkedAt >= context.attempt.deadline)
      || (needsProof && await this.#verifyEvidence(copy(proof), copy(context)) !== true)) reject()
    const finalAt = this.#now()
    if (!positive(finalAt) || finalAt < checkedAt || finalAt - issuedAt > 5
      || (!restrictive && finalAt >= context.policy.expiresAt)
      || (['admit', 'candidate'].includes(p.action) && finalAt >= context.attempt.deadline)
      || (p.action === 'begin' && finalAt >= p.deadline)) reject()
    // The ledger's CAS denies concurrent changes; a lost acknowledgement is never retried.
    return this.#ledger.append(head, JSON.stringify({ record, signature }))
  }
  register(policy) { return this.#append('registry', { ...policy, protocol, action: 'register' }) }
  revise({ taskKey, previousRegistrationId, feedbackHash, policy }) {
    return this.#append('registry', { protocol, action: 'revise', taskKey, previousRegistrationId, feedbackHash,
      policy: { ...policy, taskKey, protocol, action: 'register' } })
  }
  begin({ taskKey, registrationId, attempt, reservationHash, hostId, bootId, deadline }) {
    const attemptId = randomUUID()
    return this.#append('intent', { protocol, action: 'begin', taskKey, registrationId, attempt,
      fence: attempt, reservationHash, runtime: { hostId, bootId, unit: `aisdlc-attempt-${attemptId}.service` }, deadline })
  }
  candidate({ taskKey, attemptId, candidateHash }) { return this.#append('candidate', { protocol, action: 'candidate', taskKey, attemptId, candidateHash }) }
  admit({ taskKey, attemptId, challengeNonce }) { return this.#append('intent', { protocol, action: 'admit', taskKey, attemptId, challengeNonce }) }
  settle({ taskKey, attemptId, terminationHash, outcome, usage: tokenUsage }, proof) {
    return this.#append('terminal', { protocol, action: 'settle', taskKey, attemptId, terminationHash, outcome, usage: tokenUsage }, proof)
  }
  repair({ taskKey, attemptId, candidateHash, verifierEvidenceHash }, proof) {
    return this.#append('registry', { protocol, action: 'repair', taskKey, attemptId, candidateHash, verifierEvidenceHash }, proof)
  }
  verification({ taskKey, attemptId, candidateHash, verificationHash, evidence }, proof) {
    return this.#append('registry', { protocol, action: 'verification', taskKey, attemptId, candidateHash, verificationHash, evidence }, proof)
  }
  deliver({ taskKey, attemptId, artifactHash, artifact }, proof) {
    return this.#append('registry', { protocol, action: 'delivery', taskKey, attemptId, artifactHash, artifact }, proof)
  }
  revoke({ taskKey, reasonHash }) { return this.#append('registry', { protocol, action: 'revoke', taskKey, reasonHash }) }
}
