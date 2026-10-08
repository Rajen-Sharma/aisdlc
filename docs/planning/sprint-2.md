# Sprint SP-002 v1: reliable migration foundation

Prepared: 8 October 2026 (Australia/Sydney). Status: proposed, not authorized. Prior sprint implementation: d6f926dfad2f654e43c853990cd831e8c7bc7ba6; evidence commit: 225a598. Human Sprint 1 outcome/MVP/code-security decisions are accepted for local scope. See [Sprint 1 outcome](../reviews/sprint-1-outcome.md).

Goal: make synthetic migration runs durable and reviewable, transfer a small local asset safely, and make delivery approval dependencies inspectable. This is an increment toward MVP 2, not a commitment to complete all multilingual/revision/workflow migration in one sprint.

## Proposed stories

| Story | User outcome and scope | Acceptance criteria | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| ST-005 | Operator starts, inspects and resumes a persisted migration run | AC-014: immutable source/mapping hashes and run ID; interrupt/resume yields same destination as clean run; each selected record has one terminal result; changed input cannot reuse checkpoint; reruns preserve editorial conflicts | SP-002 and SEC-DES-002 acceptance; ST-003 | 5 |
| ST-006 | Operator imports approved taxonomy/references without silently losing links | AC-015: taxonomy terms use composite identity; required missing references reject/report; optional missing references report explicitly; second pass resolves supported cycles; re-import creates no duplicate terms or links | ST-005 | 3 |
| ST-007 | Editor uses an imported private sample asset safely | AC-016: local approved asset path only; checksum/type/size verification; private downloads denied anonymously including direct paths; referenced asset resolves; repeated run produces no duplicate upload | ST-005 and ST-006 | 5 |
| ST-008 | Reviewer inspects approval dependencies and migration evidence | AC-017: task records reference requirement/design/sprint; missing/rejected/stale approvals block eligibility; no AI-generated acceptance; run summaries reconcile; snapshot manifests and demo pack retained | ST-005..007 | 3 |

Proposed total: 16 relative points. No measured velocity exists; estimates express uncertainty. Cadence remains proposed at two weeks; dates, capacity and budget remain unconfirmed. Use sequential work and replan with human approval if effort exceeds capacity.

Implementation responsibility: AI-assisted engineering. Proposed human product/security/outcome reviewer: chat user, subject to acceptance. Production operations/release roles remain unassigned. Required security design: [SEC-DES-002](../security/design-review-2.md). Each story has the ready/done rules from SP-001: accepted design/plan before code; reproducible checks, documentation, evidence and human code-security review before acceptance.

## Boundaries

Synthetic source only; no Drupal/AEM credentials or live asset downloads. Plain-text articles remain the content slice. French content, page models, historical revisions, redirects and live-source extraction remain explicit backlog items. Approval inspection is a local control prototype; authenticated approval capture, external immutable storage and a production AI runner are subsequent work. It must not be described as an auditor-certified platform or autonomous end-to-end pipeline.

Private media changes introduce a new trust boundary, so security acceptance for Sprint 1 cannot authorize them implicitly. If the framework's private download behavior cannot meet AC-016, do not expose uploads; report/replan rather than weakening the criterion.

## Demo and reporting

Demonstrate a synthetic run interrupted after a committed checkpoint, resumed without duplication, reference resolution, safe private asset access, and rejection of a stale checkpoint/approval. Show browser editor use and anonymous denials, then the reconciliation report. Record planned/completed/accepted stories, criterion pass/fail/not-run counts, security findings, run counts, conflicts, elapsed time and actual cost where available. Keep unavailable measurements explicit.

MVP 2 acceptance requires a separately agreed boundary: do not mark the broader multilingual/revision migration complete from this sprint's narrower demo. Human sprint-outcome and applicable MVP decisions follow showcase; code-security approval attaches to the reviewed commit. No production release is proposed.

## Start gate

All required: APP-CODE-001 (SEC-CODE-001), APP-OUT-001, APP-MVP-001; APP-DES-002 (SEC-DES-002); APP-SP-002 (this plan). Sprint 1 gates are accepted for local scope. The new design and sprint-plan gates remain pending. Planning preparation is authorized by the user's instruction to continue; dependent implementation awaits these concrete decisions.
