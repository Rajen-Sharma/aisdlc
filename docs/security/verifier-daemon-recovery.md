# Disposable Docker daemon restart qualification

The dedicated GitHub Linux job owns its runner and restarts only that runner's
Docker service. It never runs on the workstation or a deployment host. A trusted
synthetic Node process creates a shell and grandchild in the existing pinned,
restricted container. Durable intent precedes creation. The observer requires a
live orphan after killing its controller, a changed Docker MainPID after a
successful service restart, and retention of the same immutable owned container
ID. A fresh OS process then checks ownership, removes by ID and confirms absence.

Post-restart running state is recorded rather than assumed: daemon live-restore
configuration can affect it. This qualifies a graceful service restart with a
surviving observer and retained local journal. It does not qualify daemon SIGKILL,
host reboot/loss, storage corruption, observer/job loss, pending operations during
restart, external durable replay state or production recovery. Failure leaves the
qualification false; best-effort cleanup cannot turn failure into success.

The job uses synthetic code only, grants no task ownership and never authorizes a
retry. Execution, promotion, model spending and human acceptance gates remain
unchanged. Public structured summaries contain trusted booleans and pinned hashes;
raw daemon diagnostics are not emitted by this controller. Detailed JSON is kept
as a CI artifact for 30 days.
