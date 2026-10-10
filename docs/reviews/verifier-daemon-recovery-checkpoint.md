# Docker service restart recovery checkpoint

Source: `build/verifier-daemon-recovery`, commit
`8a4bd9c475717baa5c52a89d1d62ae8047895f09`.

The new isolated disposable Linux job passed: the controller was killed after a
live descendant tree was observed; Docker's MainPID changed; the original owned
container ID remained; fresh-process reconciliation removed it and confirmed
absence. The container was stopped after the service restart on this runner.
This proves retained-object cleanup, not continued execution across restart.

[Qualification run](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38019207594)
passed both jobs, including the existing adversarial, controller-crash and pending
operation checks. Published public summaries are in
`docs/evidence/verifier-daemon-recovery/qualification.json`; the daemon controller
runtime SHA matches the committed Git blob. No authenticated logs or artifacts
were downloaded. Locally, script syntax, all six recovery/proxy tests and diff
whitespace checks passed. Docker was not run on Windows.

[Platform verification](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38019207605)
also passed against the same source commit, including integration tests, production
build, browser journeys and cleanup. Public jobs API evidence is retained in
`docs/evidence/verifier-daemon-recovery/platform.json`.

See `docs/security/verifier-daemon-recovery.md` for the exact boundary. Abrupt
daemon death, host/observer loss and external durable recovery remain open.
Execution and retry authority remain disabled. The local app remains stopped
following the previously recorded automatic startup rejection; no restart was
attempted in this checkpoint.
