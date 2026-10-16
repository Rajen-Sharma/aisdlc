# Default command routing after remote registration

17 October 2026. Prepared continuation of NB-003 following the
[remote environment checkpoint](codex-remote-environment-probe.md).
Linux runtime qualification is pending; this document records prepared checks,
not observed routing results.

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
passed. The actual probe requires the existing disposable Linux systemd CI
harness; it was not run on this Windows workspace. No CI result is claimed for
these new assertions.

Next: run the extended Linux protocol qualification and retain its exact source
and result. If it passes, continue investigating an explicit, enforceable tool
routing boundary before introducing authentication. Execution and retries remain
disabled. The outstanding Azure disk deletion proposal still requires the user's
answer; this continuation does not authorize permanent resource deletion.
