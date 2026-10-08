# Architecture and delivery draft

## Objective

Build a headless CMS through an AI-assisted software delivery lifecycle, with a repeatable, auditable migration from Drupal and an adapter architecture for later migration from Adobe Experience Manager (AEM).

Two distinct systems are required: the CMS that editors and applications use, and the delivery pipeline that helps implement and maintain it. AI assistance should produce reviewable changes with test evidence. Production deployment and migration cutover require explicit release authorization.

## Delivery governance requirements

Treat this work as delivery by a software organisation: maintain owned, versioned documentation; retain verifiable evidence; plan dependencies and capacity; and require human review at sprint and MVP gates. Production readiness is an acceptance requirement, not a claim based on successful code generation. The current repository contains a plan only.

### Documentation and ownership

Maintain a document register with owner, status, version, review date, and links to related requirements and evidence. Cover product scope and exclusions, functional/non-functional requirements, architecture decisions, API and content contracts, threat models, security decisions, migration mappings, test strategy, operational procedures, release notes, and editor/operator guides. Update affected documents in the same change as the implementation. Supersede old decisions explicitly rather than silently rewriting history.

During discovery, assign accountable owners for product acceptance, project delivery, engineering, security review, operations, and release authorization. One person may hold several roles, but the AI runner cannot approve its own work. Maintain a responsibility matrix, stakeholder/review schedule, and change-control process for scope, schedule, cost, and risk decisions.

### Audit evidence and traceability

Assign stable IDs to requirements, epics, stories, acceptance criteria, findings, decisions, migration runs, releases, and approvals. Maintain the traceability chain: requirement -> story -> accepted design -> implementation commit/PR -> tests and security results -> sprint/MVP review -> release artifact -> deployment and reconciliation evidence.

Each evidence record includes its ID, purpose, timestamp with timezone, producer or reviewer identity, tool/configuration version where applicable, source commit or design version, outcome, and artifact location/checksum. Record failed checks, exceptions, remediation, and retests as well as passes. A summary without its supporting artifacts is insufficient evidence.

Keep authoritative evidence in access-controlled durable storage with version history and a defined retention policy. Use append-only or immutable storage for release evidence and approval events; repository documents may index those records. Redact secrets and unnecessary personal/source data. Export a release evidence index so a reviewer can reproduce checks and follow links without relying on chat history. Human approvals must identify the reviewed scope/version and decision; subsequent material changes require renewed review.

### Project, sprint, and story planning

Maintain a project charter, phased roadmap, milestone acceptance criteria, prioritized backlog, dependency map, capacity assumptions, risk/issue/decision registers, and forecast. Estimate after source discovery and revise forecasts using actual throughput and scope changes. Document uncertainty rather than committing to unsupported dates. Prefer two-week sprints initially; confirm cadence and available human review capacity during kickoff.

Each story includes an ID, user/business outcome, linked requirements, scope/exclusions, acceptance criteria, dependencies, estimate, owner, security/data implications, test and evidence expectations, demo scenario, and completion criteria. Split stories into reviewable increments. A story is ready only when dependencies and acceptance criteria are understood and its applicable design security review is accepted. A story is done only when code review, applicable code security review, tests, documentation, and evidence are complete.

Before each sprint starts, present its goal, selected stories, capacity, dependencies, risks, and acceptance/demo plan for human review and explicit approval. At sprint end, present delivered versus planned work, demonstrations, unresolved findings, evidence links, and the proposed carryover/replan. Require explicit human approval of the sprint outcome after review. Record rejected or incomplete work without counting it as accepted delivery.

The next sprint cannot start until the previous sprint outcome and the next sprint plan are approved. No response or elapsed time counts as approval. While approval is pending, prepare review materials and proposed plans; do not start dependent implementation. Store these gates separately from security and release decisions.

### MVP showcases

Define an MVP as a demonstrable increment with agreed user outcomes, acceptance criteria, representative data, and its own review gate. Proposed increments are MVP 1: editor-to-published-API vertical slice with a Drupal sample; MVP 2: migration workflow with media, references, restart and reconciliation; MVP 3: complete required editorial workflows and production rehearsal. Define a later AEM MVP separately after its source assessment. Adjust boundaries through approved planning rather than equating every phase with an MVP automatically.

