# AI SDLC template library

Use these templates in order through [the browser guide](http://127.0.0.1:3000/sdlc). AI prepares drafts and proposed changes; accountable humans make approval decisions. Filled examples in the guide are illustrative, not evidence of completed checks or approval.

Copy a template into the appropriate requirements/planning/security/reviews/evidence directory, replace placeholders, assign a stable ID and owner, link its dependencies, and version it before review. Never change pending to accepted without a recorded human decision bound to the reviewed version.

| Stage | Template |
| --- | --- |
| Discovery | [Project charter](project-charter.md), [Requirement](requirement.md) |
| Design | [Architecture decision](architecture-decision.md) |
| Design security | [Design security review](design-security-review.md) |
| Planning | [Story](story.md), [Sprint plan](sprint-plan.md) |
| Implementation | [AI task](ai-task.md) |
| Verification | [Verification report](verification-report.md), [Evidence record](evidence-record.md), [Migration run](migration-run.md) |
| Code security | [Code security review](code-security-review.md) |
| Sprint / MVP review | [Sprint and MVP review](sprint-mvp-review.md) |
| Release | [Production release](production-release.md) |
| Operations | [Incident and recovery](incident-recovery.md) |

Traceability: requirement -> story -> accepted design -> approved sprint -> task/change -> checks -> code-security decision -> sprint/MVP decision -> release artifact -> deployment/operations evidence. A passing check is not a human acceptance decision.
