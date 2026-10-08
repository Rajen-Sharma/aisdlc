# Local MVP 1 operator guide

Scope: synthetic single-site demo only. Real Drupal/AEM adapters, public hosting, identity/MFA integration, production migrations, media transfer and recovery targets are not implemented. Production-mode build success is not production acceptance.

## Clean setup

Use Node 24.x and npm. From the repository root:

```powershell
npm ci
npm run setup
npm run db
```

Keep the database terminal running. This uses workspace-local PostgreSQL 17 binaries on loopback port 55432, with persistent files in ignored `.local/postgres`. No Docker or global PostgreSQL installation is needed. The embedded package is a development convenience and is not the production hosting design. If you supply an existing development PostgreSQL database, set DATABASE_URL and skip `npm run db`.

In another terminal:

```powershell
npm run seed
npm run import:demo
npm run dev
```

Open http://127.0.0.1:3000 for published content and http://127.0.0.1:3000/admin for the editor. Random synthetic login credentials are written to `.local/demo-credentials.json`; read them locally, never commit or attach them to review evidence. Seed does not rotate existing credentials. Environment secrets live in ignored `.env`; setup preserves existing files. Use separate isolated development databases for tests and human review if both run concurrently.

## MVP demonstration

1. Import the sample: two English articles are selected; the English page and French article are explicitly excluded.
2. Repeat the import: the unchanged two records are skipped and no duplicates created.
3. Log in as editor; edit the draft, save and reload. Publish is absent. Editors cannot change roles or visibility. Editing already published content is currently reserved for publishers/admins.
4. Log in as publisher; change visibility to public and publish. Check the anonymous public page/API.
5. Check that anonymous draft, private and revision requests are denied; review automated negative results.
6. Re-import after a destination editorial change: a conflict is reported and the human edit retained.

The importer is CLI-only and privileged; it is not a public API endpoint. MVP 1 imports are an offline operation: stop editorial writes and run one importer at a time. Concurrent-editor conflict locking, streaming extraction, restart checkpoints, media and rich-text transforms are later scope. Do not use MVP 1 to import production exports. Body content is plain text; angle-bracket markup is rejected. Legacy taxonomy/locale/revision fixture metadata remains staged for later mapping and is not claimed as migrated.

## Verification and evidence

```powershell
npm run typecheck
npm test
npm audit
npm run build
npx playwright install chromium
npm run test:browser
```

Database and dev server must run for browser verification. Integration tests create namespaced synthetic records and remove their records afterward. Browser checks create a temporary article, save/publish through the UI, verify REST permissions and remove the article. Credentials are read locally without logging passwords. Screenshots are kept in `.local/screenshots`; result summaries are in `docs/evidence`. Existing tests may see other public content; they assert access properties rather than assume an empty database.

`npm run build` creates an optimized artifact; `npm start` serves it on loopback. The development database schema is pushed by Payload only outside production mode. Production deployment needs versioned database migrations and its own reviewed runbook. Email delivery is not configured; password recovery and invitation delivery are unavailable for this MVP.

Stop server and database with Ctrl+C in their respective terminals. Keep `.local/postgres` for the next session. No destructive reset command is supplied. Backup/restore automation is later production-readiness work.
