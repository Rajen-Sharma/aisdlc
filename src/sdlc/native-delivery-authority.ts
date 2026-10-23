import { createHash } from 'node:crypto'
import { AttemptAuthority } from '../../scripts/authority-attempts.mjs'
import { AttemptEvidenceVerifier, attemptEvidenceSigningBytes } from '../../scripts/attempt-evidence.mjs'
import { authenticateNativeCandidate } from './native-candidate'
import { authenticateDeliveryArtifact, deliverySigningBytes, type DeliveryClaim, type DeliveryTrust } from './delivery-artifact'
import { currentDeliverySigningBytes, type CurrentDelivery } from './delivery-current'
import { validateSourceCapsule, type SourceCapsule } from './source-capsule'
import { verifyTaskboardCandidate } from './taskboard-verifier'
import { digest } from './contracts'

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value))
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const reject = (): never => { throw new Error('Native delivery authority rejected.') }
export type NativeDeliveryConfiguration = {
  storyId: number; taskKey: string; scopeHash: string; approvalHash: string; source: SourceCapsule
  contract: { sourceHash: string; checkPolicyHash: string; allowedPaths: string[]; acceptanceCriteria: string[] }
  guardian: { keyId: string; revision: number; publicKey: import('node:crypto').KeyObject; publicKeyDer: string }
  trust: DeliveryTrust; policyText: string; runnerSource: string; workspaceRoot: string
}

/** Private authority process only. The native caller cannot select verifier code,
 * policy, keys, environment, commands, paths or qualification. No public route.
 */
