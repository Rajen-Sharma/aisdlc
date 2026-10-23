#!/usr/bin/env bash
# Trusted operator setup on the explicitly selected private Linux client only.
# Installs no login material and never invokes inference or starts an app-server.
set -euo pipefail
[[ $(id -u) == 0 && $(uname -m) == x86_64 ]]
account=aisdlc-broker
install_dir=/opt/aisdlc-codex/0.155.1
broker_home=/var/lib/aisdlc-codex-broker
if ! id "$account" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$broker_home" --shell /usr/sbin/nologin "$account"
fi
[[ $(id -u "$account") != 0 ]]
install -d -o root -g root -m 755 "$install_dir" /opt/aisdlc-codex/workspace
install -d -o "$account" -g "$account" -m 700 "$broker_home" "$broker_home/.codex"
[[ ! -L "$broker_home" && ! -L "$broker_home/.codex" ]]
python3 - "$install_dir/codex" <<'PY'
import hashlib, io, os, pathlib, sys, tarfile, urllib.request
destination = pathlib.Path(sys.argv[1])
with urllib.request.urlopen('https://registry.npmjs.org/@openai/codex/-/codex-0.155.1-linux-x64.tgz', timeout=30) as response:
    data = response.read(160 * 1024 * 1024 + 1)
assert len(data) <= 160 * 1024 * 1024
assert hashlib.sha256(data).hexdigest() == 'f110cccdd50b0be8130b84f45b3144ea775c233f1c8bd8226da6ee719d63d206'
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    member = archive.getmember('package/vendor/x86_64-unknown-linux-musl/bin/codex')
    assert member.isfile() and member.size == 269273536
    executable = archive.extractfile(member).read()
    if destination.exists():
        assert not destination.is_symlink() and destination.stat().st_size == len(executable)
        assert hashlib.sha256(destination.read_bytes()).digest() == hashlib.sha256(executable).digest()
    else:
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o755)
        with os.fdopen(fd, 'wb') as output:
            output.write(executable)
PY
[[ $("$install_dir/codex" --version) == 'codex-cli 0.155.1' ]]
config="$broker_home/.codex/config.toml"
manifest=/opt/aisdlc-codex/private-client-files.sha256
[[ ! -L "$config" && ! -L "$manifest" ]]
if [[ -e "$config" ]]; then
  # Upgrade only a root-owned public configuration matching its retained manifest.
  # Authentication and caches are never opened, copied or changed.
  python3 - "$manifest" "$config" "$install_dir/codex" <<'PY'
import hashlib, pathlib, re, stat, sys
manifest, config, binary = map(pathlib.Path, sys.argv[1:])
for file in (manifest, config):
    info = file.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == 0 and info.st_mode & 0o022 == 0
lines = manifest.read_text().splitlines()
assert len(lines) == 2
entries = {}
for line in lines:
    match = re.fullmatch(r'([a-f0-9]{64})  (.+)', line)
    assert match and match[2] in (str(config), str(binary)) and match[2] not in entries
    entries[match[2]] = match[1]
assert set(entries) == {str(config), str(binary)}
for file in (config, binary):
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entries[str(file)]
PY
fi
staging=$(mktemp "$install_dir/config.XXXXXX")
trap 'rm -f -- "$staging"' EXIT
cat > "$staging" <<'TOML'
model = "gpt-6-sol"
model_provider = "openai"
forced_login_method = "chatgpt"
cli_auth_credentials_store = "file"
web_search = "disabled"
suppress_unstable_features_warning = true
[model_providers.openai]
name = "OpenAI"
requires_openai_auth = true
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
[features]
shell_tool = false
shell_snapshot = false
apps = false
hooks = false
multi_agent = false
plugins = false
remote_plugin = false
skill_search = false
skill_mcp_dependency_install = false
skip_host_skill_discovery = true
tool_suggest = false
TOML
chown root:"$account" "$staging"
chmod 640 "$staging"
mv -f -- "$staging" "$config"
# Retain only public executable/config hashes, never authentication/cache bytes.
sha256sum "$install_dir/codex" "$config" > "$manifest"
chmod 644 "$manifest"
printf '{"privateClientPrepared":true,"version":"0.155.1","authenticationInstalled":false,"executionAllowed":false}\n'
