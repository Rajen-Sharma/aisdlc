import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { guardCodexTransport } from '../scripts/codex-transport-guard.mjs'

const events = [ { type: 'turn.started' }, { type: 'item.completed', item: { type: 'agent_message', text: '{"candidate":"untrusted"}' } }, { type: 'turn.completed' } ]
const lines = list => list.map(x => JSON.stringify(x)).join('\n') + '\n'
const launch = script => spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: {} })
test('complete zero-exit stream returns untrusted bytes without execution or termination authority', async () => {
  const result = await guardCodexTransport(launch(`process.stdout.write(${JSON.stringify(lines(events))})`))
  assert.equal(result.accepted, true); assert.equal(result.candidateText, events[1].item.text)
  assert.equal(result.rootExited, true)
  for (const key of ['descendantTerminationVerified', 'retryAuthorized', 'executionAllowed']) assert.equal(result[key], false)
})
test('tool and unknown events, malformed UTF8, partial JSON and zero-exit success claims reject', async () => {
  for (const output of [lines([{ type: 'turn.started' }, { type: 'item.started', item: { type: 'command_execution', command: 'private canary' } }]), lines([{ type: 'mystery' }]), lines(events).trimEnd(), 'success\n', lines([events[0], events[2]]), lines([...events, events[1]])]) {
    const result = await guardCodexTransport(launch(`process.stdout.write(${JSON.stringify(output)})`))
    assert.equal(result.accepted, false); assert.equal(result.candidateText, null)
    assert.equal(JSON.stringify(result).includes('private canary'), false)
  }
  assert.equal((await guardCodexTransport(launch('process.stdout.write(Buffer.from([255,10]))'))).accepted, false)
})
test('shared output limits cover stderr and oversized individual events', async () => {
  for (const script of ['process.stderr.write("x".repeat(65537))', 'process.stdout.write("x".repeat(16385))']) {
    const result = await guardCodexTransport(launch(script))
    assert.equal(result.accepted, false); assert.equal(result.candidateText, null)
  }
})
test('timeout and caller cancellation kill root but never claim descendant termination', async () => {
  const timed = await guardCodexTransport(launch('setInterval(()=>{},1000)'), { timeoutMs: 100 })
  assert.equal(timed.failure, 'timeout'); assert.equal(timed.rootExited, true)
  const abort = new AbortController()
  const child = launch('setInterval(()=>{},1000)')
  const result = guardCodexTransport(child, { signal: abort.signal })
  abort.abort()
  const cancelled = await result
  assert.equal(cancelled.failure, 'cancelled'); assert.equal(cancelled.accepted, false)
  assert.equal(cancelled.descendantTerminationVerified, false); assert.equal(cancelled.retryAuthorized, false)
})
