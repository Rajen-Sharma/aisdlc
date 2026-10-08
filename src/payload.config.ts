import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { Users, Authors, Articles } from './collections'
const root = path.dirname(fileURLToPath(import.meta.url))
if (!process.env.PAYLOAD_SECRET || process.env.PAYLOAD_SECRET.length < 32) throw new Error('PAYLOAD_SECRET must contain at least 32 characters.')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')
export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  serverURL: process.env.SERVER_URL || 'http://127.0.0.1:3000',
  admin: { user: 'users', importMap: { baseDir: root } },
  collections: [Users, Authors, Articles],
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL }, push: process.env.NODE_ENV !== 'production' }),
  typescript: { outputFile: path.resolve(root, 'payload-types.ts') },
  graphQL: { disable: true },
})
