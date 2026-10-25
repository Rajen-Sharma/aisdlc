import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { claimUnlaunchedFence } from '../scripts/unlaunched-fence.mjs'

test('unlaunched fence and launcher share an exclusive durable claim; existing claims never certify cleanup', { skip: process.platform !== 'linux' }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'unlaunched-fence-'))
  try {
    const attempt = randomUUID(), file = path.join(directory, attempt + '.jsonl')
    const outcomes = await Promise.allSettled([claimUnlaunchedFence(directory, attempt),
      writeFile(file, 'synthetic-launch-claimed\n', { flag: 'wx', mode: 0o600 })])
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1)
    const retained = await readFile(file, 'utf8')
    await assert.rejects(claimUnlaunchedFence(directory, attempt))
    assert.equal(await readFile(file, 'utf8'), retained)
    const claimed = randomUUID()
    await writeFile(path.join(directory, claimed + '.jsonl'), 'existing launch\n', { flag: 'wx', mode: 0o600 })
    await assert.rejects(claimUnlaunchedFence(directory, claimed))
    const unsafe = path.join(directory, 'unsafe'); await mkdir(unsafe, { mode: 0o755 })
    await assert.rejects(claimUnlaunchedFence(unsafe, randomUUID()))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
