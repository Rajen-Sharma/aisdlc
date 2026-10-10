# Observer loss qualification boundary

An outer trusted fault injector launches an observer process on disposable Linux
CI. That observer launches the existing synthetic controller, waits for its live
container descendant tree, kills the controller and waits for exit. It reports
readiness with no remaining operation clients, then is itself killed by SIGKILL
before cleanup. The outer injector confirms a live orphan tree and an uncertain
bounded durable journal. A fresh OS process receives only journal path and trusted
ownership token, reconciles by verified immutable container ID and confirms absence.

This exercises loss of the in-memory observer at a quiescent boundary. The outer
fault injector, host, filesystem and Docker survive. The token is supplied from
trusted test configuration, not recovered from an independently durable authority.
It does not prove whole-job/host loss, pending writers after observer death,
production replay protection or external recovery discovery. Failure cleanup is
best effort only and cannot authorize retries; a failing runner must be discarded.
No candidate code, model calls, production execution, or human acceptance occurs.
