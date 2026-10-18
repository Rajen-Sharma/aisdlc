#!/usr/bin/env bash
# Trusted setup on the selected tools/authority host. No model or candidate runs.
set -euo pipefail
[[ $(id -u) == 0 && $(uname -m) == x86_64 ]]
account=aisdlc-authority
authority_home=/var/lib/aisdlc-authority
node_dir=/opt/aisdlc-node/24.14.0
if ! id "$account" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$authority_home" --shell /usr/sbin/nologin "$account"
fi
[[ $(id -u "$account") != 0 ]]
install -d -o root -g root -m 755 "$node_dir" /opt/aisdlc-authority
install -d -o "$account" -g "$account" -m 700 "$authority_home"
[[ ! -L "$authority_home" ]]
python3 - "$node_dir/node" <<'PY'
import hashlib, io, os, pathlib, sys, tarfile, urllib.request
destination = pathlib.Path(sys.argv[1])
with urllib.request.urlopen('https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz', timeout=30) as response:
    data = response.read(80 * 1024 * 1024 + 1)
assert len(data) <= 80 * 1024 * 1024
assert hashlib.sha256(data).hexdigest() == '41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df'
with tarfile.open(fileobj=io.BytesIO(data), mode='r:xz') as archive:
    member = archive.getmember('node-v24.14.0-linux-x64/bin/node')
    assert member.isfile() and 0 < member.size < 160 * 1024 * 1024
    executable = archive.extractfile(member).read()
if destination.exists():
    assert not destination.is_symlink()
    assert hashlib.sha256(destination.read_bytes()).digest() == hashlib.sha256(executable).digest()
else:
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o755)
    with os.fdopen(fd, 'wb') as output:
        output.write(executable)
PY
[[ $("$node_dir/node" --version) == v24.14.0 ]]
sudo -u "$account" "$node_dir/node" --input-type=module - "$authority_home" <<'JS'
import { generateKeyPairSync, createPrivateKey } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
const file = process.argv[2] + '/signing-key.pem'
if (!existsSync(file)) {
  const { privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 })
}
const stat = lstatSync(file)
if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw Error('Unsafe authority key.')
if (createPrivateKey(readFileSync(file)).asymmetricKeyType !== 'ed25519') throw Error('Wrong authority key type.')
JS
# Only the public trust anchor leaves the protected signing account.
sudo -u "$account" "$node_dir/node" --input-type=module - "$authority_home" <<'JS' > /opt/aisdlc-authority/root-public-key.der
import { createPublicKey } from 'node:crypto'
import { readFileSync } from 'node:fs'
process.stdout.write(createPublicKey(readFileSync(process.argv[2] + '/signing-key.pem')).export({ type: 'spki', format: 'der' }))
JS
chmod 644 /opt/aisdlc-authority/root-public-key.der
sha256sum "$node_dir/node" /opt/aisdlc-authority/root-public-key.der > /opt/aisdlc-authority/public-files.sha256
chmod 644 /opt/aisdlc-authority/public-files.sha256
printf '{"authorityKeyPrepared":true,"keyType":"ed25519","node":"24.14.0","privateKeyExported":false,"executionAllowed":false}\n'
