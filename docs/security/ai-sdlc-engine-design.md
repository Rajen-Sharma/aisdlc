# Design security review SEC-DES-ENG-001 v1

Status: proposed; implementation start requires human review under the agreed gates. Prepared 8 October 2026. Scope: local AI SDLC control plane and bounded CMS coding runner, synthetic/redacted inputs only. No production release or live Drupal/AEM access.

## Trust boundaries

Human session -> authenticated control panel -> PostgreSQL intake, revisions and decisions. Coordinator -> credential-minimised worker -> isolated repository checkout -> proposed diff and schema-validated result. Trusted verifier -> check results -> evidence index -> human code/security/sprint/MVP reviews. Agent output and imported source text never reach the human-decision endpoint or become executable check commands.

Control-panel sessions use existing CMS authentication but a dedicated approval permission; human actor identity is recorded from the verified session, never supplied by AI text. Cross-origin state-changing requests require origin/CSRF enforcement. Coding worker gets no CMS session, database URL, secret, human approval token or control-plane filesystem access. The coordinator's transaction binds the task hash and all applicable accepted artifact versions before leasing execution. Approval records are append-only to application identities; database administrators remain trusted operators. Local PostgreSQL is not an immutable audit archive.

## Required controls and verification

| Risk | Control | Required checks |
| --- | --- | --- |
| ENG-SEC-001: prompt injection changes scope or grants approvals | Treat all intake as data; schema validate proposals; executable eligibility uses persisted human gates, not model assertions; preserve baseline and source provenance | Embedded approval override, fabricated IDs and contradictory feedback cannot start a task or change a decision |
| ENG-SEC-002: unauthorized or stale approval | Human permission, CSRF/origin checks, artifact hashes and optimistic concurrency; scope changes invalidate applicable gates; AI identities cannot approve | Anonymous/editor/worker denials; approval reuse after scope change denied; forged actor ignored/rejected |
| ENG-SEC-003: agent reads secrets or modifies control plane | Separate unprivileged isolated worker with only an approved repository export, protected-file exclusion and egress policy; no control-plane credentials; reject changes outside declared paths and to gate/check policies | Canary secrets inaccessible; disallowed paths/network denied; symlink traversal tests; permission/pipeline changes require explicit owner-reviewed scope |
| ENG-SEC-004: generated code executes during verification | Run checks in a separate disposable sandbox without host secrets or control-plane access; trusted verifier command list is versioned outside agent writable paths | Malicious test/package script cannot reach host/control plane; command text from feedback never executes |
| ENG-SEC-005: retries/crashes duplicate work | Transactional leases, idempotency key, unique task revision, persisted attempt/output identifiers; uncertain termination quarantines execution before retry; maximum two repairs | Duplicate submission, two workers, timeout and crash/lease expiry tests; no overlapping unknown execution |
| ENG-SEC-006: falsified or sensitive evidence | Capture actual exit codes and artifacts, hashes, tool/version/commit, failures and retests; redact credentials; validate output size/schema and evidence links | Invented model test success ignored; secrets absent from UI/logs; changed artifact checksum detected |
| ENG-SEC-007: feedback silently rewrites accepted plan | Append intake and change proposals; human disposition required; invalidate only impacted approvals through explicit versioned dependency records | Duplicate linked without lost sources; contradictions pending; rejected/superseded changes retained; AEM remains later |

Read-only intake trials can run now without authorizing coding tasks. They use synthetic prompts, no repository execution, no credentials in prompts and no approval actions. Existing Windows CLI read-only mode is a discovery environment, not proof of production worker isolation. Docker was not found in the current command search; implementation must discover a usable isolation environment and demonstrate its boundary before allowing code execution. A worktree alone is not a sandbox. Do not use dangerous sandbox bypass flags to make a failed runner work.

## Human decisions requested

Review local-first intake/control-panel approach, separate approval authority, isolated worker/verifier, version-bound gates and scoped evidence limitations. Accept or return findings against this version. APP-DES-ENG-001 is pending. Code review must later verify the actual implementation against these controls and bind its acceptance to a commit. Engine acceptance cannot approve SP-002 migration/media changes or production release.
