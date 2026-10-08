# ADR-001: local MVP implementation

Date: 8 October 2026 (Australia/Sydney). Scope: approved local Sprint 1 design. Status: implemented for review; production stack acceptance remains conditional.

Use Payload 3.90.2, Next.js 16.4.0, React 19.3.0 and PostgreSQL with npm lockfile pins. Use embedded PostgreSQL 17.10 for local development because Docker/PostgreSQL commands were unavailable; this does not replace managed PostgreSQL for production. Plain text avoids implying an implemented Drupal rich-text mapping. Disable GraphQL until its access paths are explicitly tested; REST and the admin UI are the implemented interfaces.

Use explicit collection/field authorization, a before-operation role guard, and a role-aware publish button. Framework field access may silently discard unauthorized fields; explicit role escalation must return a denial instead. Anonymous server reads explicitly set overrideAccess=false. The importer alone uses privileged local calls; users cannot modify provenance fields through public management APIs.

Initial npm audit reported 16 dependency findings. Pin compatible overrides for undici 7.29.1, sass 1.105.1, DOMPurify 3.4.16 and esbuild 0.28.2; the subsequent audit reports zero vulnerabilities. Overrides require ongoing compatibility and security review on upgrades. This result is scanner evidence, not proof of absence of vulnerabilities.

Synthetic adapter capabilities explicitly exclude revision extraction, media, deltas and deletion detection. Migration uses composite identities, source hashes and destination-content hashes. Destination changes win through explicit conflict reporting. Until transaction/concurrency work in later scope, migration is offline with one importer and no editorial writes.

Sources: [Payload installation](https://payloadcms.com/docs/getting-started/installation), [field access behavior](https://payloadcms.com/docs/access-control/fields), [Local API access controls](https://payloadcms.com/docs/local-api/overview), and installed dependency types/source. Tooling decisions and later capability changes need updated review evidence.
