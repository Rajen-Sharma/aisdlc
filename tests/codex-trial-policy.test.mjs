import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessCodexTrial } from '../scripts/codex-trial-policy.mjs'
const input = {
  version: 'codex-cli 0.155.1', status: 'Logged in using ChatGPT',
  execHelp: '--ignore-user-config --ignore-rules --ephemeral --output-schema',
  features: 'shell_tool stable true\n',
}
test('confirmed subscription metadata never qualifies tools or authorizes inference', () => {
  const result = assessCodexTrial(input)
  assert.equal(result.authenticationConfirmed, true)
  for (const key of ['additionalChargesAllowed', 'publicCIAuthAllowed', 'toolBoundaryQualified', 'modelCallAllowed', 'executionAllowed', 'retryAuthorized']) assert.equal(result[key], false)
  assert.equal(result.maxAttempts, 3)
})
test('API, unknown, mixed authentication and unqualified CLI versions deny', () => {
  for (const status of ['Logged in using an API key', '', 'Logged in using ChatGPT\nAPI key enabled']) assert.throws(() => assessCodexTrial({ ...input, status }))
  assert.throws(() => assessCodexTrial({ ...input, version: 'codex-cli 0.155.2' }))
})
test('missing controls, unrecognized tool support and excessive diagnostics deny', () => {
  for (const flag of input.execHelp.split(' ')) assert.throws(() => assessCodexTrial({ ...input, execHelp: input.execHelp.replace(flag, '') }))
  assert.throws(() => assessCodexTrial({ ...input, features: 'shell_tool removed false' }))
  assert.throws(() => assessCodexTrial({ ...input, status: 'x'.repeat(32769) }))
})
