// Refreshes signed review evidence only; never begins/admit/retries a coding turn.
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { nativeAuthorityCall, nativeExecutorConfiguration } from '../src/sdlc/native-transport'
import { publishNativeHead } from '../src/sdlc/native-publication'
import { retainDeliveryArtifact, withExecutionEligibility } from '../src/sdlc/task-coordinator'

const native = await nativeExecutorConfiguration()
if (!native?.enabled || !native.nativeRuntimeQualified || process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Current qualified native configuration required.')
const payload = await getPayload({ config })
try {
  do {
    if (Date.now() >= native.expiresAt * 1000) break
    const head = await withExecutionEligibility(payload, native.storyId, async current => {
      const snapshot = await current()
      if (snapshot.record.taskKey !== native.taskKey || snapshot.record.scopeHash !== native.scopeHash || snapshot.record.approvalHash !== native.approvalHash) throw new Error('Native review scope changed.')
      return nativeAuthorityCall(native, 'head', null, snapshot)
    })
    await publishNativeHead(native, head)
    await retainDeliveryArtifact(payload, native.storyId, head.artifact)
    if (process.argv.includes('--once')) break
    await new Promise(resolve => setTimeout(resolve, 5000))
  } while (Date.now() < native.expiresAt * 1000)
} catch {
  console.error('Native evidence feed stopped. Expired evidence cannot authorize review; no model turn was started.')
  process.exitCode = 1
} finally { await payload.destroy() }
process.exit(process.exitCode || 0)
