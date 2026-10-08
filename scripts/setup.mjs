import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
if (existsSync('.env')) {
  console.log('Existing .env preserved.')
} else {
  mkdirSync('.local', { recursive: true })
  const password = randomBytes(24).toString('hex')
  writeFileSync('.env', `DATABASE_URL=postgresql://cms:${password}@127.0.0.1:55432/cms\nPAYLOAD_SECRET=${randomBytes(32).toString('hex')}\nSERVER_URL=http://127.0.0.1:3000\n`, { mode: 0o600 })
  console.log('Generated local .env. Secrets are excluded from Git.')
}
