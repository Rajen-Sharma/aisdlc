// Native execution leases are separate from accounting receipts. Only trusted
// authority code may issue them after current ledger, eligibility and qualification checks.
import { createHash, KeyObject, verify } from 'node:crypto'
import { AttemptAuthority } from './authority-attempts.mjs'

const canonical = value => value && typeof value === 'object'
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const reject = () => { throw new Error('Native turn permit rejected.') }
export const turnPermitSigningBytes = lease => Buffer.from('ai-sdlc/turn-permit/v1\n' + createHash('sha256').update(canonical(lease)).digest('hex'))

/** The root guardian supplies independently pinned policy, actual host/boot and
 * a fresh local challenge. Admission additionally binds its one freshly started thread.
 */
/** @param {any} envelope @param {{policy:any,hostId:string,bootId:string,kind:string,challengeNonce:string,threadId?:string|null,attemptId?:string}} context @param {number} now */
export function authenticateTurnPermit(envelope, { policy, hostId, bootId, kind, challengeNonce, threadId = null, attemptId }, now) {
  if (!exact(envelope, ['lease', 'signature']) || !exact(envelope.lease, ['version', 'kind', 'keyId', 'authorityRevision', 'taskKey',
    'scopeHash', 'approvalHash', 'runtimeHash', 'reservationHash', 'attemptId', 'attempt', 'fence', 'hostId', 'bootId', 'unit',
    'challengeNonce', 'threadId', 'admissionId', 'issuedAt', 'expiresAt', 'deadline', 'model', 'maxTurns', 'subscriptionOnly', 'additionalChargesAllowed'])) reject()
  const l = envelope.lease
  if (l.version !== 1 || !['launch', 'admission'].includes(kind) || l.kind !== kind || !uuid(challengeNonce) || l.challengeNonce !== challengeNonce
    || !uuid(l.attemptId) || (attemptId && l.attemptId !== attemptId) || !uuid(l.admissionId)
    || !Number.isSafeInteger(l.attempt) || l.attempt < 1 || l.attempt > 3 || l.fence !== l.attempt
    || !uuid(hostId) || !uuid(bootId) || l.hostId !== hostId || l.bootId !== bootId || l.unit !== `aisdlc-attempt-${l.attemptId}.service`
    || l.threadId !== threadId || (kind === 'admission' && (typeof threadId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(threadId)))
    || l.model !== 'gpt-6-sol' || l.maxTurns !== 1 || l.subscriptionOnly !== true || l.additionalChargesAllowed !== false
    || !Number.isSafeInteger(now) || !Number.isSafeInteger(l.issuedAt) || !Number.isSafeInteger(l.expiresAt) || !Number.isSafeInteger(l.deadline)
    || l.issuedAt > now || l.issuedAt < 1 || l.expiresAt <= now || l.expiresAt - l.issuedAt > 15
    || l.expiresAt > l.deadline || l.deadline - l.issuedAt > 120 || policy.expiresAt <= now || policy.expiresAt < l.expiresAt
    || policy.nativeRuntimeQualified !== true || !(policy.publicKey instanceof KeyObject) || policy.publicKey.type !== 'public'
    || policy.publicKey.asymmetricKeyType !== 'ed25519') reject()
  for (const key of ['taskKey', 'scopeHash', 'approvalHash', 'runtimeHash']) if (!sha(l[key]) || l[key] !== policy[key]) reject()
  if (!sha(l.reservationHash) || !Number.isSafeInteger(l.authorityRevision) || l.authorityRevision < 1
    || l.authorityRevision !== policy.authorityRevision || l.keyId !== policy.keyId
    || typeof l.keyId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(l.keyId)
    || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) reject()
  const signature = Buffer.from(envelope.signature, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== envelope.signature
    || !verify(null, turnPermitSigningBytes(l), policy.publicKey, signature)) reject()
  return structuredClone(l)
}

