# CAPSULE-001: bounded source handoff

Prepared 9 October 2026, Australia/Sydney. Partial implementation of NB-003/004,
continuing SP-ENG-001 and the accepted BUILD-ENG-002 scope. Human code-security,
sprint outcome and MVP acceptance remain pending.

Implementation commit: `474f721534360290679417303992a7395cac759b` on
`build/source-capsule`. The generic engine can now construct and validate a small,
deterministic source capsule from an explicit file selection. SHA-256 binds file
paths, bytes and contents to a trusted expected digest. No coding runner is attached.

The separate synthetic taskboard fixture has an intentionally unimplemented filter
function. It prepares a future AI trial without manually completing that trial's
feature or recording a human story approval. The approved architecture and deferred
CMS, Drupal and AEM scope are unchanged.

Local checks passed: type checking and all 13 leaf acceptance scenarios (14 Node
test results including the CMS parent). Three new boundary tests cover deterministic
selection, protected/unsafe paths, duplicate entries, content/size/hash tampering,
ambiguous encoding, hard links, directory links and file/aggregate/count bounds.
The full suite result is a coordinator-observed summary; only the targeted boundary
and type-check logs are retained in this checkpoint's local evidence directory.

GitHub verification [37910640762](https://github.com/Rajen-Sharma/aisdlc/actions/runs/37910640762)
passed against the implementation commit, including integration tests, dependency
audit, optimized production build and sequential browser journeys. Public run/job
metadata is retained alongside local targeted logs in
[the evidence manifest](../evidence/source-capsule/manifest.json). Detailed remote
logs were not downloaded; remote claims are limited to GitHub's recorded step
results. This was platform CI, not execution of generated code in a verifier.

Review the [security checkpoint](../security/source-capsule-review.md) for exact
controls and limits. This component requires a trusted, quiescent checkout; it is
not qualification of a hostile live filesystem, independent verifier or coding
sandbox. Source inspection for embedded secrets is not implemented. Only synthetic
fixture input is permitted now. Source/task binding at runtime is still pending.

Next implementation: independent protected verifier, with deliberate bad-code,
success-spoofing, secret/path/network and process-tree termination qualification.
Model execution additionally requires the selected credential route, explicit
spend ceiling and exact task approvals. No paid model call or AI feature delivery
is claimed by this checkpoint.
