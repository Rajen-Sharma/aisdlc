# Baseline review REV-001 v1

Review date: pending. Prepared: 8 October 2026 (Australia/Sydney). Status: ready for human review, not accepted.

The project baseline uses synthetic data to avoid dependence on an unavailable Drupal site. Sprint 1 proposes a local CMS, publication/privacy enforcement, and a small repeatable article import. Production readiness and real Drupal compatibility remain later acceptance obligations.

Review [BL-001](../planning/project-baseline.md), [REQ-001](../requirements/requirements.md), [SP-001](../planning/sprint-1.md), [SEC-DES-001](../security/design-review.md), [SYN-001](../../fixtures/drupal/README.md), and [EVD-001](../evidence/traceability.md).

| Metric | Actual / proposed |
| --- | --- |
| Proposed Sprint 1 stories / estimate | 4 / 13 relative points, not a calendar forecast |
| Implemented / human-accepted stories | 0 / 0 |
| Synthetic current content / negative cases | 4 / 4 |
| Sprint 1 selected happy-path records | 2 |
| Executed application tests or import runs | 0 |
| Security design risks | 5 local-scope control proposals; 1 later-scope risk |
| Human design/sprint approvals | Pending |
| Production readiness | Not demonstrated |

## Acceptance checklist and requested decisions

- Accept/revise baseline scope, MVP boundaries and proposed workload/service targets.
- Assign product/delivery/engineering/security/operations/release owners and reviewer availability.
- Designated security reviewer accepts/revises local MVP 1 design SEC-DES-001 v1; production remains outside this decision.
- Approve/revise Sprint 1 plan SP-001 v1 before implementation.

Record decisions in [GOV-001](../governance/registers.md). A concise response may accept baseline and Sprint 1 together, but security accountability and design acceptance must be explicit. Do not count planning checks as security-control validation. After Sprint 1, demonstrate the actual MVP and present its evidence for separate sprint-outcome/MVP approval.
