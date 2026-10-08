# Design security review SEC-DES-002 v1

Prepared: 8 October 2026 (Australia/Sydney). Status: proposed for human review; no new code implemented. Scope: SP-002 local synthetic migration reliability, taxonomy/references, local private media, and approval eligibility inspection. Supplements SEC-DES-001; does not authorize live source access or production hosting.

## New data flows

Synthetic input -> adapter -> validated records -> persisted migration run/checkpoints -> CMS loader. Approved fixture media directory -> bounded file validation -> protected media storage -> authenticated download route. Human decision records -> local approval eligibility checker -> task eligibility report. Imported strings must never write or alter approval decisions.

The persisted run binds source snapshot hash, adapter version, mapping version and configuration. Each content mutation and its checkpoint outcome must commit together, or recover deterministically if the framework cannot support that transaction. Imported record writes and editorial changes require a documented concurrency policy that prevents a checked destination from being overwritten by a racing importer. Duplicate identity constraints remain mandatory.

## Proposed controls and evidence

| Risk ID / severity | Required control | Acceptance evidence |
| --- | --- | --- |
| DES2-001 high: checkpoint skips failed writes or duplicates successful writes | Atomic write/checkpoint behavior or verified deterministic recovery; completed outcomes immutable per run; reject source/configuration hash mismatch on resume | Crash/interrupt tests before and after commit; clean-versus-resumed reconciliation; AC-014 |
| DES2-002 high: concurrent runs or edits lose content | Serialize conflicting imports; coordinate editorial writes with destination conflict checks; retain conflict outcome instead of overwriting | Concurrent-run and edit/import race tests; AC-014 |
| DES2-003 high: asset path escapes staging or reads secrets | Resolve and verify canonical path remains inside approved fixture directory; reject traversal, symlinks escaping root, remote URLs, unsupported MIME/type and oversized files; verify checksum | Traversal/escaping-symlink/type/size tests; AC-016 |
| DES2-004 high: private bytes accessible through static URLs | Protected download route and restrictive storage; no public static bypass; private-by-default metadata and relationships | Anonymous/authenticated direct and expanded-reference checks; AC-016 |
| DES2-005 medium: reference mappings grant access or leak private metadata | Source-scoped identity; missing required references reject; permission checks for reference expansion; preserve privacy on related content/assets | Resolution, duplicate and cross-source tests plus privacy denials; AC-015/016 |
| DES2-006 high: forged/stale approvals make a task eligible | Checker cannot generate approvals; accept only recorded human decisions bound to exact scope/version; conflicting/missing/rejected decisions deny eligibility | Gate behavior tests including tampered scope and injected content; AC-017 |

Local editable decision files alone are not authenticated or immutable approval evidence. The prototype must show that limitation explicitly and cannot authorize production actions. Later design must establish trusted approval capture and access-controlled immutable evidence retention before claiming enforceable organisational governance.

Existing users/roles retain their Sprint 1 meanings. Editors/publishers can read private media within the single site; anonymous readers cannot. Only approved import tooling/admin can create source mappings and run metadata; API clients cannot rewrite checkpoint/provenance records or approval records. Human code review must verify framework endpoints, background tasks, direct asset URLs and management API permissions in addition to intended UI paths.

Human review decision pending: accept/revise the new trust boundaries, controls and scoped limitations. Blocking design findings return for revision. After implementation, SEC-CODE-002 must verify actual behavior against this design and bind its decision to the reviewed commit.
