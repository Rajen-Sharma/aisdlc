# Fixture SYN-001 v1

Entirely synthetic. This is a project-defined Drupal-style fixture, not an official Drupal JSON:API response or verified export. Actual Drupal version is unknown. No real users, passwords, tokens, or customer data are present.

Counts: 1 author, 1 taxonomy term, 1 private media descriptor/file, 4 current content records (3 articles including a translated identity, 1 page), 1 historical revision, 1 redirect, and 4 separately stored negative cases. Composite identity includes locale: n1/en and n1/fr are distinct locale records.

Sprint 1 happy-path selector: current content records n1/en and n2/en only, with author a1 supplied as reference context. Expected fresh-run summary: selected=2, created=2, rejected=0; expected unchanged rerun: selected=2, created=0, skipped=2. These are planned expectations, not observed results. Other records are outside that selected run and must be explicitly accounted for as excluded if reporting against the full fixture.

Run negative cases separately, reporting each case ID: NEG-001/002/003 reject without writes; NEG-004 remains harmless text and cannot affect task execution or approval records. A duplicate-import scenario reuses the same selected records. A conflict scenario edits an imported destination record before rerun and expects a reported conflict without overwriting the edit. An interrupted-run scenario belongs to MVP 2.

Each run classifies selected rows exactly once: selected = created + updated + skipped + rejected + conflicted + failed. Dataset total = selected + excluded. A successful reconciled run requires failed=0, explained exclusions/rejections/conflicts, and separate reference/privacy/media validation results. Historical revisions, redirects and negative cases have separate inventories and never inflate current-content totals. Throughput and pass rates remain unavailable until actual execution.
