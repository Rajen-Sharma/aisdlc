import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import { nativeExecutorConfiguration } from '../../../sdlc/native-transport'

export default async function NativeRunStatus() {
  let status: { phase: string; attempt: number | null; updatedAt: string } | undefined
  let configured = false
  try {
    const config = await nativeExecutorConfiguration()
    if (config) {
      configured = true
      const file = path.resolve(`.local/native-status-${config.taskKey}.json`), stat = await lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2048) throw new Error()
      const handle = await open(file, 'r')
      try {
        const buffer = Buffer.alloc(2049), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        if (bytesRead !== stat.size || bytesRead > 2048) throw new Error()
        const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
        if (value.taskKey !== config.taskKey || value.scopeHash !== config.scopeHash || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error()
        if (value.attempt !== null && (!Number.isInteger(value.attempt) || value.attempt < 1 || value.attempt > 3)) throw new Error()
        status = value
      } finally { await handle.close() }
    }
  } catch { /* Progress is informational; unavailable status never enables an action. */ }
  const descriptions: Record<string, string> = {
    preparing: 'Checking the accepted scope and execution environment.', 'awaiting-guardian': 'Preparing the isolated coding run.',
    running: 'Coding is in progress. The result will be checked independently.', verifying: 'The coding run has stopped. Independent checks are running.',
    'awaiting-review': 'A checked result is ready for the separate human reviews below.',
    'failed-checks': 'Independent checks failed. The retained result and feedback form are below; acceptance is blocked.',
    uncertain: 'The run is paused while its state is checked. No automatic retry is permitted.',
  }
  const stale = status && Date.now() - Date.parse(status.updatedAt) > 180000 && !['awaiting-review', 'failed-checks', 'uncertain'].includes(status.phase)
  return <section className="delivery-panel runs-panel" aria-label="Coding run progress"><span className="eyebrow">05 / FOLLOW THE CODING RUN</span><h2>Coding run progress</h2>
    <p role="status">{stale ? 'The run has stopped reporting. Review is paused until its state is checked.' : status && descriptions[status.phase]
      ? descriptions[status.phase] : configured ? 'No current run status is available. Verified delivery evidence governs review.' : 'No private coding run has started. Your recorded scope decisions remain available.'}</p>
    {status && <p className="muted">{status.attempt ? `Attempt ${status.attempt} of 3 · ` : ''}Updated {new Date(status.updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} Sydney</p>}
  </section>
}