export class NativeDeliveryAuthority {
  #attempts: AttemptAuthority; #proof: AttemptEvidenceVerifier; #sign: (input: Uint8Array) => Promise<string>
  #config: NativeDeliveryConfiguration; #now: () => number
  constructor({ attempts, proofVerifier, signRecord, configuration, now = () => Math.floor(Date.now() / 1000) }: {
    attempts: AttemptAuthority; proofVerifier: AttemptEvidenceVerifier; signRecord: (input: Uint8Array) => Promise<string>
    configuration: NativeDeliveryConfiguration; now?: () => number
  }) {
    if (!(attempts instanceof AttemptAuthority) || !(proofVerifier instanceof AttemptEvidenceVerifier)
      || typeof signRecord !== 'function' || typeof now !== 'function') reject()
    this.#attempts = attempts; this.#proof = proofVerifier; this.#sign = signRecord; this.#now = now
    const { guardian, trust, ...json } = configuration
    this.#config = { ...structuredClone(json), guardian: { ...guardian }, trust: { ...trust } }
    validateSourceCapsule(this.#config.source, this.#config.contract.sourceHash)
  }
  async #current(attemptId?: string) {
    const head = await this.#attempts.inspect(this.#config.taskKey), task = head.task, attempt = task?.attempts.at(-1)
    if (!task || task.revoked || task.policy.scopeHash !== this.#config.scopeHash || task.policy.approvalHash !== this.#config.approvalHash
      || task.policy.runtimeHash !== this.#config.trust.runtimeHash || task.policy.expiresAt <= this.#now()
      || (attemptId && attempt?.attemptId !== attemptId)) return reject()
    return { head, task, attempt }
  }
  #expected() {
    const c = this.#config
    return { storyId: c.storyId, taskKey: c.taskKey, scopeHash: c.scopeHash, approvalHash: c.approvalHash,
      sourceHash: c.contract.sourceHash, checkPolicyHash: c.contract.checkPolicyHash, allowedPaths: c.contract.allowedPaths,
      criteriaTotal: c.contract.acceptanceCriteria.length }
  }
  async finish(input: { attemptId: string; candidate: unknown; provenance: unknown; terminationProof: unknown }) {
    const { task, attempt } = await this.#current(input.attemptId)
    if (!attempt || attempt.terminal) return reject()
    const termination = bytes(input.terminationProof)
    if (await this.#proof.verify(termination, { action: 'settle', policy: task.policy, attempt }) !== true) return reject()
    let usage = null
    if (input.candidate !== null) {
      const native = authenticateNativeCandidate(input.provenance, input.candidate, { policy: task.policy, attempt,
        sourceHash: this.#config.contract.sourceHash, guardian: this.#config.guardian }, this.#now())
      const base = this.#config.source
      if (native.capsule.sha256 === base.sha256 || base.files.length !== native.capsule.files.length || base.files.some((file, index) =>
        file.path !== native.capsule.files[index].path || (file.sha256 !== native.capsule.files[index].sha256 && !this.#config.contract.allowedPaths.includes(file.path)))) return reject()
      usage = native.record.usage
      if (!attempt.candidateHash) await this.#attempts.candidate({ taskKey: this.#config.taskKey, attemptId: input.attemptId, candidateHash: native.capsule.sha256 })
      else if (attempt.candidateHash !== native.capsule.sha256) return reject()
    } else if (input.provenance !== null || attempt.candidateHash) return reject()
    await this.#attempts.settle({ taskKey: this.#config.taskKey, attemptId: input.attemptId, terminationHash: hash(termination),
      outcome: input.candidate === null ? 'failed' : 'candidate', usage }, termination)
    return { settled: true, candidateRetained: input.candidate !== null, executionAllowed: false, retryAuthorized: false }
  }
  async verify(input: { attemptId: string; candidate: unknown; provenance: unknown }) {
    const { task, attempt } = await this.#current(input.attemptId), c = this.#config
    if (!attempt || attempt.terminal?.outcome !== 'candidate' || !attempt.admission) return reject()
    const native = authenticateNativeCandidate(input.provenance, input.candidate, { policy: task.policy, attempt,
      sourceHash: c.contract.sourceHash, guardian: c.guardian }, this.#now())
    if (native.capsule.sha256 !== attempt.candidateHash) return reject()
    if (attempt.delivery) {
      const retained = await this.head()
      return { artifactHash: retained.current.state.artifactHash, artifact: retained.artifact, evidence: retained.evidence,
        executionAllowed: false, retryAuthorized: false }
    }
    let evidence = attempt.verification?.evidence
    let verificationHash = attempt.verification?.verificationHash
    let report = evidence?.report
    if (evidence && (digest(evidence.provenance) !== digest(input.provenance) || report?.candidateHash !== native.capsule.sha256)) return reject()
    if (!evidence) {
    report = await verifyTaskboardCandidate({ capsule: native.capsule, candidateHash: native.capsule.sha256,
      policyText: c.policyText, policyHash: c.contract.checkPolicyHash, runnerSource: c.runnerSource,
      runnerHash: c.trust.verifierHash, workspaceRoot: c.workspaceRoot })
    // A changed external policy during checks cannot publish or authorize a repair.
    const checked = await this.#current(input.attemptId)
    if (checked.attempt?.candidateHash !== native.capsule.sha256 || checked.attempt.verification) return reject()
    const observedAt = this.#now()
    const record = { version: 2, kind: 'verification', keyId: c.trust.keyId, authorityRevision: c.trust.authorityRevision,
      taskKey: c.taskKey, attemptId: input.attemptId, reservationHash: attempt.reservationHash, runtimeHash: c.trust.runtimeHash,
      ...attempt.runtime, observedAt, expiresAt: observedAt + 30, candidateHash: native.capsule.sha256, verdict: report.verdict,
      verifierHash: c.trust.verifierHash, qualificationHash: c.trust.qualificationHash, image: c.trust.image,
      evidenceHash: hash(bytes(report)), provenanceHash: hash(bytes(input.provenance)) }
    const proof = { record, signature: await this.#sign(attemptEvidenceSigningBytes(record)) }
    verificationHash = hash(bytes(proof)); evidence = { proof, report, provenance: input.provenance }
    await this.#attempts.verification({ taskKey: c.taskKey, attemptId: input.attemptId, candidateHash: native.capsule.sha256, verificationHash, evidence }, bytes(proof))
    }
    const claim: DeliveryClaim = { version: 1, keyId: c.trust.keyId, authorityRevision: c.trust.authorityRevision,
      taskKey: c.taskKey, storyId: c.storyId, scopeHash: c.scopeHash, approvalHash: c.approvalHash, attemptId: input.attemptId, attempt: attempt.attempt,
      sourceHash: c.contract.sourceHash, candidateHash: native.capsule.sha256, checkPolicyHash: c.contract.checkPolicyHash,
      verifierHash: c.trust.verifierHash, qualificationHash: c.trust.qualificationHash, image: c.trust.image, runtimeHash: c.trust.runtimeHash,
      terminationHash: attempt.terminal.terminationHash, verificationHash, verdict: report.verdict,
      criteriaPassed: report.verdict === 'pass' ? c.contract.acceptanceCriteria.length : 0, criteriaTotal: c.contract.acceptanceCriteria.length,
      nativeCodex: true, issuedAt: this.#now() }
    const artifact = { envelope: { claim, signature: await this.#sign(deliverySigningBytes(claim)) }, source: c.source, candidate: native.capsule }
    const authenticated = authenticateDeliveryArtifact(artifact, c.trust, this.#now(), this.#expected())
    // The first delivery uses the bounded signed ledger, including its full source.
    // Oversize evidence is rejected rather than weakening the retained hash chain.
    await this.#attempts.deliver({ taskKey: c.taskKey, attemptId: input.attemptId, artifactHash: authenticated.artifactHash, artifact }, bytes(artifact))
    return { artifactHash: authenticated.artifactHash, artifact, evidence, executionAllowed: false, retryAuthorized: false }
  }
  async head() {
    const { head, task, attempt } = await this.#current(), c = this.#config
    if (!attempt?.delivery || !attempt.verification || !attempt.terminal) return reject()
    const authenticated = authenticateDeliveryArtifact(attempt.delivery.artifact, c.trust, this.#now(), this.#expected())
    if (authenticated.artifactHash !== attempt.delivery.artifactHash) return reject()
    const issuedAt = this.#now(), expiresAt = Math.min(issuedAt + 15, c.trust.expiresAt, task.policy.expiresAt)
    const state: CurrentDelivery = { version: 1, keyId: c.trust.keyId, authorityRevision: c.trust.authorityRevision,
      taskKey: c.taskKey, artifactHash: authenticated.artifactHash, scopeHash: c.scopeHash, approvalHash: c.approvalHash,
      attemptId: attempt.attemptId, terminationHash: attempt.terminal.terminationHash, verificationHash: attempt.verification.verificationHash,
      issuedAt, expiresAt }
    const current = { state, signature: await this.#sign(currentDeliverySigningBytes(state)) }
    const after = await this.#current()
    if (after.head.tipHash !== head.tipHash || this.#now() < issuedAt || this.#now() >= expiresAt || this.#now() - issuedAt > 5) return reject()
    return { current, artifact: authenticated.artifact, evidence: attempt.verification.evidence, accounting: head.accounting }
  }
}
