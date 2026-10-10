# Selected Codex trial: authentication preflight

Source `build/codex-trial-preflight`:
`2e98f5921b6d0cdf3456ebaf06fed4d7963cc032`.

The user selected Codex with subscription-only usage, no additional API charges,
one initial attempt and at most two repairs. Provider choice and trial ceiling are
now resolved; they must not be reported as unanswered in subsequent work.

Local metadata preflight passed for CLI 0.155.1, reporting ChatGPT authentication.
The safe fixed-field report is retained as `local-preflight.json` under
`docs/evidence/codex-trial-preflight`. Three new policy tests passed locally:
subscription metadata cannot enable inference; API/mixed/unknown auth and version
changes deny; missing capabilities and oversized diagnostics deny. These tests
are included in the existing platform recovery check step.

[Platform run 38043709512](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38043709512)
passed the thirteen recovery/policy tests, integration, audit, production build,
browser journeys and cleanup. Public run identity and step results are retained
as `platform-run.json`. No Codex account or inference was used in CI.

The adapter is not yet qualified. No model call or generated patch exists. The
metadata preflight cannot establish complete tool disablement, host isolation,
account billing policy, cancellation or durable attempt accounting. It therefore
always returns modelCallAllowed=false and toolBoundaryQualified=false.

Official OpenAI documentation excludes saved-user-account authentication in public
repository CI. This repository is public, so credentials remain local and must
not be copied to CI. Only validated synthetic candidate bytes may go to the
isolated verifier. See `docs/security/codex-subscription-trial.md` for the precise
remaining adapter controls and official sources checked using OpenAI Docs.

Existing engine execution/retry gates remain disabled; the separate synthetic
fixture is still unimplemented. Human exact-task/code-security/outcome/MVP decisions
are not manufactured by this checkpoint. Local app remains stopped; no startup
or alternative launcher was attempted.
