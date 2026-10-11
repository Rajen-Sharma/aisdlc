# Azure trial infrastructure foundation

11 October 2026. The user selected the existing Azure trial and authorized starting
the environment. This checkpoint creates infrastructure for synthetic qualification;
it does not qualify the Codex executor or approve a real task.

## Deployed scope

Resource group `rg-aisdlc-trial-aue`, Australia East, contains separate
`vm-aisdlc-client` and `vm-aisdlc-tools` machines. Each is Ubuntu 24.04 x86-64,
Standard_B2als_v2 (2 vCPU, 4 GiB RAM), with a 32 GiB Standard SSD OS disk.
Both passed key-only SSH boot checks and report no `.codex` home directory.
Compute is deallocated after the check; verify current power state before reuse.

The login exposes two identically named subscriptions. The default is pay-as-you-go
with spending protection off. Every Azure operation in this checkpoint explicitly
targets the other subscription, whose policy reports FreeTrial, Enabled and
spendingLimit On. No default subscription change, PAYG upgrade or spending-limit
removal was performed. Compute and Network service registration were needed.
The selected region reported four unused total/Basv2 vCPUs. The SKU response
restricted zone 2, so the deployment uses no availability-zone selection.

The [ARM template](../../infra/azure/trial.json) defines separate subnets and NSGs,
private subnet defaults, explicit Standard public IPv4 addresses and no managed
identities. Each NSG allows SSH only from the operator's current public IPv4 /32,
denies other inbound traffic (including default VNet access), permits outbound
HTTP/HTTPS to Internet for bootstrap, and denies other outbound traffic.
SSH keys and operator-specific parameters stay under ignored `.local/`.
No password, private key, Codex authentication or application secret is embedded.

These are bootstrap rules, not complete generated-code confinement. Azure platform
traffic, metadata access, DNS behavior and container networking require their own
qualification. No Docker runtime, executor transport, supported complete Codex tool
routing or external current-authority/signing service has been installed or qualified.
First SSH contact used a dedicated local known-hosts file with accept-new; this
checkpoint does not establish independent host-key attestation. Verify host identity
through a trusted independent channel before placing account authentication there.

## Cost and lifecycle

Microsoft's Retail Prices API returned these Australia East USD retail rates:

| Item | Rate | Two-host planning amount |
| --- | ---: | ---: |
| Linux B2als v2, regular consumption | 0.0475/hour each | 4.56 for 48 hours; 15.96 for seven days |
| Standard IPv4 static public IP | 0.005/hour each | 0.48 for 48 hours; 1.68 for seven days |
| E4 LRS 32 GiB Standard SSD storage | 3.264/month each | 6.528/month combined |

Disk mount/operation meters, transfer and other usage are additional. A 30-day
illustrative disk proration adds about USD0.44 for 48 hours or USD1.52 for seven
days. The corresponding subtotal is about USD5.48/48 hours or USD19.16/seven days,
before those additional meters and tax. These are retail planning figures, not
an invoice or a verified remaining-credit balance. No full monthly allocation is
being left running. The larger SKU consumes trial credit rather than assuming the
free 1 GiB B2ats allowance applies to it.

Sources: [Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices),
[Basv2 sizes](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/basv2-series).
Selected meter records are retained in the checkpoint evidence.

Deallocation stops compute allocation billing, but disks and public IPs can continue
consuming trial credit. The VM expiry tag is a cleanup deadline, **not a scheduler**.
It was set to 48 hours after parameter preparation. Resume only for active work,
deallocate afterward, and remove the scoped trial group when the environment is no
longer needed. Do not treat a guest shutdown as deallocation or silently retain the
environment after its deadline. Existing remaining credit and exact trial expiry
still need confirmation; spending protection stays on.
[VM billing states](https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing).

## Verification and next work

Azure template validation and what-if succeeded; what-if showed nine resource creates
and no modification/deletion of existing resources. Deployment succeeded. Two local
template security tests pass (identity/password/setup absence and network boundaries).
SSH verified Linux/x86-64/Ubuntu 24.04 and approximately 4 GiB RAM on both hosts.
All 19 local recovery, Codex guard and template tests pass. The new template tests
are included in the platform workflow; its standard build-branch checks run after
push. No local app startup is needed, and coordinator execution/retries stay disabled.

Before any model call:

1. Confirm remaining trial credit/expiry, independent host identity and cleanup owner.
2. Qualify the complete Codex capability boundary without account credentials,
   using synthetic canaries. Shell-only routing and after-the-fact rejection do
   not suffice. If the installed client cannot support the boundary, stop the
   adapter route and release unneeded resources.
3. Add a disposable tool runtime, network/metadata controls, authenticated bounded
   transport, descendant cancellation and pending-operation drain. Preserve the
   protected verifier on a separate trust boundary.
4. Integrate durable intent/fencing/attempt authority and external signing/current
   recovery authority. Azure service compatibility, including existing Ed25519
   signature bytes, is unproven; no automatic Key Vault substitution is assumed.
5. Only then use supported private Codex login and the approved synthetic task gates.
   Subscription-only, no additional API charges, initial plus at most two repairs
   remain selected. No credentials in public CI or generated-code environments.

No model call, generated patch, local application restart, merge or promotion
occurred. Execution and retries remain disabled. Local PostgreSQL is preserved.
