#!/usr/bin/env bash
# Run only on a disposable Linux qualification host, as trusted administrator.
set -euo pipefail
[[ $(id -u) == 0 && $(ps -p 1 -o comm=) == systemd ]]
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
qualification_model=${2:-gpt-6.1-sol}
[[ $# -le 2 && ( $qualification_model == gpt-6.1-sol || $qualification_model == gpt-6-sol ) ]]
[[ $# -lt 2 || ${1:-} == tool-surface ]]
probe_script=codex-linux-protocol-probe.py
if [[ ${1:-} == tool-surface ]]; then
  probe_script=codex-tool-surface-probe.py
elif [[ ${1:-} == lifecycle ]]; then
  probe_script=codex-lifecycle-probe.py
elif [[ ${1:-} == session ]]; then
  probe_script=
elif [[ $# != 0 ]]; then
  exit 2
fi
install_dir=$(mktemp -d /opt/aisdlc-codex-probe.XXXXXX)
canary_dir=$(mktemp -d /var/lib/aisdlc-codex-probe.XXXXXX)
unit="aisdlc-codex-probe-$$"
stage=install
cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then
    printf '::error title=Codex protocol harness::stage=%s; exit=%s\n' "$stage" "$status" >&2
  fi
  systemctl stop "$unit.service" >/dev/null 2>&1 || true
  systemctl stop "$unit-observer-loss.service" "$unit-runtime-timeout.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$unit.service" >/dev/null 2>&1 || true
  rm -f "$canary_dir/canary" "$install_dir/codex" "$install_dir/probe.py" "$install_dir/codex-session-qualification.mjs" "$install_dir/codex-turn-session.mjs"
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
    assert member.isfile() and member.size == 269273536, 'unexpected pinned executable size'
    pathlib.Path(sys.argv[1]).write_bytes(archive.extractfile(member).read())
PY
if [[ ${1:-} == session ]]; then
  cp "$script_dir/codex-session-qualification.mjs" "$script_dir/codex-turn-session.mjs" "$install_dir/"
  chmod 644 "$install_dir/"*.mjs
else
  cp "$script_dir/$probe_script" "$install_dir/probe.py"
  chmod 644 "$install_dir/probe.py"
fi
chmod 755 "$install_dir" "$install_dir/codex" "$canary_dir"
printf 'synthetic-host-canary\n' > "$canary_dir/canary"
chmod 644 "$canary_dir/canary"
stage=positive-control
setpriv --reuid=65534 --regid=65534 --clear-groups cat "$canary_dir/canary" >/dev/null
stage=version
[[ $("$install_dir/codex" --version) == 'codex-cli 0.155.1' ]]
stage=protocol
set +e
properties=(
  -p DynamicUser=yes -p NoNewPrivileges=yes -p ProtectSystem=strict
  -p ProtectHome=yes -p PrivateTmp=yes -p PrivateNetwork=yes
  -p PrivateDevices=yes -p ProtectKernelTunables=yes -p ProtectKernelModules=yes
  -p ProtectControlGroups=yes -p RestrictSUIDSGID=yes -p RestrictNamespaces=yes
  -p LockPersonality=yes -p MemoryDenyWriteExecute=yes
  -p CapabilityBoundingSet= -p AmbientCapabilities=
  -p 'InaccessiblePaths=/var/lib /proc/1' -p TemporaryFileSystem=/run:ro
  -p ReadOnlyPaths=/opt -p 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'
  -p MemoryMax=128M -p TasksMax=64 -p CPUQuota=50%
  -p KillMode=control-group -p SendSIGKILL=yes -p TimeoutStopSec=1s
)
if [[ ${1:-} == lifecycle ]]; then
  /usr/bin/python3 "$install_dir/probe.py" host "$install_dir/codex" "$unit" "${properties[@]}"
elif [[ ${1:-} == session ]]; then
  systemd-run --quiet --unit="$unit" --wait --pipe "${properties[@]}" \
    -p MemoryMax=256M -p RuntimeMaxSec=45s /usr/bin/python3 \
    -c 'import subprocess,sys; r=subprocess.run(sys.argv[1:],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=40); output=r.stdout.decode("utf-8",errors="replace"); print(output if r.returncode == 0 else "::error title=Credential-free Node startup::"+output[:4000].replace("%","%25").replace("\r","%0D").replace("\n","%0A")); sys.exit(r.returncode)' \
    "$(command -v node)" --jitless --input-type=module \
    -e 'import(process.argv[1]).catch(error => { const message = String(error.message).slice(0, 300).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A"); console.error("::error title=Credential-free session startup::" + error.name + ": " + message); process.exitCode = 1 })' \
    "$install_dir/codex-session-qualification.mjs" "$install_dir/codex"
else
  systemd-run --quiet --unit="$unit" --wait --pipe "${properties[@]}" \
    -p RuntimeMaxSec=45s /usr/bin/python3 "$install_dir/probe.py" "$install_dir/codex" "$canary_dir/canary" "--model=$qualification_model"
fi
status=$?
set -e
if [[ $status != 0 ]]; then
  result=$(systemctl show "$unit" -p Result --value 2>/dev/null) || result=unavailable
  printf '::error title=Codex protocol service::result=%s; exit=%s\n' "$result" "$status" >&2
fi
exit "$status"
