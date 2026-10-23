// Fixed native broker inside the guardian's unprivileged cgroup. It never opens
// authentication files: only the pinned native client uses its existing login.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { boundedJsonChannel } from './bounded-json-channel.mjs'
import { runCodexTurn } from './codex-turn-session.mjs'

const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const write = value => new Promise((resolve, reject) => process.stdout.write(JSON.stringify(value) + '\n', error => error ? reject(error) : resolve()))
const home = '/var/lib/aisdlc-codex-broker', cwd = '/opt/aisdlc-codex/workspace'
async function main() {
  if (process.platform !== 'linux' || process.getuid() === 0 || process.argv.length !== 2) throw new Error()
  const channel = boundedJsonChannel(process.stdin)
  let child
  try {
    const task = await channel.read(Date.now() + 10000)
    if (!exact(task, ['kind', 'unit', 'prompt', 'sourceHash', 'allowedPaths', 'deadlineAt']) || task.kind !== 'task'
      || typeof task.unit !== 'string' || !/^aisdlc-attempt-[a-f0-9-]{36}\.service$/.test(task.unit)
      || !(await readFile('/proc/self/cgroup', 'utf8')).trim().endsWith('/' + task.unit)) throw new Error()
    child = spawn('/opt/aisdlc-codex/0.155.1/codex', ['--strict-config', 'app-server', '--listen', 'stdio://'],
      { cwd, env: { HOME: home, CODEX_HOME: home + '/.codex', PATH: '/usr/bin:/bin', RUST_LOG: 'error', TOKIO_WORKER_THREADS: '2' },
        stdio: ['pipe', 'pipe', 'pipe'] })
    const closed = new Promise(resolve => child.once('close', resolve))
    const result = await runCodexTurn({ child, prompt: task.prompt, sourceHash: task.sourceHash, allowedPaths: task.allowedPaths,
      cwd, deadlineAt: task.deadlineAt, authentication: 'chatgpt', admit: async ({ threadId, challengeNonce }) => {
        await write({ kind: 'admission-challenge', threadId, challengeNonce })
        const admission = await channel.read(Math.min(task.deadlineAt, Date.now() + 15000))
        return exact(admission, ['kind', 'approved']) && admission.kind === 'admission' && admission.approved === true
      } })
    await write({ kind: 'result', result })
    child.stdin.end()
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    try { await closed } finally { clearTimeout(timer) }
    if (!result.completed) process.exitCode = 1
  } finally {
    channel.dispose()
    if (child && child.exitCode === null) child.kill('SIGKILL')
  }
}
process.stdout.on('error', () => { process.exitCode = 1 })
main().catch(() => { process.exitCode = 1 })
