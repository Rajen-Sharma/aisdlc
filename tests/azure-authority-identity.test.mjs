import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorityStorageToken } from '../scripts/azure-authority-identity.mjs'

const response = changes => ({ access_token: 'synthetic-token', token_type: 'Bearer',
  resource: 'https://storage.azure.com/', expires_on: '2000000000', ...changes })

test('managed identity requests only the fixed storage audience and emits no identity metadata', async () => {
  const token = await authorityStorageToken({ now: () => 1000000, transport: async (url, options) => {
    assert.equal(new URL(url).hostname, '169.254.169.254')
    assert.equal(new URL(url).searchParams.get('resource'), 'https://storage.azure.com/')
    assert.equal(options.headers.Metadata, 'true')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json(response())
  } })
  assert.equal(token, 'synthetic-token')
})

test('expired, wrong-audience, injected or unavailable identity responses reject without secret diagnostics', async () => {
  for (const changes of [{ expires_on: '1001' }, { expires_on: 'invalid' }, { token_type: 'Basic' },
    { resource: 'https://management.azure.com/' }, { access_token: 'secret\r\nInjected: value' }, { access_token: '' }]) {
    await assert.rejects(authorityStorageToken({ now: () => 1000000,
      transport: async () => Response.json(response(changes)) }), { message: 'Authority managed identity unavailable.' })
  }
  await assert.rejects(authorityStorageToken({ transport: async () => new Response('private details', { status: 403 }) }),
    { message: 'Authority managed identity unavailable.' })
  let cancelled = false
  await assert.rejects(authorityStorageToken({ transport: async () => new Response(new ReadableStream({ cancel() { cancelled = true } }),
    { headers: { 'content-length': '32769' } }) }))
  assert.equal(cancelled, true)
})
