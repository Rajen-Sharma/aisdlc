import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createPublicKey } from 'node:crypto'
import path from 'node:path'
import type { DeliveryTrust } from './delivery-artifact'

const exec = promisify(execFile)
const reject = (): never => { throw new Error('Native authority unavailable or request uncertain. No request was retried.') }
export type NativeExecutorConfiguration = {
  version: 1; enabled: boolean; nativeRuntimeQualified: boolean; storyId: number; taskKey: string; scopeHash: string; approvalHash: string
  runtimeHash: string; clientHost: string; toolsHost: string; issuedAt: number; expiresAt: number
  trust: Omit<DeliveryTrust, 'publicKey'> & { publicKeyDer: string }
}
export async function nativeExecutorConfiguration(): Promise<NativeExecutorConfiguration | null> {
  const file = path.resolve('.local/native-executor.json')
  let info
  try { info = await lstat(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; return reject() }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16384) return reject()
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let config: NativeExecutorConfiguration
  try {
    const buffer = Buffer.alloc(16385), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0), after = await handle.stat()
    if (bytesRead !== info.size || bytesRead > 16384 || after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs) return reject()
    config = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
  } finally { await handle.close() }
  if (config.version !== 1 || typeof config.enabled !== 'boolean' || typeof config.nativeRuntimeQualified !== 'boolean'
    || !Number.isSafeInteger(config.storyId) || config.storyId < 1 || !Number.isSafeInteger(config.issuedAt) || !Number.isSafeInteger(config.expiresAt)
    || config.issuedAt > Math.floor(Date.now() / 1000) || config.expiresAt <= config.issuedAt || config.expiresAt - config.issuedAt > 172800
    || ![config.taskKey, config.scopeHash, config.approvalHash, config.runtimeHash].every(value => /^[a-f0-9]{64}$/.test(value))) return reject()
  for (const host of [config.clientHost, config.toolsHost]) {
    if (typeof host !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.split('.').some(part => Number(part) > 255 || String(Number(part)) !== part)) return reject()
  }
  const trust = config.trust
  if (!trust || trust.nativeRuntimeQualified !== true || trust.runtimeHash !== config.runtimeHash
    || !/^[a-z][a-z0-9-]{2,63}$/.test(trust.keyId) || !Number.isSafeInteger(trust.authorityRevision) || trust.authorityRevision < 1
    || ![trust.verifierHash, trust.qualificationHash].every(value => /^[a-f0-9]{64}$/.test(value))
    || !/^node@sha256:[a-f0-9]{64}$/.test(trust.image) || !Number.isSafeInteger(trust.validFrom) || !Number.isSafeInteger(trust.expiresAt)
    || trust.validFrom < 1 || trust.validFrom > config.issuedAt || trust.expiresAt <= config.issuedAt || trust.expiresAt > config.expiresAt
    || typeof trust.publicKeyDer !== 'string' || !/^[A-Za-z0-9+/]{59}=$/.test(trust.publicKeyDer)) return reject()
  try {
    const key = createPublicKey({ key: Buffer.from(trust.publicKeyDer, 'base64'), type: 'spki', format: 'der' })
    if (key.asymmetricKeyType !== 'ed25519' || key.export({ type: 'spki', format: 'der' }).toString('base64') !== trust.publicKeyDer) return reject()
  } catch { return reject() }
  return config
}
export function nativeSshArguments(config: NativeExecutorConfiguration, target: 'client' | 'authority') {
  const host = target === 'client' ? config.clientHost : config.toolsHost
  return ['-F', 'none', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${path.resolve('.local/azure-trial-known-hosts').replaceAll('\\', '/')}`,
    '-o', 'GlobalKnownHostsFile=none', '-o', 'IdentitiesOnly=yes', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
    '-o', 'PermitLocalCommand=no', '-o', 'ConnectTimeout=10', '-o', 'LogLevel=ERROR', '-i', path.resolve('.local/azure-trial-key'),
    `trialadmin@${host}`, 'sudo', '-n', ...(target === 'authority' ? ['-u', 'aisdlc-authority'] : []),
    '/opt/aisdlc-node/24.14.0/node', ...(target === 'client' ? ['--jitless'] : []),
    target === 'client' ? '/opt/aisdlc-codex/guarded/guardian.mjs' : '/opt/aisdlc-authority/native-authority.mjs']
}
export const nativeSshBinary = () => process.platform === 'win32'
  ? path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32/OpenSSH/ssh.exe') : '/usr/bin/ssh'
export function nativeSshEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', PATH: process.env.PATH || '' }
  if (process.platform === 'win32') {
    env.SYSTEMROOT = process.env.SYSTEMROOT; env.USERPROFILE = process.env.USERPROFILE
    // Windows OpenSSH exits before connecting without its system data directory.
    env.PROGRAMDATA = process.env.PROGRAMDATA
    env.TEMP = process.env.TEMP; env.TMP = process.env.TMP
  }
  return env
}
export async function nativeAuthorityCall(config: NativeExecutorConfiguration, action: string, input: unknown, eligibility: unknown = null) {
  const restrictive = ['inspect', 'revoke', 'settle-cleanup'].includes(action)
  if (!restrictive && (!config.enabled || !config.nativeRuntimeQualified || Date.now() >= config.expiresAt * 1000)) return reject()
  if (!['inspect', 'register', 'revise', 'requalify', 'begin', 'launch', 'admit', 'finish', 'verify', 'head', 'repair', 'revoke', 'settle-cleanup'].includes(action)) return reject()
  const request = JSON.stringify({ action, input, eligibility }) + '\n'
  if (Buffer.byteLength(request) > 131072) return reject()
  try {
    // Only the native SSH binary opens the existing identity; this process never
    // reads or copies its contents and forwards no app/database environment.
    const operation = exec(nativeSshBinary(), nativeSshArguments(config, 'authority'), {
      env: nativeSshEnvironment(), windowsHide: true, encoding: 'utf8', timeout: action === 'verify' ? 45000 : 20000, maxBuffer: 262144,
    })
    operation.child.stdin!.on('error', () => {})
    operation.child.stdin!.end(request)
    const response = await operation
    if (Buffer.byteLength(response.stdout) > 262144) return reject()
    const envelope = JSON.parse(response.stdout)
    if (envelope?.ok === false && typeof envelope.diagnostic === 'string' && /^Native permit denied at [a-z-]{1,40}\.$/.test(envelope.diagnostic)) throw new Error(envelope.diagnostic)
    if (!envelope || envelope.ok !== true || !Object.hasOwn(envelope, 'result')) return reject()
    return envelope.result as any
  } catch (error) {
    if (error instanceof Error && /^Native permit denied at [a-z-]{1,40}\.$/.test(error.message)) throw error
    const stdout = (error as { stdout?: unknown })?.stdout
    if (typeof stdout === 'string' && Buffer.byteLength(stdout) <= 262144) {
      let denied
      try { denied = JSON.parse(stdout) } catch { /* Truncated/unknown output grants no diagnostic authority. */ }
      if (denied?.ok === false && typeof denied.diagnostic === 'string' && /^Native permit denied at [a-z-]{1,40}\.$/.test(denied.diagnostic)) throw new Error(denied.diagnostic)
    }
    return reject()
  }
}
