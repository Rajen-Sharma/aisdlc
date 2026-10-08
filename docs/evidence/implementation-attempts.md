# Implementation attempts and corrections

Preparation date: 8 October 2026 (Australia/Sydney). Records below preserve failures observed during development; final result artifacts are separate. These summaries are not replacements for all raw session output, which was not persisted for the earliest attempts.

1. Initial install: audit found 16 vulnerabilities including 5 high. Compatible pinned overrides applied; final machine-readable audit retained.
2. Initial typecheck: access-function return types too broad. Narrow boolean/Where signatures applied. Generated Payload types later exposed role/visibility literal typing errors; types corrected.
3. Initial Next dev: forwarding Node's --env-file through Next worker NODE_OPTIONS failed. Dedicated launcher loads env before spawning Next.
4. Initial integration run: role escalation was silently discarded instead of explicitly rejected. Added a before-operation role guard; subsequent behavior checks passed.
5. Next integration attempt: all four behavior tests passed but test cleanup attempted a second author deletion. Corrected cleanup; final parent and subtests pass.
6. Initial browser API request: missing Origin caused cookie authentication to be denied. Retained [attempt result](browser-check-attempt-1.json); corrected the test request Origin to match the same-origin browser journey. No authentication control was relaxed.
7. Initial admin import map: hand-written TS placeholder shadowed the generated JS map. Removed placeholder and generated the framework map; admin/dashboard and role-aware button verified.

Limitations: no historical commits for each initial attempt; no total cost/active-effort baseline measured; no external CI run yet. Do not claim a complete immutable auditor record from this first local development session. Later pipeline work must capture these artifacts at execution time.
