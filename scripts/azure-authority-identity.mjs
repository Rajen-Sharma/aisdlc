// Host-side managed identity only. Never called inside a candidate container.
// The storage audience and link-local endpoint are fixed, not request parameters.
export async function authorityStorageToken({ transport = fetch, now = () => Date.now() } = {}) {
  let response
  try {
    const url = 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fstorage.azure.com%2F'
    response = await transport(url, { headers: { Metadata: 'true' }, redirect: 'error', signal: AbortSignal.timeout(5000) })
    if (response.status !== 200 || !response.body) throw new Error()
    const declared = response.headers.get('content-length')
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 32768)) throw new Error()
    const reader = response.body.getReader(), chunks = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > 32768) throw new Error()
        chunks.push(value)
      }
    } catch {
      await reader.cancel().catch(() => {})
      throw new Error()
    } finally { reader.releaseLock() }
    if (declared !== null && Number(declared) !== total) throw new Error()
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total)))
    if (!value || value.token_type !== 'Bearer' || value.resource !== 'https://storage.azure.com/'
      || typeof value.access_token !== 'string' || value.access_token.length < 1 || value.access_token.length > 16384
      || /[\r\n]/.test(value.access_token) || !/^\d+$/.test(String(value.expires_on))
      || Number(value.expires_on) < Math.floor(now() / 1000) + 60) throw new Error()
    return value.access_token
  } catch {
    await response?.body?.cancel().catch(() => {})
    throw new Error('Authority managed identity unavailable.')
  }
}
