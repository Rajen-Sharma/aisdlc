// One bounded app-server turn. The guardian owns spawning, isolation and cleanup.
// Completion here is untrusted candidate data, never process-termination proof.
import { randomUUID } from 'node:crypto'

const disabled = ['shell_tool', 'shell_snapshot', 'apps', 'hooks', 'multi_agent', 'plugins',
  'remote_plugin', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest']
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
const fail = code => { throw new Error(code) }

export async function runCodexTurn({ child, prompt, sourceHash, allowedPaths, cwd, admit,
  deadlineAt, signal, authentication = 'chatgpt' }) {
  if (!child?.stdin || !child?.stdout || !child?.stderr || typeof admit !== 'function'
    || typeof prompt !== 'string' || !prompt.length || Buffer.byteLength(prompt) > 65536
    || !/^[a-f0-9]{64}$/.test(sourceHash) || typeof cwd !== 'string' || !cwd.length
    || !Array.isArray(allowedPaths) || !allowedPaths.length || allowedPaths.length > 32
    || new Set(allowedPaths).size !== allowedPaths.length
    || allowedPaths.some(value => typeof value !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value) || value.split('/').some(part => part === '.' || part === '..'))
    || !Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now() || deadlineAt - Date.now() > 120000
    || !['chatgpt', 'synthetic'].includes(authentication)) throw new Error('Invalid guarded turn configuration.')
  let sequence = 0, bytes = 0, messages = 0, pending = '', waiter, failure
  let threadId, turnId, completed = false, candidateText = null, usage = null, turnSent = false, stage = 'initialize'
  let rpcErrorCode = null, failureCategory = null
  const classify = error => {
    const message = typeof error?.message === 'string' ? error.message : ''
    // Fixed labels only. Never retain raw provider errors, endpoints or credentials.
    failureCategory = /schema|invalid.*parameter|unsupported.*parameter/i.test(message) ? 'request-schema'
      : /usage limit|quota|rate limit|too many requests/i.test(message) ? 'capacity'
      : /unauthorized|authentication|not logged|token.*expired/i.test(message) ? 'authentication'
      : /model.*(?:not supported|not found|unavailable)|unsupported.*model/i.test(message) ? 'model-unavailable'
      : /connect|network|dns|resolve|stream disconnected/i.test(message) ? 'connection' : 'provider-error'
  }
  const decoder = new TextDecoder('utf-8', { fatal: true }), queue = []
  const wake = () => { const waiting = waiter; waiter = undefined; waiting?.() }
  const stop = code => {
    if (failure) return
    failure = code
    try { child.kill('SIGKILL') } catch { /* Guardian must verify actual cleanup. */ }
    wake()
  }
  const count = chunk => { bytes += chunk.length; if (bytes > 262144) stop('output-limit') }
  const stdout = chunk => {
    count(chunk); if (failure) return
    try {
      pending += decoder.decode(chunk, { stream: true })
      let offset
      while ((offset = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, offset); pending = pending.slice(offset + 1)
        if (Buffer.byteLength(line) > 131072 || ++messages > 4096) fail('protocol-limit')
        const message = JSON.parse(line)
        if (!message || typeof message !== 'object' || Array.isArray(message) || queue.length >= 128) fail('protocol-invalid')
        queue.push(message)
      }
      if (Buffer.byteLength(pending) > 131072) fail('protocol-limit')
      wake()
    } catch { stop('protocol-invalid') }
  }
  const closed = () => { if (!completed) stop('transport-closed'); else wake() }
  const transportError = () => stop('transport-error')
  const cancel = () => stop('cancelled')
  const timer = setTimeout(() => stop('timeout'), deadlineAt - Date.now())
  child.stdout.on('data', stdout); child.stderr.on('data', count)
  child.stdout.on('error', transportError); child.stderr.on('error', transportError)
  child.stdin.on('error', transportError); child.on('error', transportError); child.on('close', closed)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const check = () => { if (failure) fail(failure); if (Date.now() >= deadlineAt) fail('timeout') }
  const send = value => { check(); child.stdin.write(JSON.stringify(value) + '\n') }
  const receive = async () => {
    while (!queue.length) { check(); await new Promise(resolve => { waiter = resolve }) }
    check(); return queue.shift()
  }
  const bindTurn = p => {
    if (p.threadId !== threadId || !identifier(p.turnId)) fail('turn-identity')
    if (turnId && p.turnId !== turnId) fail('turn-identity')
    turnId ??= p.turnId
  }
  const notification = message => {
    if ('id' in message) fail('unexpected-server-request')
    const p = message.params ?? {}, method = message.method
    stage = /^[A-Za-z/]{1,80}$/.test(method) ? method : 'unknown-notification'
    if (method === 'error') { classify(p.error); fail('provider-error') }
    if (method === 'remoteControl/status/changed' && p.status === 'disabled') return
    if (method === 'account/updated' && (p.authMode === (authentication === 'chatgpt' ? 'chatgpt' : null))) return
    // Account-wide sparse metadata has no thread/turn identity. It cannot
    // authorize execution, reset attempts or purchase additional capacity.
    if (method === 'account/rateLimits/updated') {
      if (!p.rateLimits || typeof p.rateLimits !== 'object' || Array.isArray(p.rateLimits)) fail('protocol-invalid')
      return
    }
    if (method === 'thread/started') {
      if (!identifier(p.thread?.id) || (threadId && threadId !== p.thread.id)) fail('thread-identity')
      threadId ??= p.thread.id; return
    }
    if (method === 'thread/status/changed') {
      if (p.threadId !== threadId || !['idle', 'active'].includes(p.status?.type)) fail('thread-status')
      return
    }
    if (method === 'warning') {
      // The credential-free custom-provider fixture has no remote model catalog.
      // Native account sessions must reject this warning before any model turn.
      if (authentication === 'synthetic' && p.threadId === threadId
        && p.message === 'Model metadata for `gpt-6-sol` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.') return
      fail('unexpected-notification')
    }
    if (method === 'turn/started' || method === 'turn/completed') {
      if (!turnSent || p.threadId !== threadId || !identifier(p.turn?.id) || (turnId && turnId !== p.turn.id)) fail('turn-identity')
      turnId ??= p.turn.id
      if (method === 'turn/started') { if (p.turn.status !== 'inProgress') fail('turn-status'); return }
      if (completed || p.turn.status !== 'completed' || !candidateText) fail('turn-incomplete')
      completed = true; return
    }
    if (!turnSent || completed) fail('unexpected-notification')
    bindTurn(p)
    if (method === 'thread/tokenUsage/updated') {
      const value = p.tokenUsage?.total
      if (!value || !['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 10000000)
        || value.totalTokens !== value.inputTokens + value.outputTokens
        || (usage && ['inputTokens', 'outputTokens', 'totalTokens'].some(key => value[key] < usage[key]))) fail('usage-invalid')
      usage = { inputTokens: value.inputTokens, outputTokens: value.outputTokens, totalTokens: value.totalTokens }; return
    }
    if (['item/started', 'item/completed'].includes(method)) {
      if (!['userMessage', 'agentMessage', 'reasoning'].includes(p.item?.type)) fail('tool-or-unknown-item')
      if (p.item.type === 'agentMessage' && method === 'item/completed') {
        if (p.item.phase === 'commentary') {
          if (typeof p.item.text !== 'string' || Buffer.byteLength(p.item.text) > 65536) fail('candidate-invalid')
          return // Interim text is never candidate bytes or a success assertion.
        }
        if (candidateText !== null || typeof p.item.text !== 'string' || !p.item.text.length
          || Buffer.byteLength(p.item.text) > 65536 || (p.item.phase && p.item.phase !== 'final_answer')) fail('candidate-invalid')
        candidateText = p.item.text
      }
      return
    }
    if (['item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/textDelta', 'item/reasoning/summaryPartAdded'].includes(method)) return
    // Includes model rerouting, context compaction, errors, tools and approvals.
    fail('unexpected-notification')
  }
  const rpc = async (method, params) => {
    const id = ++sequence
    stage = method
    send({ id, method, params })
    for (;;) {
      const value = await receive()
      if ('method' in value) { notification(value); continue }
      if (value.id !== id || 'error' in value || !('result' in value)) {
        if (value.error) { classify(value.error); if (Number.isSafeInteger(value.error.code)) rpcErrorCode = value.error.code }
        fail('rpc-rejected')
      }
      return value.result
    }
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'aisdlc_guarded_turn', title: 'AI SDLC guarded turn', version: '1' }, capabilities: { experimentalApi: true } })
    send({ method: 'initialized' })
    const account = await rpc('account/read', { refreshToken: false })
    if (authentication === 'chatgpt') {
      if (account.account?.type !== 'chatgpt' || account.requiresOpenaiAuth !== true) fail('subscription-auth-required')
    } else if (account.account !== null || account.requiresOpenaiAuth !== false) fail('synthetic-auth-required')
    const config = (await rpc('config/read', { includeLayers: false })).config
    const provider = authentication === 'chatgpt' ? 'aisdlc-openai' : 'synthetic'
    if (!config || config.model !== 'gpt-6-sol' || ![null, undefined, provider].includes(config.model_provider)
      || config.web_search !== 'disabled' || (authentication === 'chatgpt' && config.forced_login_method !== 'chatgpt')
      || Object.keys(config.mcp_servers ?? {}).length || !disabled.every(key => config.features?.[key] === false)
      || config.features?.skip_host_skill_discovery !== true) fail('effective-config-rejected')
    const overrides = config.model_providers ?? {}
    if (Object.keys(overrides).some(key => key !== provider)
      || overrides[provider]?.request_max_retries !== 0 || overrides[provider]?.stream_max_retries !== 0
      || overrides[provider]?.supports_websockets !== false) fail('provider-retries-or-fallback')
    if (authentication === 'chatgpt' && (overrides[provider].requires_openai_auth !== true || overrides[provider].name !== 'OpenAI'
      || overrides[provider].supports_standalone_web_search !== false
      || overrides[provider].wire_api !== 'responses'
      || Object.entries(overrides[provider]).some(([key, value]) => value != null
        && !['name', 'requires_openai_auth', 'wire_api', 'request_max_retries', 'stream_max_retries', 'supports_websockets', 'supports_standalone_web_search'].includes(key)))) fail('custom-endpoint-denied')
    const thread = await rpc('thread/start', { model: 'gpt-6-sol', modelProvider: provider, cwd, ephemeral: true,
      environments: [], dynamicTools: [], selectedCapabilityRoots: [], approvalPolicy: 'never', sandbox: 'read-only' })
    if (!identifier(thread.thread?.id) || (threadId && threadId !== thread.thread.id)
      || (thread.instructionSources ?? []).length || thread.model !== 'gpt-6-sol' || thread.modelProvider !== provider) fail('thread-policy-rejected')
    threadId = thread.thread.id
    const challengeNonce = randomUUID()
    if (await admit({ threadId, challengeNonce }) !== true) fail('admission-denied')
    check()
    const outputSchema = { type: 'object', additionalProperties: false, required: ['version', 'sourceHash', 'files'], properties: {
      version: { type: 'integer', const: 1 }, sourceHash: { type: 'string', const: sourceHash }, files: { type: 'array', minItems: 1,
        maxItems: allowedPaths.length, items: { type: 'object', additionalProperties: false, required: ['path', 'content'],
          properties: { path: { type: 'string', enum: allowedPaths }, content: { type: 'string' } } } } } }
    turnSent = true
    const turn = await rpc('turn/start', { threadId, input: [{ type: 'text', text: prompt, text_elements: [] }], outputSchema })
    if (!identifier(turn.turn?.id) || (turnId && turn.turn.id !== turnId)) fail('turn-identity')
    turnId = turn.turn.id
    while (!completed) notification(await receive())
    // Drain already received messages: late errors/tools cannot be hidden by success.
    while (queue.length) notification(queue.shift())
    return { completed: true, candidateText, usage, threadId, turnId, turnSent,
      executionAllowed: false, retryAuthorized: false, descendantTerminationVerified: false }
  } catch (error) {
    const known = ['output-limit', 'protocol-invalid', 'protocol-limit', 'transport-closed', 'transport-error', 'cancelled', 'timeout',
      'turn-identity', 'thread-identity', 'thread-status', 'turn-status', 'turn-incomplete', 'unexpected-server-request', 'unexpected-notification',
      'usage-invalid', 'tool-or-unknown-item', 'candidate-invalid', 'rpc-rejected', 'subscription-auth-required', 'synthetic-auth-required',
      'effective-config-rejected', 'provider-retries-or-fallback', 'custom-endpoint-denied', 'thread-policy-rejected', 'admission-denied', 'provider-error']
    stop(known.includes(error.message) ? error.message : 'protocol-invalid')
    return { completed: false, candidateText: null, usage, turnSent, failure: failure ?? 'protocol-invalid', failureStage: stage, rpcErrorCode, failureCategory,
      executionAllowed: false, retryAuthorized: false, descendantTerminationVerified: false }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel)
    child.stdout.off('data', stdout); child.stderr.off('data', count)
    child.stdout.off('error', transportError); child.stderr.off('error', transportError)
    child.off('error', transportError); child.off('close', closed)
    // No root or descendant exit is inferred from successful protocol completion.
  }
}
