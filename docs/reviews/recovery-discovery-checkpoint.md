# Read-only recovery discovery checkpoint

Source `build/recovery-discovery`:
`9530ca00c7b3fde6de94165b81a721abec1af473`.

The new preflight compares an independently supplied expected token/journal-hash
inventory with bounded recovery documents. It reports missing, conflicting,
unexpected and malformed journals; exact matches remain quarantined. All outputs,
including empty matches, explicitly deny authority verification, execution and
retry. It performs no Docker, filesystem or coordinator operations.

Ten local tests passed: four new discovery scenarios plus six existing recovery
and proxy tests. Abuse cases include duplicate identities/documents, altered exact
bytes, self-declared completion, malformed JSON, oversized documents/counts and
untrusted additional fields. Whitespace checks passed. The same tests are now a
dedicated platform CI step. Docker qualifiers were not modified or required for
this pure read-only helper.

[Platform run 38034834009](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38034834009)
passed against the source commit, including the new ten-test recovery step,
integration, audit, production build, browser journeys and database cleanup.
Public run identity and step results are retained in
`docs/evidence/recovery-discovery/platform-run.json`.

This is a building block for NB-002/003, not durable storage or host-loss proof.
The expected inventory still requires an external authenticated, current and
complete authority. Replaying old inventory and old journals can match; the helper
cannot detect that. Concrete external requirements are documented in
`docs/security/recovery-discovery.md`. No service, credential, executor or provider
call was provisioned. NB-004/005 and human acceptance remain outstanding. The local
app remains stopped and the previous startup rejection was not retried.
