# Codex cancellation and controller-loss qualification

18 October 2026, Australia/Sydney. Continuation of the approved first task toward
BUILD-ENG-002 execution readiness. This checkpoint implements two missing lifecycle
checks. It does not enable the coding coordinator or count a synthetic response
as an AI-produced taskboard feature.

## Streaming turn cancellation

The pinned Codex 0.155.1 app-server receives one request from the credential-free
local synthetic provider. The provider starts an SSE response and deliberately
withholds completion. The driver waits until that request reaches the provider,
then invokes turn/interrupt for the exact returned thread/turn identifiers.
It requires interrupted terminal status, no completed candidate message and
exactly one provider request. A separate positive-control turn must subsequently
complete normally with the same tool inventory. That control is synthetic protocol
reuse, not authorization to retry a real task.

The [official app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes turn/interrupt and the interrupted completion status. The request shape
was also checked against the installed pinned protocol schema using the OpenAI
Docs skill. The synthetic request proves client behavior; it does not prove that
a real provider stops all server-side computation, refunds usage or cancels
already-committed tool effects. Actual interrupted/uncertain attempts must retain
their reservation and accounting history.

Local Windows validation used a fresh credential-free home and a private local
synthetic endpoint, never the operator's account authentication or a model service.
It passed the existing tool/canary cases plus interruption and the subsequent
positive control. Local Python parsing, Bash parsing, diff checks and all seven
Codex guard/policy tests passed.

## Actual Codex descendants and controller loss

The Linux harness runs two independently named transient systemd services with
the existing protected runtime profile and pinned Codex executable. Through the
actual command/exec RPC, a fixed trusted Python command spawns a child and
grandchild. Both establish separate sessions and ignore SIGTERM. No model or
candidate supplies this command.

Before termination, the outer host guardian independently checks all four live
process identities (controller, Codex and two descendants), process start times,
their exact cgroup, the service main PID and kill policy, and the descendants'
session IDs and ignored TERM disposition. This prevents a nonexistent process or
an unstarted service from counting as successful cleanup.

The observer-loss case pins the controller with a Linux pidfd and sends SIGKILL.
The timeout case leaves it running until the service's 12-second deadline.
Both must fail with their expected service result, stop all original processes,
and leave no cgroup members. A dead zombie may remain awaiting reaping, but cannot
execute. A reused PID is distinguished by its process start time. Any uncertain
cleanup fails qualification; no task retry is authorized.

These expectations follow systemd's
[main-process lifetime](https://www.freedesktop.org/software/systemd/man/257/systemd.service.html)
and [control-group kill policy](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html).
Their documented behavior is checked experimentally on the disposable Linux CI
host rather than assumed from root-process exit alone.

## Authority storage access

The recovery storage template now also allows the trial `tools` subnet through a
virtual-network rule, in addition to the pinned IP rules; default action remains Deny.
`infra/azure/authority-append-role.json` defines a custom role limited to blob read and
append plus read-only management actions (no overwrite, delete, key delegation or
wildcards). It carries no assignable scope: it must be created and assigned only to the
trial authority container, and that assignment has not been performed or verified here.
Retail price evidence for the 48-hour trial is in `docs/evidence/codex-lifecycle/`
(about USD 5.48 known subtotal against a USD 10 ceiling; not a billing cap).

## Readiness boundary

The human's exact first-task sprint/design approval remains recorded in
[the decision record](../governance/taskboard-filter-approval.json). It must not
be requested again for the unchanged approved scope. Authenticated coordinator
registration remains outstanding.

The provider client is still credential-free in these tests. A private supported
login, exact live-runtime/tool qualification, durable attempt/spend accounting,
and independently operated signing/current recovery authority remain prerequisites.
The tests assume the outer host/systemd service manager survives; whole-host loss,
external authority availability, reboot recovery and stale-runtime fencing are
not established by these two service tests. No personal authentication is copied
to the public repository or CI. Model calls, execution and retries remain disabled.

Source revision and final CI observations are recorded in the accompanying
evidence inventory. Raw authenticated logs/artifacts were not downloaded.
