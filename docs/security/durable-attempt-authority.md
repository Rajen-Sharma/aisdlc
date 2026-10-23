# Durable attempt accounting

This is accounting and recovery preparation. It launches no provider, grants no
execution/retry permission and changes no accepted human gate.

`scripts/authority-attempts.mjs` replays the current signed external ledger on
every operation. It never takes a SQL attempt count or restored local snapshot
as its source of truth. A task uses the digest of its project/story identity,
independently of scope revision and SQL task ID. A registration cannot replace
an earlier registration or reset its budget. Revision changes currently stop
registration rather than implicitly issuing another three attempts.

Registration binds scope, exact approval receipt digest, qualified-runtime
digest, a validity deadline of at most 24 hours, exactly three attempts,
subscription-only use, prohibition of additional charges, model `gpt-6-sol`
and one model turn per attempt. The coordinator's
new read-only `inspectExecutionEligibility` checks the current story and both
human gates under its story lock. Its digest is a snapshot, never a permit.

An externally committed intent consumes its attempt immediately. Attempt and
fence advance together and cannot exceed three. It binds the registration,
coordinator reservation, host UUID, boot UUID, unique systemd unit and a deadline
of at most 120 seconds. A pending intent remains uncertain across process loss,
expired leases or application database restore. It is not refunded if the
provider never launches. Concurrent intents have one CAS winner; a lost append
acknowledgement is not retried automatically.

A separate single-use admission binds a fresh guardian challenge to the spent
attempt before its model turn. Concurrent or repeated admissions are rejected;
admission does not constitute an execution permit. A candidate requires that
admission and binds one hash to the current unexpired attempt. Settlement requires
bounded exact proof bytes, their matching SHA-256 and a trusted independent
evidence verifier. That verifier receives the retained runtime identity and
attempt context. A claimed clean exit or elapsed time cannot settle an attempt.
After a candidate, a separate independently verified failed-verdict receipt must
authorize the accounting transition for a repair; it cannot accept the candidate.
Settlement may record proven cleanup after policy expiry or revocation. Revocation
cannot resurrect an attempt or restore budget.

Known input/output/total tokens are preserved. Missing usage stays explicitly
unknown and still consumes the attempt. Aggregate reporting distinguishes known
totals from incomplete usage; it does not invent a zero cost or complete token
total for an interrupted request. These metrics do not measure dollar charges,
provider entitlement, global subscription use or additional provider requests.

All transitions are strictly shaped and replay-validated before signing.
Eligibility is checked before and after asynchronous signing. Evidence is
rechecked after signing, and signing longer than five seconds or a backwards
clock denies the append. Current external state is re-read and ETag/byte-offset
CAS binds the final write. Callback inputs are detached copies. The only legacy
records allowed are the exact synthetic qualification records already present
in the trial ledger; unknown signed protocols fail closed.

## Integration boundary

The signer, current coordinator-eligibility callback and independent evidence
verifier are trusted dependencies; accepting arbitrary caller callbacks through
a route would defeat the boundary. Tests provide synthetic callbacks and actual
Ed25519 signatures against an in-memory transport implementing Azure CAS. They
are not deployed service qualification. No default successful callback exists.

Current eligibility and the external CAS are not a distributed transaction. The
executor still needs an explicit admission/lease protocol, guardian process and
launch-writer drain/boot-fencing evidence. This component cannot establish those
facts. A signed cleanup statement alone does not demonstrate them. Current-key
registration, authenticated transport, whole-host recovery and real provider
integration remain required before the first model call. Private-host deployment
requires a currently authorized trial window; both VMs remain deallocated.

## Concrete evidence and session boundaries

`attempt-evidence.mjs` checks bounded, domain-separated Ed25519 envelopes against
a current independently selected public key and authority revision. Termination
evidence binds the retained host, boot, unit and attempt and requires root exit,
empty cgroup and drained launch writers. Repair evidence binds a failed verdict
to the candidate and qualified verifier. Evidence expires within 30 seconds;
key resolution cannot extend that deadline. Signatures authenticate assertions,
not the behavior of an unqualified producer.

`codex-turn-session.mjs` drives one fresh ephemeral thread and one admitted turn.
It rejects inherited tools, custom native endpoints, provider retries, model
rerouting, tool requests, malformed or excessive output, and incomplete responses.
Native sessions require ChatGPT authentication; synthetic qualification has a
separate explicit credential-free mode. Account quota notifications are metadata
and cannot authorize another turn or additional charges. Candidate bytes and
usage are inert output; the driver never asserts descendant termination.

The real pinned Windows client passed the credential-free loopback session
qualification on 23 October 2026 with one request, one admission and exact
candidate bytes. The same driver is included in disposable Linux systemd CI
qualification. Neither test calls a real model or demonstrates native account
entitlement. Private-host installation and real lifecycle qualification remain
required before execution.
