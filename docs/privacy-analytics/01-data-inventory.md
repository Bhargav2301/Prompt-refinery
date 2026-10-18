# Scoped usage data inventory

Inspected 2026-10-18. Purpose labels below describe code behavior, not a legal basis or approval for further use. Broader content, browser/extension storage and vendor inventories remain incomplete.

| Store / source | Data and identifiers | Existing purpose / access | Retention evidence | Open issue |
| --- | --- | --- | --- | --- |
| `usageEvents` via meter | Request, tenant, workspace, principal IDs; task/provider/status; token/cost/credits/latency; bounded attempts | Gateway/conversion accounting and owner reports; Admin SDK writes, browser rules deny | New-event `expiresAt` = creation + 90 days | Actual TTL/deletion unverified; linkable; other migration path bypasses new writer |
| `usageDailyAggregates` | Tenant/day; request/status/quality/token/cost counters | Existing operational rollups; browser rules deny | Expiry = latest write + 13 × 31 days | Not anonymous; no dedup proof; actual deletion unverified |
| `users/{uid}/usageEvents` | UID path; kind/technique/provider/source/count/score/success/time | Legacy Pro dashboard | No expiry written | Writer remains present but no external source caller found; purpose and legacy retention need review |
| Credit wallet/reservations/ledger | Tenant/principal/workspace/request links; amounts, task and lifecycle | Credit settlement in `credit-service.ts` | Separate schedules not established here | Keep separate from optional behavioral analytics; no changes in PA-001 |
| Gateway requests, circuits and admin probe/report diagnostics | Request/identity links and operational/error/model fields | Reliability/idempotency/admin views | Mixed implementation; not fully inventoried | Other string/log sinks remain; do not generalize PA-001's protections |
| `tenantProviderKeys` | Encrypted provider key, hint, owner/tenant/provider/status | User-configured BYOK in `provider-key-service.ts` | Revocation clears ciphertext/nonce/tag in code | Source permits encrypted storage when BYOK enabled; do not claim keys are never stored; runtime flags not inspected |
| Historical usage migration | PA-003 projects known legacy metadata, trusted tenant/workspace/creator, original date and bounded expiry; no raw source IDs/paths | `tenant-migration.ts` / `legacy-usage-migration.ts`, automatic profile loading and job/CLI paths | Original-date expiry, not a fresh migration clock; skips invalid/expired records | Tested locally; completed users/historical data not cleaned. No live profile call/migration run |
| Private owner dashboard response | Aggregate profile counts, validated operational totals, latency/cost and thresholded groups | PA-008a active-owner-only API; all current/future profile/event queries | Response not cached or stored; existing audit records action/window | No content/identity rows returned; no new tracking; row cap and unmarked test-traffic limits disclosed |

The new projection excludes unknown fields such as prompts, outputs, filenames, attachment bodies, headers, emails and URLs from these normal usage writers. It is not a classifier for sensitive information elsewhere in the product. Identity fields remain restricted-format server references, not anonymous identifiers. Vendor-side logs, ingress IPs, backups, support access and account erasure were not verified in this task.

## Source accounting / optional observations follow-up

See [release contract](13-refinement-metrics-release.md). New data is fixed-category optional refinement metadata in usageEvents, numeric usageSourceDailyAggregates with source, and source labels on credit/free quota reservations and settled usage ledger entries. Private chat parameter snapshots/digests are never projected into analytics. No new vendor is introduced.
