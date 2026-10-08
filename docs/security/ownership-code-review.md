# SEC-CODE-OWN-001 v1

AI implementer review prepared for human review. Scope: OWN-001 reservation coordinator, shared story locks, task/event collections and portal queue/ledger. Supplements SEC-CODE-ENG-002 checkpoint 1; does not approve itself or replace an independent security review.

Implemented controls: fixed parameterized SQL, bounded lease/attempt limits, current project/contract/revision/gate checks under a shared PostgreSQL advisory lock, row-level task ownership, random owner identifiers, monotonic fences, DB wall-clock expiry, absolute deadline and bounded SQL waits. Normal task/event API mutations denied. Server queue action authenticates administrator and validates story ID before invoking the trusted coordinator. Identity is derived from authenticated session for the public queue/review actions; recovery is an internal trusted API, not a public action.

Recovery/eligibility evidence: two parallel clients get one owner; forged/stale fences and expired completion denied; lost leases are not reassigned; editor recovery denied; all three attempts survive repeated coordinator invocations; old-scope completion cannot create a candidate after revision. Lock-wait test starts heartbeat before expiry then expires its lease while the row is locked: database wall-clock checking denies renewal. Tests and browser fixtures create explicitly synthetic test decisions and remove them afterward.

A fresh trusted coordinator process also verifies persisted attempt consumption after restart. It imports control-plane code only and reserves ownership; no generated source or coding process runs. CI diagnostic annotations use a safe allowlist instead of publishing arbitrary test logs. A first remote integration failure and the subsequent passing retest are retained; the precise original failure is not asserted from unavailable detailed logs.

Blocking limitations:

- No qualified executor or independent verifier is attached. Every reservation explicitly returns executionAllowed=false. No real AI patch or execution proof exists.
- Internal recovery accepts a trusted caller's authenticated administrator ID and evidence hash, not independently verified backend termination. It is safe only within the current no-executor reservation boundary. Real worker/process/container identities and verified termination must replace this before coding.
- Project activation remains an operator-controlled file outside the DB transaction. Move exact activation/version into the coordinator's transaction boundary before execution to eliminate configuration-change races.
- Application DB credentials identify trusted coordinator code, not separate human/worker principals. Dedicated identities and stronger human-review assurance remain pending. No model can receive these credentials or call recovery.
- Complete requirement-to-task/sprint membership provenance and artifact/check hashes beyond the task contract still require implementation.
- Database administrators can edit the supposedly immutable ledger. External tamper-evident storage/retention is pending; normal API immutability is the proven boundary.

Source-path/symlink/network/resource/secret adversarial controls, signed artifact provenance, physical crash/recovery, verifier isolation, model cost ceiling and protected GitHub policy ownership remain qualification blockers. Passing tests and a queued task cannot authorize execution or promotion. Exact source commit and file hashes are in the checkpoint manifest; human review decision remains pending.
