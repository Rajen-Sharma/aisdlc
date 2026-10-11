# Credential-free Linux tool runtime probe

11 October 2026. This implements a synthetic Linux isolation probe for NB-003.
It is a lower-level control qualification, not a complete Codex tool boundary.

The trusted administrator ran [the probe](../../scripts/qualify-linux-tool-runtime.sh)
on `vm-aisdlc-tools` in the explicitly targeted, spending-protected Azure trial.
Only that machine was resumed. The client host remained deallocated; no personal
authentication, model calls, generated source or additional packages were involved.
The tools host was deallocated again afterward. Retained disks/IPs still consume
credit, and the existing 48-hour cleanup deadline remains unchanged.

## Observed results

The host reports Ubuntu 24.04, systemd 255.4-1ubuntu8.17 and kernel
6.17.0-1022-azure. All eleven filesystem/network/privilege checks passed:

- The service runs as a dynamic non-root user with no effective capabilities and
  no-new-privileges enabled.
- World-readable synthetic files in host state, home and `/run` are inaccessible.
  An attempted `/proc/1/root` escape is denied and `/etc` writes fail.
- A live host loopback listener is unreachable; metadata and internet connection
  attempts fail in the private network namespace.

Positive controls confirm the host can read all three exact synthetic canaries,
an ordinary unprivileged host UID can read them, and the host can connect to the
listener. Absence of a target alone therefore cannot explain those denial results.
The metadata/internet checks report failed connections, not packet-capture evidence
or proof about every network protocol.

A separate service forks a child that ignores SIGTERM. Its two-second runtime
deadline results in timeout/failed state; the child is absent afterward and the
service cgroup contains no processes. The check accepts an inert zombie if reaping
is delayed, but never a running descendant. This covers systemd-owned timeout on a
live host, not observer loss, daemon death, kernel failure or host-loss recovery.

The profile uses a private network, devices and temporary directory, protected home,
read-only system files, an empty read-only `/run`, inaccessible host state/PID 1,
namespace restrictions, a 128 MiB memory ceiling, 16-task ceiling, 50% CPU quota,
and control-group termination with a one-second stop timeout and SIGKILL enabled.
Resource ceilings are configured here; exhaustion/resource-stress behavior is not
qualified by these probes. The initial `/run` inaccessible-path configuration failed
namespace setup before the payload ran; an empty private `/run` mount was then tested
successfully. The failed setup is not counted as a passing containment test.

## Scope and remaining work

Raw bounded synthetic results are in
`docs/evidence/azure-tool-runtime-probe/probe.jsonl`. The script cleans its temporary
files, listener and transient units on normal exit/failure; the service runtime
limits also bound test payload lifetime. Abrupt controller loss during setup may
leave temporary files or the listener and requires separate recovery qualification.
The profile is a prototype test harness, not an installed production executor.

The platform workflow runs the same root-administered synthetic probe on its
disposable Linux runner. No account authentication or cloud access is required.
Frozen source `9455e2db160a2073a4a1deba3c0b340faada34d2` passed
[platform CI 38121964465](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38121964465),
including that probe, 19 recovery/Codex/template tests, integration tests, dependency
audit, optimized build, browser journeys and owned-database cleanup. The same 19
Node tests passed locally. CI step metadata is retained alongside the Azure results.

Before a Codex model call, qualify **every actual capability** as disabled or routed
through the separate runtime. App-server environment support offers a possible
transport, but it does not establish confinement of all built-ins, plugins, browser,
image, filesystem and patch paths. No supported complete configuration has yet been
demonstrated for the pinned client. Do not substitute shell-only isolation, an empty
dynamic-tool list or post-execution event rejection for prevention.

Next: credential-free environment/exec-server protocol qualification, bounded
authenticated transport, independent host identity verification, and actual
capability routing. Durable attempt/fencing/current-authority/signing integration
and the accepted task/human gates still apply. Execution and retries remain disabled;
the local app remains stopped and PostgreSQL data is preserved.

## Primary references

- [Ubuntu systemd execution controls](https://manpages.ubuntu.com/manpages/noble/man5/systemd.exec.5.html)
- [Ubuntu control-group termination](https://manpages.ubuntu.com/manpages/noble/man5/systemd.kill.5.html)
- [Official OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server)
- [Official OpenAI configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)

The OpenAI Docs skill was used for current product controls; the findings above
distinguish inspected protocol capability from experimentally qualified behavior.
