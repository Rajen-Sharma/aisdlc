import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativeSshEnvironment } from '../src/sdlc/native-transport'

test('native SSH retains required Windows system metadata without forwarding application or provider secrets', () => {
  const name = 'AISDLC_SYNTHETIC_SECRET', old = process.env[name]
  process.env[name] = 'synthetic-do-not-forward'
  try {
    const env = nativeSshEnvironment()
    assert.equal(env[name], undefined); assert.equal(env.DATABASE_URL, undefined); assert.equal(env.OPENAI_API_KEY, undefined)
    assert.equal(env.PAYLOAD_SECRET, undefined); assert.equal(env.SSH_AUTH_SOCK, undefined)
    if (process.platform === 'win32') assert.equal(env.PROGRAMDATA, process.env.PROGRAMDATA)
  } finally { if (old === undefined) delete process.env[name]; else process.env[name] = old }
})
