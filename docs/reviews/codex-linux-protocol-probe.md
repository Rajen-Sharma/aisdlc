# Credential-free Codex Linux protocol qualification

11 October 2026. NB-003 remains in progress. This checkpoint tests the actual
pinned Codex app-server filesystem and process RPCs inside a disposable Linux
systemd service. It does not qualify the complete model-facing tool boundary.

## Implementation and controls

[The trusted installer](../../scripts/qualify-codex-linux-protocol.sh) downloads
the public `@openai/codex` package `0.155.1-linux-x64`, verifies SHA256
`f110cccdd50b0be8130b84f45b3144ea775c233f1c8bd8226da6ee719d63d206`, and extracts
only the named regular executable with its exact 269273536-byte size. It does not
run an npm lifecycle script. The package's bundled companion executables and
resources are not installed or qualified by this probe.

[The driver](../../scripts/codex-linux-protocol-probe.py) starts app-server with a
fresh private temporary HOME/CODEX_HOME and an explicit environment. It allows
only initialization, `fs/readFile`, `fs/writeFile`, and `command/exec`; it never
requests login, a thread, a turn or a model. The process command is fixed synthetic
Python, not generated code. These RPC surfaces and the initialization handshake
are described in the [official OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server).

The sandbox uses DynamicUser, no-new-privileges, empty capabilities, protected
home/system/kernel/control-group paths, private network/devices/tmp, an empty
read-only `/run`, inaccessible `/var/lib` and `/proc/1`, namespace restrictions,
and MemoryDenyWriteExecute. Bounds are 128 MiB memory, 64 tasks, 50% CPU and a
45-second service lifetime. Systemd owns control-group termination with SIGKILL
enabled and a one-second stop timeout. Resource exhaustion and full Codex
descendant termination are not independently qualified here.

The driver additionally bounds combined protocol/stderr bytes to 64 KiB, records
to 16 KiB and each RPC wait to eight seconds. It permits at most four id-less
`configWarning` notifications and at most four remote-control status notifications
whose status must be `disabled`; notifications never establish success. Other
unexpected records fail. Raw server stderr is not published; diagnostics use fixed category
names and numeric exit/size information.

## Findings during qualification

- The first installer rejected the executable because its 256 MiB bound was
  slightly too small. The corrected check requires the exact pinned size while
  retaining archive hash verification.
- With the earlier synthetic profile's 16-task ceiling, the actual server exited
  before initialization with a thread-creation diagnostic. Setting
  `TOKIO_WORKER_THREADS=2` alone did not resolve it. A bounded 64-task ceiling
  allowed initialization. This is a different task ceiling from the earlier
  synthetic qualification and does not inherit its resource-stress claims.
- Once initialized, app-server emitted a configuration warning. The driver now
  handles that notification under the byte/count limits rather than mistaking it
  for an RPC response or successful containment test.
- A subsequent disabled remote-control status notification is now accepted only
  with an explicit `disabled` value and a separate four-notification bound.

## Results and next boundary

Source `dabd3b697d7bcc290ce7f79a27ebd18d47e5fb58` passed the credential-free Codex
protocol step in [CI run 38126979706](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38126979706).
The complete platform workflow passed: both Linux probes, 19 guard/recovery/template
checks, integration tests, dependency audit, optimized build, browser journeys and
owned-database cleanup. Step metadata is retained in the accompanying evidence.
The required checks are an exact temporary-file write/read positive control,
denial of a host canary and `/proc/1/root` escape, denial of an `/etc` write,
non-root fixed command execution with canary/metadata/internet denials, and denial
of a symlink pointing to the host canary. The host first demonstrates that an
ordinary unprivileged UID can read the exact world-readable canary.

Evidence retains the package pin, public CI step metadata, bounded failure
annotations and an audit summary. Raw CI artifacts were not downloaded; the
passing step plus its frozen assertion-bearing source is the retained basis for
the containment result. The working-byte hash manifest is an inventory, not
signed or immutable execution authority. The 19 local Node guard/recovery/template
tests and Python syntax parsing passed.

Even successful RPC containment would prove only these explicit calls under this
profile. It would not prove that every model-facing tool is disabled or routed to
a separate credential-free runtime. Remote environment/exec-server routing,
credential-host separation, protected source/verifier paths, observer-loss
recovery, external current authority and signing custody remain outstanding.
Execution and retries remain disabled; no model calls or personal authentication
are authorized by this checkpoint.

The Azure tools-VM start command was rejected by automatic approval review with
`blocked by policy`. It was not retried. Qualification continued on existing
disposable GitHub Linux CI without allocating Azure compute. Both Azure VMs were
last confirmed deallocated at the preceding checkpoint; this is not a fresh live
state observation. Retained disks/IPs still consume trial credit. The existing
cleanup deadline `2026-10-13T03:24:58Z` is a tag, not a scheduled deletion.
