#!/usr/bin/env bash
# Trusted synthetic qualification only. Never receives account credentials or source.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as the trusted Linux administrator' >&2; exit 1; }
[[ $(ps -p 1 -o comm=) == systemd ]] || { echo 'systemd host required' >&2; exit 1; }
command -v python3 >/dev/null
probe_dir=$(mktemp -d /var/lib/aisdlc-probe.XXXXXX)
probe_script=$(mktemp /opt/aisdlc-probe.XXXXXX.py)
probe_output=$(mktemp /var/tmp/aisdlc-probe.XXXXXX)
home_canary=$(mktemp /home/aisdlc-probe.XXXXXX)
run_canary=$(mktemp /run/aisdlc-probe.XXXXXX)
unit="aisdlc-probe-$$"
listener_pid=''
cleanup() {
  systemctl stop "$unit.service" "$unit-cancel.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$unit.service" "$unit-cancel.service" >/dev/null 2>&1 || true
  if [[ -n "$listener_pid" ]]; then kill "$listener_pid" 2>/dev/null || true; wait "$listener_pid" 2>/dev/null || true; fi
  rm -f "$probe_dir/canary" "$probe_script" "$probe_output" "$home_canary" "$run_canary"
  rmdir "$probe_dir"
}
trap cleanup EXIT
printf 'synthetic-host-canary\n' > "$probe_dir/canary"
chmod 755 "$probe_dir"
chmod 644 "$probe_dir/canary"
printf 'synthetic-home-canary\n' > "$home_canary"
printf 'synthetic-run-canary\n' > "$run_canary"
chmod 644 "$home_canary" "$run_canary"
cat > "$probe_script" <<'PY'
import errno, json, os, signal, socket, sys, time

if sys.argv[1] == 'listener':
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 35491))
        listener.listen()
        while True:
            connection, _ = listener.accept()
            connection.close()

if sys.argv[1] == 'cancel':
    child = os.fork()
    if child == 0:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        while True:
            time.sleep(1)
    print(json.dumps({'childPid': child}), flush=True)
    while True:
        time.sleep(1)

canary = sys.argv[2]
checks = {}
checks['nonRoot'] = os.getuid() != 0
for name, path in [('hostCanary', canary), ('procRootEscape', '/proc/1/root' + canary),
                   ('homeCanary', sys.argv[3]), ('runCanary', sys.argv[4])]:
    try:
        with open(path, 'rb') as stream:
            stream.read(1)
        checks[name + 'Denied'] = False
    except OSError as error:
        checks[name + 'Denied'] = error.errno in (errno.EACCES, errno.ENOENT, errno.EPERM)
try:
    with open('/etc/aisdlc-probe-forbidden', 'x'):
        pass
    checks['systemWriteDenied'] = False
except OSError as error:
    checks['systemWriteDenied'] = error.errno in (errno.EACCES, errno.EROFS, errno.EPERM)
for name, address, port in [('hostLoopback', '127.0.0.1', 35491),
                            ('metadata', '169.254.169.254', 80),
                            ('internet', '1.1.1.1', 443)]:
    try:
        with socket.create_connection((address, port), timeout=1):
            pass
        checks[name + 'Denied'] = False
    except OSError:
        checks[name + 'Denied'] = True
status = open('/proc/self/status').read()
checks['noNewPrivileges'] = 'NoNewPrivs:\t1' in status
checks['capabilitiesEmpty'] = 'CapEff:\t0000000000000000' in status
print(json.dumps({'checks': checks}), flush=True)
sys.exit(0 if all(checks.values()) else 1)
PY
chmod 644 "$probe_script"

# Positive controls: host administrator can read this exact canary and connect to
# this listener. A nonexistent target alone must not count as isolation evidence.
[[ $(cat "$probe_dir/canary") == synthetic-host-canary ]]
[[ $(cat "$home_canary") == synthetic-home-canary ]]
[[ $(cat "$run_canary") == synthetic-run-canary ]]
setpriv --reuid=65534 --regid=65534 --clear-groups cat "$probe_dir/canary" "$home_canary" "$run_canary" >/dev/null
python3 "$probe_script" listener &
listener_pid=$!
python3 - <<'PY'
import socket, time
for attempt in range(30):
    try:
        with socket.create_connection(('127.0.0.1', 35491), timeout=0.2):
            break
    except OSError:
        time.sleep(0.1)
else:
    raise RuntimeError('host listener positive control failed')
PY

properties=(
  -p DynamicUser=yes -p NoNewPrivileges=yes -p ProtectSystem=strict
  -p ProtectHome=yes -p PrivateTmp=yes -p PrivateNetwork=yes
  -p PrivateDevices=yes -p ProtectKernelTunables=yes -p ProtectKernelModules=yes
  -p ProtectControlGroups=yes -p RestrictSUIDSGID=yes -p RestrictNamespaces=yes
  -p LockPersonality=yes -p MemoryDenyWriteExecute=yes
  -p CapabilityBoundingSet= -p AmbientCapabilities=
  -p 'InaccessiblePaths=/var/lib /proc/1' -p TemporaryFileSystem=/run:ro
  -p 'ReadOnlyPaths=/opt' -p 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'
  -p MemoryMax=128M -p TasksMax=16 -p CPUQuota=50%
  -p KillMode=control-group -p SendSIGKILL=yes -p TimeoutStopSec=1s
)
systemd-run --quiet --unit="$unit" --wait --pipe "${properties[@]}" \
  -p RuntimeMaxSec=15s /usr/bin/python3 "$probe_script" canary "$probe_dir/canary" "$home_canary" "$run_canary"

# The child ignores TERM; the unit must time out and kill the whole cgroup.
set +e
systemd-run --quiet --unit="$unit-cancel" --wait --pipe "${properties[@]}" \
  -p RuntimeMaxSec=2s /usr/bin/python3 "$probe_script" cancel > "$probe_output"
cancel_status=$?
set -e
[[ $cancel_status != 0 ]]
[[ $(systemctl show "$unit-cancel" -p Result --value) == timeout ]]
[[ $(systemctl show "$unit-cancel" -p ActiveState --value) == failed ]]
python3 - "$probe_output" <<'PY'
import json, os, sys
child = json.load(open(sys.argv[1]))['childPid']
# A killed orphan may briefly be a zombie; it cannot perform further operations.
try:
    state = open(f'/proc/{child}/stat').read().split(') ', 1)[1][0]
except FileNotFoundError:
    state = None
if state not in (None, 'Z'):
    raise RuntimeError('cancelled descendant still running')
print(json.dumps({'descendantStopped': True, 'descendantState': state}))
PY
group=$(systemctl show "$unit-cancel" -p ControlGroup --value)
if [[ -n "$group" && -e "/sys/fs/cgroup$group/cgroup.procs" ]]; then
  [[ -z $(cat "/sys/fs/cgroup$group/cgroup.procs") ]]
fi
printf '{"syntheticRuntimeProbePassed":true,"codexToolBoundaryQualified":false,"executionAllowed":false,"retryAllowed":false}\n'
