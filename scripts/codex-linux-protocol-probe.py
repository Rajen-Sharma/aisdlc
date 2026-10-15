"""Trusted, credential-free RPC probe. No threads, turns, models or login methods."""
import base64
import json
import os
from pathlib import Path
import selectors
import socket
import subprocess
import sys
import time

binary, canary = sys.argv[1:3]
home = Path('/tmp/aisdlc-protocol-home')
home.mkdir(mode=0o700)
allowed = {'initialize', 'fs/readFile', 'fs/writeFile', 'command/exec',
           'environment/add', 'environment/info', 'environment/status'}
executor = None
environment = {'HOME': str(home), 'CODEX_HOME': str(home), 'PATH': '/usr/bin:/bin',
               'RUST_LOG': 'error', 'TOKIO_WORKER_THREADS': '2'}
server = subprocess.Popen([binary, 'app-server', '--listen', 'stdio://'],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, env=environment, cwd='/tmp')
selector = selectors.DefaultSelector()
selector.register(server.stdout, selectors.EVENT_READ, 'stdout')
selector.register(server.stderr, selectors.EVENT_READ, 'stderr')
buffer = b''
total = 0
stderr_buffer = b''
sequence = 0
last_method = 'startup'
config_warnings = 0
remote_disabled_notifications = 0

def send(message):
    server.stdin.write(json.dumps(message).encode() + b'\n')
    server.stdin.flush()

def rpc(method, params):
    global buffer, stderr_buffer, total, sequence, last_method, config_warnings, remote_disabled_notifications
    assert method in allowed, 'method outside the model-free allowlist'
    sequence += 1
    last_method = method
    send({'id': sequence, 'method': method, 'params': params})
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        while b'\n' in buffer:
            line, buffer = buffer.split(b'\n', 1)
            if len(line) > 16384:
                raise RuntimeError('oversized protocol record')
            message = json.loads(line.decode('utf-8', errors='strict'))
            if message.get('method') == 'configWarning' and 'id' not in message:
                config_warnings += 1
                if config_warnings > 4:
                    raise RuntimeError('configuration warning limit exceeded')
                continue
            if message.get('method') == 'remoteControl/status/changed' and 'id' not in message:
                remote_disabled_notifications += 1
                if remote_disabled_notifications > 4 or message.get('params', {}).get('status') != 'disabled':
                    raise RuntimeError('remote control is not disabled or notification limit exceeded')
                continue
            if message.get('id') == sequence:
                return message
            # Unexpected server requests/notifications cannot silently pass.
            raise RuntimeError('unexpected protocol record type=' + str(message.get('method', 'response'))[:64])
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
            else:
                stderr_buffer += chunk
    raise RuntimeError('bounded RPC deadline exceeded')

def successful(message):
    if 'error' in message or 'result' not in message:
        raise RuntimeError('expected successful RPC result; errorCode=' + str(message.get('error', {}).get('code')))
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
    # A separate credential-free exec-server shares this disposable sandbox.
    # This qualifies connection/status only, not distinct-host tool routing.
    remote_home = Path('/tmp/aisdlc-executor-home')
    remote_home.mkdir(mode=0o700)
    remote_cwd = Path('/tmp/aisdlc-executor-workspace')
    remote_cwd.mkdir(mode=0o700)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    endpoint = f'ws://127.0.0.1:{port}'
    last_method = 'exec-server/startup'
    remote_environment = dict(environment, HOME=str(remote_home), CODEX_HOME=str(remote_home))
    executor = subprocess.Popen([binary, 'exec-server', '--listen', endpoint],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=remote_environment, cwd=remote_cwd)
    selector.register(executor.stdout, selectors.EVENT_READ, 'executorStdout')
    selector.register(executor.stderr, selectors.EVENT_READ, 'executorStderr')
    startup_deadline = time.monotonic() + 3
    while True:
        if executor.poll() is not None:
            os.set_blocking(executor.stderr.fileno(), False)
            stderr_buffer += os.read(executor.stderr.fileno(), 4096)
            raise RuntimeError('exec-server exited before readiness')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.1):
                break
        except OSError:
            if time.monotonic() >= startup_deadline:
                raise RuntimeError('exec-server startup deadline exceeded')
            time.sleep(0.05)
    successful(rpc('environment/add', {'environmentId': 'synthetic-remote',
                                     'execServerUrl': endpoint, 'connectTimeoutMs': 1500}))
    info = successful(rpc('environment/info', {'environmentId': 'synthetic-remote'}))
    checks['remoteEnvironmentCwdMatches'] = info.get('cwd') == remote_cwd.as_uri()
    checks['remoteEnvironmentReady'] = successful(rpc(
        'environment/status', {'environmentId': 'synthetic-remote'})).get('status') == 'ready'
    checks['unknownEnvironmentDenied'] = successful(rpc(
        'environment/status', {'environmentId': 'synthetic-unknown'})).get('status') == 'unknown'
    executor.terminate()
    executor.wait(timeout=2)
    loss_deadline = time.monotonic() + 3
    while True:
        status = successful(rpc('environment/status', {'environmentId': 'synthetic-remote'}))
        if status.get('status') == 'disconnected':
            checks['lostRemoteEnvironmentDisconnected'] = True
            break
        if time.monotonic() >= loss_deadline:
            raise RuntimeError('lost exec-server did not become disconnected')
        time.sleep(0.05)
    assert all(checks.values()), 'a containment check did not pass'
    print(json.dumps({'checks': checks, 'configWarnings': config_warnings, 'modelCalls': 0, 'credentialFree': True,
                      'codexToolBoundaryQualified': False, 'executionAllowed': False, 'retryAllowed': False}))
except Exception as error:
    # Only probe-owned stages/types and bounded exception diagnostics; no RPC
    # payloads, server stderr or environment values are published.
    # Classify only fixed markers. Never emit server-controlled text.
    diagnostic_text = stderr_buffer.decode('utf-8', errors='replace').lower()
    markers = {
        'threadLimit': ('resource temporarily unavailable', 'failed to spawn thread'),
        'memoryLimit': ('memory allocation', 'out of memory'),
        'missingFile': ('no such file or directory',),
        'permission': ('permission denied', 'operation not permitted'),
        'panic': ('panicked at',),
        'argument': ('unexpected argument', 'invalid value', 'required arguments', 'cannot be used', 'only supported'),
        'authentication': ('api key', 'authentication', 'not logged', 'access token'),
        'transport': ('websocket', 'listen', 'bind'),
    }
    classified = [name for name, values in markers.items() if any(value in diagnostic_text for value in values)]
    executor_exit = executor.poll() if executor is not None else 'not-started'
    diagnostic = (f'stage={last_method}; request={sequence}; childExit={server.poll()}; executorExit={executor_exit}; '
                  f'stderrBytes={len(stderr_buffer)}; classes={classified}; {type(error).__name__}: {error}')
    diagnostic = diagnostic[:512].replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print('::error title=Credential-free Codex protocol probe::' + diagnostic, file=sys.stderr)
    raise
finally:
    if executor is not None:
        if not executor.stdin.closed:
            executor.stdin.close()
        try:
            executor.wait(timeout=2)
        except subprocess.TimeoutExpired:
            executor.kill()
            executor.wait(timeout=2)
    server.stdin.close()
    try:
        server.wait(timeout=2)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=2)
    selector.close()