After every MVP, provide a runnable staging demonstration or reproducible walkthrough, test accounts where appropriate, representative synthetic or approved data, a scripted user journey, evidence links, known limitations, and an acceptance checklist. Show failure/permission behavior as well as the successful path. Human review produces an explicit accept, accept with documented conditions, or reject decision. Conditions need owners and deadlines and must not bypass security or production gates. Block dependent MVP work until acceptance and any prerequisite conditions are satisfied.

### Meaningful reporting

For every sprint, MVP, and release, lead with outcomes, readiness, material risks, and decisions needed. Report planned/completed/accepted stories, scope changes, blocked work and age, defects by severity, security findings and retest status, test results and coverage of acceptance criteria, and forecast changes. Include dates, denominators, data sources, and trends when available; mark unavailable measurements explicitly.

Migration reports include extracted, excluded, imported, updated, skipped, rejected, and reconciled counts by entity type; unresolved references; verified media; publication/privacy mismatches; runtime and throughput; and restart/re-import results. Define non-overlapping count categories and reconciliation equations per run so totals can be explained. Report production performance against agreed workloads and targets. Do not use generated code volume or model confidence as a delivery quality measure.

Each review pack contains a concise executive summary, acceptance checklist, supporting metric table, evidence index, outstanding risks/issues, and explicit requested decisions. Preserve the detailed artifacts behind the summary.

### Production-ready definition of done

Discovery must set measurable availability, latency/throughput, capacity, recovery time and recovery point, accessibility, and support targets appropriate to the intended service. Before production acceptance, demonstrate:

- Accepted functional requirements and editor/API journeys, including authorization and private-content behavior.
- Valid design and code security decisions for the deployed artifact, with all blocking findings resolved or handled under the recorded exception policy.
- Repeatable builds and deployments, versioned database migrations, environment configuration and secret management, and rollback compatibility.
- Load/performance evidence against agreed workloads and thresholds, and tested resource limits and failure handling.
- Approved Drupal reconciliation and cutover rehearsal; later AEM release uses equivalent source-specific evidence.
- Monitoring, actionable alerts, audit logs, dashboards, support ownership, and incident response procedures.
- Tested backup restoration and recovery against agreed targets, including database and media consistency.
- Current API/editor/operator documentation, release notes, dependency/license inventory, and release evidence index.
- Human acceptance of the final MVP, sprint outcomes, operational handover, and explicit production release authorization.

An MVP may be reviewed in staging before these final gates pass; label its readiness accurately. No prototype or incomplete increment may be presented as production ready.

## Recommended stack

See [AI SDLC industry research](research/ai-sdlc-industry-research.md), researched on 8 October 2026, for adoption evidence, implementation patterns, limitations, and the proposed tool pilot. Adopt structured specifications, bounded agent tasks, persistent progress, deterministic CI, and accountable human review. Select the initial coding tool after a representative pilot; survey popularity alone does not establish suitability or production readiness.

