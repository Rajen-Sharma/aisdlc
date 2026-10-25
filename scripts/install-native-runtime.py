#!/usr/bin/env python3
"""Install only a reviewed public package. No policy activation or model call.

Run as root on the explicitly selected private client/tools VM. Native login
material is never opened. Existing service keys and journals are preserved.
"""
import hashlib
import json
import os
import pathlib
import pwd
import stat
import subprocess
import sys
import tempfile
import urllib.request
import io
import tarfile

assert sys.platform == 'linux' and os.geteuid() == 0
assert len(sys.argv) == 4 and sys.argv[1] in ('client', 'tools')
role, package, expected_manifest_hash = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3]
assert package.is_absolute() and package.resolve() == package and not package.is_symlink()

def regular(file, maximum=1048576, owner=None):
    info = file.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and file.resolve() == file
    assert info.st_size <= maximum
    if owner is not None:
        assert info.st_uid == owner and info.st_mode & 0o022 == 0
    return file.read_bytes()

def digest(data):
    return hashlib.sha256(data).hexdigest()

manifest_bytes = regular(package / 'manifest.json')
assert digest(manifest_bytes) == expected_manifest_hash
manifest = json.loads(manifest_bytes)
assert manifest['version'] == 1 and manifest['node'] == '24.14.0' and manifest['codex'] == '0.155.1'
assert manifest['nativeRuntimeQualified'] is False and manifest['executionAllowed'] is False
allow = {'guardian.mjs', 'guardian-engine.mjs', 'broker.mjs', 'verifier.mjs', 'authority.mjs', 'runner.mjs', 'qualify-host.mjs', 'qualify-delivery.mjs', 'qualify-tools.mjs',
         'prepare-client.sh', 'prepare-authority.sh', 'metadata-preflight.py', 'install-runtime.py'}
entries = manifest['files']
assert {entry['name'] for entry in entries} == allow and len(entries) == len(allow)
content = {}
for entry in entries:
    data = regular(package / entry['name'])
    assert len(data) == entry['bytes'] and digest(data) == entry['sha256']
    content[entry['name']] = data

def folder(file, mode=0o755, uid=0, gid=0):
    if not file.exists():
        file.mkdir(mode=mode)
        os.chown(file, uid, gid)
    info = file.lstat()
    assert stat.S_ISDIR(info.st_mode) and file.resolve() == file and info.st_uid == uid
    assert info.st_mode & (0o077 if mode == 0o700 else 0o022) == 0

def atomic(file, data, mode=0o644):
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix='.native-install-', dir=file.parent)
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
        temporary = None
        parent = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if temporary is not None:
            os.unlink(temporary)

# Pinned public executable, never a copy from a credential-bearing home.
node_parent = pathlib.Path('/opt/aisdlc-node')
folder(node_parent); folder(node_parent / '24.14.0')
node = node_parent / '24.14.0/node'
with urllib.request.urlopen('https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz', timeout=30) as response:
    archive_bytes = response.read(80 * 1024 * 1024 + 1)
assert len(archive_bytes) <= 80 * 1024 * 1024
assert digest(archive_bytes) == '41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df'
with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:xz') as archive:
    member = archive.getmember('node-v24.14.0-linux-x64/bin/node')
    assert member.isfile() and 0 < member.size < 160 * 1024 * 1024
    executable = archive.extractfile(member).read()
if node.exists():
    assert regular(node, 160 * 1024 * 1024, 0) == executable
else:
    atomic(node, executable, 0o755)
assert subprocess.check_output([str(node), '--version'], text=True).strip() == 'v24.14.0'

base = pathlib.Path('/opt/aisdlc-codex/guarded' if role == 'client' else '/opt/aisdlc-authority')
if role == 'client':
    # The separate reviewed preparation script preserves existing native login.
    subprocess.run(['/usr/bin/bash', '-s'], input=content['prepare-client.sh'], check=True)
    folder(base)
    folder(pathlib.Path('/var/lib/aisdlc-guardian'), 0o700)
    folder(pathlib.Path('/var/lib/aisdlc-guardian/journal'), 0o700)
    # Service-owned key generation and public export remain inside Node. Python
    # and the operator receive public bytes only; an existing key is never replaced.
    helper = b"""import {existsSync,writeFileSync,lstatSync,readFileSync} from 'node:fs';
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
const file='/var/lib/aisdlc-guardian/signing-key.pem';
if(!existsSync(file)){const {privateKey}=generateKeyPairSync('ed25519');writeFileSync(file,privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});}
const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1||(s.mode&0o077))throw Error('Unsafe guardian key');
const key=createPrivateKey(readFileSync(file));if(key.asymmetricKeyType!=='ed25519')throw Error('Wrong key type');
process.stdout.write(createPublicKey(key).export({format:'der',type:'spki'}));
"""
    public = subprocess.check_output([str(node), '--input-type=module', '-e', helper.decode()])
    assert len(public) == 44
    atomic(base / 'guardian-public-key.der', public)
    mapping = {'guardian.mjs': 'guardian.mjs', 'broker.mjs': 'broker.mjs', 'qualify-host.mjs': 'qualify-host.mjs', 'metadata-preflight.py': 'metadata-preflight.py'}
else:
    subprocess.run(['/usr/bin/bash', '-s'], input=content['prepare-authority.sh'], check=True)
    folder(base)
    account = pwd.getpwnam('aisdlc-authority')
    folder(pathlib.Path('/var/lib/aisdlc-authority/verifier-work'), 0o700, account.pw_uid, account.pw_gid)
    # This is the trusted verifier/signing service, never the coding account.
    assert pathlib.Path('/usr/bin/docker').is_file()
    subprocess.run(['/usr/sbin/usermod', '-aG', 'docker', 'aisdlc-authority'], check=True)
    mapping = {'authority.mjs': 'native-authority.mjs', 'runner.mjs': 'runner.mjs', 'qualify-delivery.mjs': 'qualify-delivery.mjs', 'qualify-tools.mjs': 'qualify-tools.mjs'}

retained = base / 'installed-runtime.json'
prior = json.loads(regular(retained, owner=0)) if retained.exists() else None
if prior:
    assert prior['version'] == 1 and prior['role'] == role
for source, target in mapping.items():
    destination = base / target
    if destination.exists():
        actual = digest(regular(destination, owner=0))
        assert prior and prior['files'].get(target) == actual
for source, target in mapping.items():
    atomic(base / target, content[source])
record = {'version': 1, 'role': role, 'manifestHash': expected_manifest_hash,
          'files': {target: digest(content[source]) for source, target in mapping.items()},
          'nativeRuntimeQualified': False, 'executionAllowed': False}
atomic(retained, (json.dumps(record, indent=2) + '\n').encode())
print(json.dumps({'installed': role, 'manifestHash': record['manifestHash'], 'executionAllowed': False,
                  'nativeRuntimeQualified': False, 'modelCalls': 0, 'authenticationExported': False}))
