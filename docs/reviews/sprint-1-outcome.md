# Sprint 1 outcome and MVP 1 review REV-SP-001

Prepared: 8 October 2026 (Australia/Sydney). Status: implemented and locally verified; human code-security, sprint-outcome and MVP acceptance pending. Scope: SP-001 local synthetic vertical slice. Production ready: no.

## Delivered behavior

Payload editor, publisher and administrator accounts; draft/revision privacy; public published delivery API/page; English synthetic Drupal-style article import with provenance, repeat detection, source updates and destination conflict reporting. A role-aware publish action matches the API denial. Local PostgreSQL starts without Docker. A pinned GitHub verification workflow is prepared but not run remotely; no repository/hosting account was connected and nothing deployed externally.

| Story | Implementation / verification | Human acceptance |
| --- | --- | --- |
| ST-001 | Locked dependencies, generated local secrets, workspace database, setup guide, optimized build | Pending |
| ST-002 | CMS roles/models; local API and REST/browser negative authorization checks | Pending code/security review |
| ST-003 | Synthetic adapter; create/skip/update/reject/conflict results | Pending code/security review |
| ST-004 | Browser journey, screenshots, reports, documentation and review pack prepared | Pending sprint/MVP review |

## Actual metrics and evidence

| Measurement | Observed result | Evidence |
| --- | --- | --- |
| Planned / implemented / human-accepted stories | 4 / 4 / 0 | This table; approval register |
| Integration test result | 4 behavior subtests plus parent: 5 passed, 0 failed | [Raw result](../evidence/integration-tests.log) |
| Browser/REST checks | Editor save/reload; publish and role denials; anonymous draft/version denial; publisher UI-to-public journey; mobile overflow check passed | [Results](../evidence/browser-check.json) |
| Fresh demo import | Selected 2, created 2, failed 0 | Run 2dfee50d-bbd4-422d-b550-dc4f44b1a363; [retained summary](../evidence/demo-first-import.json) |
| Unchanged demo rerun | Selected 2, skipped 2, created/updated/rejected/conflicted/failed 0; 2 current-content rows excluded | [Raw result](../evidence/demo-rerun.log) |
| Dependency audit | 0 reported vulnerabilities | [Audit](../evidence/dependency-audit.json) |
| TypeScript / optimized build | Passed | [Build log](../evidence/build.log); typecheck exit status recorded in manifest |
| Production-mode browser run | Same browser/REST journey verified against npm start | Browser results captured after built server startup |
| Hosted CI / availability / load / restore | Not executed | Deferred production acceptance work |
| Cost, active human effort and throughput baseline | Unavailable | No values fabricated |

Review [code-security pack](../security/code-review.md), [attempts/corrections](../evidence/implementation-attempts.md), [operator guide](../runbooks/local-mvp.md), [implementation decision](../decisions/001-mvp-implementation.md), and the source/evidence manifest generated for this review. Fixture checks and synthetic results do not establish actual Drupal compatibility.

## Showcase

The built local server is available at http://127.0.0.1:3000; editor at http://127.0.0.1:3000/admin while the local processes run. Use the ignored local credential file described in the operator guide. Follow its demonstration script and inspect [public-page screenshot](../evidence/mvp-home.png).

## Limitations and decisions

Single site, English article import and plain text only. Full media/taxonomy/localization/revision mappings, actual source adapters, checkpoint recovery, concurrent migration safety and the AI orchestration service remain later scope. The initial AI-assisted delivery used this coding session with repository artifacts; no autonomous sprint orchestrator is claimed. Working Git history and check artifacts do not constitute immutable third-party audit storage. Production review must resolve the security/operations blockers in SEC-CODE-001.

Human reviewer: inspect source and evidence, then accept/reject SEC-CODE-001, APP-OUT-001 and APP-MVP-001 independently, with any conditions and accountable owners. These decisions are not prefilled. Sprint 2 planning may be prepared, but implementation requires those outcomes and a newly approved sprint plan. No production release is requested.
