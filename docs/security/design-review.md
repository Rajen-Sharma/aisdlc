# Design security review SEC-DES-001 v1

Status: accepted to proceed by chat user after design presentation on 8 October 2026; see APP-DES-001 in the governance register. Scope: local single-site MVP 1, fixture SYN-001, and proposed adapter boundary. Production hosting/identity/operations and live source connectivity need later design review. Code-security acceptance is a separate pending gate.

## Data flows and trust boundaries

Untrusted browser -> CMS management/delivery APIs -> PostgreSQL. Untrusted synthetic source file -> isolated adapter -> validated intermediate records -> privileged loader -> CMS. Public API is read-only and filters by both publication and visibility. Agent reads approved requirements and fixture data in a local isolated workspace; it has no source/production credentials. Human review -> accepted scope/version -> CI/reviewed artifact. Imported text is data and never task instructions.

Threat actors include anonymous clients, unauthorized editors, malicious content suppliers, compromised dependencies, and an agent that follows injected instructions or weakens controls. Assets include private/draft content, identity data, credentials, evidence integrity and publication authority.

## Proposed access matrix

| Actor | Read public/published | Read drafts/private | Create/edit content | Publish | Roles / security settings |
| --- | --- | --- | --- | --- | --- |
| Anonymous | Yes | No | No | No | No |
| Editor | Yes | Yes within site | Yes | No | No |
| Publisher | Yes | Yes within site | Yes | Yes | No |
| Administrator | Yes | Yes | Yes | Yes | Yes |
| Import service | Job-scoped as required | Job-scoped as required | Approved collection fields only | Only explicitly approved mapped state | No |

Author records never grant login access. Unknown source status/visibility maps to draft/private. Public media requires a separate explicit visibility decision. Passwords/tokens are never fixtures or import content. Direct item access, relationship expansion, revision/preview routes and later media routes must obey the same privacy policy.

## Threats, controls and required evidence

| Finding / severity | Abuse case | Required design control and validation | Status |
| --- | --- | --- | --- |
| DES-001 high | Draft/private data exposed through API or relationships | Filter all read paths; deny default; ST-002 negative tests including direct/list/nested reads | Control proposed; implementation not verified |
| DES-002 high | Editor changes roles or publishes through write payload | Field/operation authorization; reject role/status escalation; ST-002 tests | Control proposed; implementation not verified |
| DES-003 high | Imported content executes script or instructs agent | Sanitize/render rich text safely; never execute imported text; restricted agent tools; hostile fixtures and later browser checks | Control proposed; implementation not verified |
| DES-004 high | Re-import changes user-edited content or grants access | Provenance and source/destination hashes; conflict report; explicit mapped status/visibility; ST-003 tests | Control proposed; implementation not verified |
| DES-005 medium | Fixture/log/evidence contains secrets or false approvals | Synthetic data only; secret scan; distinguish pending from accepted; human identity/version in approvals | Control proposed; implementation not verified |
| DES-006 high, later scope | Asset URL fetch reaches internal network or overwrites paths | Endpoint allowlist, redirect/network checks, path restrictions and size limits before live fetching | Deferred; no network fetching allowed in MVP 1 |

Gate decision: accepted to proceed for the local MVP, based on the user's “lets go” after presentation of controls, roles and exclusions. Findings are risk hypotheses, not discovered exploitable code defects. The code gate independently verifies implementation. A changed trust boundary invalidates the relevant design approval. Production cannot rely on this local-only decision.

Code review template: reviewed commit/artifact; accepted design version; files/configuration inspected; test/scan artifacts; findings with severity/owner/disposition; remediation and retests; reviewer identity/time; accept/reject decision. Do not mark a code review accepted until that review occurs.
