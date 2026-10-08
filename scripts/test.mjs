import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
// One isolated test suite at a time. Schema push must not race between processes.
for (const file of (await readdir('tests')).filter(x => x.endsWith('.test.ts')).sort()) {
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--env-file=.env', '--import', 'tsx', '--test', '--test-force-exit', `tests/${file}`], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('close', done);
  });
  if (code !== 0) { process.exitCode = typeof code === 'number' ? code : 1; break; }
}
