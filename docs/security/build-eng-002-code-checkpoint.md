# SEC-CODE-ENG-002 checkpoint 1

Status: prepared by the AI implementer for human review, not independent assurance or acceptance. Scope: versioned story gates, advisory readiness, atomic triage reservation and prepared GitHub templates/preliminary probe. Exact implementation commit and file hashes are retained in the checkpoint manifest after commit. Production release and coding execution remain blocked.

Controls implemented: authenticated administrator required by story/gate hooks even when access checks are overridden; actor, revision, scope and unique decision identities derived server-side; immutable normal API records; distinct sprint/design decisions; superseded or stale-context reviews denied; strict hash/list/path contract validation; artifact-stage approval refused without an artifact ledger. Server actions independently authenticate and validate inputs; the internal session helper is no longer an exported action. No model/service credentials were added.

The triage claim is an atomic SQL reservation with row locking and a queued-state predicate. Two concurrent database clients get one owner. It uses the adapter's configured database pool and fixed table/query names; no input is interpolated into SQL. It is not a coding lease or fencing implementation. Local filesystem lock remains as an additional operator guard, with no automatic stale-lock expiry.

Prepared workflow controls: full action commit pins, contents-read token, no persisted checkout credentials, deterministic container probes with a strict official Node digest input, explicit resource/user/network/capability settings, bounded command output/time, container cleanup confirmation, no provider/application credentials or host mounts. Issue text and workflow inputs are not interpolated into shell commands. Linux probes have only passed syntax review; execution/security qualification is pending. DNS denial alone is not a complete network isolation proof.

Known limitations / next review obligations:

- High, coding blocker: transactional coding gate/claim evaluation, attempt ledger, fencing, lease/recovery and termination qualification are incomplete. Advisory readiness cannot grant execution.
- High, coding blocker: provider credential broker, source export/path and symlink enforcement, protected check-policy mounting, fresh independent verifier and artifact provenance are incomplete.
- Medium: administrator role is the current human identity boundary; a dedicated reviewer/service model and immutable external audit retention are pending. Holding an administrator session is treated as human authority; stronger assurance is not claimed.
- Medium: story source requirements/change-proposal links and sprint membership are not yet the complete backlog-to-task approval graph. One story's sprint-scope decision is not a completed whole-sprint approval system.
- Medium: approval creation and a concurrent new revision are not serialized. Since execution is always blocked and latest revision is checked again for readiness, this cannot currently authorize coding; claim-time transactional serialization is required before enabling it.
- Medium: prepared GitHub protections, hosted Linux probes and CI have not been run remotely. Repository/plan support and protected policy ownership must be verified after connection.
- Medium: populated gate-form browser submission, accessible authoring, adversarial process/network/resource probes, simultaneous-login investigation and complete error preservation remain to be qualified.

Evidence: integration-tests.log, build.log, browser.json and desktop/mobile captures under docs/evidence/build-eng-002; checkpoint manifest links these to the committed implementation. Node suite has nine leaf scenarios and ten reported results, not coverage percentage or audit certification. [Checkpoint outcome](../reviews/build-eng-002-checkpoint.md) identifies unfinished stories. Human code-security, outcome, showcase and release acceptance remain separate and unrecorded.
