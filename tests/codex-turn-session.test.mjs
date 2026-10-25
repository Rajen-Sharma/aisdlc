import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { runCodexTurn } from '../scripts/codex-turn-session.mjs'

const sourceHash = 'a'.repeat(64), text = JSON.stringify({ version: 1, sourceHash, files: [{ path: 'src/test.mjs', content: 'untrusted candidate' }] })
function fixture(mutate = () => {}) {
  const child = new EventEmitter(), requests = []
  child.stdout = new PassThrough(); child.stderr = new PassThrough()
  child.kill = () => { child.killed = true }
  const notify = (method, params) => child.stdout.write(JSON.stringify({ method, params }) + '\n')
  const config = { model: 'gpt-6-sol', model_provider: 'aisdlc-openai', forced_login_method: 'chatgpt', web_search: 'disabled',
    features: Object.fromEntries(['shell_tool', 'shell_snapshot', 'apps', 'hooks', 'multi_agent', 'plugins', 'remote_plugin',
      'skill_search', 'skill_mcp_dependency_install', 'tool_suggest'].map(key => [key, false])),
    model_providers: { 'aisdlc-openai': { name: 'OpenAI', requires_openai_auth: true, wire_api: 'responses',
      request_max_retries: 0, stream_max_retries: 0, supports_websockets: false, supports_standalone_web_search: false } } }
  config.features.skip_host_skill_discovery = true
  const account = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
  child.stdin = new Writable({ write(chunk, _, done) {
    const request = JSON.parse(chunk.toString())
    requests.push(request)
    queueMicrotask(() => {
      if (request.method === 'initialized') return
      let result = {}
      if (request.method === 'account/read') result = account
      if (request.method === 'config/read') result = { config }
      if (request.method === 'thread/start') result = { thread: { id: 'thread_1' }, model: 'gpt-6-sol', modelProvider: 'aisdlc-openai', instructionSources: [] }
      if (request.method === 'turn/start') result = { turn: { id: 'turn_1', status: 'inProgress' } }
      const controls = { child, requests, request, result, notify, config, account, skip: false }
      mutate(controls)
      if (controls.skip) return
      child.stdout.write(JSON.stringify({ id: request.id, result }) + '\n')
      if (request.method === 'turn/start') {
        const ids = { threadId: 'thread_1', turnId: 'turn_1' }
        notify('turn/started', { threadId: 'thread_1', turn: { id: 'turn_1', status: 'inProgress' } })
        notify('thread/tokenUsage/updated', { ...ids, tokenUsage: { total: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } } })
        notify('item/completed', { ...ids, item: { type: 'agentMessage', text, phase: 'final_answer' } })
        notify('turn/completed', { threadId: 'thread_1', turn: { id: 'turn_1', status: 'completed' } })
      }
    })
    done()
  } })
  const run = (extra = {}) => runCodexTurn({ child, prompt: 'Synthetic task only.', sourceHash,
    allowedPaths: ['src/test.mjs'], cwd: '/fixed/empty', admit: async () => true, deadlineAt: Date.now() + 1000, ...extra })
  return { child, requests, run }
}

test('provider failures retain only fixed diagnostic labels and numeric RPC codes', async () => {
  const state = fixture(c => {
    if (c.request.method === 'turn/start') {
      c.skip = true
      c.child.stdout.write(JSON.stringify({ id: c.request.id, error: { code: -32602,
        message: 'Invalid parameter schema; private diagnostic must never be retained' } }) + '\n')
    }
  })
  const result = await state.run()
  assert.equal(result.completed, false); assert.equal(result.turnSent, true)
  assert.equal(result.rpcErrorCode, -32602); assert.equal(result.failureCategory, 'request-schema')
  assert.equal(JSON.stringify(result).includes('private diagnostic'), false)
})

test('one admitted thread/turn returns inert bytes and usage without asserting cleanup or correctness', async () => {
  const state = fixture(); let admitted = 0
  const result = await state.run({ admit: async ({ threadId, challengeNonce }) => {
    assert.equal(threadId, 'thread_1'); assert.match(challengeNonce, /^[a-f0-9-]{36}$/); admitted++; return true
  } })
  assert.equal(admitted, 1); assert.equal(result.completed, true); assert.equal(result.candidateText, text)
  assert.deepEqual(result.usage, { inputTokens: 5, outputTokens: 3, totalTokens: 8 })
  assert.equal(result.descendantTerminationVerified, false)
  assert.equal(result.executionAllowed, false)
  assert.equal(state.requests.filter(request => request.method === 'turn/start').length, 1)
  const thread = state.requests.find(request => request.method === 'thread/start').params
  assert.deepEqual(thread.environments, []); assert.deepEqual(thread.dynamicTools, []); assert.deepEqual(thread.selectedCapabilityRoots, [])
  assert.equal(thread.modelProvider, 'aisdlc-openai')
})

