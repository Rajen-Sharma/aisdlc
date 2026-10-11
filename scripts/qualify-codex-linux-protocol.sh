#!/usr/bin/env bash
# Run only on a disposable Linux qualification host, as trusted administrator.
set -euo pipefail
[[ $(id -u) == 0 && $(ps -p 1 -o comm=) == systemd ]]
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
install_dir=$(mktemp -d /opt/aisdlc-codex-probe.XXXXXX)
canary_dir=$(mktemp -d /var/lib/aisdlc-codex-probe.XXXXXX)
unit="aisdlc-codex-probe-$$"
cleanup() {
  systemctl stop "$unit.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$unit.service" >/dev/null 2>&1 || true
  rm -f "$canary_dir/canary" "$install_dir/codex" "$install_dir/probe.py"
  rmdir "$canary_dir" "$install_dir"
}
trap cleanup EXIT

# Fetch an exact public package; verify SHA256 before extracting only its executable.
python3 - "$install_dir/codex" <<'PY'
import hashlib, io, pathlib, tarfile, urllib.request, sys
url = 'https://registry.npmjs.org/@openai/codex/-/codex-0.155.1-linux-x64.tgz'
expected = 'f110cccdd50b0be8130b84f45b3144ea775c233f1c8bd8226da6ee719d63d206'
with urllib.request.urlopen(url, timeout=30) as response:
    data = response.read(160 * 1024 * 1024 + 1)
assert len(data) <= 160 * 1024 * 1024, 'archive exceeds bound'
assert hashlib.sha256(data).hexdigest() == expected, 'archive integrity mismatch'
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    member = archive.getmember('package/vendor/x86_64-unknown-linux-musl/bin/codex')
    assert member.isfile() and member.size < 256 * 1024 * 1024
    pathlib.Path(sys.argv[1]).write_bytes(archive.extractfile(member).read())
PY
cp "$script_dir/codex-linux-protocol-probe.py" "$install_dir/probe.py"
chmod 755 "$install_dir" "$install_dir/codex" "$canary_dir"
chmod 644 "$install_dir/probe.py"
printf 'synthetic-host-canary\n' > "$canary_dir/canary"
chmod 644 "$canary_dir/canary"
setpriv --reuid=65534 --regid=65534 --clear-groups cat "$canary_dir/canary" >/dev/null
[[ $("$install_dir/codex" --version) == 'codex-cli 0.155.1' ]]
set +e
systemd-run --quiet --unit="$unit" --wait --pipe \
  -p DynamicUser=yes -p NoNewPrivileges=yes -p ProtectSystem=strict \
  -p ProtectHome=yes -p PrivateTmp=yes -p PrivateNetwork=yes \
  -p PrivateDevices=yes -p ProtectKernelTunables=yes -p ProtectKernelModules=yes \
  -p ProtectControlGroups=yes -p RestrictSUIDSGID=yes -p RestrictNamespaces=yes \
  -p LockPersonality=yes -p MemoryDenyWriteExecute=yes \
  -p CapabilityBoundingSet= -p AmbientCapabilities= \
  -p 'InaccessiblePaths=/var/lib /proc/1' -p TemporaryFileSystem=/run:ro \
  -p ReadOnlyPaths=/opt -p 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
  -p MemoryMax=128M -p TasksMax=16 -p CPUQuota=50% \
  -p KillMode=control-group -p SendSIGKILL=yes -p TimeoutStopSec=1s \
  -p RuntimeMaxSec=45s /usr/bin/python3 "$install_dir/probe.py" "$install_dir/codex" "$canary_dir/canary"
status=$?
set -e
if [[ $status != 0 ]]; then
  result=$(systemctl show "$unit" -p Result --value)
  printf '::error title=Codex protocol service::result=%s; exit=%s\n' "$result" "$status" >&2
fi
exit "$status"
