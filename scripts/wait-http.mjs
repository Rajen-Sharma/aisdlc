const started = Date.now()
let ready = false
while (Date.now() - started < 90_000) {
  try { if ((await fetch('http://127.0.0.1:3000', { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break } } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000))
}
if (!ready) throw new Error('Application did not become ready within 90 seconds.')
console.log('Application ready.')
