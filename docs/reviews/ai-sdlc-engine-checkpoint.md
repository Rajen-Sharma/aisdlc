# AI SDLC engine working showcase REV-ENG-001

Prepared 8 October 2026, Australia/Sydney. SP-ENG-001 plan and security design were accepted contextually by the human's “Lets go” following presentation of both packs. This report does not mark the sprint complete or request acceptance of undelivered work.

## Demonstrated outcome

Delivery Studio at `http://127.0.0.1:3000/pipeline` provides authenticated intake for backlog requirements, review suggestions and MVP feedback, a durable exact-snapshot queue, actual AI triage, source-linked proposals, conflict/injection presentation and immutable human analysis decisions. The linked `/sdlc` explorer has ten lifecycle stages and fourteen reusable document templates, with blank/example views, copying and Markdown export. Desktop/mobile screenshots are retained.

The existing CMS remains the destination project. The engine has **not yet implemented a CMS change**. It cannot become eligible to do so until isolated execution/verification and the complete human implementation gates are demonstrated. Synthetic Drupal remains first and AEM later. The existing migration SP-002 proposal is unchanged and pending.

## Meaningful measurements

| Measure | Observed value / basis |
| --- | --- |
| Planned engine stories | 5; none marked fully complete or human accepted at this checkpoint |
| Real showcase inputs | 6 persisted synthetic inputs; requirement, duplicate review, contradictory media feedback, injection, later AEM |
| Worker attempts | RUN-3 failed canonicalization integrity check; RUN-4 passed schema/provenance/hash checks and awaits human review |
| Human decisions granted by automation | 0; temporary security-test decisions are labelled and deleted |
| Automated tests | 7 passing behaviors: existing CMS suite (5), engine authorization/immutability suite (1), response provenance/canonicalization suite (1) |
| Browser validation | Admin sign-in, anonymous/editor denial, persisted six-source intake, queued snapshot, actual proposals/conflicts/injection display, mobile no overflow |
| Template validation | 10 stages, 14 templates, examples, clipboard, download and mobile entry |
| Dependency advisories | 0 in recorded npm audit; does not cover all security risks |
| Time, retries and cost | Actual worker elapsed time/version retained in run evidence; one failed integration run and one corrected run; monetary cost unavailable |
| Production readiness | Not ready; no deployment or live migration authorized |

## Review walkthrough

1. Open `/pipeline` anonymously: delivery data and actions are unavailable.
2. Sign in with the synthetic administrator using ignored `.local/demo-credentials.json`, then return to the panel.
3. Inspect the six labelled synthetic inputs and RUN-4. Compare duplicate provenance, contradictory media requirements and rejected approval override.
4. Expand the result evidence and compare the hash with `docs/evidence/engine-runs.json`. RUN-3 remains visibly failed.
5. Review the analysis and enter notes if desired. Accepting analysis does not approve implementation; use a new feedback record for changes or findings.
6. Open the lifecycle/template explorer, select design security, compare blank/example content, and download its Markdown template.

Review limitations and code-security findings in [SEC-CODE-ENG-001](../security/ai-sdlc-engine-code-review.md). The next dependency is selection/provisioning of a local Docker/WSL, remote Linux or existing CI execution environment. The assistant requested this preference while continuing independent intake work. No elapsed time is treated as a reply or approval.