export class TurnPermitIssuer {
  #authority; #sign; #eligible; #qualified; #now
  constructor({ authority, signPermit, authorizeCurrent, resolveQualified, now = () => Math.floor(Date.now() / 1000) }) {
    if (!(authority instanceof AttemptAuthority) || ![signPermit, authorizeCurrent, resolveQualified, now].every(v => typeof v === 'function')) reject()
    this.#authority = authority; this.#sign = signPermit; this.#eligible = authorizeCurrent; this.#qualified = resolveQualified; this.#now = now
  }
  async #issue(request, kind) {
    const deny = stage => { throw new Error(`Native permit denied at ${stage}.`) }
    if (!exact(request, ['taskKey', 'attemptId', 'challengeNonce', 'threadId']) || !sha(request.taskKey) || !uuid(request.attemptId)
      || !uuid(request.challengeNonce) || (kind === 'launch' ? request.threadId !== null
        : typeof request.threadId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(request.threadId))) reject()
    const before = await this.#authority.inspect(request.taskKey), task = before.task, attempt = task?.attempts.at(-1)
    if (!task || task.revoked || !attempt || attempt.attemptId !== request.attemptId || attempt.terminal
      || attempt.candidateHash || attempt.admission) deny('attempt-state')
    const context = { policy: task.policy, attempt, threadId: request.threadId }
    const qualified = await this.#qualified(structuredClone(context))
    const start = this.#now()
    if (!Number.isSafeInteger(start) || start < 1 || !qualified || qualified.nativeRuntimeQualified !== true || qualified.runtimeHash !== task.policy.runtimeHash
      || await this.#eligible(structuredClone(context)) !== true || start >= attempt.deadline || start >= task.policy.expiresAt) deny('qualification')
    let head = before, admissionId = attempt.attemptId
    if (kind === 'admission') {
      const receipt = await this.#authority.admit({ taskKey: request.taskKey, attemptId: request.attemptId, challengeNonce: request.challengeNonce })
      head = await this.#authority.inspect(request.taskKey)
      if (head.tipHash !== receipt.tipHash || head.task?.attempts.at(-1)?.admission?.operationId !== receipt.operationId) deny('admission-tip')
      admissionId = receipt.operationId
    }
    const lease = { version: 1, kind, keyId: qualified.keyId, authorityRevision: qualified.authorityRevision,
      taskKey: request.taskKey, scopeHash: task.policy.scopeHash, approvalHash: task.policy.approvalHash, runtimeHash: task.policy.runtimeHash,
      reservationHash: attempt.reservationHash, attemptId: attempt.attemptId, attempt: attempt.attempt, fence: attempt.fence,
      ...attempt.runtime, challengeNonce: request.challengeNonce, threadId: request.threadId, admissionId,
      issuedAt: start, expiresAt: Math.min(start + 15, attempt.deadline, task.policy.expiresAt, qualified.expiresAt), deadline: attempt.deadline,
      model: 'gpt-6-sol', maxTurns: 1, subscriptionOnly: true, additionalChargesAllowed: false }
    const envelope = { lease, signature: await this.#sign(turnPermitSigningBytes(lease)) }
    // Neither signing delay, changed eligibility nor a concurrent ledger transition
    // may turn an old snapshot into permission. A committed admission is not refunded.
    const after = await this.#authority.inspect(request.taskKey), current = await this.#qualified(structuredClone(context)), now = this.#now()
    if (after.tipHash !== head.tipHash || now < start || now - start > 5 || current?.keyId !== qualified.keyId
      || current?.authorityRevision !== qualified.authorityRevision || current?.nativeRuntimeQualified !== true
      || current?.runtimeHash !== qualified.runtimeHash || current?.expiresAt !== qualified.expiresAt
      || current?.publicKey?.export({ format: 'der', type: 'spki' }).toString('base64') !== qualified.publicKey?.export({ format: 'der', type: 'spki' }).toString('base64')
      || await this.#eligible(structuredClone(context)) !== true) deny('freshness-recheck')
    const finalAt = this.#now()
    if (finalAt < start || finalAt - start > 5) deny('signing-deadline')
    authenticateTurnPermit(envelope, { policy: { ...qualified, ...task.policy }, ...attempt.runtime, kind,
      challengeNonce: request.challengeNonce, threadId: request.threadId, attemptId: request.attemptId }, finalAt)
    return envelope
  }
  launch(request) { return this.#issue(structuredClone(request), 'launch') }
  admit(request) { return this.#issue(structuredClone(request), 'admission') }
}