Recommendation: build on Payload with TypeScript and PostgreSQL, rather than implement the entire CMS engine from scratch. This is a starting recommendation, subject to a proof of concept against the Drupal inventory. Payload documents support for [PostgreSQL](https://payloadcms.com/docs/database/postgres) and [versions and drafts](https://payloadcms.com/docs/versions/overview), which address core requirements here.

| Component | Proposed choice | Reason |
| --- | --- | --- |
| CMS and editor interface | Payload with its Next.js application | Extend an established content platform and editor UI |
| Application and migration language | TypeScript | Share model definitions and validation across the CMS and importer |
| Database | PostgreSQL | Store content relationships, provenance, and migration checkpoints |
| Media | S3-compatible object storage | Keep media independent of application containers |
| Import execution | Separate containerized TypeScript worker | Keep long-running imports outside HTTP requests |
| Tests | Unit/integration tests plus Playwright editor journeys | Verify transformations, API permissions, and publishing behavior |
| Delivery | GitHub Actions if the repository is hosted on GitHub | Run checks, build artifacts, and promote through environments |
| Hosting | Managed container service, managed PostgreSQL, object storage | Minimize infrastructure work; select cloud after budget and residency discovery |
| AI task runner | Provider-neutral adapter invoking a coding agent in an isolated checkout | Keep task contracts independent of a particular model vendor |

Pin supported runtime and dependency versions when implementation begins. Start with CMS, importer, and pipeline automation in one repository. Do not introduce a separate workflow platform or distributed agent framework until execution volume warrants it.

GitHub documents [deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) for approval and secret controls. Verify repository-plan support for the chosen protection rules; use the hosting platform's release authorization if necessary.

## Confirmed scope and decisions to resolve

The first deliverable is architecture and a phased implementation plan. The source is described as latest Drupal, but the installed version is unknown. Do not infer the installed version from the [Drupal release list](https://www.drupal.org/project/drupal/releases); record the site's actual version during discovery.

- Deliverable: architecture first or an executable starter.
- Source: Drupal version, database access, API access, custom modules, content volume, languages, and media storage.
- Migration scope: content, revisions, media, taxonomy, users, permissions, aliases, redirects, and publishing workflows.
- Destination: preferred stack, hosting, identity provider, and operational constraints.
- Product scope: one site or multiple tenants, editor experience, API consumers, search, and availability expectations.
- Build versus extend: determine whether an existing CMS satisfies the requirements before committing to a custom platform.

## CMS responsibilities

The initial product should support:

- Content types with typed fields, validation, references, and localization.
- Drafts, revisions, publishing, scheduling, and editorial permissions.
- Media metadata and storage, including alternative text and access controls.
- Taxonomy and relationships between content items.
- Authenticated management APIs and a delivery API that exposes only published, authorized content.
- An editor interface, audit history, webhooks, and API documentation.
- Legacy URL aliases and redirects where required by consuming applications.

Separate content storage, media storage, identity, API delivery, and background jobs. Add search only when product requirements justify it. Treat schema changes as versioned migrations and maintain stable public content identifiers.

## AI-assisted SDLC

Use repository artifacts as the source of truth. Each work item moves through these stages:

| Stage | AI-assisted output | Required evidence |
| --- | --- | --- |
| Discovery | Requirements, source inventory, open questions | Confirmed scope and acceptance criteria |
| Design | Architecture decisions, API contracts, threat analysis | Reviewed design and implementation boundaries |
| Design security review | Threat model, access matrix, control requirements, design findings | Accepted design security decision before implementation of the affected scope |
| Planning | Small work items with dependencies | Each item has observable acceptance criteria |
| Implementation | Branch changes and focused tests | Diff, rationale, and reproducible local checks |
| Verification | Test results and findings | Build, lint, relevant tests, security and dependency checks |
| Review | Proposed change summary | Review of behavior, permissions, and migration effects |
| Code security review | Source/configuration review, scan results, security tests, remediation evidence | Accepted code security decision tied to the reviewed commit before merge and release |
| Release | Versioned artifacts and release notes | Staging validation and release authorization |
| Operations | Failure analysis and proposed fixes | Logs, metrics, regression evidence, and rollback procedure |

The orchestrator should accept a work item, load approved requirements and repository guidance, invoke a bounded implementation task, run deterministic checks, and return a reviewable change. Failed checks return the item for correction with a retry limit. Unresolved failures stop promotion and retain evidence.

Agent execution should have limited credentials and isolated working directories. Source content, issue text, and imported files are untrusted input, not agent instructions. Do not expose production secrets or use unrestricted production write access during implementation. Record task identifiers, model configuration, changed files, check results, and approval decisions without logging secrets or private content unnecessarily.

Start with sequential tasks. Add parallel execution only after work ownership, dependency ordering, and integration checks are defined.

## Security review

Security review has two sequential gates: design security review before implementing the affected scope, then code security review before merging that implementation and promoting it to production. Repeat both gates for the later AEM adapter. AI can identify risks and propose fixes; a designated human security reviewer owns triage and approval. Assign that role during discovery.

### Gate 1: Design security review

Review architecture decisions, data flows and trust boundaries, authentication and authorization, content publication rules, media access, migration credential scopes, data retention, AI isolation, and deployment controls. Identify abuse cases and define testable security requirements before code is written.

Inputs are the versioned design, threat model, role/field access matrix, API contracts, and adapter capability/mapping proposals. Outputs are design findings, required control changes, security acceptance criteria, and a recorded design review decision. Blocking findings return the design for revision. Implementation tasks must reference the accepted design version and its security requirements.

### Gate 2: Code security review

After implementation and automated verification, review the actual source diff, CMS configuration, migration transformations, infrastructure/deployment configuration, and dependency changes against the accepted design. Combine manual review with static analysis, secret/dependency/container scans, and relevant negative authorization, input-handling, and staging security tests from the matrix below.

Outputs are code findings, remediation commits, retest evidence, and a recorded code review decision tied to the exact reviewed commit and applicable build artifact. Blocking findings return the change for remediation and re-review before merge or release. Material changes after approval require review of the affected code; changes to trust boundaries or controls return to design security review first. At release, verify that the reviewed commit/artifact is the one being deployed and that both gate decisions remain valid.

### Shared review scope and findings policy

Create a threat model showing the editor interface, public and management APIs, database, object storage, migration staging, source systems, AI runner, and CI/CD trust boundaries. Classify sensitive content and identity data, document credential scopes, and specify retention and deletion for exports, logs, backups, and AI inputs.

| Review area | Required checks and evidence |
| --- | --- |
| CMS access | Role and field permission matrix; negative tests for draft/revision exposure, unauthorized edits and publishing, and cross-tenant access if tenancy is introduced |
| Identity and APIs | Authentication/session review, administrator MFA strategy, token expiry and revocation, CSRF protection for cookie-authenticated changes, CORS configuration, request validation, and rate/resource limits |
| Content and media | Stored-XSS tests for imported rich text and previews; upload type/size validation; private asset access checks; malicious-file handling and restricted serving policy |
| Drupal and AEM adapters | Read-only source credentials where possible; approved source endpoints; SSRF checks for fetched assets and redirects; path traversal and archive checks; import size limits; permission and publication mappings that do not grant access by default |
| Migration data | Restricted staging, encrypted transport/storage, redacted reports, credential separation between extraction and loading, and verification that private source content remains private after import |
| AI task runner | Prompt-injection scenarios using imported content; isolated execution and scoped network/tool access; secret protection; synthetic/redacted inputs; owner review of agent changes to permissions or pipeline controls |
| Dependencies and delivery | Secret scanning, static analysis, dependency and container vulnerability checks, restricted CI credentials, protected review controls, and traceability from reviewed commit to deployed artifact |
| Operations | Deployment configuration review, audit coverage, safe error responses, alert ownership, tested credential rotation and backup recovery, and an incident response runbook |

Automated checks run on pull requests; use an isolated staging environment with synthetic or approved data for dynamic testing. Manual review covers authorization design, business workflows, and adapter semantics that scanners cannot establish. Retest fixes against the same affected behaviors.

Record findings with review type (design or code), severity, affected component, design version or commit, reproduction or abuse-case evidence, owner, remediation, and verification status. Keep sensitive exploit details and data out of public reports. Critical and high findings block the applicable gate until fixed and verified, or explicitly accepted by the accountable security and release owners with rationale, compensating controls, and an expiry date. Track lower-severity findings with owners and due dates. The AI runner cannot approve an exception or its own security review.

Security artifacts: threat model, access matrix, separate design and code review decisions, test/scan reports tied to the release commit, and a findings register. Phase 1 requires design security acceptance; phases 2–4 require code security acceptance for implementation changes and design re-review where needed; phase 5 verifies both decisions for release; phase 6 repeats both reviews for AEM before its cutover. These gates apply to the exit criteria of every corresponding delivery milestone below.

## Migration adapter architecture

Define a source adapter contract during design and implement the Drupal adapter first. Add an AEM adapter in a later phase after the Drupal migration is production-ready.

```text
Drupal adapter -> Versioned intermediate records -> Shared mapping, validation, and CMS loader
AEM adapter    -> Versioned intermediate records -> Same shared pipeline (later phase)
```

Each source adapter owns connection configuration, capability discovery, schema and entity inventory, paginated extraction, asset retrieval, and source-specific normalization. It emits records with source system, source instance, entity type, stable source identifier, locale, references, source hash, and available revision/publication metadata. Preserve unmapped source metadata in restricted staging for analysis.

Declare capabilities explicitly, including revisions, publication state, incremental extraction, and deletion detection. An unsupported capability must produce a documented limitation; the pipeline must not silently assume parity between sources. Checkpoints are scoped to adapter version, source instance, extraction configuration, and snapshot or cursor.

The shared migration core owns mapping manifests, destination validation, ID mappings, dependency resolution, retries, import checkpoints, and reconciliation. Source adapters must not write directly to destination collections. Include source system and instance in provenance keys so Drupal and AEM identifiers cannot collide.

Use adapter contract tests with synthetic fixtures to verify pagination, stable identity, asset references, capability reporting, and restart behavior. Retain source-specific tests for normalization. This keeps AEM extraction changes independent of the CMS loader.

### Later AEM assessment and adapter

First confirm the AEM edition, version, available APIs or exports, permissions, and migration scope. Assess content fragments and their models, pages and component content, assets and metadata, tags, language variants, references, versions, publishing state, and URL mappings against a representative source sample. Select the extraction method only after that assessment.

Define mappings to the common intermediate schema and target content models. Page components and presentation behavior require explicit decisions about structured content extraction and frontend rebuilding. Record unsupported behavior and manual remediation work. Assess workflows, users, permissions, and integrations separately rather than assuming they transfer with content.

Deliver an AEM proof of concept before estimating a full migration. Its acceptance gate is a representative import through the shared loader with resolved references, verified assets, repeatable execution, and an approved reconciliation and exception report. Apply the same rehearsal, cutover, and rollback requirements used for Drupal.

## Drupal migration

### Discover and map

Inventory source content types, fields, relationships, revisions, languages, taxonomy, media/files, aliases, publishing states, users, and custom module behavior. Capture counts by entity type and publication state. Determine the extraction method after confirming the Drupal version and available access.

Create a reviewed mapping manifest from source entities and fields to destination models. Specify conversions, defaults, unsupported fields, rich-text handling, reference behavior, and rejected-record policy. Preserve Drupal identifiers as provenance rather than assuming source IDs can become destination IDs.

### Extract, transform, and load

Use a staged pipeline:

1. Extract source records and files into a restricted staging area with checksums and a run manifest.
2. Transform records into a versioned intermediate format and validate them against destination schemas.
3. Import foundational entities such as taxonomy and identity mappings, then content and media according to dependencies.
4. Resolve references in a separate pass so cyclic relationships do not require import ordering tricks.
5. Import aliases, redirects, revisions, and workflow state according to the approved scope.
6. Reconcile the destination against the extraction manifest and generate an exception report.

Maintain a mapping keyed by source site, entity type, source ID, and language where applicable. Re-running an import must update or skip mapped records without duplication. Track completed checkpoints, retries, rejected records, and source hashes. Define how retries interact with content edited in the destination.

Do not assume rich text, embedded media, or custom module behavior transfers automatically. Treat password migration and identity linking as separate decisions after inspecting source and destination authentication compatibility.

### Validate and cut over

Validate counts, required fields, references, media checksums, languages, publishing state, representative rendered content, and legacy URLs. Count reconciliation must account for explicitly excluded and rejected records. Repeat a migration run to demonstrate idempotency and test restart after an interrupted import.

Rehearse against a disposable destination before production. Choose a source editing freeze or a verified delta migration strategy. Delta migration must account for deletions as well as changes. Back up both systems, run the final import, validate, and switch API consumers or routing only after acceptance checks pass.

Rollback must account for writes made after cutover. Define whether destination editing is paused during the rollback window and how any new changes would be recovered.

## Delivery milestones

1. Discovery: confirmed requirements, Drupal inventory, stack decision, and build-versus-extend decision.
2. Vertical slice: one content type, draft/publish behavior, editor access, delivery API, and a small Drupal sample import.
3. Migration foundation: mapping manifests, provenance, resumable jobs, validation reports, and media handling.
4. Product expansion: required localization, revisions, permissions, taxonomy, webhooks, and editor features.
5. Production readiness: automated delivery checks, security review and remediation, staging rehearsal, observability, recovery exercise, and cutover runbook.
6. Later AEM migration: source assessment, adapter proof of concept, approved mappings, and a separately scoped migration rollout.

Each phase has an exit gate:

| Phase | Concrete artifacts | Exit gate |
| --- | --- | --- |
| 1. Discovery and design | Source inventory, field mappings, architecture decision records, prioritized backlog, threat model and access matrix | Representative source export available; custom-module behavior understood; stack proof of concept accepted; security reviewer and requirements assigned |
| 2. Vertical slice | Payload app, initial content model, draft/publish permissions, sample importer, CI checks | An imported record can be edited and published; draft access tests pass |
| 3. Migration foundation | Extraction adapters, intermediate schema, media transfers, ID maps, checkpoints, reconciliation report | Repeated and interrupted imports pass; missing references are reported; sample media verified |
| 4. Product expansion | Required models, languages, workflows, editor journeys, API contracts | Approved representative content and workflows pass end-to-end tests |
| 5. Production readiness | Deployment artifacts, security review decision and findings register, staging rehearsal report, backup/restore evidence, cutover and rollback runbooks | Security release gate satisfied; reconciliation accepted; recovery demonstrated; release authorized |
| 6. AEM adapter and migration | AEM inventory, capability matrix, adapter, mappings, representative import, exception report, security review, rollout runbook | Adapter contract tests pass; sample reconciles; presentation gaps accepted; AEM security gate satisfied before cutover; full migration separately scoped |

Estimate delivery dates after phase 1. Content volume, custom modules, multilingual revisions, and identity requirements can materially change migration effort.

## Proposed repository layout

```text
apps/cms/                 Payload configuration, editor UI, API
apps/migration/           Extraction, transformation, import worker
packages/content-model/  Shared schemas and validation
packages/migration-core/ Adapter contracts, provenance, mappings, run manifests
packages/adapter-drupal/ Drupal extraction and normalization
packages/adapter-aem/    Later AEM extraction and normalization
automation/              Task contracts and AI runner integration
docs/requirements/       Accepted requirements and acceptance criteria
docs/research/           Dated industry evidence, source register, tool evaluation and limitations
docs/governance/         Ownership, document register, approval and change-control policies
docs/planning/           Charter, roadmap, backlog, sprint plans, risks and forecasts
docs/reviews/            Sprint/MVP review packs and approval evidence references
docs/evidence/           Traceability matrix and durable artifact indexes
docs/decisions/          Architecture decisions
docs/security/           Threat model, access matrix, findings, separate design/code review decisions
docs/runbooks/           Migration, release, recovery procedures
.github/workflows/       Checks and release workflows, if using GitHub
```

## Pipeline task contract

Every AI task must contain a requirement ID, allowed scope, dependencies, acceptance criteria, check commands, and a maximum retry budget. Its result includes a branch or patch, tests and their results, unresolved findings, and a proposed review summary. The orchestrator persists task status so interrupted execution can resume without creating duplicate changes.

Suggested task states: queued, running, checking, awaiting review, accepted, failed. A successful model response alone does not mark a task accepted. Deterministic checks and the applicable review gate must pass. Changes to pipeline permissions or release controls require owner review.

Implementation tasks also reference the accepted design security decision and control requirements. Track design and code security gate status separately from general review status. The orchestrator must block implementation when design acceptance is missing, and block merge/release when code acceptance is missing or no longer applies to the current commit.

Also enforce separate sprint-plan approval, sprint-outcome approval, MVP acceptance, and production release authorization states. Link each to the exact reviewed plan, outcome, or artifact. The runner must not infer approval from silence, automatically mark a human decision accepted, or start a subsequent sprint while its approval dependencies are outstanding. Task results include updated documentation and requirement-to-evidence links so review packs can be assembled from actual records.

Use AI to propose Drupal field mappings and explain exceptions. Keep approved mappings and actual imports deterministic: the same source snapshot and mapping version should yield the same transformed records. Send synthetic or redacted samples to the AI runner by default.

## First implementation acceptance criteria

- An editor can create a draft and publish it; an anonymous API consumer cannot retrieve the draft.
- A representative Drupal content sample imports with its required fields and provenance.
- Re-importing the same sample produces no duplicate records.
- Missing references and invalid records appear in an actionable report.
- Repository checks run reproducibly and block promotion on failure.
- Security checks run in CI; negative authorization tests cover draft access and unauthorized publishing, and security findings have recorded owners and disposition.

This is an architecture recommendation, not an implemented system. The precise runtime versions, cloud provider, AI provider, and Drupal extraction adapter remain pending discovery.
