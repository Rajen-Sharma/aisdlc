import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pausedDockerProxy } from '../scripts/qualification-docker-proxy.mjs'

for (const scenario of ['unapproved-endpoint', 'oversized-body']) {
  test(`proxy preserves ${scenario} failure through closure without contacting Docker`, async () => {
    const directory = process.platform === 'win32' ? undefined : await mkdtemp(path.join(tmpdir(), 'sdlc-proxy-test-'))
    const socketPath = directory ? path.join(directory, 'api.sock') : `\\\\.\\pipe\\sdlc-proxy-test-${randomUUID()}`
    const proxy = await pausedDockerProxy(socketPath, { action: 'create', name: 'synthetic', phase: 'request' })
    const denied = assert.rejects(proxy.reached)
    const disconnected = new Promise(resolve => {
      const request = http.request({ socketPath, method: scenario === 'unapproved-endpoint' ? 'DELETE' : 'POST', path: '/containers/create?name=synthetic', agent: false }, response => { response.resume(); response.once('end', resolve) })
      request.once('error', resolve)
      request.end(scenario === 'oversized-body' ? Buffer.alloc(16385, 1) : undefined)
    })
    try {
      await denied
      await disconnected
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(proxy.stats().forwarded, 0)
      await assert.rejects(proxy.close(), /uncertain/)
    } finally { if (directory) await rmdir(directory) }
  })
}
