// Reads CLI metadata only. Does not read/copy auth files or launch inference.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assessCodexTrial } from './codex-trial-policy.mjs'

if (process.platform !== 'win32') throw new Error('Selected local Windows preflight only.')
const exec = promisify(execFile)
const env = {}
for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
  if (process.env[key]) env[key] = process.env[key]
}
// No OPENAI_API_KEY, CODEX_API_KEY, custom endpoint, proxy, or inherited model config.
const cli = path.join(env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js')
const invoke = async args => {
  const result = await exec(process.execPath, [cli, ...args], { env, timeout: 15000, maxBuffer: 32768, windowsHide: true })
  return (result.stdout + result.stderr).trim()
}
let report
try {
  const version = await invoke(['--version'])
  const status = await invoke(['-c', 'forced_login_method="chatgpt"', 'login', 'status'])
  const execHelp = await invoke(['exec', '--help'])
  const features = await invoke(['features', 'list'])
  report = assessCodexTrial({ version, status, execHelp, features })
} catch {
  report = { version: 1, authenticationConfirmed: false, modelCallAllowed: false, executionAllowed: false, retryAuthorized: false, failure: 'Local Codex preflight failed; no model invocation attempted.' }
  process.exitCode = 1
}
await mkdir('.local/codex-trial', { recursive: true })
await writeFile('.local/codex-trial/preflight.json', JSON.stringify({ observedAt: new Date().toISOString(), ...report }, null, 2))
console.log(JSON.stringify(report))
