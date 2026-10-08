# Delivery Studio: generic AI SDLC

Delivery Studio is a project-independent AI SDLC platform. It accepts requirements, review suggestions and showcase feedback, runs actual AI intake analysis and preserves human review decisions. Product objectives and constraints come from a versioned [project profile](projects/README.md), not hardcoded CMS or migration instructions. The local platform currently supports one active project profile at a time.

The existing CMS MVP, Drupal fixture and migration plans are preserved as a deferred example project. Its public preview is at `/cms`; [its optional profile](projects/examples/headless-cms.json) can be activated later. The generic homepage is at `/`, delivery workspace at `/pipeline`, and template explorer at `/sdlc`. Production readiness and the full coding runner remain pending.

See [the architecture and delivery plan](docs/architecture-and-delivery.md).

See [the AI SDLC industry research](docs/research/ai-sdlc-industry-research.md) for current adoption evidence, implementation patterns, and project recommendations.

Explore the [AI SDLC and templates](http://127.0.0.1:3000/sdlc): ten lifecycle stages, AI/human responsibilities, and fourteen templates with generic project examples, copy and Markdown downloads. Source templates are in [docs/templates](docs/templates/README.md). The guide links to the actual delivery workspace; the guide itself does not execute agents or record approvals.

Delivery requirements include organisation-level documentation, traceable audit evidence, project and story planning, human approval of every sprint plan and outcome, MVP showcases, meaningful reporting, and demonstrated production readiness.

Start with the [generic platform operator guide](docs/runbooks/ai-sdlc-local.md) and [project configuration guide](projects/README.md). Earlier CMS planning/review packs remain preserved historical records.

```powershell
npm ci
npm run setup
npm run db
```

Keep the database terminal running. In another terminal run `npm run seed`, then `npm run dev`. Open http://127.0.0.1:3000/pipeline; random local account credentials are in ignored `.local/demo-credentials.json`. `npm run import:demo` is optional and belongs to the deferred CMS example.
# AI delivery workspace

Open [Delivery Studio](http://127.0.0.1:3000/pipeline) for the actual requirement/review/feedback intake and AI triage workflow. Administrator sign-in is required. [Operator guide](docs/runbooks/ai-sdlc-local.md) covers queueing, `npm run sdlc:worker`, evidence and recovery. The template explorer remains available at `/sdlc`.

This is an in-progress engine increment. Read-only triage is implemented; coding execution stays blocked until an isolated worker and verifier are qualified. Analysis acceptance does not approve implementation, sprint completion, security or production release.
