# Native coding guardian

Update, 25 October 2026: trusted operator activation can append a runtime
requalification after a signed, settled failure that produced no candidate.
It requires fresh host qualification, exact-source CI and current human scope
gates. The append changes only the runtime hash and registration fence; approved
scope, expiry, spent intents, global attempt numbers and usage remain intact.
Unresolved work, candidates, revoked policy and exhausted budgets deny this path.
Failed native handoffs now retain fixed diagnostic categories, protocol stages
and numeric RPC codes; raw provider messages and credentials are discarded.

Implementation prepared 24 October 2026. Packaging and synthetic qualification
do not enable the private runtime or demonstrate an actual model delivery.

`TurnPermitIssuer` separates accounting from native execution leases. It requires
the concrete external attempt authority, current trusted eligibility and current
native qualification. Launch permits bind a fresh guardian challenge. Admission
first consumes the external single-use admission, then binds the fresh thread and
challenge to a separately signed permit. Every permit binds scope, approvals,
runtime, reservation, attempt, host, boot, unit, model and one-turn limit. Validity
is at most 15 seconds, within the attempt deadline and policy window. Eligibility,
external tip and selected key are rechecked after signing; uncertainty consumes
the admission without producing another permission.

The root guardian is outside the fixed unprivileged `aisdlc-broker` systemd unit.
It verifies pinned public policy and code hashes, the actual machine/boot identity
and a still-valid protected trial window before accepting a launch. Its root-only
journal uses O_EXCL and fsync before the only launcher exists. Repeated requests
or a restarted observer cannot launch that attempt again. This local journal is
a replay barrier, never the authoritative attempt budget.

The unit has no capabilities, cannot create namespaces, modify control groups or
use host service sockets. It has bounded memory, CPU, processes, runtime and stop
time. Host homes and `/var/lib` are hidden; only the dedicated native client data
directory is bound into the workload. The pinned CLI alone uses its existing
ChatGPT login. No code copies, exports or directly inspects native authentication.
Host loopback and Azure IMDS access are denied, with a narrow localhost resolver
exception. The native provider endpoint, features, tool use and retry policy are
independently checked by the session driver. The separate verifier has no network.

The broker accepts one fixed task and one root-approved admission. It cannot
choose executable paths, environment, working directory or service properties.
Candidate text stays inert. The root guardian decodes it against the trusted
source and allowed files, then signs candidate provenance only after cleanup.
Provenance binds actual admission, thread/turn, source/candidate hashes and known
or unknown usage; it is neither a verifier verdict nor a human acceptance.

Cleanup requires an observed daemon-created unit with an actual executed root,
completed stop, closed launcher, inactive/failed unit and absent or unpopulated
cgroup. Mere root exit, timeout or unobserved absence cannot produce a proof.
Controller loss leaves uncertainty. The unit's own deadline still kills its
descendants, but no replacement observer infers retry permission from that fact.
Whole-host recovery remains a separate authenticated fencing operation.

`package-native-runtime.mjs` bundles an explicit source allowlist with per-file
hashes. It includes no login, application secret, private key or execution policy.
Its manifest keeps native qualification and execution false. Installing the
documented [Linux bubblewrap prerequisite](https://learn.chatgpt.com/docs/sandboxing)
does not relax the outer guardian sandbox or enable model tools. Ubuntu 24.04
also loads the distribution's scoped bubblewrap AppArmor profile; the global
unprivileged-user-namespace restriction remains enabled. The system resolver's
public stub configuration is bound read-only so hiding `/run` does not break DNS.
The client qualification checks DNS readability and native account/config/catalog/
read-only-thread metadata under the same unit restrictions, without `turn/start`.

The pinned CLI forbids redefining its built-in `openai` provider. The fixed
`aisdlc-openai` configuration uses native OpenAI authentication, forced ChatGPT
login, no endpoint/header/API-key override, no transport retries and no web search.
Candidate provenance uses `openai` as the provider's canonical name; the pinned
runtime and configuration hashes bind the exact internal provider identifier.
Activation rejects dirty runtime sources, mismatched package/boot/qualification,
stale probes and unsuccessful source CI.

The disposable CI qualification uses ephemeral roots and a fixed synthetic broker
to test actual unit isolation, a readable-host-canary positive control, broker-only
data access, blocked loopback, detached TERM-ignoring children, duplicate launches
and killed-observer timeout behavior. It never uses credentials or makes a model
call. The real pinned CLI session and taskboard verifier have separate synthetic
qualifications. Private deployment, authority/current-head publication and the
controller integration are required before the real coding cycle can run.
