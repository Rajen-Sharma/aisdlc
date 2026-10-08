import { readFile, readdir, appendFile } from 'node:fs/promises'
let log
try { log = (await readFile('docs/evidence/github-ci/integration-tests.log', 'utf8')).replace(/\x1b\[[0-9;]*m/g, '') } catch { console.log('No integration log available.'); process.exit(0) }
// Emit only source-owned scenario names and an allowlist of diagnostic phrases.
// Never publish arbitrary log contents, credentials, assertion objects or URLs.
const titles = []
for (const file of (await readdir('tests')).filter(name => name.endsWith('.test.ts'))) {
  const source = await readFile(`tests/${file}`, 'utf8')
  for (const match of source.matchAll(/test\('([^'\n]+)'/g)) titles.push(match[1])
}
const failed = titles.filter(title => log.split('\n').some(line => line.includes(title) && (line.includes('✖') || /not ok \d+/.test(line))))
const known = ['Heartbeat must have begun before lease expiry.', 'Story integrity failed.', 'Story mutation requires a PostgreSQL transaction.', 'Task counter integrity failed.', 'ERR_ASSERTION', 'ECONNREFUSED', '55P03', '57014']
const messages = [...failed, ...known.filter(phrase => log.includes(phrase))]
if (!messages.length) messages.push('Integration failure; consult the retained per-run artifact.')
for (const message of messages) console.log(`::error title=Integration diagnostic::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`)
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nIntegration diagnostics (safe allowlist only):\n\n${messages.map(message => `- ${message}`).join('\n')}\n`)
