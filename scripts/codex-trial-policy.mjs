import assert from 'node:assert/strict'

// Eligibility preflight only. Never constructs or launches a model invocation.
export function assessCodexTrial({ version, status, execHelp, features }) {
  for (const value of [version, status, execHelp, features]) {
    assert.ok(typeof value === 'string' && Buffer.byteLength(value) <= 32768)
  }
  assert.equal(version.trim(), 'codex-cli 0.155.1', 'Unqualified CLI version.')
  assert.equal(status.trim(), 'Logged in using ChatGPT', 'Subscription authentication not confirmed.')
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--output-schema']) {
    assert.ok(execHelp.includes(flag), 'Required CLI capability absent.')
  }
  assert.match(features, /^shell_tool\s+stable\s+(true|false)\s*$/m)
  return {
    version: 1, cliVersion: '0.155.1', authentication: 'chatgpt',
    provider: 'codex', subscriptionOnly: true, additionalChargesAllowed: false,
    maxAttempts: 3, localAuthOnly: true, publicCIAuthAllowed: false,
    authenticationConfirmed: true, toolBoundaryQualified: false,
    modelCallAllowed: false, executionAllowed: false, retryAuthorized: false,
    remaining: ['qualify-complete-tool-boundary', 'qualify-cancellation-and-output-bounds', 'bind-exact-task-and-approval-gates'],
  }
}
