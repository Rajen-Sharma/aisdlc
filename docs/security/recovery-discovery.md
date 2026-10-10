# Recovery discovery preflight and external authority requirements

The read-only `discoverRecovery` helper compares an operator-supplied expected
inventory of token/exact journal byte hashes with bounded journal documents. It
reports missing, conflicting, malformed and unexpected records. Matching records
remain quarantined. No Docker client, filesystem operation, database mutation,
termination receipt or retry path is exposed. Even an empty matching inventory
returns authorityVerified=false, executionAllowed=false and retryAuthorized=false.

This is a preflight building block, not durable storage or host-loss qualification.
Caller-supplied expected records are not authenticated by this helper. Restoring
both old inventory and old journals can produce a match. Raw byte hashes deliberately
reject reserialization; the authority must commit the exact bytes before effects.
Callers must bound transport before constructing the arrays as well. Published
reports include expected tokens but never untrusted journal diagnostics.

Before a replacement guardian can act after whole-job/host loss, an independently
operated service must provide these concrete capabilities:

- Atomically register intent before create/start, binding task, attempt, fence,
  worker/host epoch, runtime identity, exact journal hash and qualification policy.
- Enumerate all outstanding intents from a complete current checkpoint, with
  monotonic external anchors that survive application/database backup restoration.
- Authenticate recovery operators and runtime endpoints, isolate signing/storage
  credentials from generated code, and retain immutable audit history.
- Revoke/fence the old guardian and stop new writes; prove pending client/backend
  operations drained or fence the entire former runtime before absence is trusted.
- Resolve unavailable hosts as uncertain. Empty local inventory is insufficient
  when another host, daemon epoch or late operation could still execute.
- Record scoped termination evidence and transactionally consume recovery authority;
  only a separately reviewed coordinator policy may ever authorize a bounded retry.

These services are not provisioned. No production key, endpoint, provider credential
or spending authority is introduced. NB-002/003 remain partial; NB-004/005 still need
the real agent-generated change and human review cycle. The accepted plan/design
remain unchanged.
