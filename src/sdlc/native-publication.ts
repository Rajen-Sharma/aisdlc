import { createPublicKey, randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from './contracts'
import { authenticateCurrentDelivery } from './delivery-current'
import type { NativeExecutorConfiguration } from './native-transport'

export async function writeNativeRecord(name: string, value: unknown) {
  if (!/^(?:delivery-trust|delivery-current-[a-f0-9]{64}|delivery-evidence-[a-f0-9]{64}|native-status-[a-f0-9]{64}|native-attempt-[a-f0-9-]{36})\.json$/.test(name)) throw new Error('Invalid native record path.')
  const text = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(text) > 262144) throw new Error('Native record exceeds bound.')
  const root = path.resolve('.local'), temporary = path.join(root, `native-write-${randomUUID()}.tmp`)
  await mkdir(root, { recursive: true })
  try { await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await rename(temporary, path.join(root, name)) }
  catch (error) { await unlink(temporary).catch(() => {}); throw error }
}

export async function publishNativeHead(config: NativeExecutorConfiguration, reply: any) {
  const { publicKeyDer, ...policy } = config.trust
  const trust = { ...policy, publicKey: createPublicKey({ key: Buffer.from(publicKeyDer, 'base64'), format: 'der', type: 'spki' }) }
  const state = authenticateCurrentDelivery(reply.current, trust, config.taskKey, Math.floor(Date.now() / 1000))
  if (state.scopeHash !== config.scopeHash || state.approvalHash !== config.approvalHash || digest(reply.artifact) !== state.artifactHash) throw new Error('Current native delivery mismatch.')
  if (reply.evidence) await writeNativeRecord(`delivery-evidence-${state.artifactHash}.json`, reply.evidence)
  await writeNativeRecord('delivery-trust.json', config.trust)
  await writeNativeRecord(`delivery-current-${config.taskKey}.json`, reply.current)
  return state
}
