# Codex transport and cancellation guard

Source `build/codex-transport-guard`:
`332f7430aaacdbef6ec18b8ff9b46530ef30fd4d`.

The new guard bounds stdout/stderr to 64 KiB, JSONL records to 16 KiB and runtime
to at most 120 seconds. Only one complete turn of reasoning/agent-message events
with zero exit can return untrusted candidate bytes. Tool/unknown events, malformed
UTF-8/JSON, incomplete output, excess output and cancellation fail closed and discard
candidate text. Diagnostics are not echoed. Root SIGKILL is requested on failure,
with a bounded two-second drain wait. Root exit is observed separately; descendant
termination, execution and retry authority are never inferred.

All seventeen local transport/policy/recovery/proxy tests passed, including four
new scenarios with real trusted Node subprocesses. Cases cover completed output,
forged success, tool events, invalid/truncated streams, stderr flooding, oversized
records, timeout and caller cancellation. No Codex inference, generated code or
Docker ran on the workstation. Whitespace checks passed.

[Platform run 38044076273](https://github.com/Rajen-Sharma/aisdlc/actions/runs/38044076273)
passed the seventeen transport/recovery/policy tests, integration, audit, production
build, browser journeys and owned database cleanup against the same source commit.
Public run identity and step results are retained in
`docs/evidence/codex-transport-guard/platform-run.json`.

This guard does not prevent tool execution. A tool event can arrive after effects;
the complete pre-execution boundary remains unqualified. The helper accepts an
already-started trusted child and has no Codex launcher, credential reader, account
billing enforcement, durable attempt store or coordinator mutation. See
`docs/security/codex-transport-guard.md` for limits and official OpenAI Docs sources.

Codex selection and limits remain accepted: existing subscription only, no additional
API charges, initial plus at most two repair attempts. Personal auth remains local.
Execution/retries remain disabled; no model call or AI patch has occurred. Local app
remains stopped and no startup retry was attempted. Next work must qualify the full
tool boundary and integrate authoritative task/attempt binding before inference.
