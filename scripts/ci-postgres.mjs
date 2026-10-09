import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'

// Trusted CI database setup, never a generated-code execution backend.
const image = 'postgres@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
const run = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || !/^\d+$/.test(run ?? '') || !/^\d+$/.test(attempt ?? '')) throw new Error('GitHub Linux CI only.')
const name = `sdlc-ci-postgres-${run}-${attempt}`
const owner = `${run}:${attempt}`
const directory = 'docs/evidence/github-ci'
await mkdir(directory, { recursive: true })
const report = { version: 1, image, owner, observedAt: new Date().toISOString(), pulls: [], ready: false }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function docker(args, timeout = 30000) {
  return new Promise(resolve => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', exceeded = false, timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
    const collect = bytes => {
      if (Buffer.byteLength(output) + bytes.length > 524288) { exceeded = true; child.kill('SIGKILL') }
      else output += bytes.toString('utf8')
    }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, output: '', timedOut, exceeded, launchFailed: true }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, timedOut, exceeded, launchFailed: false }) })
  })
}
function category(result) {
  if (result.launchFailed) return 'docker-client-unavailable'
  if (result.timedOut) return 'timeout'
  if (result.exceeded) return 'output-limit'
  if (result.code === 0) return 'success'
  const text = result.output.toLowerCase()
  if (/toomanyrequests|too many requests|pull rate limit/.test(text)) return 'registry-rate-limit'
  if (/manifest unknown|not found|no matching manifest/.test(text)) return 'manifest-unavailable'
  if (/unauthorized|authentication required|denied/.test(text)) return 'registry-access-denied'
  if (/certificate|x509|tls handshake/.test(text)) return 'tls-error'
  if (/no such host|network|connection|i\/o timeout|deadline exceeded/.test(text)) return 'network-error'
  return 'unclassified-docker-error'
}
async function persist() {
  await writeFile(`${directory}/database-startup.json`, JSON.stringify(report, null, 2) + '\n')
  // Only fixed categories/validated identifiers enter public annotations. Raw daemon text stays private to this process.
  console.log(`::notice title=CI database diagnostic::${JSON.stringify(report)}`)
}
async function inspect() {
  const result = await docker(['inspect', '--type=container', name])
  if (category(result) !== 'success') throw new Error('Owned CI database inspection failed.')
  const rows = JSON.parse(result.output)
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].Name !== `/${name}` || rows[0].Config?.Labels?.['ai-sdlc.ci-owner'] !== owner || !/^[a-f0-9]{64}$/.test(rows[0].Id)) throw new Error('CI database identity mismatch.')
  return rows[0]
}
if (process.argv[2] === 'stop') {
  // Missing containers are harmless; never remove an unowned name or follow a changed name.
  const listed = await docker(['ps', '-aq', '--no-trunc', '--filter', `name=^/${name}$`])
  if (category(listed) !== 'success') throw new Error('CI database inventory failed.')
  if (listed.output.trim()) {
    const row = await inspect()
    if (category(await docker(['rm', '-f', row.Id])) !== 'success') throw new Error('CI database removal failed.')
  }
  const absent = await docker(['ps', '-aq', '--no-trunc', '--filter', `name=^/${name}$`])
  if (category(absent) !== 'success' || absent.output.trim()) throw new Error('CI database absence not confirmed.')
  console.log('Owned CI database absent.')
} else if (process.argv[2] === 'start') {
  try {
    for (let index = 0; index < 3; index++) {
      const pulled = await docker(['pull', image], 180000)
      report.pulls.push({ attempt: index + 1, exitCode: pulled.code, category: category(pulled) })
      if (category(pulled) === 'success') break
      if (index < 2) await delay((index + 1) * 3000)
    }
    if (report.pulls.at(-1)?.category !== 'success') throw new Error('Pinned CI database pull failed; see safe diagnostic.')
    const created = await docker(['run', '-d', '--name', name, '--label', `ai-sdlc.ci-owner=${owner}`, '-p', '127.0.0.1:55432:5432', '-e', 'POSTGRES_USER=cms', '-e', 'POSTGRES_PASSWORD=ci-only-not-for-deployment', '-e', 'POSTGRES_DB=cms', '--health-cmd', 'pg_isready -U cms -d cms', '--health-interval', '2s', '--health-timeout', '5s', '--health-retries', '20', image])
    report.create = category(created)
    if (report.create !== 'success') throw new Error('CI database creation failed.')
    for (let index = 0; index < 30; index++) {
      const row = await inspect()
      if (row.Config.Image !== image || row.State.Running !== true) throw new Error('CI database image/state mismatch.')
      if (row.State.Health?.Status === 'healthy') { report.ready = true; break }
      await delay(2000)
    }
    if (!report.ready) throw new Error('CI database readiness timed out.')
  } finally { await persist() }
} else throw new Error('Expected start or stop.')
