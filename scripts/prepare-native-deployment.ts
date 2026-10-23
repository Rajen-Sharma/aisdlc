// Local, public-only deployment packet. No cloud mutation, login or model call.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { inspectExecutionEligibility } from '../src/sdlc/task-coordinator'
import { digest } from '../src/sdlc/contracts'
import { validateSourceCapsule } from '../src/sdlc/source-capsule'

if (process.argv.length !== 2) throw new Error('This packet prepares only the accepted first delivery.')
const payload = await getPayload({ config })
try {
  const proposal = JSON.parse(await readFile('docs/planning/taskboard-first-delivery.json', 'utf8'))
  const latest = (await payload.db.pool.query("SELECT * FROM sdlc_stories WHERE project_key=$1 AND story_key=$2 ORDER BY revision DESC LIMIT 1",
    [proposal.proposedStory.projectKey, proposal.proposedStory.storyKey])).rows[0]
  if (!latest || latest.scope_hash !== proposal.proposedScopeHash) throw new Error('First task changed; prepare its new approved source capsule separately.')
  const eligibility = await inspectExecutionEligibility(payload, Number(latest.id))
  validateSourceCapsule(proposal.sourceCapsule, eligibility.record.sourceHash)
  if (digest(proposal.proposedStory) !== eligibility.record.scopeHash) throw new Error('Prepared task contract mismatch.')
  const built = JSON.parse(execFileSync(process.execPath, ['scripts/package-native-runtime.mjs'], { encoding: 'utf8', windowsHide: true }))
  const policy = Buffer.from(proposal.checkPolicy, 'utf8')
  if (createHash('sha256').update(policy).digest('hex') !== eligibility.record.checkPolicyHash) throw new Error('Approved verifier policy mismatch.')
  const root = path.resolve('.local/native-deployment'); await mkdir(root, { recursive: true })
  const directory = await mkdtemp(path.join(root, 'packet-'))
  const plan = {
    version: 1, preparedAt: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    package: built, storyId: Number(latest.id), task: proposal.proposedStory, source: proposal.sourceCapsule, eligibility,
    azure: { subscriptionId: 'b7c13fa8-f215-42a7-b04b-b48e78f1ba72', resourceGroup: 'rg-aisdlc-trial-aue',
      clientVm: 'vm-aisdlc-client', toolsVm: 'vm-aisdlc-tools', requestedWindowHours: 48,
      planningCeilingUsd: 10, trialCreditsOnly: true, payAsYouGoAllowed: false, priorWindowExpired: true },
    controls: { model: 'gpt-6-sol', subscriptionOnly: true, additionalChargesAllowed: false,
      maxAttempts: 3, maxTurnsPerAttempt: 1, maxAttemptSeconds: 120, automaticRequestRetries: 0 },
    steps: ['Confirm protected trial credit/subscription state and renewed 48-hour authorization',
      'Start only the two named VMs; retain scheduled shutdown and explicit stop deadline',
      'Verify management-plane SSH fingerprints before native SSH',
      'Transfer only manifest-listed public package files; install with exact manifest hash',
      'Check private-host isolation and pinned runtime metadata without model calls',
      'Export service public keys only; prepare exact source/approval/runtime-bound policies',
      'Activate only after qualification and current approval checks',
      'Run the bounded worker; retain independent verdict and start the read-only evidence feed',
      'Human reviews exact code security, outcome and MVP in the portal; feedback requires new scope approval',
      'Stop and deallocate both VMs before the renewed deadline'],
    nativeRuntimeQualified: false, executionAllowed: false, cloudMutations: 0, realModelCalls: 0,
  }
  await writeFile(path.join(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(path.join(directory, 'taskboard-policy.json'), policy, { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify({ directory, storyId: plan.storyId, scopeHash: eligibility.record.scopeHash,
    manifestHash: built.manifestHash, planHash: digest(plan), executionAllowed: false, cloudMutations: 0 }))
} finally { await payload.destroy() }
process.exit(0)
