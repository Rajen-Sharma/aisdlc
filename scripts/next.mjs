import { spawn } from 'node:child_process'
process.loadEnvFile('.env')
const command = process.argv[2]
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Unknown Next command.')
const args = command === 'build' ? ['build', '--webpack'] : [command, '--hostname', '127.0.0.1']
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { env: process.env, stdio: 'inherit', windowsHide: true })
child.on('exit', code => process.exit(code ?? 1))
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
