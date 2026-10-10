# First real AI delivery: readiness and remaining work

Prepared 10 October 2026. This is a status and implementation worklist under the
accepted BUILD-ENG-002 continuation, not a changed sprint, acceptance record or
permission to execute. The accepted plan and security design remain unchanged.

## Current position

| Plan item | Implemented evidence | Remaining before completion |
| --- | --- | --- |
| NB-001 | Versioned stories, task contracts, exact sprint/design gate checks and stale/superseded denials | Real selected task and applicable human decisions; engine checkpoint acceptance |
| NB-002 | Transactional reservations, fencing, attempt cap, lease uncertainty, artifact binding | Integrate actual worker lifecycle and qualified termination; durable recovery and replay authority |
| NB-003 | Restricted synthetic containers; adversarial/resource/path/secret tests; controller/daemon/observer loss at documented boundaries; pending-operation drain | Real adapter credential boundary; protected signing/current registry; external durable recovery; actual executor qualification |
| NB-004 | Bound candidate submission, signed verifier evidence and revocation checks | Actual AI-produced fixture patch, independent verification and exact-commit human code-security review |
| NB-005 | Portal foundation, browser regression journeys and review/evidence workflow | Complete success/failure/recovery showcase, feedback revision/reapproval and human outcome/MVP decisions |

No plan item is declared human-accepted by this table. Synthetic tests are evidence
of individual controls, not the complete delivery cycle. The coordinator still
hardcodes executionAllowed=false. The existing intake CLI worker is not a coding
executor and must not be repurposed as one without qualification.

## Implementation sequence to the real trial

1. Record the provider credential route and an explicit total spending ceiling
   with currency, including repair attempts. Record the selected synthetic story
   and exact task contract through the existing human gate workflow. No secret
   values belong in chat, source, journal or evidence.
2. Prepare the selected adapter's feasibility implementation and review: trusted
   model client outside the writable code environment, pinned model/tool versions,
   bounded requests/responses, provider allowlist, request accounting, timeout and
   cancellation behavior, and credential-canary qualification. Authoritative checks
   stay outside the agent's writable scope. Do not enable execution yet.
3. Provision the independently operated recovery/signing boundaries. Review a
   concrete service/account proposal first if no existing service is available.
   Require authenticated identity, complete current outstanding-intent discovery,
   append-only audit, external anti-rollback anchors and old-runtime fencing. A
   GitHub artifact upload or a local database copy is not sufficient by itself.
4. Integrate and qualify one actual worker lifecycle: intent committed before any
   effects, claim/fence binding, provider spend reservation, isolated tools, exact
   source export, candidate capture, separate verifier and immutable evidence.
   Deny any operation when its authority, budget or qualification is unavailable.
5. Run one selected, explicitly authorized synthetic task. Capture real patch,
   checks, failures, model/tool/image identities, attempt count, elapsed time and
   actual/unknown cost status. A model success claim cannot satisfy verification.
6. Present the exact patch for human code-security review; demonstrate success,
   failed checks, uncertainty/recovery and feedback reapproval; then request
   separate outcome/MVP decisions on the concrete complete-cycle evidence.

This sequence does not waive any approved acceptance criterion. If infrastructure
constraints require a smaller trial, present the concrete changed scope for human
review rather than silently dropping recovery or credential controls.

## External choices that remain unresolved

| Choice | Why implementation depends on it | Current state |
| --- | --- | --- |
| Provider route | Determines adapter API, credential isolation, accounting and cancellation | Unselected: trusted broker with provider key, existing approved gateway, or feasibility evaluation of existing login |
| Total model spend ceiling and currency | Required before paid coding calls; repairs must share the same cap | Not supplied; no paid coding run is authorized |
| Recovery and signing service/account | Determines authentication, immutable storage, current anchors, fencing and operational ownership | Not provisioned; requirements documented, no endpoint or credentials assumed |

The accepted plan explicitly requires a viable credential strategy and an explicit
model budget. Repeated instructions to continue authorize independent engineering
work but do not select an account, reveal a secret or define a monetary ceiling.
No additional permission is needed to prepare the adapter and service proposal
once these choices are known; actual execution still requires all applicable gates.

## Latest evidence and limits

- [Recovery discovery](recovery-discovery-checkpoint.md): read-only expected/journal
  comparison; even matching inventory remains quarantined with no verified authority.
- [Pending-operation observer loss](verifier-observer-drain-checkpoint.md): a surviving
  outer guardian drains owned clients/proxy; whole-guardian/host loss is not proven.
- [Supervisor registry](supervisor-registry-checkpoint.md): signed catalog/revocation
  checks; independent deployed key custody/current-anchor service still absent.
- [Current accepted build plan](../planning/next-build.md) and
  [security design](../security/next-build-design.md).

Checkpoint branches and evidence have been pushed; no merge or deployment has
occurred in these continuations. Local app remains stopped following the recorded
startup rejection; no alternative launcher or retry was used. PostgreSQL data is
preserved. CMS/Drupal/AEM feature delivery remains deferred behind engine readiness.
