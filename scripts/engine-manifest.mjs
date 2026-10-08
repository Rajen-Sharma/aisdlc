import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).filter(file => file !== 'docs/evidence/engine-manifest.json');
const records = [];
for (const file of files) {
  const bytes = await readFile(file);
  records.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
await writeFile('docs/evidence/engine-manifest.json', JSON.stringify({ recordedAt: new Date().toISOString(), sourceCommit: commit, buildId, definition: 'SHA-256 of tracked working-file bytes at the source commit, including local line endings. This index is mutable local evidence, not an immutable archive or approval.', files: records }, null, 2));
console.log(`Evidence index bound to ${commit}; ${records.length} files.`);
