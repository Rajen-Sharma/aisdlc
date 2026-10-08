# Code security review SEC-CODE-ENG-001 v1

Prepared 8 October 2026. Status: AI-prepared review pack; human code-security acceptance pending. Scope: actual local intake, read-only CLI triage, immutable review decisions and template explorer. This is a checkpoint review, not acceptance of the complete SP-ENG-001 increment or a production release. The final source commit/evidence manifest must identify the reviewed artifact.

## Implemented controls and evidence

| Design control | Actual implementation | Verification |
| --- | --- | --- |
| ENG-SEC-001 | Schema allowlists source IDs; independent validator rejects unknown/omitted provenance, extra fields and granted approval states; triage result cannot grant implementation approval | `tests/sdlc-contracts.test.ts`; real six-source RUN-4 includes duplicates, unresolved media conflict and rejected approval instruction |
| ENG-SEC-002 | Every server action authenticates and requires administrator role; Next enforces server-action origin checks; REST collection permissions deny anonymous/editor access; decision hook derives actor from request and binds exact result hash | `tests/sdlc-access.test.ts`; browser anonymous/editor denials and admin sign-in; stale hash and forged actor tests |
| ENG-SEC-003 | Read-only intake CLI, no application environment inherited, synthetic snapshots only, 120-second timeout/output cap; unexpected tool event stops processing; no coding worker enabled | RUN-4 real execution and tool-version evidence; full filesystem/egress/canary isolation remains **unverified and blocks coding** |
| ENG-SEC-004 | No generated code or generated check commands executed | Coding/verifier implementation and malicious-test isolation checks remain blocked |
| ENG-SEC-005 | Unique snapshot/task key, immutable input, local exclusive worker lock; no lock expiry or automatic retry after unknown crash | Unique/immutability tests; uncertain crash recovery documented; distributed leases and verified process-tree termination remain incomplete |
| ENG-SEC-006 | Actual CLI exit, elapsed time, version, validated result, canonical input/result hashes and failed run retained; diagnostic stderr not published | RUN-3 failure preserved, RUN-4 success; canonical JSONB regression test; snapshot/result recomputation in evidence export |
| ENG-SEC-007 | Intake/review decisions cannot be updated/deleted through application permissions; revised inputs retain separate source records; triage acceptance clearly separate from sprint/security/MVP/release | Immutability and duplicate decision tests; dashboard and operator guide; material-change approval invalidation not yet implemented |

## Findings and limits

Blocking production/coding findings: qualified worker and verifier isolation missing; full task lifecycle, versioned implementation gates, distributed recovery and immutable external evidence storage incomplete. Approval authority currently uses the administrator role rather than a dedicated human-reviewer permission. Operator/database access is trusted, not protected by a production immutable archive. Source attachments, connectors, acceptance-criteria coverage reporting, spend data and complete sprint/showcase automation remain future implementation within the approved plan.

The worker's shell-free launch and stripped environment reduce exposure; they do not prove host isolation. CLI auth still uses the operator's existing account. Unexpected-tool detection observes execution events, so it must not be described as pre-execution prevention of arbitrary commands. Only synthetic/redacted discovery data is supported here. No private customer data, CMS credentials or database URL is placed in prompts. The coding runner stays disabled.

During verification, concurrent schema push caused the initial test failure; suites now run in separate sequential processes. PostgreSQL JSONB reordered snapshot keys and caused RUN-3 to fail; canonical hashing and its regression test fixed it for RUN-4. Early browser assertions raced with form redirects; the smoke test now waits for the actual submission response and verifies all six inputs through the authenticated API before queueing. Template copy/download comparison normalizes platform line endings. Original failure evidence and retests are retained; no failure is converted into human approval.

Evidence: [final test log](../evidence/engine-tests-final.log), [build log](../evidence/engine-build-final.log), [browser checks](../evidence/pipeline-browser.json), [runs](../evidence/engine-runs.json), [dependency audit](../evidence/engine-dependency-audit.json), [template checks](../evidence/sdlc-guide-check.json). A zero dependency advisory count does not establish absence of application vulnerabilities. Manual human review, external security scans and production qualification remain pending.

Requested eventual decision: review this exact checkpoint artifact and return findings or accept its local intake scope. No approval is requested for blocked coding execution, completion of the sprint, migration changes or production release.

Artifact identity: [engine manifest](../evidence/engine-manifest.json) records the source commit, build ID and tracked file checksums. Human acceptance remains pending.
