# Abrupt Docker daemon death qualification

NB-003 extends the graceful service restart scenario with a separate disposable
Linux runner. After durable intent, a live synthetic descendant tree and controller
SIGKILL, systemd sends SIGKILL only to docker.service's main process. A successful
signal request, changed MainPID, responsive Docker and retention of the same owned
immutable container ID are required. A fresh process then removes that container
by verified ID and confirms absence. Post-recovery running state is recorded.

The observer and containerd survive. Systemd may automatically restart Docker;
explicit service start is idempotent. No claim is made about outage duration or
continued descendant execution. This is not host, storage, containerd, whole-job or
observer loss qualification, nor pending-operation recovery during daemon death.
It adds no production executor, retry permission, key custody or human acceptance.
Local services and Windows features are untouched. Execution remains disabled.
