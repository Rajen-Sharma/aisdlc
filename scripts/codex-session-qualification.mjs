// Real pinned Codex + a credential-free loopback provider. No external model call.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCodexTurn } from './codex-turn-session.mjs'

const binary = process.argv[2]
assert.ok(path.isAbsolute(binary))
const root = await mkdtemp(path.join(tmpdir(), 'aisdlc-session-'))
const home = path.join(root, 'home'), workspace = path.join(root, 'workspace')
await mkdir(home, { mode: 0o700 }); await mkdir(workspace, { mode: 0o700 })
const sourceHash = 'b'.repeat(64)
const candidate = JSON.stringify({ version: 1, sourceHash, files: [{ path: 'src/synthetic.mjs', content: '// synthetic protocol control only\n' }] })
let requests = 0, providerFailure = false
let providerStage = 'not-requested', sessionStage = 'startup', protocolFailure = 'none', protocolStage = 'none'
const provider = createServer(async (request, response) => {
  try {
    providerStage = 'request-target'
    assert.equal(request.url, '/v1/responses'); assert.equal(request.headers.authorization, undefined)
    providerStage = 'request-count'
    assert.equal(++requests, 1)
    const chunks = []; let size = 0
    for await (const part of request) { size += part.length; assert.ok(size <= 262144); chunks.push(part) }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    providerStage = 'model'
    assert.equal(body.model, 'gpt-6-sol')
    providerStage = 'tool-surface'
    assert.deepEqual(body.tools.map(tool => tool.name ?? tool.type), ['request_user_input', 'skills'])
    const item = { id: 'msg_control', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: candidate, annotations: [] }] }
    const events = [
      { type: 'response.created', response: { id: 'resp_control', status: 'in_progress' } },
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_control', status: 'completed', output: [item],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 } } },
    ]
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
    providerStage = 'response-completed'
  } catch { providerFailure = true; response.writeHead(400); response.end() }
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const config = `model = "gpt-6-sol"
model_provider = "synthetic"
web_search = "disabled"
suppress_unstable_features_warning = true
[model_providers.synthetic]
name = "Synthetic only"
base_url = "http://127.0.0.1:${provider.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
[features]
shell_tool = false
shell_snapshot = false
apps = false
hooks = false
multi_agent = false
plugins = false
remote_plugin = false
skill_search = false
skill_mcp_dependency_install = false
skip_host_skill_discovery = true
tool_suggest = false
`
await writeFile(path.join(home, 'config.toml'), config, { mode: 0o600 })
const environment = { HOME: home, CODEX_HOME: home, PATH: '/usr/bin:/bin', RUST_LOG: 'error', TOKIO_WORKER_THREADS: '2' }
if (process.platform === 'win32') Object.assign(environment, { SYSTEMROOT: process.env.SYSTEMROOT, USERPROFILE: home, TEMP: root, TMP: root })
const child = spawn(binary, ['--strict-config', 'app-server', '--listen', 'stdio://'],
  { cwd: workspace, env: environment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
const closed = new Promise(resolve => child.once('close', resolve))
try {
  let admissions = 0
  const result = await runCodexTurn({ child, prompt: 'Return the synthetic fixture schema only.', sourceHash,
    allowedPaths: ['src/synthetic.mjs'], cwd: workspace, authentication: 'synthetic', deadlineAt: Date.now() + 30000,
    admit: async () => { admissions++; return true } })
  sessionStage = 'session-completion'; protocolFailure = result.failure ?? 'none'; protocolStage = result.failureStage ?? 'none'
  assert.equal(result.completed, true, `Session rejected: ${result.failure} at ${result.failureStage}`)
  assert.equal(result.candidateText, candidate)
  assert.equal(requests, 1); assert.equal(admissions, 1); assert.equal(providerFailure, false)
  child.stdin.end()
  sessionStage = 'server-exit'
  const code = await Promise.race([closed, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Server exit deadline')), 3000); t.unref() })])
  assert.equal(code, 0)
  console.log(JSON.stringify({ pinnedCodexSessionPassed: true, syntheticRequests: requests, admissions,
    candidateBytesMatched: true, realModelCalls: 0, credentialFree: true, executionAllowed: false }))
} catch (error) {
  // Only enumerated stages/counts from this credential-free control, never raw diagnostics.
  console.error(`::error title=Bounded synthetic session::stage=${sessionStage}; protocolFailure=${protocolFailure}; protocolStage=${protocolStage}; providerStage=${providerStage}; providerFailure=${providerFailure}; requests=${requests}`)
  throw error
} finally {
  if (child.exitCode === null) child.kill('SIGKILL')
  await closed
  await new Promise(resolve => provider.close(resolve))
}
