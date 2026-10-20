# Private runtime trial, 20 October 2026

The local application runs at `http://127.0.0.1:3000`. The private client is
authenticated using ChatGPT. No real model call or task implementation occurred.

## Observed results

- The protected Azure Free Trial subscription reports spendingLimit On. The human
  explicitly authorized preparation and VM startup for a new 48-hour window, with
  a USD 10 planning ceiling, trial credits only and no pay-as-you-go. The window
  ends 2026-10-20T11:12:11.753Z; existing native shutdown schedules remain enabled.
- The actual client reports ChatGPT authentication. Its effective app-server
  configuration was checked without reading authentication files, and its
  catalog lists `gpt-6-sol`. The former `gpt-6.1-sol` selection was absent from
  that catalog. Configuration now selects the listed model; no implicit model
  fallback or API billing route was used.
- A fresh credential-free synthetic provider on the client passed the complete
  existing tool-surface probe for `gpt-6-sol`: empty skill catalogs, denied skill
  reads, denied questions, unsupported shell/image/patch tools, interrupted
  streaming with no candidate, and a subsequent positive control. This remains
  a synthetic protocol test, not full authenticated execution qualification.
- All eight deployed verifier export files matched the manifest at source
  f335b3207cdd3b6a1be482f1eae9939e47fd1146. The actual tools VM passed 25 variants
  with 22 cases each: two accepted controls and 23 rejected variants. All
  containers were removed.
- The authority's managed identity was assigned the custom read/append role at
  the authority-container scope. Storage denies shared keys and public access
  outside the allowlist; the tools-subnet rule is effective. The temporary
  operator Storage Blob Data Contributor assignment was removed after bootstrap.
- The earlier zero-byte CLI upload did not create a blob. A conditional REST
  create with If-None-Match `*` created the empty append blob without replacement.
- Two actual ledger qualifications appended six synthetic signed records total.
  Each confirmed stale-head denial, exactly one concurrent winner, a committed
  write with its acknowledgement deliberately lost and then reconciled, no
  automatic write retry, and HTTP 403 for attempted overwrite. The retained
  snapshot's six signatures and final tip match the second qualification when
  independently checked locally. No private key or managed-identity token was
  exported. The retention policy remains unlocked.

## Local application and registration

The desktop/mobile pipeline smoke checks and delivery review-page checks passed.
Cold initial compilation exceeded browser navigation limits; the warmed app
passed. Concurrent authenticated browser suites produced an intermittent review
page failure; the delivery suite passed when run on its own.

Thirty runtime/recovery guard tests and TypeScript checking passed. A local
integration process hit a memory allocation failure while a production build was
also running. The build was stopped and the failed claim suite passed on its own;
all remaining suites subsequently passed sequentially. The interrupted build is not a
successful production-build result.

The workspace now offers **Register my recorded decision**. A signed-in human
administrator can register the unchanged approved task and its existing sprint
and design decision in one transaction. The server supplies the contract and
decision scope; the form cannot supply another actor, contract or decision.
Concurrent registration is idempotent, and conflicting existing versions or
decisions cannot be overwritten. Gate reads share that transaction so they can
see its newly created story. The registration test uses a separate, temporary
database and removes it after the test process closes. No automated test creates
the real task's approvals in the operator database.

## Remaining boundary

The user signed in and registered story 84, revision 1, at 10:25:19 UTC on
20 October. Read-only database inspection confirmed the exact approved scope
and both accepted gates under administrator account 1. This supersedes the
earlier documentary-only coordinator status without altering the recorded scope
decision. The assistant did not submit that registration. Both Azure VMs were
confirmed deallocated after qualification; the local app remains available.

The authenticated coding lifecycle, durable
attempt/spend state machine, current signing/recovery authority integration and
whole-host-loss fencing remain incomplete. Execution, retries and artifact
acceptance remain disabled. Passing infrastructure and synthetic verifier checks
does not complete the approved AI implementation loop or approve code/outcome.

Evidence is retained in `docs/evidence/azure-runtime-2026-10-20/`. Authentication
files, private keys, passwords and identity tokens are excluded.
