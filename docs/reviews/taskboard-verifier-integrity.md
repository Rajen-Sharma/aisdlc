# Taskboard verifier integrity checkpoint

18 October 2026, Australia/Sydney. Continuation of BUILD-ENG-002. This is an
AI-prepared implementation and review checkpoint; human code-security, outcome
and MVP decisions remain pending.

The taskboard candidate decoder and disposable Linux verifier were introduced
at `6b31544`, followed by unsupported-status coverage at `bcb3ea2`. The complete
platform run for `64e03c15e5b366094dbb44c4f2b96304c990f943` passed in
[run 39009564077](https://github.com/Rajen-Sharma/aisdlc/actions/runs/39009564077).
That run also exercised the credential-free synthetic Codex provider probe:
empty skill catalogs, denied skill reads and question/tool dispatch denials.
It establishes neither authenticated-provider isolation nor a real coding run.

## Review findings and corrections

The original runner used candidate-controlled array iteration when checking
reference identity, checked an error's mutable name, and assigned a result to a
candidate-visible global. It created inputs through realm JSON.parse after
candidate module evaluation. JSON serialization also omitted extra array
properties and did not detect replaced, deeply equal input objects or changed
property descriptors. These were verifier integrity weaknesses, not observed
host escapes or evidence of an executed real coding task.

The runner now creates inputs and retains the realm TypeError prototype before
evaluating candidate code, keeps the original input bindings fixed, and obtains
the invocation's return value directly. Host-owned descriptor inspection checks
result identities without candidate iterators or getters. Error checks use the
retained prototype and a bounded chain, rejecting proxies. Input comparison
retains array length, extra keys, original object references, property flags,
prototypes and extensibility.
The VM timeout bounds invocation; container limits remain the OS boundary.

Qualification now includes 25 variants with 22 cases each: two positive controls
and 23 intentionally invalid candidates. The second positive control changes
realm JSON.parse but correctly filters the independently prepared inputs. New
negative cases exercise error-name spoofing and a hanging name getter, cloned
results with a forged iterator, a forged global result accessor, array property
and length mutation, replacement of nonmatching tasks or nested field objects,
and descriptor, prototype or extensibility mutation. Existing negative checks cover wrong results/order,
cloning, mutation, invalid status handling, early exit, forged stdout, forbidden
runner import, runaway computation and getters. Unsupported statuses run against
both empty and populated input.

## Verification and evidence

Source revision: `b6d170e69299e9a450d06e587f672bc6a7553a53`, recorded in the
accompanying source inventory. The complete workflow passed in
[run 39117182433](https://github.com/Rajen-Sharma/aisdlc/actions/runs/39117182433):
Linux runtime/protocol/tool probes, TypeScript checking, 19 guard checks,
integration tests, all 25 verifier variants, dependency audit, optimized build,
browser journeys and owned-database cleanup. All three intermediate source runs
also passed. Local syntax checks, TypeScript checking and all 19
guard/recovery/template tests passed. Candidate source was never evaluated on
the Windows control-plane host.

The harness requires a disposable GitHub Linux runner, the pinned Node image,
read-only candidate/runner mounts, no network, a nonroot user, dropped
capabilities and bounded memory, processes, CPU, temporary storage, time and
output. It compares exact trusted results and confirms removal of every named
container before recording success. Container cleanup uncertainty fails the
qualification; it never authorizes a retry. Qualification is synthetic and is
not an independent whole-host recovery or production verifier service.

Public CI run/job metadata and Git-blob hashes are retained under
`docs/evidence/taskboard-verifier-integrity/`. Detailed authenticated CI logs
and raw artifacts were not downloaded. Passing steps plus frozen assertions are
the evidence basis; the working repository is not immutable signed authority.
After the unauthenticated GitHub API limit was exhausted, public run/job HTML
provided the final status and step metadata. Older in-progress API snapshots
remain labelled as observations rather than being rewritten as final API results.

## Remaining complete-cycle dependencies

The fixture is still intentionally unimplemented. The task proposal retains
pending real human sprint/design decisions; no approval records were created.
The provider remains subscription-only, no additional API charges, at most
three total attempts. The coordinator continues to return executionAllowed=false.

An authenticated provider lifecycle still needs qualified credential/tool
isolation, durable attempt/spend reservation, cancellation and descendant cleanup.
Independent recovery/signing identity and current anti-rollback authority are
not provisioned. A synthetic provider and disposable verifier cannot satisfy
those dependencies. Actual AI patch generation, exact-artifact human code review,
feedback/reapproval and outcome/MVP decisions remain outstanding. No merge,
deployment, application startup or Azure resource change is included.
