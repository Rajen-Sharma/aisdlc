import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { boundedJsonChannel } from '../scripts/bounded-json-channel.mjs'

test('guarded IPC preserves fragmented UTF-8 and bounded sequential messages', async () => {
  const stream = new PassThrough(), channel = boundedJsonChannel(stream)
  const bytes = Buffer.from(JSON.stringify({ text: '€' }) + '\n' + JSON.stringify({ done: true }) + '\n')
  for (const byte of bytes) stream.write(Buffer.from([byte]))
  stream.end()
  assert.deepEqual(await channel.read(Date.now() + 1000), { text: '€' })
  assert.deepEqual(await channel.read(Date.now() + 1000), { done: true })
  await assert.rejects(channel.read(Date.now() + 1000), /closed/)
  channel.dispose()
})
test('malformed bytes, oversize messages, excess messages, EOF fragments and timeout deny', async () => {
  for (const input of [Buffer.from([255, 10]), Buffer.alloc(262145), Buffer.from('null\n'), Buffer.from('{}\n'.repeat(9)), Buffer.from('{"unterminated":')]) {
    const stream = new PassThrough(), channel = boundedJsonChannel(stream)
    stream.end(input)
    await assert.rejects(channel.read(Date.now() + 1000))
    channel.dispose()
  }
  const stream = new PassThrough(), channel = boundedJsonChannel(stream)
  await assert.rejects(channel.read(Date.now() + 20))
  channel.dispose()
})
