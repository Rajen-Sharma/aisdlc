// Fixed operator-selected public files and service-generated signing keys only.
// Never use these helpers for native authentication or personal credentials.
import { constants, createReadStream } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const reject = () => { throw new Error('Trusted host file rejected.') }
export async function trustedHostFile(file, { maximumBytes = 1048576, privateMode = false } = {}) {
  if (process.platform !== 'linux' || !path.isAbsolute(file) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 1048576) reject()
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== 0 || (stat.mode & (privateMode ? 0o077 : 0o022))
    || stat.size > maximumBytes || await realpath(file) !== file) reject()
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) reject()
    const bytes = Buffer.alloc(maximumBytes + 1)
    let size = 0
    while (size < bytes.length) {
      const read = await handle.read(bytes, size, bytes.length - size, size)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    const after = await handle.stat()
    if (size > maximumBytes || size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) reject()
    return Buffer.from(bytes.subarray(0, size))
  } finally { await handle.close() }
}

export async function trustedHostHash(file, expectedHash, maximumBytes = 300 * 1024 * 1024) {
  if (process.platform !== 'linux' || !path.isAbsolute(file) || !/^[a-f0-9]{64}$/.test(expectedHash)) reject()
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== 0 || (stat.mode & 0o022)
    || stat.size > maximumBytes || await realpath(file) !== file) reject()
  const hash = createHash('sha256')
  let size = 0
  const stream = createReadStream(file, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })
  for await (const bytes of stream) {
    size += bytes.length
    if (size > maximumBytes) { stream.destroy(); reject() }
    hash.update(bytes)
  }
  const after = await lstat(file)
  if (hash.digest('hex') !== expectedHash || size !== stat.size || after.ino !== stat.ino || after.dev !== stat.dev
    || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) reject()
}
