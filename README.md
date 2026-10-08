# Headless CMS with an AI-assisted SDLC

This repository contains a local Payload/PostgreSQL CMS MVP with editorial roles, a public delivery API, and a synthetic Drupal-style importer. A shared adapter design supports later live Drupal and Adobe Experience Manager (AEM) migration. Production readiness and human code/outcome acceptance remain pending.

See [the architecture and delivery plan](docs/architecture-and-delivery.md).

See [the AI SDLC industry research](docs/research/ai-sdlc-industry-research.md) for current adoption evidence, implementation patterns, and project recommendations.

Explore the [AI SDLC and templates](http://127.0.0.1:3000/sdlc): ten lifecycle stages, AI/human responsibilities, and fourteen templates with illustrative CMS examples, copy and Markdown downloads. Source templates are in [docs/templates](docs/templates/README.md). The guide does not run agents or record approvals.

Delivery requirements include organisation-level documentation, traceable audit evidence, project and story planning, human approval of every sprint plan and outcome, MVP showcases, meaningful reporting, and demonstrated production readiness.

Start with the [local setup and demo guide](docs/runbooks/local-mvp.md) and [Sprint 1 outcome review](docs/reviews/sprint-1-outcome.md). The [baseline review pack](docs/reviews/baseline-review.md) records planning scope and criteria.

```powershell
npm ci
npm run setup
npm run db
```

Keep the database terminal running. In another terminal run `npm run seed`, `npm run import:demo`, then `npm run dev`. Open http://127.0.0.1:3000/admin; random local account credentials are in ignored `.local/demo-credentials.json`.
# AI delivery workspace

Open [Delivery Studio](http://127.0.0.1:3000/pipeline) for the actual requirement/review/feedback intake and AI triage workflow. Administrator sign-in is required. [Operator guide](docs/runbooks/ai-sdlc-local.md) covers queueing, `npm run sdlc:worker`, evidence and recovery. The template explorer remains available at `/sdlc`.

This is an in-progress engine increment. Read-only triage is implemented; coding execution stays blocked until an isolated worker and verifier are qualified. Analysis acceptance does not approve implementation, sprint completion, security or production release.
