# Headless CMS with an AI-assisted SDLC

This repository contains a local Payload/PostgreSQL CMS MVP with editorial roles, a public delivery API, and a synthetic Drupal-style importer. A shared adapter design supports later live Drupal and Adobe Experience Manager (AEM) migration. Production readiness and human code/outcome acceptance remain pending.

See [the architecture and delivery plan](docs/architecture-and-delivery.md).

See [the AI SDLC industry research](docs/research/ai-sdlc-industry-research.md) for current adoption evidence, implementation patterns, and project recommendations.

Delivery requirements include organisation-level documentation, traceable audit evidence, project and story planning, human approval of every sprint plan and outcome, MVP showcases, meaningful reporting, and demonstrated production readiness.

Start with the [local setup and demo guide](docs/runbooks/local-mvp.md) and [Sprint 1 outcome review](docs/reviews/sprint-1-outcome.md). The [baseline review pack](docs/reviews/baseline-review.md) records planning scope and criteria.

```powershell
npm ci
npm run setup
npm run db
```

Keep the database terminal running. In another terminal run `npm run seed`, `npm run import:demo`, then `npm run dev`. Open http://127.0.0.1:3000/admin; random local account credentials are in ignored `.local/demo-credentials.json`.
