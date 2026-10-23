// Root guardian stays outside the fixed unprivileged workload unit. No caller-
// selected commands, service properties, file paths or environment are accepted.
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { authenticateTurnPermit } from './turn-permit.mjs'
import { boundedJsonChannel } from './bounded-json-channel.mjs'

const exec = promisify(execFile)
const reject = (stage = 'validation') => { throw new Error(`Systemd guardian rejected at ${stage}; attempt remains uncertain.`) }
const fixedEnvironment = { PATH: '/usr/bin:/bin', HOME: '/root', LANG: 'C', NODE_ENV: 'production' }
export const nativeUnitProperties = [
  'User=aisdlc-broker', 'Group=aisdlc-broker', 'Type=exec', 'RemainAfterExit=yes',
  'NoNewPrivileges=yes', 'ProtectSystem=strict', 'ProtectHome=yes', 'PrivateTmp=yes', 'PrivateDevices=yes',
  'ProtectKernelTunables=yes', 'ProtectKernelModules=yes', 'ProtectControlGroups=yes', 'RestrictSUIDSGID=yes',
  'RestrictNamespaces=yes', 'LockPersonality=yes', 'MemoryDenyWriteExecute=yes', 'ProtectProc=invisible',
  'CapabilityBoundingSet=', 'AmbientCapabilities=', 'TemporaryFileSystem=/var/lib:ro /run:ro',
  'BindPaths=/var/lib/aisdlc-codex-broker/.codex', 'ReadOnlyPaths=/opt', 'InaccessiblePaths=/proc/1',
  'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6', 'IPAddressDeny=localhost 169.254.169.254/32', 'IPAddressAllow=127.0.0.53/32',
  'MemoryMax=384M', 'TasksMax=64', 'CPUQuota=50%', 'KillMode=control-group', 'SendSIGKILL=yes', 'TimeoutStopSec=2s',
]
const properties = nativeUnitProperties.flatMap(value => ['--property', value])
const nodeBinary = '/opt/aisdlc-node/24.14.0/node', brokerScript = '/opt/aisdlc-codex/guarded/broker.mjs'
const journalDirectory = '/var/lib/aisdlc-guardian/journal'
async function trustedFile(file, executable) {
  const info = await lstat(file)
  const label = executable ? 'node' : 'broker'
  if (!info.isFile() || info.isSymbolicLink()) reject(`trusted-file-${label}-type`)
  if (info.uid !== 0 || info.nlink !== 1 || (info.mode & 0o022)) reject(`trusted-file-${label}-ownership`)
  if (executable && !(info.mode & 0o100)) reject(`trusted-file-${label}-executable`)
  if (await realpath(file) !== file) reject(`trusted-file-${label}-path`)
}
async function command(args) {
  return exec('/usr/bin/systemctl', args, { env: fixedEnvironment, timeout: 5000, maxBuffer: 4096, encoding: 'utf8' })
}
async function inspect(unit) {
  let stdout
  try { ({ stdout } = await command(['show', unit, '--property=ExecMainPID,ControlGroup,ActiveState,LoadState'])) }
  catch (error) {
    if (typeof error.stdout !== 'string' || !/(?:^|\n)LoadState=not-found(?:\n|$)/.test(error.stdout)) throw error
    stdout = error.stdout
  }
  return Object.fromEntries(stdout.trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function launchGuardedAttempt(envelope, context, { diagnostic } = {}) {
  if (process.platform !== 'linux' || process.getuid() !== 0 || (await readFile('/proc/1/comm', 'utf8')).trim() !== 'systemd') reject('host')
  const lease = authenticateTurnPermit(envelope, context, Math.floor(Date.now() / 1000))
  if (context.kind !== 'launch' || lease.bootId !== (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()) reject('boot')
  for (const file of [nodeBinary, brokerScript]) await trustedFile(file, file === nodeBinary)
  const directory = await lstat(journalDirectory)
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 || (directory.mode & 0o077)
    || await realpath(journalDirectory) !== journalDirectory) reject('journal')
  // O_EXCL plus fsync before the only launcher exists. Restart, duplicate request
  // and a lost controller cannot launch the same attempt again on this host.
  const journal = await open(path.join(journalDirectory, lease.attemptId + '.jsonl'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try {
    await journal.writeFile(JSON.stringify({ phase: 'launch-claimed', lease }) + '\n'); await journal.sync()
    const parent = await open(journalDirectory, constants.O_RDONLY | constants.O_DIRECTORY)
    try { await parent.sync() } finally { await parent.close() }
  } finally { await journal.close() }
  // Lease may have expired during durable storage; the intent stays spent.
  authenticateTurnPermit(envelope, context, Math.floor(Date.now() / 1000))
  const remaining = lease.deadline - Math.floor(Date.now() / 1000)
  if (remaining < 1 || remaining > 120) reject('deadline')
  const child = spawn('/usr/bin/systemd-run', ['--quiet', '--unit', lease.unit, '--wait', '--pipe', ...properties,
    '--property', `RuntimeMaxSec=${remaining}s`, '--working-directory=/opt/aisdlc-codex/workspace',
    nodeBinary, '--jitless', brokerScript], { env: fixedEnvironment, stdio: ['pipe', 'pipe', 'pipe'] })
  let closed = false, transportFailed = false, diagnostics = 0, observed = false
  child.on('error', () => { transportFailed = true })
  child.stdin.on('error', () => { transportFailed = true })
  child.stderr.on('data', chunk => {
    diagnostics += chunk.length
    if (diagnostics > 65536) transportFailed = true
    // An in-process trusted fixture observer may inspect its own credential-free
    // diagnostics. The native controller supplies no observer and logs none.
    else diagnostic?.(Buffer.from(chunk))
  })
  const exit = new Promise(resolve => child.once('close', code => { closed = true; resolve(code) }))
  const channel = boundedJsonChannel(child.stdout)
  const group = `/system.slice/${lease.unit}`
  const stop = async () => {
    try {
      const current = await inspect(lease.unit)
      if (current.LoadState !== 'loaded' || Number(current.ExecMainPID) < 1
        || (current.ControlGroup && current.ControlGroup !== group)) reject()
      observed = true
      child.stdin.end()
      await command(['stop', lease.unit])
      let timer
      try { await Promise.race([exit, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Launcher drain deadline.')), 5000) })]) }
      finally { clearTimeout(timer) }
      if (!closed) reject()
      const stopped = await inspect(lease.unit)
      if (!['inactive', 'failed'].includes(stopped.ActiveState)) reject()
      let populated = false
      try { populated = /(?:^|\n)populated 1(?:\n|$)/.test(await readFile(`/sys/fs/cgroup${group}/cgroup.events`, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') reject() }
      if (populated || !observed) reject()
      return { rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
    } catch { reject('cleanup') }
    finally { channel.dispose() }
  }
  // Observe the actual daemon-created unit, retaining it through stopped state.
  // A never-observed or delayed create cannot be declared clean from absence.
  try {
    const observationDeadline = Math.min(Date.now() + 8000, lease.deadline * 1000)
    while (Date.now() < observationDeadline) {
      const status = await inspect(lease.unit)
      if (status.LoadState === 'loaded' && Number(status.ExecMainPID) > 0) {
        if (status.ControlGroup && status.ControlGroup !== group) reject()
        observed = true; break
      }
      if (closed || transportFailed) reject()
      await pause(50)
    }
    if (!observed || transportFailed) reject()
    return {
      lease,
      send(value) {
        const text = JSON.stringify(value)
        if (closed || transportFailed || Buffer.byteLength(text) > 131072 || Date.now() >= lease.deadline * 1000) reject()
        child.stdin.write(text + '\n')
      },
      read: deadlineAt => channel.read(Math.min(deadlineAt, lease.deadline * 1000)),
      stop,
    }
  } catch {
    // Best effort only. No proof is returned when observation/launch state is uncertain.
    try { await command(['stop', lease.unit]) } catch { /* Remains uncertain. */ }
    if (!closed) child.kill('SIGKILL')
    channel.dispose()
    reject('observation')
  }
}
