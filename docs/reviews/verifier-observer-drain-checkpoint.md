# Pending-operation drain after observer loss

Source `build/verifier-observer-drain`:
`7c1be592a70918a708286b38ad905dacec5b4f78`.

[Qualification run 38033244198](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38033244198)
passed all three jobs. The new observer-loss mode passed four cases: create/start,
each paused at request/response. The observer terminated its separate controller,
then died by SIGKILL with the guardian-owned CLI still pending. Premature recovery
was denied; only client closure and proxy/backend drain permitted cleanup.
Delayed create demonstrated empty inventory before a late real create; late starts
demonstrated live descendant trees. All cases confirmed absence and retry=false.

Public structured summary and run/job steps are retained in
`docs/evidence/verifier-observer-drain`. The controller runtime SHA matches the
committed Git blob. No authenticated logs/artifacts were downloaded. Local syntax,
six recovery/proxy tests and whitespace checks passed; no local Docker ran.

[Platform run 38033244155](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38033244155)
passed against the same commit, including integration, audit, production build,
browser journeys and owned database cleanup. Its public step results are retained.

See `docs/security/verifier-observer-drain.md`: this NB-003 checkpoint assumes the
outer operation guardian survives with ownership of clients and proxy. Guardian,
whole-job and host loss remain open and need durable recovery/discovery. This does
not enable production execution, retries or human acceptance. Provider credential
route and explicit model spending ceiling remain prerequisites for the first real
AI delivery trial. Local app remains stopped; no startup was attempted.
