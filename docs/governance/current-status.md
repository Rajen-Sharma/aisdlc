# Current governance status GOV-STATUS-001

Update, 20 October 2026: the local app runs and the private Azure client confirms
ChatGPT authentication. Actual Azure verifier and signed append-ledger checks
passed; [the runtime review](../reviews/azure-runtime-2026-10-20.md) records their
limits. The user registered the approved task through the signed-in workspace:
story 84, revision 1, exact scope, both accepted gates under account 1. Full coding
execution and later review gates remain unavailable.

Update, 18 October 2026: the human accepted taskboard-filter revision 1 sprint/design
scope (APP-SP-TASKBOARD-001 / APP-DES-TASKBOARD-001). See the
[exact decision](taskboard-filter-approval.json) and
[readiness addendum](../reviews/taskboard-approved-readiness.md). This resolves
the task-scope decision; authenticated coordinator registration and execution
qualification remain outstanding. The historical index below is dated separately.

As of 8 October 2026, Australia/Sydney. This index reconciles current decisions with preserved historical review artifacts. The [approval register](registers.md) records actual human statements and scopes; an old artifact's preparation status is not a new rejection or acceptance. Reviewed files are not edited merely to change their labels or hashes.

| Scope | Current decision | Evidence / boundary |
| --- | --- | --- |
| CMS local MVP 1 design/start | Accepted to proceed | APP-DES-001 / APP-SP-001; local scope only |
| CMS local MVP 1 code, sprint outcome, showcase | Accepted for local MVP scope | APP-CODE-001 / APP-OUT-001 / APP-MVP-001; exact implementation/evidence identified in register |
| Engine-first sequence | Accepted | APP-SEQ-ENG-001 |
| Engine SP-ENG-001 v1 and SEC-DES-ENG-001 v1 start | Accepted for local scope | APP-SP-ENG-001 / APP-DES-ENG-001; exact historical hashes in register; packs retain original prepared status |
| Generic platform direction | Requested by human / implemented as local foundation | CR-ENG-001; not a new code/outcome/release approval |
| Current generic/engine code-security review | Pending human review | SEC-CODE-GEN-001 and SEC-CODE-ENG-001 checkpoint packs; no independent audit claimed |
| Complete engine sprint outcome and engine MVP | Not yet eligible | Full approved implementation/verification loop incomplete |
| Deferred CMS migration SP-002 / SEC-DES-002 | Pending | Not changed or activated by generic platform work |
| BUILD-ENG-002 continuation plan / SEC-DES-ENG-002 | Accepted for local implementation | APP-BUILD-ENG-002 / APP-DES-ENG-002; preserved exact hashes in register; checkpoint code/outcome review remains pending |
| Production release | Not eligible | APP-REL-001; production criteria unmet |
| GitHub repository / platform verification | Connected; full Linux CI passed | Rajen-Sharma/aisdlc; run 37773865509 at a8c23ff; [connection evidence](../reviews/github-connection-2026-10-08.md) |
| Preliminary Linux container probes | Three checks passed; coding qualification incomplete | Run 37773072611; actual probe JSON retained; provider/ownership/verifier boundaries still pending |

No response, elapsed time, passing checks, AI-generated acceptance or approval of a different project/version may satisfy a pending gate. Accountable product/security reviewer is the chat user for the recorded local decisions; legal identity and exact message times were not supplied and are not invented. The human subsequently selected GitHub Actions to replace local Docker/WSL2 for the first isolated trial; repository details are pending. This changes the provisioning choice while preserving scope and human gates. See the [GitHub handoff](../operations/github-delivery.md).
