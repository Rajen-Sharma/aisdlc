# Evidence and traceability EVD-001 v1

Status: implementation evidence available for the local Sprint 1 slice; see [outcome review](../reviews/sprint-1-outcome.md). Design/sprint-start approvals are recorded; human code-security/outcome/MVP acceptance remains pending. Original planned-evidence rows below distinguish future scope; current results follow.

| Requirements / criteria | Story / stage | Design reference | Expected evidence | Current result |
| --- | --- | --- | --- | --- |
| REQ-CMS-001/002; AC-001/002 | ST-002 | DES-001/002 | Editor journey and negative API tests | Integration and browser results passed; human acceptance pending |
| REQ-MIG-001/002/003; AC-003/004/005 | ST-003 | DES-003/004 | Adapter, rerun, conflict and rejection reports | Integration and demo import results passed; human acceptance pending |
| REQ-MIG-004/005; AC-006/007 | MVP 2 backlog | New design scope required | Media/reference/resume reconciliation | Not planned in Sprint 1 |
| REQ-MIG-006; AC-008 | Pre-production discovery | Live source review required | Actual inventory/sample validation | Source unknown |
| REQ-AEM-001; AC-009 | Later AEM backlog | AEM design review required | AEM contract/import review | Deferred |
| REQ-GOV-001/002; AC-010/011 | ST-004 and later runner | DES-005 | Review pack, evidence links and gate tests | Pack/links prepared; runtime approval controls remain later scope |
| REQ-SEC-001; AC-012 | All affected stories | SEC-DES-001 | Design and commit-specific code decisions | Design accepted to proceed; code review pack prepared, human decision pending |
| REQ-OPS-001; AC-013 | Production-readiness backlog | Production design required | Performance/recovery/operations evidence | Targets proposed only |

## Evidence record template

- ID and linked requirement/story/criterion:
- Purpose; source classification (synthetic or real):
- Producer and timestamp with timezone:
- Source commit/design version; tool/configuration versions:
- Reproduction command and environment (secrets redacted):
- Outcome, counts/denominators and limitations:
- Artifact location and SHA-256:
- Failed attempts, remediation and retest links:
- Reviewer identity, time, decision and reviewed version:

Retain raw output behind summaries. Automated correctness results are distinct from human acceptance. Generated files and verified fixture counts are evidence of preparation only. Final release index must bind requirement/story/design, reviewed commit, test/security results, human decisions, immutable build digest, deployment and migration run IDs.

## Sprint/MVP report template

Outcome and readiness; planned/completed/accepted story IDs and counts; scope changes; blocked work/age; defects and security findings by severity; acceptance criteria tested/passed/failed/not run; actual versus proposed migration counts; evidence links; elapsed/active/review time; measured cost or unavailable; forecast changes; risks; human decisions needed. Do not substitute zero for unavailable measurements.
