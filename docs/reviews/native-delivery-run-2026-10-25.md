# Native delivery trial, 25 October 2026

The product is not ready for an accepted end-to-end delivery. The approved first
task produced no candidate. All three authorized intents are spent and settled;
there is no checked artifact to approve. Human code-security, outcome and MVP
decisions remain pending. No production release is eligible.

The runtime source at `268eb1c2ca3d8de069c0609c765dd103972a30fc` passed
[full CI](https://github.com/Rajen-Sharma/aisdlc/actions/runs/40168754171).
Both actual private hosts passed signed qualification: client process isolation,
controller loss, native metadata, unlaunched fencing and independent Docker
verifier controls. These checks establish their stated controls, not a successful
model delivery. Activation used the existing approved story 84, revision 1,
scope `9e60b3e20539bf90070dfd52e0e53aa4898e7e2da838857e3645ced9e26ecdcb`.

| Intent | Observed result | Durable outcome |
| --- | --- | --- |
| 1 | Native admission; no candidate; original handoff lacked failure category | Signed cleanup; failed; remains spent |
| 2 | No admission, launch claim or execution unit | Expired ID exclusively fenced in the launch journal; signed cleanup; failed; remains spent |
| 3 | Native admission; driver rejected a `warning` notification | Signed cleanup; failed; remains spent |

The third diagnostic is `unexpected-notification`, stage `warning`, with
`turnSent: true`. The raw warning was discarded by the bounded protocol handler;
its precise cause is unresolved. It did not recur during a later metadata-only
thread check. A native token refresh and subscription-capacity read succeeded
without model generation. These observations do not establish that generation
will succeed. The warning must not be silently allowed without understanding it.

The independent ledger retains 16 authenticated records, including the six
earlier synthetic qualification records. It records three actual task intents,
two admissions and three failed settlements, with no candidate, verification or
delivery event. Usage is unknown for all three settlements; no zero-token or
precise model-call count is claimed. Diagnostic text is a trusted SSH handoff
observation, separate from the signed cleanup assertion.

Implemented during the run: bounded native failure diagnostics; runtime
requalification preserving scope, deadline and all spent intents; exclusive
unlaunched fencing; and an explicit attempt-limit state in the portal. The
source fixture remains the approved incomplete input. It was not implemented
manually or represented as model output.

The user-authorized renewal states `maxAttempts: 3` in
[the exact renewal record](../governance/azure-trial-renewal-2026-10-25.json).
Further coding attempts require an explicit change to that policy and its
enforcement, preserving the existing ledger and spent history. Re-registering,
changing a story key, restoring SQL or renewing infrastructure cannot refund
these intents. No further coding attempt is authorized by this report.

After evidence capture, both trial VMs were deallocated and the local executor
was disabled. The [management-plane shutdown record](../evidence/native-runtime-2026-10-25/cloud-shutdown.json)
confirms their stopped allocation state. The local portal remains available at
`http://127.0.0.1:3000/pipeline`; it shows the attempt limit and no verified
delivery. Browser checks passed for denied anonymous access and browser artifact
writes, absent acceptance controls, and desktop/mobile layout. Storage resources
were preserved; deallocation stops idle VM compute rather than all trial costs.

The public evidence is in
[the run record](../evidence/native-runtime-2026-10-25/run.json), including the
signed ledger, host qualification and three cleanup handoffs. Verify archived
signatures and exact manifest bytes with:

```powershell
node scripts/verify-native-run-evidence.mjs
```

This is historical verification; archived proofs cannot reopen execution or
artifact review. No private keys, native authentication files or personal SSH
identity contents were exported.