test('missing admission, wrong authentication, inherited tools, retries and custom endpoints deny before a turn', async () => {
  const denied = fixture()
  assert.equal((await denied.run({ admit: async () => false })).failure, 'admission-denied')
  assert.equal(denied.requests.some(request => request.method === 'turn/start'), false)
  for (const change of [c => { c.account.account.type = 'apiKey' }, c => { c.config.features.shell_tool = true },
    c => { c.config.model_providers['aisdlc-openai'].request_max_retries = 1 }, c => { c.config.model_providers['aisdlc-openai'].base_url = 'https://unexpected.invalid' },
    c => { c.config.model_providers.other = {} }, c => { c.config.mcp_servers = { server: {} } },
    c => { c.config.model_provider = 'openai' },
    c => { c.config.model_providers['aisdlc-openai'].supports_standalone_web_search = true },
    c => { c.config.model_providers['aisdlc-openai'].name = 'Unexpected' }]) {
    const state = fixture(c => { if (c.request.method === 'initialize') change(c) })
    assert.equal((await state.run()).completed, false)
    assert.equal(state.requests.some(request => request.method === 'turn/start'), false)
  }
})

test('tools, model reroutes, mismatched identities and early success claims cannot become candidates', async () => {
  for (const event of [
    ['item/completed', { threadId: 'thread_1', turnId: 'turn_1', item: { type: 'commandExecution' } }],
    ['model/rerouted', { threadId: 'thread_1', turnId: 'turn_1', toModel: 'other' }],
    ['item/completed', { threadId: 'other', turnId: 'turn_1', item: { type: 'agentMessage', text } }],
    ['turn/completed', { threadId: 'thread_1', turn: { id: 'turn_1', status: 'completed' } }],
  ]) {
    const state = fixture(c => { if (c.request.method === 'turn/start') c.notify(...event) })
    const result = await state.run()
    assert.equal(result.completed, false); assert.equal(result.candidateText, null); assert.equal(state.child.killed, true)
  }
})

test('schema-supported interim commentary cannot replace the required final candidate', async () => {
  const state = fixture(c => { if (c.request.method === 'turn/start') c.notify('item/completed', {
    threadId: 'thread_1', turnId: 'turn_1', item: { type: 'agentMessage', phase: 'commentary', text: 'Untrusted interim success claim.' },
  }) })
  const result = await state.run()
  assert.equal(result.completed, true); assert.equal(result.candidateText, text)
  const early = fixture(c => { if (c.request.method === 'turn/start') {
    c.notify('item/completed', { threadId: 'thread_1', turnId: 'turn_1', item: { type: 'agentMessage', phase: 'commentary', text: 'Done' } })
    c.notify('turn/completed', { threadId: 'thread_1', turn: { id: 'turn_1', status: 'completed' } })
  } })
  assert.equal((await early.run()).completed, false)
})

test('timeout, caller cancellation, malformed bytes and output overflow fail without retries', async () => {
  const hanging = fixture(c => { if (c.request.method === 'turn/start') c.skip = true })
  assert.equal((await hanging.run({ deadlineAt: Date.now() + 30 })).failure, 'timeout')
  assert.equal(hanging.requests.filter(r => r.method === 'turn/start').length, 1)
  const cancelled = fixture(), controller = new AbortController(); controller.abort()
  assert.equal((await cancelled.run({ signal: controller.signal })).failure, 'cancelled')
  for (const data of [Buffer.from([255, 10]), Buffer.alloc(262145)]) {
    const state = fixture(c => { if (c.request.method === 'turn/start') { c.child.stdout.write(data); c.skip = true } })
    assert.equal((await state.run()).completed, false)
  }
})

test('account-wide quota updates are metadata, while native model fallback warnings deny', async () => {
  const metadata = fixture(c => {
    if (c.request.method === 'initialize') c.notify('account/rateLimits/updated', { rateLimits: { primary: { usedPercent: 25 } } })
  })
  assert.equal((await metadata.run()).completed, true)
  assert.equal(metadata.requests.filter(r => r.method === 'turn/start').length, 1)
  const warning = fixture(c => {
    if (c.request.method === 'thread/start') c.notify('warning', { message: 'Model metadata for `gpt-6-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.', threadId: 'thread_1' })
  })
  assert.equal((await warning.run()).completed, false)
  assert.equal(warning.requests.some(r => r.method === 'turn/start'), false)
})
