// Test-only fault injector. Private Unix socket, no generated-code access, no general API forwarding.
import http from 'node:http'
import assert from 'node:assert/strict'

export async function pausedDockerProxy(socketPath, { action, name, id, phase }) {
  assert.ok(['create', 'start'].includes(action))
  assert.ok(['request', 'response'].includes(phase))
  let reachedResolve, reachedReject, releaseResolve
  const reached = new Promise((resolve, reject) => { reachedResolve = resolve; reachedReject = reject })
  const released = new Promise(resolve => { releaseResolve = resolve })
  const connections = new Set()
  const handlers = new Set()
  let closing = false, failed = false, forwarded = 0, statusCode
  const server = http.createServer((incoming, outgoing) => {
    const task = handle(incoming, outgoing)
    handlers.add(task)
    task.catch(() => { failed = true; reachedReject(new Error('Controlled proxy failed.')); outgoing.destroy() }).finally(() => handlers.delete(task))
  })
  server.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)) })
  async function handle(incoming, outgoing) {
    const url = new URL(incoming.url, 'http://qualification.invalid')
    const pathname = url.pathname.replace(/^\/v[0-9]+\.[0-9]+/, '')
    const handshake = ['GET', 'HEAD'].includes(incoming.method) && ['/_ping', '/version'].includes(pathname)
    const target = incoming.method === 'POST' && (action === 'create'
      ? pathname === '/containers/create' && url.searchParams.get('name') === name
      : pathname === `/containers/${id}/start`)
    assert.ok(handshake || target, 'Unapproved Docker proxy endpoint.')
    let size = 0
    const chunks = []
    for await (const chunk of incoming) { size += chunk.length; assert.ok(size <= 16384); chunks.push(chunk) }
    if (target && phase === 'request') { reachedResolve(); await released }
    if (closing) { outgoing.destroy(); return }
    const result = await new Promise((resolve, reject) => {
      if (target) forwarded++
      const request = http.request({ socketPath: '/var/run/docker.sock', method: incoming.method, path: incoming.url, headers: { ...incoming.headers, connection: 'close' }, agent: false }, response => {
        let bytes = 0
        const body = []
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 65536) request.destroy(new Error('Response bound exceeded.')); else body.push(chunk) })
        response.once('error', reject)
        response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(body) }))
      })
      request.setTimeout(10000, () => request.destroy(new Error('Backend request timed out.')))
      request.once('error', reject)
      request.end(Buffer.concat(chunks))
    })
    if (target) {
      statusCode = result.status
      assert.ok(result.status >= 200 && result.status < 300, 'Daemon operation did not succeed.')
      if (phase === 'response') { reachedResolve(); await released }
    }
    if (closing) { outgoing.destroy(); return }
    outgoing.writeHead(result.status, { ...result.headers, connection: 'close' })
    outgoing.end(result.body)
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve) })
  return {
    reached, release: releaseResolve,
    stats: () => ({ forwarded, statusCode }),
    async close() {
      closing = true
      releaseResolve()
      const stopped = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      for (const socket of connections) socket.destroy()
      // Backend operations must settle, not merely lose their client connection.
      await stopped
      while (handlers.size) await Promise.allSettled([...handlers])
      if (failed) throw new Error('Proxy operation remains uncertain.')
    },
  }
}
