# Local AI SDLC operator guide

The actual delivery control panel is at `/pipeline`; the lifecycle and 14 templates are at `/sdlc`. Use the synthetic administrator account from ignored `.local/demo-credentials.json`. Editors and publishers retain CMS permissions and cannot read delivery records or grant delivery decisions. Do not paste secrets or live source exports into this local increment.

The default workspace is now generic. [Project profiles](../../projects/README.md) define the active product; the CMS/Drupal profile is deferred. The old CMS preview is at `/cms` and its historical intake/evidence is preserved separately. Project identity and version are bound into every new intake/run/decision scope; the dashboard shows only the active project. Human governance rules remain platform-owned.

1. Run the database and application using the existing local MVP setup instructions.
2. Sign into `/admin`, then open `/pipeline`.
3. Submit a requirement, review suggestion or showcase feedback with its target and source. Inputs are immutable. Submit a new record for a revision and link the preceding record; the admin intake collection provides a structured `supersedes` relationship.
4. Queue AI triage. The task binds an exact source snapshot/hash. A repeat queue of the same snapshot does not create another run. A changed snapshot creates a new run.
5. In a separate terminal run `npm run sdlc:worker`. It processes one queued snapshot through an actual authenticated Codex CLI call, strips application environment variables, validates schema/source coverage, and records its outcome. It does not implement code or grant approvals. The CLI must already be authenticated; failure is shown as failed, never simulated success.
6. Reload the control panel and review proposals, duplicates, conflicts and rejected instructions. Record an analysis decision and notes. Triage acceptance approves analysis only; unresolved conflicts need new feedback and a subsequent reviewed snapshot before implementation.

## Recovery

A worker lock prevents simultaneous local coordinators. The lock is not automatically expired. After a crash, verify that the recorded worker PID and its CLI/process tree have terminated before removing `.local/sdlc-worker/worker.lock`. A running task is uncertain and must be investigated; do not reset it to queued automatically. Preserve the original failed/uncertain run and prepare a new reviewed attempt under an explicit recovery procedure. No automatic repair retries are enabled for intake.

## Evidence and limits

PostgreSQL stores inputs, run snapshots/results/checksums, actual elapsed time/CLI version and human review decisions. Anonymous/editor access, immutable intake/decisions, stale review and forged source IDs have focused tests. Working local evidence remains mutable to database administrators and is not a production immutable archive.

Code implementation and verification workers remain blocked until an isolated runtime is available and its secrets/filesystem/network boundaries are demonstrated. No Docker/Podman runtime or usable WSL environment was found. A worktree or read-only discovery trial is insufficient qualification. The local engine is an in-progress increment, not production ready; sprint/outcome/code-security/MVP acceptance are not inferred from this guide or a passing build.

Reproduce checks with `npm test`, `npm run typecheck`, `npm run build`, `node scripts/pipeline-smoke.mjs --seed`, `npm run sdlc:worker`, then `node scripts/pipeline-smoke.mjs --results`. Seeding adds clearly labelled synthetic showcase inputs and queues analysis; it never grants human approval.
