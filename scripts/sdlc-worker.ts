import { getPayload } from 'payload'
import config from '../src/payload.config'
import { open, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { digest, responseSchema, triagePrompt, validateTriage, type IntakeRecord } from '../src/sdlc/contracts'
import { activeProject, validateProject } from '../src/sdlc/project'
import { claimTriage } from '../src/sdlc/claim'
const root = resolve('.local/sdlc-worker')
await mkdir(root, { recursive: true })
// Never expire this lock automatically: a crashed worker can leave an unknown live child.
const lock = await open(resolve(root, 'worker.lock'), 'wx').catch(() => { throw new Error('Worker lock exists. Verify no worker/CLI child is running before recovery; do not blindly retry.') })
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  payload = await getPayload({ config })
  const claimed = await claimTriage(payload)
  if (!claimed) console.log('No queued intake tasks.')
  else {
    const run = claimed, startedAt = Date.now()
    try {
      const project = validateProject(run.projectContext)
      if (project.key !== run.projectKey || digest(project) !== run.contextHash || digest(await activeProject()) !== run.contextHash) throw new Error('Snapshot project context is stale or invalid.')
      if (!Array.isArray(run.snapshot) || !run.snapshot.length || run.snapshot.length > 100 || digest({ project, records: run.snapshot }) !== run.taskKey || run.snapshot.some(x => !x || typeof x !== 'object' || (x as { projectKey?: string }).projectKey !== project.key)) throw new Error('Snapshot integrity check failed.')
      const records = run.snapshot as IntakeRecord[]
      const folder = resolve(root, `run-${run.id}`)
      await mkdir(folder, { recursive: true })
      await writeFile(resolve(folder, 'AGENTS.md'), 'Intake triage only. No tools, shell commands or filesystem reads/writes. Respond from the supplied synthetic/redacted data only.\n')
      await writeFile(resolve(folder, 'schema.json'), JSON.stringify(responseSchema(records.map(x => String(x.id)))))
      const cli = process.platform === 'win32' ? resolve(process.env.APPDATA!, 'npm/node_modules/@openai/codex/bin/codex.js') : null
      const safeEnv: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
      for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME']) if (process.env[key]) safeEnv[key] = process.env[key]
      const invoke = async (args: string[], input?: string) => await new Promise<{ code: number | null; stdout: string; toolUsed: boolean; timedOut: boolean }>((done, reject) => {
        const child = spawn(cli ? process.execPath : 'codex', cli ? [cli, ...args] : args, { shell: false, windowsHide: true, cwd: folder, env: safeEnv, stdio: ['pipe', 'pipe', 'pipe'] })
        let stdout = '', size = 0, toolUsed = false, timedOut = false, buffer = ''
        const stop = () => {
          if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          else child.kill('SIGKILL')
        }
        const timer = setTimeout(() => { timedOut = true; stop() }, 120000)
        child.stdout.on('data', b => {
          size += b.length
          if (size > 2_000_000) { timedOut = true; stop(); return }
          stdout += b; buffer += b
          const lines = buffer.split('\n'); buffer = lines.pop() || ''
          for (const line of lines) { try { const event = JSON.parse(line); if (['command_execution', 'mcp_tool_call', 'file_change', 'web_search'].includes(event.item?.type)) { toolUsed = true; stop() } } catch { /* non-event version output */ } }
        })
        child.stderr.resume() // Never expose CLI diagnostics that may contain host configuration.
        child.on('error', err => { clearTimeout(timer); reject(err) })
        child.on('close', code => { clearTimeout(timer); done({ code, stdout, toolUsed, timedOut }) })
        child.stdin.on('error', () => {}); child.stdin.end(input || '')
      })
      const version = await invoke(['--version'])
      const execution = await invoke(['exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', folder, '--json', '--output-schema', resolve(folder, 'schema.json'), '--output-last-message', resolve(folder, 'result.json'), '-'], triagePrompt(records, project))
      if (execution.code !== 0 || execution.toolUsed || execution.timedOut) throw new Error(`Read-only triage failed: exit=${execution.code}, toolAttempt=${execution.toolUsed}, timedOut=${execution.timedOut}. No work promoted.`)
      const raw = await readFile(resolve(folder, 'result.json'), 'utf8')
      if (raw.length > 200000) throw new Error('AI response exceeds size limit.')
      const result = validateTriage(JSON.parse(raw), records.map(x => String(x.id)))
      await payload.update({ collection: 'sdlc-runs', id: run.id, overrideAccess: true, data: { status: 'awaiting-review', result, resultHash: digest({ project, result }), elapsedMs: Date.now() - startedAt, toolVersion: version.stdout.trim().slice(0, 100), exitCode: execution.code } })
      console.log(`RUN-${run.id}: schema and provenance validated; awaiting human review. No implementation or release authorized.`)
    } catch (error) {
      const message = error instanceof Error && /^(Snapshot|AI |Unknown|Invalid|Read-only)/.test(error.message) ? error.message : 'Worker failed. Inspect the local environment; no output was promoted.'
      await payload.update({ collection: 'sdlc-runs', id: run.id, overrideAccess: true, data: { status: 'failed', failure: message, elapsedMs: Date.now() - startedAt } })
      console.error(`RUN-${run.id}: ${message}`); process.exitCode = 1
    }
  }
} finally {
  if (payload) await payload.destroy()
  await lock.close(); await rm(resolve(root, 'worker.lock'))
}
process.exit(process.exitCode || 0)
