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

## Engine-first sequencing decision, 8 October 2026

The human explicitly selected “Build the AI SDLC engine first; preserve scope and approval gates.” This authorizes the sequencing direction and discovery trials. Existing SP-002 and SEC-DES-002 remain unchanged and pending; they will be delivered through the engine after its readiness gates.

| Approval ID | Scope | Decision | Evidence |
| --- | --- | --- | --- |
| APP-SEQ-ENG-001 | Prioritize the engine while preserving architecture, CMS scope and approval gates | Accepted | Chat user's explicit selection above |
| APP-SP-ENG-001 | [SP-ENG-001 v1](../planning/ai-sdlc-engine-first.md), SHA-256 46ae97a2d1d18af69794d8f63f81fbe9ab4e3475c5138ca7d5ed04582e573d92 | Accepted for local engine scope | Chat user: “The final product needs to be more than basic, it must be polished. Lets go”, following explicit request to accept these two packs |
| APP-DES-ENG-001 | [SEC-DES-ENG-001 v1](../security/ai-sdlc-engine-design.md), SHA-256 d7fc6e51850d062cab705b7755f7e1443592fb979d4e967887593148d3d93e89 | Accepted for local engine scope | Same contextual human decision; production and migration approvals remain separate |

[TRIAL-INTAKE-001](../research/intake-trial-findings.md) records discovery results; a passing AI intake trial does not approve a sprint or security design.

Product quality requirement QLT-001: final engine and CMS must be polished, with complete workflows, accessible/responsive interfaces, understandable reporting, documentation and tested failure states. “Polished” does not waive production criteria or permit claiming incomplete work is production ready.
