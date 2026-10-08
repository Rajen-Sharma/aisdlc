# Project baseline BL-001 v1

Prepared: 8 October 2026 (Australia/Sydney). Status: proposed for human review. Owner: product owner (user); engineering preparation: AI assistant. Security reviewer, operations owner, delivery owner, and release owner: unassigned. This is preparation, not an approved sprint or production system.

## Charter

Deliver an extensible headless CMS with an auditable AI-assisted SDLC, Drupal migration first and an AEM source adapter later. Success means demonstrable editorial workflows, correct repeatable migration, traceable delivery evidence, and operational acceptance against agreed production targets.

Initial scope: single site; articles/pages; authors distinct from login identities; taxonomy; public/private media; English/French sample content; draft/published states; provenance and legacy URLs. Extend revisions, scheduling, localization and workflow fidelity through later stories. Multitenancy, real password transfer, bespoke Drupal module parity, frontend rebuilding, and AEM implementation are outside MVP 1. Their production relevance must be assessed before full rollout.

Use synthetic Drupal-style exports. Installed Drupal version, actual schema, APIs, volumes and custom modules remain unknown. This fixture is neither a real Drupal export nor proof of live Drupal compatibility. Production migration requires a real inventory and representative export/API verification.

## Roadmap and dependencies

| Increment | Outcome | Dependencies / acceptance |
| --- | --- | --- |
| Sprint 1 / MVP 1 | Local CMS vertical slice and small synthetic import | BL-001, design SEC-DES-001, and sprint SP-001 accepted; demonstrate edit/publish and denied access |
| MVP 2 / subsequent approved sprints | Media, references, validation, checkpoint/retry and repeat-import workflow | MVP 1 accepted; mapping and adapter design reviewed; reconciliation evidence |
| MVP 3 / subsequent approved sprints | Required editorial features and production rehearsal | MVP 2 accepted; real-source discovery and hosting/identity decisions; performance/recovery evidence |
| Later AEM MVP | Representative AEM migration through shared core | Drupal production readiness; AEM inventory; separate design/code reviews and sprint approvals |

Propose two-week sprint cadence; start date, available reviewer capacity, budget and calendar commitment remain unconfirmed. Story points express relative uncertainty, not days or proven AI velocity. Start sequentially with one implementation story in progress. Forecast after Sprint 1 actuals; do not promise a production date yet.

## Risks, issues and decisions

| ID | Item | Owner / next action |
| --- | --- | --- |
| RISK-001 | Synthetic source differs from real Drupal | Product owner: arrange real inventory before production migration |
| RISK-002 | AI changes pass shallow tests but break permissions | Engineering: independent negative API/editor checks and code security review |
| RISK-003 | Review capacity delays gates | Delivery owner: agree review schedule before sprint starts |
| ISSUE-001 | Security and operations owners unassigned | Product owner: nominate owners; same human may hold multiple roles |
| DEC-001 | Payload/TypeScript/PostgreSQL preferred | Proposed; validate in vertical slice using research already recorded |
| DEC-002 | Synthetic fixture adapter before live Drupal adapter | Proposed; preserve shared contract, avoid claiming live compatibility |
| DEC-003 | CI/cloud/identity/tool procurement | Deferred; select through documented evaluation before connecting services |

Scope changes record rationale, affected requirements/stories, effort/risk impact and human decision. Changes to approved scope or design require a new baseline version and the relevant renewed approval.

## Review decisions needed

Accept or revise BL-001; confirm proposed production targets in REQ-001; assign human review roles; accept or revise SEC-DES-001; approve or revise SP-001. Each decision is recorded separately. No implementation begins until its applicable sprint/design decisions are accepted.
