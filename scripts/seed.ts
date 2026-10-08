import { getPayload } from 'payload'
import config from '../src/payload.config'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
const payload = await getPayload({ config })
const credentials: { email: string; password: string; role: string }[] = []
for (const role of ['admin', 'editor', 'publisher'] as const) {
  const email = `${role}@example.invalid`
  const result = await payload.find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true, limit: 1 })
  if (result.docs.length) continue
  const password = randomBytes(24).toString('base64url')
  await payload.create({ collection: 'users', data: { email, password, role }, overrideAccess: true })
  credentials.push({ email, password, role })
}
await mkdir('.local', { recursive: true })
if (credentials.length) await writeFile('.local/demo-credentials.json', JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' })
console.log('Synthetic accounts ready. Credentials are in .local/demo-credentials.json (not committed).')
await payload.destroy()
process.exit(0)
