# Sprint SP-001 v1: synthetic Drupal vertical slice

Status: implementation authorized by chat user on 8 October 2026; outcome/MVP/code-security acceptance pending. See governance register APP-SP-001 and APP-DES-001. Proposed cadence: two weeks; calendar capacity unconfirmed. Scope: 13 relative points, a provisional ceiling rather than a velocity-based commitment. Implementation: AI-assisted engineering; human product/security review: chat user; production operations/release owners remain unassigned.

Goal: demonstrate an imported synthetic article moving through edit, draft, and publish with public/private access enforced and audit evidence attached. MVP 1 accepts this bounded slice, not real-source migration or production readiness.

| Story | Outcome / scope | Criteria | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| ST-001 | Reproducible local Payload/PostgreSQL environment and documented checks | Clean setup follows instructions; versions pinned; configuration example contains no secrets; build/check reports retained | BL-001 and design approval | 3 |
| ST-002 | Article model, editor/publisher roles, publication/privacy rules | AC-001/002; anonymous direct/list/nested queries cannot reveal drafts/private records; editors cannot self-promote or publish | ST-001 | 5 |
| ST-003 | Synthetic adapter and small article import | AC-003/004/005; happy-path 2 records import; duplicate rerun creates zero; invalid/missing-reference records rejected; edited destination conflicts reported | ST-002 and fixture SYN-001 | 3 |
| ST-004 | MVP 1 demonstration and reproducible review evidence | AC-010/012; script shows import/edit/publish/denied access/re-import; docs, check outputs and code review decision linked | ST-001..003 | 2 |

All stories exclude live source access, production deployment, password transfer and AEM implementation. ST-003 handles only the article slice; media streaming, full references/localization and resume are MVP 2. If scope exceeds capacity, propose a revised sprint plan before changing the commitment.

## Story execution contracts

ST-001 changes environment/configuration and setup documentation; demonstrate a clean start. ST-002 changes CMS models/access logic; use synthetic accounts and API/editor negative tests. ST-003 changes adapter/loader behavior and mapping documentation; preserve provenance, classify each input once, retain errors, and avoid widening source access. ST-004 prepares demonstration/review records and cannot fabricate earlier evidence or grant approval.

For each story record owner, implementation commit/PR, design requirements, commands/configuration, actual outputs, failures/retests and reviewer decision. Ready: criteria/dependencies understood, design accepted, sprint approved. Done: behavior verified, docs/evidence updated, code and code-security reviews accepted. Retry limit: two correction cycles per failed automated task, then report failure for replanning; never weaken acceptance tests to claim success.

## Demo and outcome review

Use fixture SYN-001; show public published article, hidden draft/private content, editor-to-publisher journey, repeated import and actionable reject/conflict report. Record planned versus completed versus accepted stories, test results by criterion, security findings, elapsed/active/review time, spend when available, and forecast impact.

Gates: sprint plan APP-SP-001 pending; design APP-DES-001 pending; later code decisions per reviewed commit pending; sprint outcome APP-OUT-001 pending; MVP acceptance APP-MVP-001 pending. Human reviews the completed demo and evidence before accepting the sprint and MVP. Sprint 2 waits for those outcomes and its own approved plan. Release authorization is a separate later gate.
