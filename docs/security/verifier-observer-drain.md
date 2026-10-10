# Observer loss with pending operations

This NB-003 synthetic qualification extends the existing four delayed-operation
cases: Docker create/start, paused before forwarding the request or returning the
response. A distinct observer process owns a controller process. While the outer
operation guardian's Docker CLI remains pending, the observer kills its controller,
waits for closure, and is then itself SIGKILLed. The guardian retains ownership of
the CLI and private fault-injection proxy throughout.

Premature reconciliation must reject before any absence check. In the delayed
create-request case, inventory is empty before releasing a real late create.
Only after the CLI closes and proxy backend handlers drain may the guardian
reconcile by verified immutable container identity. Late starts must expose a live
descendant tree before cleanup. All four cases must confirm container absence and
keep retry authorization false.

This proves the surviving guardian pattern at those injection points. It does not
prove recovery when the guardian/proxy also dies, whole-job/host loss, durable
remote discovery or independently authenticated production termination evidence.
The trusted test IPC acknowledgment is not a production attestation. A guardian
failure must leave recovery uncertain and the disposable runner discarded.
No production executor, provider call, human acceptance or retry is enabled.
