"""Trusted, credential-free RPC probe. No threads, turns, models or login methods."""
import base64
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time

binary, canary = sys.argv[1:3]
home = Path('/tmp/aisdlc-protocol-home')
home.mkdir(mode=0o700)
allowed = {'initialize', 'fs/readFile', 'fs/writeFile', 'command/exec'}
environment = {'HOME': str(home), 'CODEX_HOME': str(home), 'PATH': '/usr/bin:/bin', 'RUST_LOG': 'error'}
server = subprocess.Popen([binary, 'app-server', '--listen', 'stdio://'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, env=environment, cwd='/tmp')
selector = selectors.DefaultSelector()
selector.register(server.stdout, selectors.EVENT_READ, 'stdout')
selector.register(server.stderr, selectors.EVENT_READ, 'stderr')
buffer = b''
total = 0
sequence = 0

def send(message):
    server.stdin.write(json.dumps(message).encode() + b'\n')
    server.stdin.flush()

def rpc(method, params):
    global buffer, total, sequence
    assert method in allowed, 'method outside the model-free allowlist'
    sequence += 1
    send({'id': sequence, 'method': method, 'params': params})
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        while b'\n' in buffer:
            line, buffer = buffer.split(b'\n', 1)
            if len(line) > 16384:
                raise RuntimeError('oversized protocol record')
            message = json.loads(line.decode('utf-8', errors='strict'))
            if message.get('id') == sequence:
                return message
            # Unexpected server requests/notifications cannot silently pass.
            raise RuntimeError('unexpected protocol record')
        for key, _ in selector.select(min(0.25, max(0, deadline - time.monotonic()))):
            chunk = os.read(key.fileobj.fileno(), 4096)
            if not chunk:
                selector.unregister(key.fileobj)
                if key.data == 'stdout':
                    raise RuntimeError('protocol ended before response')
                continue
            total += len(chunk)
            if total > 65536:
                raise RuntimeError('combined diagnostic/protocol limit exceeded')
            if key.data == 'stdout':
                buffer += chunk
                if len(buffer) > 16384 and b'\n' not in buffer:
                    raise RuntimeError('oversized protocol record')
    raise RuntimeError('bounded RPC deadline exceeded')

def successful(message):
    if 'error' in message or 'result' not in message:
        raise RuntimeError('expected successful RPC result')
    return message['result']

def denied(message):
    error = message.get('error', {})
    # Unknown/invalid methods are not evidence of filesystem containment.
    return error.get('code') not in (None, -32600, -32601, -32602) and any(
        marker in error.get('message', '').lower()
        for marker in ('permission denied', 'operation not permitted', 'read-only file system', 'no such file'))

try:
    successful(rpc('initialize', {'clientInfo': {'name': 'aisdlc_synthetic_probe', 'version': '1'},
                                  'capabilities': {'experimentalApi': True}}))
    send({'method': 'initialized'})
    payload = b'synthetic-protocol-positive\n'
    successful(rpc('fs/writeFile', {'path': '/tmp/positive.txt', 'dataBase64': base64.b64encode(payload).decode()}))
    read = successful(rpc('fs/readFile', {'path': '/tmp/positive.txt'}))
    assert base64.b64decode(read['dataBase64'], validate=True) == payload
    checks = {'filesystemPositiveControl': True}
    checks['hostCanaryReadDenied'] = denied(rpc('fs/readFile', {'path': canary}))
    checks['procRootReadDenied'] = denied(rpc('fs/readFile', {'path': '/proc/1/root' + canary}))
    checks['systemWriteDenied'] = denied(rpc('fs/writeFile', {
        'path': '/etc/aisdlc-protocol-forbidden', 'dataBase64': base64.b64encode(payload).decode()}))
    code = """
import json, os, socket, sys
checks = {'nonRoot': os.getuid() != 0}
try:
    open(sys.argv[1], 'rb').read(1)
    checks['hostCanaryDenied'] = False
except (PermissionError, FileNotFoundError):
    checks['hostCanaryDenied'] = True
for name, address in [('metadataDenied', '169.254.169.254'), ('internetDenied', '1.1.1.1')]:
    try:
        socket.create_connection((address, 80), timeout=0.5).close()
        checks[name] = False
    except OSError:
        checks[name] = True
os.symlink(sys.argv[1], '/tmp/escape-link')
print(json.dumps(checks))
sys.exit(0 if all(checks.values()) else 1)
"""
    command = successful(rpc('command/exec', {
        'command': ['/usr/bin/python3', '-c', code, canary], 'cwd': '/tmp', 'timeoutMs': 4000,
        'sandboxPolicy': {'type': 'externalSandbox', 'networkAccess': 'restricted'}}))
    assert command['exitCode'] == 0
    assert all(json.loads(command['stdout']).values())
    checks['commandExecutionConfined'] = True
    checks['symlinkReadDenied'] = denied(rpc('fs/readFile', {'path': '/tmp/escape-link'}))
    assert all(checks.values()), 'a containment check did not pass'
    print(json.dumps({'checks': checks, 'modelCalls': 0, 'credentialFree': True,
                      'codexToolBoundaryQualified': False, 'executionAllowed': False, 'retryAllowed': False}))
finally:
    server.stdin.close()
    try:
        server.wait(timeout=2)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=2)
    selector.close()
