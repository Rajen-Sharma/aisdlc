# Exact-artifact delivery review

The portal now has a retained artifact ledger, separate code-security, sprint
outcome and MVP reviews, and artifact-linked feedback that prepares a new story
revision. This implements the review workflow; it is not evidence that the first
native model delivery has occurred.

## Evidence boundary

Only the internal `retainDeliveryArtifact` importer writes the artifact ledger.
Collection access and mutation hooks deny browser, model and Local API writers,
including `overrideAccess`. The importer locks the story, rechecks current
planning decisions and authenticates bounded native delivery evidence. It
retains exact source/candidate capsules and their domain-separated Ed25519
envelope. Candidate bytes are displayed literally and never imported or run in
the web process.

The claim binds stable task identity, story, scope, approval receipt digest,
attempt, source/candidate/check digests, qualified runtime and verifier, image,
cleanup and verification receipts, criterion denominator and verdict. Only a
currently selected public Ed25519 key with independently qualified native
runtime policy can authenticate it. Synthetic receipts, unknown fields, altered
bytes, unauthorized paths, partial successful denominators and private keys
are rejected. A producer's signature does not itself qualify that producer.

The independent authority must publish an operator-owned public policy file
`delivery-trust.json` and a signed `delivery-current-<stable-task-hash>.json`
head. The directory defaults to `.local`; a trusted operator may select an
absolute `AISDLC_DELIVERY_STATE_DIRECTORY` for a separate public-state feed.
There is no browser configuration or root selection. Reads reject links and
nonregular, oversized, changed or malformed files and never load credentials.

The current-head protocol is `ai-sdlc/delivery-current/v1`. Heads are valid for
at most 15 seconds and bind the exact artifact, scope, approvals, attempt and
cleanup/check receipts. An expired/missing head or withdrawn root blocks
decisions, including after SQL restore. Policy and state are independently
read on every operation. These files have deliberately **not** been provisioned
for the real application: their producer must first be deployed and qualified.
There is no successful default or synthetic production fallback.

## Human decisions and feedback

The gate hook checks project/story integrity, latest story version, exact current
artifact and accepted planning scope under the story lock. Passing independent
checks are required for acceptance. Code security precedes sprint outcome;
both precede MVP acceptance. Decision keys include the artifact hash, so neither
a new candidate nor a new story inherits them. Actors come from the authenticated
request; submitted actor IDs are ignored. Decisions remain immutable.

Failed checks remain visible for findings and feedback. A rejected decision is
retained; it cannot be overwritten by a later acceptance. Artifact feedback
retains its source hash and human actor. Preparing a revision links that feedback
and supersedes the reviewed story, changes the scope hash and requires new sprint
and design decisions. Existing pre-feedback story hashes remain unchanged.
This creates no model attempt and never resets external attempt accounting.

Review controls keep notes in controlled browser state if the decision is denied.
Unavailable, expired or superseded evidence presents a blocked state with no
actionable acceptance form. The portal reports check denominators and attempt
number without inferring release readiness or inventing cost data.

## Verification and remaining integration

Cryptographic tests cover signatures, public-only key selection, current authority
revision, scope and path changes, synthetic flags, failed/error checks and expired
heads. Database tests cover denied direct writers, idempotent internal import,
actor substitution, ordered distinct reviews, duplicate/stale decisions and feedback
revision with fresh approval requirements. Tests use ephemeral public-state
directories and keys, synthetic source comments and temporary story records.
They make no model calls and do not count as human governance decisions.

The native guardian, authority-side delivery producer/current-head publication,
private-host deployment and actual AI patch/check cycle remain integration work.
Both private VMs remain deallocated after the previous approved trial expired.
No deployment, real code/outcome/MVP acceptance or production release is implied.
