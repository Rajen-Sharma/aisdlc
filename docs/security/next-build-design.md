# Security design SEC-DES-ENG-002 v1

Prepared 8 October 2026. Status: proposed for human review. Scope: the generic fixture-project vertical slice in BUILD-ENG-002; no live migration or production release. Supplements the accepted local engine design with concrete task eligibility, ownership and isolated implementation/verification boundaries. Prior approval does not grant acceptance of this new design version.

## Boundaries and authority

Authenticated human review -> coordinator approval/events store -> transactionally eligible task and lease -> trusted provider adapter plus isolated coding tools -> untrusted proposed patch -> separate trusted verifier -> reviewable artifacts -> human code-security/outcome/MVP decisions. Model text and project configuration remain data. Coding and generated tests/code receive no control-plane database, approval or application credentials.

The implementation must choose and demonstrate a credential boundary compatible with its agent adapter. Prefer keeping provider credentials in a trusted model client/broker outside generated-code and verifier execution. If an adapter requires credentials within its agent environment, present its exposure, scope/budget restrictions and mitigation for human design review before adoption. Do not silently mount the operator's home/auth directory into a coding or test container. No actual provider key is specified or requested in documents.

## Controls and acceptance evidence

| Risk / severity | Required design control | Evidence before acceptance |
| --- | --- | --- |
| NB-SEC-001 high: forged/stale gate | Distinct human decisions bound to project, task revision, approved requirements/design/sprint/check policy and artifact hashes. AI/service identity cannot approve. Transaction validates gates at claim; material changes invalidate dependencies | Missing/denied/wrong-project/stale/AI-asserted decisions deny execution; scope change after readiness cannot reuse eligibility |
| NB-SEC-002 high: duplicate or stale executor | Atomic DB claim with persisted lease/attempt, unique owner and monotonic fencing. Expired/unknown execution quarantined; stale worker cannot publish results | Two-worker race, crash before/after effect, timeout and restarted-worker tests; no overlapping unknown execution |
| NB-SEC-003 high: secrets/host access | Approved source export excludes protected/ignored secrets and escaping symlinks; no privileged/host/container-socket mounts. Code/tool container cannot read control plane or approval store. Network/resource scope declared and enforced | Canary DB/app/approval/host secrets inaccessible; traversal/symlink/host path/unauthorized egress/resource tests |
| NB-SEC-004 high: generated verifier compromise | Separate disposable verifier, no provider or control-plane secrets. Versioned trusted commands/tests outside agent write scope; patch path/type/size validation before execution | Modified tests/check commands/protected paths rejected; malicious generated code cannot reach host/credentials; checks bound to actual patch |
| NB-SEC-005 high: orphan survives timeout | Verified process-tree/container termination and artifact quarantine before releasing ownership or retrying; bounded initial+two repair attempts | Child/grandchild runaway, cancellation and coordinator crash tests; termination failure blocks retry |
| NB-SEC-006 medium: invented/sensitive evidence | Capture actual exit/results, approved source and patch hashes, provider/model/tool/image/check versions, failed attempts/retests and cost status. Redact sensitive diagnostics; independent evidence checksum validation | Model success with failed check denied; secret-bearing diagnostics redacted; artifact tamper detected |
| NB-SEC-007 medium: feedback changes accepted work | Immutable intake and effective revisions; explicit human disposition; story/task versions never mutate running scope | Supersession/duplicate/contradiction tests; accepted change generates new version and required reapproval |
| NB-SEC-008 medium: mistaken human identity/session | Dedicated review permission/service distinction, actor derived from verified session, CSRF/origin checks; isolate test accounts and investigate shared-account 403 | Anonymous/editor/service denial; forged actor rejected; origin mismatch and concurrent-session tests; no automated real approval |

## Fail-closed behavior

Unavailable/unqualified sandbox, missing approval, provider credential uncertainty, verifier change, unknown surviving process, excessive retry budget or invalid evidence prevents execution/promotion. Preserve a failed/blocked/uncertain record with reason and required human action. A local filesystem lock or read-only discovery setting cannot qualify the coding boundary.

No production approval endpoint, remote repository connection, Windows feature installation, provider purchase or live data access is authorized by this design pack. Environment provisioning and provider configuration require concrete session choices. Approval states remain pending until the human reviews this version and gives an explicit decision; silence is not acceptance.
