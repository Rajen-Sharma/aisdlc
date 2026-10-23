import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import type { DeliveryClaim } from './delivery-artifact'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type ShowcaseCase = { id: string; input: unknown; expected: unknown; observed: unknown; passed: boolean }
/** The authenticated artifact claim commits to the exact signed receipt, which
 * commits to the report and native provenance. Reading it grants no execution.
 */
export function authenticateShowcase(input: unknown, claim: DeliveryClaim) {
  const reject = (): never => { throw new Error('Recorded showcase evidence rejected.') }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 131072) return reject()
  const { proof, report, provenance } = input as any
  if (!proof?.record || !report || !provenance?.record || hash(proof) !== claim.verificationHash) return reject()
  const r = proof.record
  if (r.version !== 2 || r.kind !== 'verification' || r.evidenceHash !== hash(report) || r.provenanceHash !== hash(provenance)
    || r.taskKey !== claim.taskKey || r.attemptId !== claim.attemptId || r.candidateHash !== claim.candidateHash
    || r.runtimeHash !== claim.runtimeHash || r.verifierHash !== claim.verifierHash || r.qualificationHash !== claim.qualificationHash
    || r.image !== claim.image || r.verdict !== claim.verdict || report.candidateHash !== claim.candidateHash
    || report.checkPolicyHash !== claim.checkPolicyHash || report.verifierHash !== claim.verifierHash || report.image !== claim.image
    || report.verdict !== claim.verdict || report.cleanupVerified !== true || provenance.record.candidateHash !== claim.candidateHash
    || provenance.record.attemptId !== claim.attemptId || provenance.record.taskKey !== claim.taskKey
    || !Number.isInteger(report.casesTotal) || report.casesTotal < 1 || report.casesTotal > 32
    || !Array.isArray(report.replay) || report.replay.length !== report.casesTotal
    || !Number.isInteger(report.casesPassed) || report.casesPassed < 0 || report.casesPassed > report.casesTotal
    || report.replay.some((entry: any) => !entry || typeof entry.id !== 'string' || entry.id.length > 100 || typeof entry.passed !== 'boolean'
      || !['input', 'expected', 'observed'].every(key => Object.hasOwn(entry, key)))
    || report.replay.filter((entry: any) => entry.passed).length !== report.casesPassed
    || !Number.isInteger(report.elapsedMs) || report.elapsedMs < 0) return reject()
  return { cases: structuredClone(report.replay) as ShowcaseCase[], casesPassed: report.casesPassed as number,
    elapsedMs: report.elapsedMs as number, exitCode: report.exitCode as number | null,
    usage: structuredClone(provenance.record.usage) as { inputTokens: number; outputTokens: number; totalTokens: number } | null }
}
export async function recordedShowcase(artifactHash: string, claim: DeliveryClaim) {
  if (!/^[a-f0-9]{64}$/.test(artifactHash)) return null
  try {
    const file = path.resolve(`.local/delivery-evidence-${artifactHash}.json`), stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 131072) return null
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const bytes = Buffer.alloc(131073), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0), after = await handle.stat()
      if (bytesRead !== stat.size || bytesRead > 131072 || after.ino !== stat.ino || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) return null
      return authenticateShowcase(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')), claim)
    } finally { await handle.close() }
  } catch { return null }
}
