# Default command routing after remote registration

17 October 2026. Prepared continuation of NB-003 following the
[remote environment checkpoint](codex-remote-environment-probe.md).
Source `e0d4c62df4d5be71fec1b84b07d3d991ef4f7ced` passed the credential-free
protocol step in [CI run 38973532251](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38973532251).

The credential-free protocol driver now issues a fixed `command/exec` request
while the registered exec-server is ready, omitting `cwd`. The app-server starts
in `/tmp`; the exec-server starts in `/tmp/aisdlc-executor-workspace`. The command
reports its actual working directory and writes a fixed relative marker. The
probe requires `/tmp`, reads the exact marker bytes through `fs/readFile` at that
location, and checks that the marker is absent from the remote working directory.
A different default fails qualification rather than silently changing the claim.

These checks distinguish environment registration from default command routing.
Both processes still share the same filesystem and OS sandbox. The marker read
does not independently establish filesystem RPC routing or separate-host
isolation. No environment selector, model-facing tool routing, credentials,
thread, turn or model request is introduced.

Local validation: Python AST parsing and all seven Codex transport/policy tests
passed. The actual probe ran in the existing disposable Linux systemd CI harness,
not on this Windows workspace. The passing step establishes that the command
used `/tmp`, its exact marker was readable there, and no marker appeared in the
exec-server working directory. Public step metadata plus the frozen assertions
are the retained basis; raw CI artifacts have not been downloaded.
The complete workflow passed, including both Linux probes, type checking,
guard/recovery checks, integration tests, dependency audit, optimized build,
browser journeys and owned-database cleanup. Final run and step metadata and
the audit are retained in `docs/evidence/codex-default-routing/`.

Next: investigate an explicit, enforceable tool routing boundary before
introducing authentication. Registration and ready status cannot authorize tool
execution on a separate host. Execution and retries remain
disabled. The outstanding Azure disk deletion proposal still requires the user's
answer; this continuation does not authorize permanent resource deletion.
