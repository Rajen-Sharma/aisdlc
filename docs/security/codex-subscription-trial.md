# Selected Codex subscription trial

The human selected Codex after the proposed limits: existing subscription usage
only, no additional API charges, one initial attempt and at most two repairs.
This resolves the provider choice and monetary boundary for this trial. It does
not accept a task, qualify an executor or approve code/security/outcome/MVP gates.

Local metadata preflight confirms CLI 0.155.1 and ChatGPT authentication. Its
environment allowlist excludes API keys, proxy/custom endpoint variables and
inherited model configuration. It invokes only version, login status, help and
feature metadata, with forced_login_method=chatgpt for status. It never reads or
copies auth files, runs inference or exposes account identity/credentials. The
published report contains only trusted fixed fields. Qualification expires when
the pinned CLI version changes. Metadata checks do not pin executable integrity
or attest the operating system.

The user authentication must stay local. Official non-interactive documentation
explicitly excludes the saved-account CI workflow from public/open-source
repositories; this repository is public. Do not place personal auth.json in
GitHub Secrets, artifacts, source exports or a test container.

## Proposed adapter boundary, not yet qualified

Trusted local CLI client -> supplied synthetic prompt/source -> bounded structured
candidate bytes -> source-capsule validation -> isolated GitHub Linux verifier.
Credentials remain in the trusted client, generated code never executes locally,
and returned code never becomes a shell command or import. No server/app startup
is needed to prepare this adapter. The coordinator remains executionAllowed=false.

Before the first model call, demonstrate all of the following:

- Explicit ChatGPT-only authentication on the actual invocation and no API key,
  endpoint, provider fallback or additional-credit purchase path. Subscription
  billing/account behavior is not proven by the local login status string alone.
- Controlled working directory, user/project configuration and rule isolation;
  no inherited MCP servers, plugins, hooks, skills or connected apps.
- A complete tool boundary. Disabling shell_tool alone does not establish that
  filesystem, patch, browser, image or other tool capabilities are absent. Neither
  prompts saying "no tools" nor after-the-fact event rejection can prevent effects.
- Bounded prompt/output/schema, process lifetime and descendant termination;
  durable attempt accounting across restarts, including failed/uncertain calls.
- Exact task contract and applicable real human gates, safe patch validation and
  separate verifier checks. No manually implemented fixture counts as delivery.

The current preflight deliberately returns toolBoundaryQualified=false and
modelCallAllowed=false. There is no model invocation path to accidentally enable.
The remaining boundary must be implemented and qualified before advancing.

## Official references checked 10 October 2026

- [Authentication](https://learn.chatgpt.com/docs/auth): ChatGPT versus API auth.
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode):
  exec flags, structured output and public-repository account-auth restriction.
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference):
  forced_login_method and shell_tool settings.

These sources were checked with the OpenAI Docs skill. No API-backed application
or API key is used by this metadata-only implementation.
