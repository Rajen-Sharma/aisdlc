# Codex transport guard boundary

The guard receives an already-started trusted child process, bounds combined stdout
and stderr to 64 KiB and individual JSONL records to 16 KiB, validates UTF-8 and a
single turn, and returns untrusted candidate text only after a complete stream and
zero process exit. It allows only reasoning/agent-message items. Tool, unknown,
malformed and incomplete events reject. Stderr is counted but never retained or
echoed. A failure latches and discards candidate text. Candidate output is not
evaluated, imported, parsed as a command or claimed to be a validated source patch.

Timeout is bounded to at most 120 seconds; caller cancellation and protocol/output
failure request root SIGKILL. A two-second drain bound returns failure even if root
termination cannot be confirmed. Root exit is reported separately. Descendant
termination is ALWAYS unverified; execution and retry authorization are ALWAYS
false. An exited root or closed pipe is not proof that all code/tools stopped.

This is transport protection, not a tool sandbox. A tool event can arrive after
effects already occurred. Real CLI invocation remains disabled until a complete
pre-execution tool boundary is demonstrated. This helper does not spawn Codex,
read credentials, enforce subscription billing, count durable attempts or perform
coordinator operations. The four tests spawn only trusted synthetic Node programs;
no model or generated code runs on Windows.

The OpenAI Docs skill was used to check the current official configuration and
permission guidance. Shell sandbox/network controls do not cover every tool or
model/authentication request. Further qualification must cover configuration,
apps/plugins/MCP/hooks, filesystem/patch/image/browser capabilities, descendant
termination and authoritative task/attempt binding before model calls.

References checked 10 October 2026:
[Configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[Permissions](https://learn.chatgpt.com/docs/permissions),
[Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security).
