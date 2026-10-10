// Output/cancellation guard only. Detecting a tool event cannot undo tool effects.
// Caller must enforce the complete tool boundary BEFORE spawning a real CLI.
import assert from 'node:assert/strict'
import { TextDecoder } from 'node:util'

export function guardCodexTransport(child, { timeoutMs = 120000, signal } = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 120000)
  assert.ok(child?.stdout && child?.stderr && typeof child.kill === 'function')
  return new Promise(resolve => {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0, pending = '', message = '', completed = false, started = false
    let failure, rootExited = false, settled = false, drainTimer
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer); clearTimeout(drainTimer)
      signal?.removeEventListener('abort', cancel)
      // No descendant termination assertion can be inferred from root/pipe closure.
      resolve({ accepted: !failure, failure: failure ?? null, rootExited,
        descendantTerminationVerified: false, retryAuthorized: false,
        executionAllowed: false, candidateText: failure ? null : message })
    }
    const fail = reason => {
      if (failure || settled) return
      failure = reason; message = ''; pending = ''
      try { child.kill('SIGKILL') } catch { /* Root termination remains uncertain. */ }
      drainTimer = setTimeout(finish, 2000)
    }
    const cancel = () => fail('cancelled')
    const timer = setTimeout(() => fail('timeout'), timeoutMs)
    const account = chunk => {
      bytes += chunk.length
      if (bytes > 65536) fail('output-limit')
      return !failure && !settled
    }
    const event = line => {
      assert.ok(Buffer.byteLength(line) <= 16384)
      const value = JSON.parse(line)
      assert.ok(value && typeof value === 'object' && !Array.isArray(value))
      if (value.type === 'thread.started') { assert.equal(started, false); assert.equal(completed, false); return }
      if (value.type === 'turn.started') { assert.equal(started, false); assert.equal(completed, false); started = true; return }
      assert.equal(started, true); assert.equal(completed, false)
      if (['item.started', 'item.updated', 'item.completed'].includes(value.type)) {
        // Unknown item types reject. Do not publish diagnostics, commands or tool args.
        assert.ok(['agent_message', 'reasoning'].includes(value.item?.type))
        if (value.item.type === 'agent_message' && value.type === 'item.completed') {
          assert.equal(message, '')
          assert.ok(typeof value.item.text === 'string' && value.item.text.length > 0)
          message = value.item.text
        }
        return
      }
      assert.equal(value.type, 'turn.completed')
      assert.ok(message.length > 0); completed = true
    }
    child.stdout.on('data', chunk => {
      if (!account(chunk)) return
      try {
        pending += decoder.decode(chunk, { stream: true })
        let split
        while ((split = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, split); pending = pending.slice(split + 1)
          event(line)
        }
        assert.ok(Buffer.byteLength(pending) <= 16384)
      } catch { fail('protocol-invalid') }
    })
    child.stderr.on('data', account) // Count, never retain or echo diagnostics.
    child.stdout.on('error', () => fail('transport-error'))
    child.stderr.on('error', () => fail('transport-error'))
    child.on('error', () => fail('transport-error'))
    child.once('exit', () => { rootExited = true })
    child.once('close', (code, terminationSignal) => {
      if (!failure) {
        try { decoder.decode(); assert.equal(pending, ''); assert.equal(code, 0); assert.equal(terminationSignal, null); assert.equal(completed, true) }
        catch { failure = 'incomplete-or-failed' }
      }
      finish()
    })
    if (signal?.aborted) cancel()
    else signal?.addEventListener('abort', cancel, { once: true })
  })
}
