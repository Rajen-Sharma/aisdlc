// A fence must win the same O_EXCL journal claim that every launcher requires.
// Existing claims are never rewritten, interpreted as cleanup, or retried.
import { constants } from 'node:fs'
import { lstat, open, realpath, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
const reject = () => { throw new Error('Unlaunched fence rejected.') }
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
export async function claimUnlaunchedFence(directory, attemptId) {
  if (!uuid(attemptId)) reject()
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)
    || await realpath(directory) !== directory) reject()
  const file = await open(path.join(directory, attemptId + '.jsonl'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try { await file.writeFile(JSON.stringify({ phase: 'fenced-no-launch', attemptId }) + '\n'); await file.sync() }
  finally { await file.close() }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY)
  try { await parent.sync() } finally { await parent.close() }
}
export async function fenceUnlaunchedAttempt(input) {
  if (process.platform !== 'linux' || process.getuid() !== 0 || !input
    || Object.keys(input).sort().join(',') !== 'attemptId,bootId,deadline,hostId,reservationHash,runtimeHash,taskKey,unit'
    || !['attemptId', 'bootId', 'hostId'].every(k => uuid(input[k]))
    || !['taskKey', 'reservationHash', 'runtimeHash'].every(k => typeof input[k] === 'string' && /^[a-f0-9]{64}$/.test(input[k]))
    || input.unit !== `aisdlc-attempt-${input.attemptId}.service` || !Number.isSafeInteger(input.deadline)
    || input.deadline < 1 || input.deadline >= Math.floor(Date.now() / 1000)
    || input.bootId !== (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
    || input.hostId !== (await readFile('/sys/class/dmi/id/product_uuid', 'utf8')).trim().toLowerCase()) reject()
  await claimUnlaunchedFence('/var/lib/aisdlc-guardian/journal', input.attemptId)
  // A future or concurrent launcher can no longer cross the durable claim.
  let stdout
  try { ({ stdout } = await promisify(execFile)('/usr/bin/systemctl', ['show', input.unit, '--property=ExecMainPID,ActiveState,ControlGroup,LoadState'],
    { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, timeout: 5000, maxBuffer: 4096 })) }
  catch (error) {
    if (typeof error.stdout !== 'string' || !/(?:^|\n)LoadState=not-found(?:\n|$)/.test(error.stdout)) throw error
    stdout = error.stdout
  }
  const status = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')))
  if (status.LoadState !== 'not-found' || status.ExecMainPID !== '0' || status.ActiveState !== 'inactive' || status.ControlGroup !== '') reject()
  try { await lstat(`/sys/fs/cgroup/system.slice/${input.unit}`); reject() }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  return { rootExited: true, cgroupEmpty: true, launchWritersDrained: true }
}
