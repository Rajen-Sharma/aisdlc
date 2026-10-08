import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
const exec = promisify(execFile)
const image = process.env.PROBE_IMAGE
if (!image || !/^node@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('PROBE_IMAGE must be an explicitly pinned official Node image digest.')
const evidence = { image, checkedAt: new Date().toISOString(), scope: 'Preliminary deterministic container probes; no coding or full qualification.', probes: [] }
const probes = [
  ['Non-root, no capabilities and no-new-privileges', `const a=require('node:assert/strict'),f=require('node:fs'); a.notEqual(process.getuid(),0); const s=f.readFileSync('/proc/self/status','utf8'); a.match(s,/CapEff:\\s+0+\\n/); a.match(s,/NoNewPrivs:\\s+1/);`],
  ['Read-only root with bounded temporary writable storage', `const a=require('node:assert/strict'),f=require('node:fs'); const root=f.readFileSync('/proc/mounts','utf8').split('\\n').find(x=>x.split(' ')[1]==='/'); a.ok(root.split(' ')[3].split(',').includes('ro')); f.writeFileSync('/tmp/probe','synthetic'); a.equal(f.readFileSync('/tmp/probe','utf8'),'synthetic');`],
  ['External DNS denied and application credentials absent', `const a=require('node:assert/strict'),d=require('node:dns').promises; for(const k of ['DATABASE_URL','PAYLOAD_SECRET','OPENAI_API_KEY','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN']) a.equal(process.env[k],undefined); d.lookup('example.com').then(()=>process.exit(1),()=>process.exit(0));`],
]
try {
  await exec('docker', ['pull', image], { timeout: 180000, maxBuffer: 256000 })
  for (const [check, code] of probes) {
    const name = `sdlc-probe-${randomUUID()}`
    let passed = false
    try {
      await exec('docker', ['run', '--name', name, '--network', 'none', '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '32', '--memory', '128m', '--cpus', '1', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,mode=1777', image, 'node', '-e', code], { timeout: 30000, maxBuffer: 64000 })
      passed = true
    } finally {
      // Remove by coordinator-generated name even if the Docker client timed out.
      await exec('docker', ['rm', '-f', name], { timeout: 15000, maxBuffer: 64000 })
      let remains = false
      try { await exec('docker', ['inspect', name], { timeout: 15000, maxBuffer: 64000 }); remains = true } catch (error) { if (error.code !== 1) throw error }
      if (remains) throw new Error('Container termination could not be confirmed.')
      evidence.probes.push({ check, passed, containerRemoved: true })
    }
  }
} catch {
  evidence.failure = 'Probe or cleanup failed. No execution qualification granted.'
  process.exitCode = 1
} finally {
  await mkdir('docs/evidence/isolation', { recursive: true })
  await writeFile('docs/evidence/isolation/probe.json', JSON.stringify(evidence, null, 2))
}
console.log(JSON.stringify(evidence))
