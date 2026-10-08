# Requirements REQ-001 v1

Status: proposed. Linked baseline: BL-001 v1. Every criterion below is an acceptance obligation, not a recorded pass.

| ID | Requirement | Acceptance criterion / planned evidence |
| --- | --- | --- |
| REQ-CMS-001 | Editor creates and updates article drafts | AC-001: authenticated editor saves and reloads a draft; editor journey report |
| REQ-CMS-002 | Publisher publishes content; public sees only public published content | AC-002: publisher publishes; anonymous draft, revision and private queries denied; role/API tests |
| REQ-MIG-001 | Adapter emits versioned records with provenance | AC-003: synthetic adapter preserves source/instance/type/ID/locale and reports capabilities; contract tests |
| REQ-MIG-002 | Re-import does not duplicate or silently overwrite editor changes | AC-004: same source imported twice creates no duplicates; changed destination yields conflict; integration report |
| REQ-MIG-003 | Invalid records are reported | AC-005: rejected rows have source ID/reason and reconcile to input; reject report |
| REQ-MIG-004 | Media, taxonomy, authors and multilingual references reconcile | AC-006: bytes/checksums verified; references resolve; locale/privacy preserved; MVP 2 report |
| REQ-MIG-005 | Imports restart safely | AC-007: interrupt/resume matches clean run; checkpoint report in MVP 2 |
| REQ-MIG-006 | Real Drupal compatibility proven before production | AC-008: installed version/schema inventoried; real export/API sample reconciles |
| REQ-AEM-001 | Later AEM adapter shares loader | AC-009: separate AEM sample, mappings and adapter security decisions accepted |
| REQ-GOV-001 | Documents and evidence trace delivery | AC-010: every accepted story links requirement, design, change, results, reviews and artifact |
| REQ-GOV-002 | Human sprint/MVP approvals gate progression | AC-011: missing/rejected/stale decisions block dependent work; gate verification |
| REQ-SEC-001 | Separate design and code security decisions | AC-012: both decisions identify reviewed scope/version; blocking findings disposition verified |
| REQ-OPS-001 | Production readiness measured | AC-013: performance, recovery and operational reports meet confirmed targets |

## Proposed production targets (require confirmation)

Planning workload: one site, 100,000 content records, 20 concurrent editors, and 50 delivery requests/second against a representative mix. These are synthetic sizing assumptions, not discovered customer demand.

Propose delivery API p95 <= 300 ms and error rate < 1% over a 30-minute steady-state test, with agreed cache/warm-up conditions recorded; management writes p95 <= 1 second at 20 concurrent editors. Propose monthly availability 99.9% measured by service probes; RPO <= 24 hours and RTO <= 4 hours demonstrated by restore. Review these targets against cost and business needs before production design acceptance.

For custom editor journeys propose WCAG 2.2 AA as the acceptance target, verified by automated checks plus keyboard/manual review; this is a project target, not an assertion of framework compliance. Hosting/data residency, incident coverage, retention periods, identity/MFA integration and supported client matrix remain decisions to resolve before production release. Local MVP 1 is explicitly not production ready.
