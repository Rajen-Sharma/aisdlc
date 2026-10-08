import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
const url = new URL(process.env.DATABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Embedded database requires a loopback URL.')
const pg = new EmbeddedPostgres({
  databaseDir: '.local/postgres', user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  port: Number(url.port), persistent: true, authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: console.error,
})
if (!existsSync('.local/postgres/PG_VERSION')) await pg.initialise()
await pg.start()
const client = pg.getPgClient()
await client.connect()
const name = url.pathname.slice(1)
if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid local database name.')
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
if (!existing.rowCount) await client.query(`CREATE DATABASE "${name}"`)
await client.end()
console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}. Ctrl+C stops it.`)
let stopping = false
async function stop() { if (stopping) return; stopping = true; await pg.stop(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 60_000)
