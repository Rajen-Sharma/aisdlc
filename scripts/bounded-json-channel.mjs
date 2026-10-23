// Bounded JSON lines for trusted controller/guardian IPC. No raw diagnostic logging.
export function boundedJsonChannel(stream, { maximumBytes = 262144, maximumLine = 131072, maximumMessages = 8 } = {}) {
  const decoder = new TextDecoder('utf-8', { fatal: true }), queue = []
  let pending = '', total = 0, count = 0, failure, closed = false, waiting
  const wake = () => { const resolve = waiting; waiting = undefined; resolve?.() }
  const invalid = () => { failure = new Error('Guarded IPC rejected.'); wake() }
  const data = chunk => {
    try {
      total += chunk.length
      if (total > maximumBytes) return invalid()
      pending += decoder.decode(chunk, { stream: true })
      let newline
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        if (Buffer.byteLength(line) > maximumLine || ++count > maximumMessages || queue.length >= maximumMessages) return invalid()
        const value = JSON.parse(line)
        if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
        queue.push(value)
      }
      if (Buffer.byteLength(pending) > maximumLine) return invalid()
      wake()
    } catch { invalid() }
  }
  const end = () => { closed = true; if (pending) invalid(); wake() }
  stream.on('data', data); stream.on('error', invalid); stream.on('end', end)
  return {
    async read(deadlineAt) {
      if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now() || deadlineAt - Date.now() > 120000 || waiting) throw new Error('Guarded IPC rejected.')
      const timer = setTimeout(invalid, deadlineAt - Date.now())
      try {
        while (!queue.length) {
          if (failure) throw failure
          if (closed) throw new Error('Guarded IPC closed.')
          await new Promise(resolve => { waiting = resolve })
        }
        if (failure || Date.now() >= deadlineAt) throw failure ?? new Error('Guarded IPC expired.')
        return queue.shift()
      } finally { clearTimeout(timer) }
    },
    dispose() { stream.off('data', data); stream.off('error', invalid); stream.off('end', end); closed = true; wake() },
  }
}
