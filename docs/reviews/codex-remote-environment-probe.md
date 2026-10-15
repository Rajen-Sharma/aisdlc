# Credential-free remote environment probe

15 October 2026. Continuation of NB-003 after the
[filesystem/process checkpoint](codex-linux-protocol-probe.md). Execution, retries
and complete Codex tool-boundary qualification remain disabled.

## Observed results

Source `147e3a7cab39c90d3c88b04e3161d37f21c1db7a` passed the extended protocol
step in [CI run 38721941587](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38721941587).
All previous filesystem/process checks also run in that same step. The new
assertions passed: exact remote working directory, ready status, unknown status
for an unconfigured environment, and disconnected status after termination.

Two earlier runs failed before executor readiness. The diagnostic run captured
exit code 2 and a transport-related command-line diagnostic. Removing the
optional `--exit-on-stdin-close` flag allowed startup; this probe uses explicit
termination and makes no claim about that optional mode. Seven local Codex guard
tests and Python syntax parsing passed. Raw CI artifacts were not downloaded;
the retained basis is public CI metadata plus the frozen assertion-bearing code.
The complete platform workflow passed: both Linux qualification probes, 19
guard/recovery/template checks, integration tests, dependency audit, optimized
build, browser journeys and owned-database cleanup. Final run and step metadata
are retained under `docs/evidence/codex-remote-environment/`, together with bounded
failure summaries and the audit. Its working-byte hash manifest is an inventory,
not signed execution authority.

## Tested boundary

The extended trusted probe starts the same pinned Codex 0.155.1 executable as a
separate exec-server process with a fresh credential-free home and a distinct
temporary working directory. Both processes remain inside the existing systemd
sandbox: private network/tmp/devices, protected host paths, no effective
capabilities, 128 MiB memory, 64 tasks, 50% CPU and a 45-second service lifetime.
The listener is ephemeral loopback inside that private network namespace; no
public listener, Azure startup or personal authentication is involved.

The intended acceptance checks are successful `environment/add` and
`environment/info`, an exact working-directory match to the exec-server rather
than app-server, ready status, unknown status for an unconfigured ID, and
disconnected status after explicit termination of the exec-server. No
thread, turn or model request is allowed. Startup/protocol diagnostics remain
bounded and publish only fixed classifications, not raw server output.

The [official OpenAI documentation](https://learn.chatgpt.com/docs/app-server)
describes experimental environment introspection. The pinned local protocol
schemas also expose environment registration and status. These interfaces do
not establish that all model tools route remotely. In particular, the pinned
`command/exec` and `fs/readFile` parameter schemas have no environment selector.
Both processes in this test share an OS sandbox; success would not demonstrate
isolation between an authenticated host and an untrusted tool host. It also
would not prove descendant termination, observer-loss recovery or safe retries.

## Azure resource status

Read-only Azure queries on 15 October confirmed both `vm-aisdlc-client` and
`vm-aisdlc-tools` deallocated in the explicitly targeted protected trial
subscription. The dedicated group `rg-aisdlc-trial-aue` still contains eleven
resources: two VMs, two disks, two public IPs, two NICs, two NSGs and one virtual
network. The deadline `2026-10-13T03:24:58Z` has passed; its tag was not a deletion
scheduler. Retained disks and public IPs still consume trial credit.

Deletion of that exact dedicated group has been proposed to the user. No deletion
will occur without their answer because it permanently removes both disks.
The previous automatic approval rejection of Azure startup remains respected;
no startup was retried. The protocol work uses existing disposable Linux CI.
