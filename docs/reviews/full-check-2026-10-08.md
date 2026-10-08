# Implementation review REV-FULL-001

Reviewed 8 October 2026, Australia/Sydney. Baseline source: `9f852c23edd40dab4b33553d15a2f6d86ad35d48`; generic implementation: `6464c817d5985684f93bcbe61e034a7ea0cae486`. Producer: the AI assistant that implemented the current foundation. This is a source/check review, not an independent human security audit or production acceptance.

## Verdict

Retain the architecture. The local generic intake/triage/template foundation works, with reproducible evidence. It is not a complete AI SDLC platform: it has not delivered a software feature through an approved isolated coding/verifying/review loop. Existing engine stories remain incomplete and unaccepted as a complete increment. CMS/Drupal/AEM remain a deferred example project.

## Checks performed once, with necessary retests

| Area | Evidence / result | Practical limit |
| --- | --- | --- |
| Repository baseline | Started with clean tracked tree; source/approval/planning/CI/worker/UI reviewed | No remote PR or independent reviewer involved |
| Automated checks | [tests.log](../evidence/review-2026-10-08/tests.log): 8 reported Node test results, including the CMS parent; 7 leaf scenarios pass | This is not 8 independent end-to-end cases or a coverage measurement |
| Type checking | [typecheck-final.log](../evidence/review-2026-10-08/typecheck-final.log): pass | Does not establish behavior/security |
| Optimized build | [build.log](../evidence/review-2026-10-08/build.log): pass; app restarted against this build | Build alone cannot authorize release |
| Dependency audit | [dependency-audit.json](../evidence/review-2026-10-08/dependency-audit.json): 0 known reported advisories across 354 reported dependencies | Not application SAST/DAST or proof of no vulnerabilities |
| Historic evidence integrity | [baseline-integrity.json](../evidence/review-2026-10-08/baseline-integrity.json): all 159 indexed working-file hashes match; 77 local Markdown targets exist | No external link/anchor validation, signatures or immutable storage proof |
| Generic browser journey | [generic-pipeline-browser.json](../evidence/review-2026-10-08/generic-pipeline-browser.json): six check groups pass | Displays existing actual AI output; no fresh model call or human approval granted |
| Templates | [generic-sdlc-guide-check.json](../evidence/review-2026-10-08/generic-sdlc-guide-check.json): 10 stages/14 templates, examples, copy/download and mobile navigation pass | Not an automated accessibility audit |
| Preserved CMS | [generic-preserved-cms-browser.json](../evidence/review-2026-10-08/generic-preserved-cms-browser.json): sequential retest passes draft/publishing/role/privacy and mobile checks | Parallel shared-account failure retained and its cause unresolved |
| Persisted AI evidence | [live-state.json](../evidence/review-2026-10-08/live-state.json): current project/run context, snapshot and result hashes inspected | No repeatability benchmark, new model execution or monetary cost evidence |
| Execution ownership | [claim-probe.json](../evidence/review-2026-10-08/claim-probe.json): both DB readers see queued and both unconditional claims succeed | Diagnostic emulates separate lock roots, not two workers bypassing the same local file lock |

The review utilities write to a separate dated evidence directory to preserve earlier showcase artifacts. `review-baseline.mjs` was run before modifying existing verification scripts; its result describes that baseline, not later authorized utility changes.

## Findings, prioritized for the next build

| ID / priority | Finding and evidence | Required disposition |
| --- | --- | --- |
| REV-001 / high, blocks coding | Only analysis decisions exist. Sprint/design/code/outcome/MVP/release gates have templates/docs but no executable task eligibility chain (`src/sdlc/collections.ts`, `pipeline/actions.ts`) | Implement explicit version-bound human gates and a deterministic eligibility checker; negative tests before coding |
| REV-002 / high, blocks coding | Worker isolation/verifier isolation not qualified. Read-only discovery uses operator auth; tool detection occurs after an execution event. No available Docker/Podman runtime found | Qualify isolated code/tool execution and a separate trusted verifier with secret/path/network/process/resource tests; no dangerous bypass |
| REV-003 / high, blocks reliable execution | Local file lock is the sole ownership protection. Queue read and running update are separate, unconditional operations; two lock roots can claim a run. No durable lease/fencing/crash recovery | Transactional claim, persisted attempts, fencing, explicit uncertain state and verified termination before retry |
| REV-004 / medium, blocks controlled feedback loop | `queueTriage` selects all project inputs; superseded items are still included and batches over 100 are refused. There is no selected-version change-proposal workflow or implementation approval invalidation | Explicit scoped batches, provenance/history preservation, effective requirement revisions and dependency-driven reapproval |
| REV-005 / medium, quality gap | CI runs CMS browser checks but not generic workspace/templates. Push trigger covers `main` while local branch is `master`; no remote CI execution evidence | Align branch policy, add deterministic generic/negative checks and isolated scenario accounts, capture new evidence on success/failure |
| REV-006 / medium, reproducibility gap | Worker records CLI version but not resolved model/provider configuration, complete event/check ledger or measured cost. It is one hardcoded CLI adapter | Provider contract plus versioned task/config/attempt evidence; unavailable values explicit; benchmark repeated fixed tasks |
| REV-007 / medium, audit clarity | Historical accepted design/sprint packs still say pending; register records acceptance. Evidence archive and dedicated human-reviewer permission are incomplete | Add current-status index without rewriting reviewed bytes; implement separate permissions/trusted event storage in bounded increments |
| REV-008 / medium, usability gap | No automated/manual accessibility qualification; errors are generic and may lose entered form data; recent-history metrics are capped | Define keyboard/accessibility/error/empty/pending criteria and test them; report metric denominators/pagination explicitly |
| REV-009 / medium, investigate | CMS browser journey received 403 when run concurrently with generic checks sharing synthetic editor/admin accounts; isolated retest passes | Retain failure; investigate session behavior versus test contention with separate accounts and an intentional concurrent-login test; no unsupported root-cause claim |

These priorities describe risks to the intended next capability, not demonstrated exploits of the current local synthetic workspace. No coding/production enablement is proposed until blocking controls are implemented and accepted.

## Failure and retest record

The assistant ran an initial browser check while rebuilding the active `.next` directory. The live server reported a missing client reference manifest, and the login field timed out. [Initial attempt](../evidence/review-2026-10-08/pipeline-first-attempt.log) is retained. Restarting the completed build allowed the generic journey to pass. Build/serve/browser steps must be sequenced and separated in future verification.

The parallel shared-account CMS run returned 403 and is retained in [first attempt](../evidence/review-2026-10-08/cms-browser-first-attempt.json). [Sequential retest](../evidence/review-2026-10-08/cms-browser-retest.log) passed. This narrows the investigation; it does not prove the cause or fix a product defect.

Not run/proven: real isolated coding; crash/kill fault injection; distributed recovery; full SAST/DAST/secret/license scans; WCAG qualification; load/availability/restore tests; production secret/identity management; live Drupal/AEM migration; externally executed CI. No full story/sprint/MVP/release acceptance inferred.

Next: [BUILD-ENG-002 proposed continuation](../planning/next-build.md), [security design](../security/next-build-design.md), and [current governance status](../governance/current-status.md).

Review/source artifact identity: [manifest](../evidence/review-2026-10-08/manifest.json). The review utility changes preserve earlier evidence by writing dated outputs; application behavior was not changed in this review.
