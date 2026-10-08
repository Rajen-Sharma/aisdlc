# Build preflight EVD-PREFLIGHT-001

Observed during the user's request to build Sprint 1. Results describe this workstation, not deployment readiness.

| Check | Observed result | Build implication |
| --- | --- | --- |
| Node.js | v24.14.0 | Available; verify selected dependencies against this runtime |
| npm | 11.9.0 | Available; use npm and a committed lockfile |
| pnpm | Not on PATH | No global installation needed; npm is sufficient |
| Docker | Not on PATH | Cannot assume Compose can run here |
| PostgreSQL commands | No psql/postgres/pg_ctl found on PATH | Investigate a workspace-local development database before runtime verification |
| Git repository | Directory is not a Git repository | Initialize before creating implementation commits and recording review versions |
| npm registry | Payload and PostgreSQL adapter report 3.90.2 | Candidate version only; not installed or approved as a tested build |

Read the official [Payload access control](https://payloadcms.com/docs/access-control/overview), [drafts](https://payloadcms.com/docs/versions/drafts), and [Local API](https://payloadcms.com/docs/local-api/overview) documentation before implementation. Public server-side calls must explicitly respect access control rather than rely on privileged Local API defaults.

The user said “Lets build it”; this authorizes implementation of the proposed Sprint 1 scope. Explicit human security-design acceptance and reviewer accountability remain pending; requested separately under the agreed governance policy. No CMS or migration code has been written while that gate is pending.
