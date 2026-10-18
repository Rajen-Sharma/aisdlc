"""Trusted synthetic Linux lifecycle qualification. No credentials or model calls."""
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time


def identity(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    return {'pid': pid, 'start': fields[19], 'state': fields[0]}


def descendant(marker):
    os.setsid()
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    child = os.fork()
    if child == 0:
        os.setsid()
        while True:
            time.sleep(1)
    deadline = time.monotonic() + 1
    while os.getsid(child) != child:
        assert time.monotonic() < deadline
        time.sleep(0.01)
    temporary = Path(marker + '.tmp')
    temporary.write_text(json.dumps([identity(os.getpid()), identity(child)]))
    temporary.replace(marker)
    while True:
        time.sleep(1)


def worker(binary, script):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    home = Path('/tmp/aisdlc-lifecycle-home')
    home.mkdir(mode=0o700)
    env = {'HOME': str(home), 'CODEX_HOME': str(home), 'PATH': '/usr/bin:/bin',
           'RUST_LOG': 'error', 'TOKIO_WORKER_THREADS': '2'}
    server = subprocess.Popen([binary, 'app-server', '--listen', 'stdio://'], env=env, cwd='/tmp',
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector()
    selector.register(server.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(server.stderr, selectors.EVENT_READ, 'stderr')
    pending = b''
    total = 0
    sequence = 0
    notices = 0

    def send(value):
        server.stdin.write(json.dumps(value).encode() + b'\n')
        server.stdin.flush()

    def rpc(method, params):
        nonlocal pending, total, sequence, notices
        assert method in {'initialize', 'command/exec'}
        sequence += 1
        send({'id': sequence, 'method': method, 'params': params})
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                assert len(line) <= 16384
                value = json.loads(line)
                if 'method' in value:
                    assert 'id' not in value
                    assert value['method'] in {'configWarning', 'remoteControl/status/changed'}
                    notices += 1
                    assert notices <= 8
                    if value['method'] == 'remoteControl/status/changed':
                        assert value['params']['status'] == 'disabled'
                    continue
                assert value.get('id') == sequence and 'error' not in value
                return value['result']
            for key, _ in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    assert key.data != 'stdout', 'protocol-closed'
                    continue
                total += len(chunk)
                assert total <= 65536
                if key.data == 'stdout':
                    pending += chunk
                    assert len(pending) <= 32768
        raise RuntimeError('rpc-deadline')

    rpc('initialize', {'clientInfo': {'name': 'aisdlc_lifecycle_probe', 'version': '1'},
                       'capabilities': {'experimentalApi': True}})
    send({'method': 'initialized'})
    # This fixed command spawns TERM-ignoring, session-detached descendants through
    # the actual Codex command RPC. No candidate or model-supplied code is used.
    code = '''
import json, pathlib, subprocess, sys, time
marker = pathlib.Path('/tmp/aisdlc-lifecycle-descendants.json')
subprocess.Popen(['/usr/bin/python3', sys.argv[1], 'descendant', str(marker)],
                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
deadline = time.monotonic() + 2
while not marker.exists():
    if time.monotonic() >= deadline: raise RuntimeError('descendants-not-ready')
    time.sleep(0.02)
print(marker.read_text())
'''
    result = rpc('command/exec', {'command': ['/usr/bin/python3', '-c', code, script],
                 'cwd': '/tmp', 'timeoutMs': 3000,
                 'sandboxPolicy': {'type': 'externalSandbox', 'networkAccess': 'restricted'}})
    assert result['exitCode'] == 0
    descendants = json.loads(result['stdout'])
    assert len(descendants) == 2
    processes = [identity(os.getpid()), identity(server.pid)] + descendants
    group = Path('/proc/self/cgroup').read_text()
    for item in processes:
        current = identity(item['pid'])
        assert current['start'] == item['start'] and current['state'] != 'Z'
        assert Path(f'/proc/{item["pid"]}/cgroup').read_text() == group
    print(json.dumps({'ready': True, 'processes': processes}), flush=True)
    # Intentionally no finally cleanup: external host guardian/systemd must prove
    # termination after this controller is killed or the unit deadline expires.
    while True:
        time.sleep(1)


def control(*args):
    return subprocess.run(['systemctl', *args], capture_output=True, text=True, timeout=5)


def host(binary, script, prefix, properties):
    assert os.getuid() == 0 and Path('/proc/1/comm').read_text().strip() == 'systemd'
    outcomes = []
    for case in ['observer-loss', 'runtime-timeout']:
        unit = prefix + '-' + case + '.service'
        command = ['systemd-run', '--quiet', '--unit=' + unit, '--wait', '--pipe', *properties,
                   '-p', 'RuntimeMaxSec=12s', '/usr/bin/python3', script, 'worker', binary, script]
        client = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        selector = selectors.DefaultSelector()
        selector.register(client.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(client.stderr, selectors.EVENT_READ, 'stderr')
        pending = b''
        total = 0
        stage = 'readiness'
        try:
            deadline = time.monotonic() + 10
            ready = None
            while time.monotonic() < deadline and ready is None:
                for key, _ in selector.select(0.1):
                    chunk = os.read(key.fileobj.fileno(), 4096)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(chunk)
                    assert total <= 32768
                    if key.data == 'stdout':
                        pending += chunk
                        if b'\n' in pending:
                            line, pending = pending.split(b'\n', 1)
                            ready = json.loads(line)
            assert ready and ready['ready'] is True and len(ready['processes']) == 4
            processes = ready['processes']
            assert len({item['pid'] for item in processes}) == 4
            stage = 'positive-control'
            details = control('show', unit, '-p', 'MainPID', '-p', 'ControlGroup', '-p', 'KillMode', '-p', 'SendSIGKILL')
            assert details.returncode == 0
            state = dict(line.split('=', 1) for line in details.stdout.splitlines())
            assert state['MainPID'] == str(processes[0]['pid'])
            assert state['KillMode'] == 'control-group' and state['SendSIGKILL'] == 'yes'
            group = state['ControlGroup']
            assert group == '/system.slice/' + unit
            for item in processes:
                observed = identity(item['pid'])
                assert observed['start'] == item['start'] and observed['state'] != 'Z'
                assert Path(f'/proc/{item["pid"]}/cgroup').read_text().strip() == '0::' + group
            for item in processes[2:]:
                assert os.getsid(item['pid']) == item['pid']
                status = Path(f'/proc/{item["pid"]}/status').read_text()
                ignored = next(line.split()[1] for line in status.splitlines() if line.startswith('SigIgn:'))
                assert int(ignored, 16) & (1 << (signal.SIGTERM - 1))
            stage = 'termination'
            if case == 'observer-loss':
                # Pin main-process identity while signaling: never kill by a
                # potentially reused PID after relying only on old observations.
                fd = os.pidfd_open(processes[0]['pid'])
                try:
                    assert identity(processes[0]['pid'])['start'] == processes[0]['start']
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                finally:
                    os.close(fd)
            assert client.wait(timeout=18) != 0
            result = control('show', unit, '-p', 'Result', '--value')
            expected = 'signal' if case == 'observer-loss' else 'timeout'
            assert result.returncode == 0 and result.stdout.strip() == expected
            stage = 'absence-confirmation'
            for item in processes:
                try:
                    observed = identity(item['pid'])
                    assert observed['start'] != item['start'] or observed['state'] == 'Z'
                except FileNotFoundError:
                    pass
            group_file = Path('/sys/fs/cgroup' + group + '/cgroup.procs')
            assert not group_file.exists() or not group_file.read_text().strip()
            outcomes.append({'case': case, 'actualCodexPositiveControl': True,
                             'detachedTermIgnoringDescendants': 2, 'processesStopped': 4,
                             'cgroupEmpty': True, 'serviceResult': expected})
        except Exception as error:
            # Never publish raw server diagnostics or process output.
            print(json.dumps({'case': case, 'stage': stage, 'failureType': type(error).__name__}), flush=True)
            raise SystemExit(1) from None
        finally:
            stopped = control('stop', unit)
            if client.poll() is None:
                client.kill()
            client.wait(timeout=3)
            selector.close()
            control('reset-failed', unit)
            if stopped.returncode != 0:
                raise SystemExit('lifecycle-cleanup-uncertain')
    print(json.dumps({'lifecycleCases': outcomes, 'credentialFree': True, 'realModelCalls': 0,
                      'wholeHostLossQualified': False, 'executionAllowed': False, 'retryAllowed': False}))


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'descendant':
        descendant(sys.argv[2])
    elif mode == 'worker':
        worker(*sys.argv[2:4])
    elif mode == 'host':
        host(sys.argv[2], str(Path(__file__).resolve()), sys.argv[3], sys.argv[4:])
    else:
        raise SystemExit('unsupported-probe-mode')
