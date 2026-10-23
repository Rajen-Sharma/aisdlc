// Authentication of evidence from an independently selected current guardian key.
// A signature authenticates the trusted guardian's assertion; producer qualification
// must separately demonstrate that its process/launch-writer checks are sufficient.
import { createHash, KeyObject, verify } from 'node:crypto'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const canonical = value => value && typeof value === 'object'
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value)
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{2,63}$/.test(value)
const positive = value => Number.isSafeInteger(value) && value > 0
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
export const attemptEvidenceSigningBytes = record => Buffer.from('ai-sdlc/attempt-evidence/v1\n' + hash(canonical(record)))

export class AttemptEvidenceVerifier {
  #resolve; #now
  constructor({ resolveCurrent, now = () => Math.floor(Date.now() / 1000) }) {
    if (typeof resolveCurrent !== 'function' || typeof now !== 'function') throw new Error('Independent evidence configuration required.')
    this.#resolve = resolveCurrent; this.#now = now
  }
  async verify(bytes, context) {
    try {
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 32768
        || !context?.attempt || !['settle', 'repair'].includes(context.action)) return false
      const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if (!exact(envelope, ['record', 'signature'])) return false
      const { record: r, signature } = envelope
      const kind = context.action === 'settle' ? 'termination' : 'verification'
      const common = ['version', 'kind', 'keyId', 'authorityRevision', 'taskKey', 'attemptId', 'reservationHash', 'runtimeHash',
        'hostId', 'bootId', 'unit', 'observedAt', 'expiresAt']
      const fields = kind === 'termination' ? ['rootExited', 'cgroupEmpty', 'launchWritersDrained']
        : ['candidateHash', 'verdict', 'verifierHash', 'qualificationHash', 'image']
      if (!exact(r, [...common, ...fields]) || r.version !== 1 || r.kind !== kind || !slug(r.keyId)
        || !positive(r.authorityRevision) || ![r.taskKey, r.reservationHash, r.runtimeHash].every(sha)) return false
      const attempt = context.attempt
      if (r.taskKey !== context.policy.taskKey || r.attemptId !== attempt.attemptId
        || r.reservationHash !== attempt.reservationHash || r.runtimeHash !== context.policy.runtimeHash
        || ['hostId', 'bootId', 'unit'].some(key => r[key] !== attempt.runtime[key])) return false
      const now = this.#now()
      if (!positive(now) || !positive(r.observedAt) || !positive(r.expiresAt)
        || !positive(attempt.issuedAt) || r.observedAt < attempt.issuedAt || r.observedAt > now
        || r.expiresAt <= now || r.expiresAt <= r.observedAt || r.expiresAt - r.observedAt > 30) return false
      // Resolve every time; sender fields cannot select a key or historical revision.
      const selected = await this.#resolve({ kind, runtimeHash: context.policy.runtimeHash })
      if (!selected || selected.kind !== kind || selected.runtimeHash !== r.runtimeHash
        || selected.keyId !== r.keyId || selected.revision !== r.authorityRevision
        || !(selected.publicKey instanceof KeyObject) || selected.publicKey.type !== 'public' || selected.publicKey.asymmetricKeyType !== 'ed25519'
        || !positive(selected.validFrom) || !positive(selected.validUntil)
        || selected.validFrom > r.observedAt || selected.validUntil < r.expiresAt || selected.validUntil <= now) return false
      if (kind === 'termination') {
        if (r.rootExited !== true || r.cgroupEmpty !== true || r.launchWritersDrained !== true) return false
      } else if (r.verdict !== 'fail' || r.candidateHash !== attempt.candidateHash || !sha(r.candidateHash)
        || !sha(r.verifierHash) || !sha(r.qualificationHash) || r.verifierHash !== selected.verifierHash
        || r.qualificationHash !== selected.qualificationHash || r.image !== selected.image
        || typeof r.image !== 'string' || !/^node@sha256:[a-f0-9]{64}$/.test(r.image)) return false
      if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false
      const decoded = Buffer.from(signature, 'base64')
      if (decoded.length !== 64 || decoded.toString('base64') !== signature
        || !verify(null, attemptEvidenceSigningBytes(r), selected.publicKey, decoded)) return false
      const after = this.#now()
      return positive(after) && after >= now && after < r.expiresAt && after < selected.validUntil
    } catch { return false }
  }
}
