# Next build BUILD-ENG-002 v1: prove one complete generic delivery cycle

Prepared 8 October 2026, Australia/Sydney. Status: proposed continuation of SP-ENG-001, **not a completed prior sprint or an automatically approved new sprint**. Preserve the original plan, generic direction and deferred CMS scope. Review baseline: [REV-FULL-001](../reviews/full-check-2026-10-08.md). Design gate: [SEC-DES-ENG-002](../security/next-build-design.md).

## Outcome and first delivery candidate

A human submits one generic requirement, reviews its story/acceptance criteria, approves the sprint/design scope, and receives a real AI-produced patch from an isolated coding task. A separate trusted verifier checks it. The human then reviews actual code security, the showcase and the sprint/MVP outcome. Rejected findings return as new versioned feedback and another bounded attempt. No production deployment or self-approval.

Candidate project: a small synthetic task board. First story: filter tasks by status, preserve order and the input data, show an empty result, and reject unsupported statuses. Use a separate fixture repository/export rather than let the first coding task edit platform approval, authentication, task policy or trusted tests. This is proposed for human selection, not yet accepted work. An actual agent must produce the change; manually completing it cannot count as proving the engine.

## Stories and acceptance

| Story / dependency | Outcome and required evidence | Relative estimate |
| --- | --- | --- |
| NB-001 / human plan+design review | Versioned story/change proposal and exact task contract; separate human sprint/design decisions; eligibility rejects absent, denied, stale or wrong-project approval. Accepted analysis cannot authorize code. Changed criteria/source/check policy invalidates affected gates; superseded input history retained | 5 |
| NB-002 / NB-001 | Transactional task claim and attempt ledger; unique active owner and fencing; two workers cannot execute one task concurrently. Crash/timeout marks uncertainty; no retry until termination/effects assessed. Initial attempt plus at most two repair attempts, persisted across restarts | 5 |
| NB-003 / environment selected; NB-001 | Qualify isolated coding and verifier environments. Control-plane DB/approval credentials and host secrets inaccessible; protected/symlink paths denied; network/resource/process limits tested. Real provider adapter feasibility trial, credential strategy and image/tool pinning recorded before enabling execution | 8 |
| NB-004 / NB-001..003 | One actual agent change to the separate generic fixture project. Allowed source paths enforced; trusted tests/check commands reside outside agent writable scope. Capture source/patch/check hashes, actual exit/logs and resolved model/tool metadata. Failed tests cannot promote; altered verifier/tests rejected; human code-security gate against exact commit | 5 |
| NB-005 / NB-004 | Runnable/reproducible showcase with success, denial, failed check and recovery; feedback yields a new version requiring applicable reapproval. Useful status/error UI and keyboard checks; deterministic generic/negative CI and evidence retained. Separate human code-security, sprint outcome and MVP decisions | 3 |

Total proposed: 26 relative points. These are uncertain decomposition estimates, not proven velocity or a two-week commitment. Capacity, reviewer availability and infrastructure provisioning time are unconfirmed. If too large for one sprint, split through human-approved planning; retain all security/verification criteria. Do not silently reduce scope to meet a date.

## Delivery order and checkpoints

1. **Ready-to-execute checkpoint:** NB-001/002. Show exact task versions, missing/stale gate denials and the two-worker/crash tests. No code task runs yet.
2. **Isolation checkpoint:** NB-003. Demonstrate canary secret, path, network, malicious-test and process termination controls. Failed qualification keeps execution disabled.
3. **Complete-cycle checkpoint:** NB-004/005. Demonstrate a real patch, trusted checks, human code/security decision, outcome/showcase and feedback revision. Present the full evidence chain before requesting acceptance.

Each checkpoint is reviewable within the existing engine increment. It does not replace required sprint/MVP approvals. The next separately scheduled sprint cannot start without the agreed prior outcome and next-plan gates.

## Scope and architecture choices

Retain PostgreSQL, versioned project contracts and the current portal. Start with one coding task at a time and one fixture project. Use a Linux container worker and separate disposable verifier as the proposed qualification target; local Docker/WSL, remote Linux or existing CI provisioning remains a human choice. Do not install/reconfigure Windows features or assume a connected CI repository from silence. No Docker/Podman runtime was found in the review.

Keep the execution contract provider-neutral. The current Codex CLI is an existing candidate, not a proven isolated coding adapter. Trial its credential/tool boundaries against the design; if it cannot meet them, present an alternative adapter and evidence before adoption. Avoid a new distributed agent framework until measured requirements justify it.

Include CI alignment with the agreed branch policy, generic UI/template checks, scenario-specific accounts and an explicit concurrent-login test for REV-009. Existing CMS tests remain regression checks for the preserved example. No actual CMS/Drupal/AEM project implementation is scheduled here.

## Quality and acceptance rules

- Tests come from acceptance criteria and abuse cases; the generated implementation cannot edit its own authoritative verifier or change success thresholds.
- A model's claim of success or an attractive screenshot is insufficient. Show working behavior, negative paths, exact artifacts and reproducible checks.
- Review design security before implementation and code security against the resulting patch/commit. Record blocking findings, fixes and retests.
- Evaluate applicable accessibility/keyboard behavior, input preservation on errors and clear pending/empty/failed/review states; do not claim full WCAG qualification from mobile screenshots.
- Reports include planned/completed/accepted stories, criterion denominators, check failures/retests, reviewer findings, attempt count, agent/check time, human review wait, and cost when available.
- Keep raw synthetic proof and a source/config/artifact-bound evidence index. Mutable local evidence is labelled; production immutable storage, identity/operations and release qualification remain later requirements.

## Dependencies, risks and decisions

Required before dependent implementation: human review of current foundation/code findings, acceptance of this concrete continuation scope and SEC-DES-ENG-002, selection/provisioning of the execution target, and a viable authorized provider credential strategy. Model budget/cost ceiling must be explicit before coding runs; unavailable price data cannot imply unlimited spend.

Risks: execution environment may be unavailable; the chosen CLI may not satisfy isolation; session contention may expose a framework issue; review capacity may dominate lead time; the full slice may exceed one sprint. Resolve through recorded findings and human replan, not weaker controls. No commitment to production release is made.

Showcase acceptance checklist: real agent-generated feature; source/requirement/task trace; absent/stale/forged approvals denied; two-worker and crash cases safe; independent positive/negative tests; protected files/secrets/verifier inaccessible; failed run retained; code-security pack; human outcome/MVP decisions; feedback revision and reapproval. Until all applicable items pass, report partial delivery.
