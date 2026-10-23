// Qualified private-runtime orchestration only. No model runs until both the
// local operator configuration and private authority/guardian independently permit it.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { digest } from '../src/sdlc/contracts'
import { nativeAuthorityCall, nativeExecutorConfiguration, nativeSshArguments, nativeSshBinary, nativeSshEnvironment } from '../src/sdlc/native-transport'
import { publishNativeHead, writeNativeRecord } from '../src/sdlc/native-publication'
import { retainDeliveryArtifact, withExecutionEligibility } from '../src/sdlc/task-coordinator'
import { boundedJsonChannel } from './bounded-json-channel.mjs'

const native = await nativeExecutorConfiguration()
if (!native?.enabled || !native.nativeRuntimeQualified || Date.now() >= native.expiresAt * 1000 || process.argv.length !== 2) throw new Error('Native runtime is not configured and qualified for a current authorized window.')
const selected = native
const payload = await getPayload({ config })
const status = (phase: string, attempt?: number) => writeNativeRecord(`native-status-${selected.taskKey}.json`, {
  version: 1, taskKey: selected.taskKey, storyId: selected.storyId, scopeHash: selected.scopeHash, phase, attempt: attempt ?? null,
  updatedAt: new Date().toISOString(), executionAllowed: false,
})
async function retainedAttempt(attemptId: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attemptId)) throw new Error('Invalid native attempt.')
  const file = path.resolve(`.local/native-attempt-${attemptId}.json`), info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 262144) throw new Error('Native handoff unavailable; attempt remains uncertain.')
  const text = await readFile(file, 'utf8')
  if (Buffer.byteLength(text) > 262144) throw new Error('Native handoff exceeds bound.')
  return JSON.parse(text)
}
try {
  await status('preparing')
  const delivered = await withExecutionEligibility(payload, selected.storyId, async current => {
    const checked = async () => {
      const snapshot = await current()
      if (snapshot.record.taskKey !== selected.taskKey || snapshot.record.scopeHash !== selected.scopeHash || snapshot.record.approvalHash !== selected.approvalHash) throw new Error('Native task scope changed.')
      return snapshot
    }
    const call = async (action: string, input: unknown = null) => nativeAuthorityCall(selected, action, input, await checked())
    const initial = await call('inspect')
    if (initial.task?.revoked) await call('revise')
    else await call('register')
    for (;;) {
      const external = await call('inspect'), task = external.task, previous = task?.attempts.at(-1)
      if (!task || task.revoked || task.policy.runtimeHash !== selected.runtimeHash) throw new Error('Current native policy is unavailable.')
      const priorScope = previous && task.attempts.length <= task.generationStart
      if (!priorScope && previous?.delivery && previous.verification?.verdict === 'pass') return call('head')
      if (previous && !previous.terminal) {
        // Reconciliation uses the retained signed cleanup handoff. Missing or
        // expired proof never permits another model turn or a refunded attempt.
        const saved = await retainedAttempt(previous.attemptId)
        await call('finish', saved)
        continue
      }
      if (!priorScope && previous?.terminal?.outcome === 'candidate') {
        const saved = await retainedAttempt(previous.attemptId)
        await status('verifying', previous.attempt)
        const verified = await call('verify', { attemptId: previous.attemptId, candidate: saved.candidate, provenance: saved.provenance })
        if (verified.artifact.envelope.claim.verdict === 'pass') return call('head')
        if (verified.artifact.envelope.claim.verdict !== 'fail') throw new Error('Verifier outcome is unresolved; no repair was authorized.')
        if (external.accounting.remainingAttempts === 0) throw new Error('Three attempts consumed; no additional model turn authorized.')
        if (!previous.repair) await call('repair', { attemptId: previous.attemptId })
      }
      if (external.accounting.remainingAttempts === 0) throw new Error('Three attempts consumed; no additional model turn authorized.')
      await status('awaiting-guardian', (previous?.attempt ?? 0) + 1)
      const child = spawn(nativeSshBinary(), nativeSshArguments(selected, 'client'), { env: nativeSshEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let exited = false, transportFailed = false, diagnosticBytes = 0
      child.on('error', () => { transportFailed = true }); child.stdin.on('error', () => { transportFailed = true })
      child.stderr.on('data', part => { diagnosticBytes += part.length; if (diagnosticBytes > 65536) transportFailed = true })
      const closed = new Promise(resolve => child.once('close', code => { exited = true; resolve(code) }))
      const channel = boundedJsonChannel(child.stdout)
      const timer = setTimeout(() => { transportFailed = true; child.kill('SIGKILL') }, 140000)
      try {
        const hello = await channel.read(Date.now() + 15000)
        if (transportFailed || hello.kind !== 'hello' || hello.runtimeHash !== selected.runtimeHash) throw new Error('Guardian identity mismatch.')
        const snapshot = await checked()
        const began = await call('begin', { hostId: hello.hostId, bootId: hello.bootId,
          reservationHash: digest({ snapshotHash: snapshot.snapshotHash, hostId: hello.hostId, bootId: hello.bootId, nonce: randomUUID() }) })
        const attemptId = began.operationId
        if (typeof attemptId !== 'string' || !/^[a-f0-9-]{36}$/.test(attemptId)) throw new Error('Invalid external intent.')
        const permit = await call('launch', { attemptId, challengeNonce: hello.challengeNonce, threadId: null })
        child.stdin.write(JSON.stringify({ kind: 'launch', permit }) + '\n')
        await status('running', (previous?.attempt ?? 0) + 1)
        let event = await channel.read(Date.now() + 120000)
        if (event.kind === 'admission-challenge') {
          if (event.attemptId !== attemptId) throw new Error('Native admission mismatch.')
          const admission = await call('admit', { attemptId, threadId: event.threadId, challengeNonce: event.challengeNonce })
          child.stdin.write(JSON.stringify({ kind: 'admission', permit: admission }) + '\n')
          event = await channel.read(Math.min(Date.now() + 120000, permit.lease.deadline * 1000 + 10000))
        }
        if (transportFailed || event.kind !== 'finished' || event.attemptId !== attemptId) throw new Error('Native attempt remains uncertain.')
        child.stdin.end()
        const handoff = { attemptId, candidate: event.candidate, provenance: event.provenance, terminationProof: event.terminationProof }
        await writeNativeRecord(`native-attempt-${attemptId}.json`, handoff)
        await call('finish', handoff)
        if (event.candidate === null) throw new Error('No candidate was produced; resolve the failure before starting another turn.')
      } finally {
        clearTimeout(timer); channel.dispose(); child.stdin.end()
        if (!exited) {
          const exitTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
          try { await closed } finally { clearTimeout(exitTimer) }
        }
      }
    }
  })
  await publishNativeHead(selected, delivered)
  await retainDeliveryArtifact(payload, selected.storyId, delivered.artifact)
  await status('awaiting-review', delivered.artifact.envelope.claim.attempt)
  console.log(JSON.stringify({ artifactHash: delivered.current.state.artifactHash, awaitingHumanReview: true, additionalModelTurnsStarted: false }))
} catch {
  await status('uncertain').catch(() => {})
  console.error('Native cycle paused: independent state or proof is unavailable. No request was retried and no additional attempt was authorized.')
  process.exitCode = 1
} finally { await payload.destroy() }
process.exit(process.exitCode || 0)
