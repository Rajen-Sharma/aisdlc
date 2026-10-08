# Governance registers GOV-001 v1

Prepared 8 October 2026 (Australia/Sydney). Baseline BL-001 v1. Documents below are review candidates, not human-approved deliverables. Working files lack durable immutable audit storage; that is a future setup requirement, not fulfilled by these Markdown files.

| Document ID | Artifact | Owner | Version / status |
| --- | --- | --- | --- |
| BL-001 | [Project baseline](../planning/project-baseline.md) | Product owner | v1 / proposed |
| REQ-001 | [Requirements](../requirements/requirements.md) | Product owner | v1 / proposed |
| SP-001 | [Sprint 1](../planning/sprint-1.md) | Delivery owner, unassigned | v1 / proposed |
| SEC-DES-001 | [Security design review](../security/design-review.md) | Security reviewer, unassigned | v1 / awaiting review |
| SYN-001 | [Synthetic fixture](../../fixtures/drupal/README.md) | Engineering owner, unassigned | v1 / prepared |
| EVD-001 | [Evidence/traceability](../evidence/traceability.md) | Delivery owner, unassigned | v1 / prepared |
| REV-001 | [Baseline review pack](../reviews/baseline-review.md) | Product owner | v1 / awaiting review |

Initial review date for every document: 8 October 2026 preparation review only. Next human review: pending. On acceptance record exact versions/hashes and human reviewer identity/time. Changes preserve superseded versions through version control and evidence storage once configured.

| Approval ID | Scope | Decision | Human identity/time/evidence |
| --- | --- | --- | --- |
| APP-BL-001 | BL-001 local MVP boundaries; production targets remain provisional | Accepted to proceed | Chat user; 8 October 2026; “Lets build it” followed by “lets go” after design presentation |
| APP-DES-001 | SEC-DES-001 v1; local MVP 1 only | Accepted to proceed | Chat user as human security reviewer; 8 October 2026; “lets go” in response to design and invitation to accept/review |
| APP-SP-001 | SP-001 v1 plan | Accepted to proceed | Chat user; 8 October 2026; “Lets build it”, reaffirmed after security-design presentation |
| APP-CODE-001 | SEC-CODE-001; implementation d6f926d, evidence 225a598 | Accepted for local MVP scope | Chat user; 8 October 2026; “Accept all three for the local MVP scope” |
| APP-OUT-001 | Sprint 1 actual outcome REV-SP-001 | Accepted for local MVP scope | Chat user; 8 October 2026; same explicit decision |
| APP-MVP-001 | MVP 1 demo and evidence REV-SP-001 | Accepted for local MVP scope | Chat user; 8 October 2026; same explicit decision |
| APP-DES-002 | SEC-DES-002 v1 | Pending | New migration/media design prepared for review |
| APP-SP-002 | SP-002 v1 | Pending | Sprint 2 plan prepared for review |
| APP-REL-001 | Production release artifact | Not yet eligible | Production criteria unmet |

The above records preserve the user's actual statements and their context. Initial “lets go” accepted the local MVP design/start; the later explicit “Accept all three for the local MVP scope” accepted its code-security, sprint-outcome and MVP decisions. Neither approves production release or the new Sprint 2 design/plan. Exact message times and the user's legal identity were not provided and are not fabricated. A human may hold multiple roles. Product/security/release exceptions cannot be approved by the AI assistant.

Review cadence proposal: sprint planning before start, a progress checkpoint midway, and outcome/demo review at end; MVP review whenever its criteria are met. Evidence retention period, storage access and platform remain to be agreed before release. Working synthetic inputs may stay in this repository; real exports must use restricted storage.
