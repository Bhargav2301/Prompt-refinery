# Private owner operational dashboard — PA-008a

Implemented locally 2026-10-18 following the founder's explicit selection of a private owner dashboard. Location: **Settings → Admin → Analytics**. API: `GET /api/admin/analytics?days=7|30|90` (default 30). No deployment or external configuration changes have occurred.

## Sources and access

- Server authentication verifies the current Firebase identity/role. Only `role=owner` with an active account can read. User/admin/support roles are rejected; client query parameters cannot choose a user or elevate permissions.
- `users` aggregate queries count all existing Clarift profiles and profiles created in the selected interval. No email/name/profile-content scan and no beta enrollment list. Future profiles are included automatically on refresh. Authentication-only accounts without a Clarift profile are not counted.
- `usageEvents` is queried for the UTC interval, newest first, selecting only aggregation metadata and flags. Maximum 10,001 rows fetched to detect the 10,000-row display limit. The query does not read prompt, output, attachment, email, model, error or principal-ID fields.
- A second runtime projection prevents private strings in historical metadata from becoming chart labels. Legacy migrated events are excluded because their schema/meaning differs from operational request events.
- Responses are `private, no-store`. Maximum 20 reads per owner per five minutes using existing distributed limits. The existing admin-center flag disables reads. A successful read writes the existing admin audit with the verified actor and a fixed action/window only; no report rows or request data are copied into the audit.
- This feature adds no event SDK, collection endpoint, polling, browser identifier/storage, provider call, vendor or tracking flag. Network/API behavior is exercised with synthetic dependencies only unless separately stated in evidence.

## Definitions

| Metric | Definition / caveat |
| --- | --- |
| Clarift accounts | All documents in `users`, including staff, disabled and pending-deletion profiles. Not a count of active/consenting users. |
| New accounts | Profiles whose `createdAt` falls within the selected interval. Missing creation dates cannot contribute. |
| Recorded requests | Eligible root event documents in the interval after validation/exclusions; not pageviews or every attempted request. Current root IDs overwrite repeated writes to the same request document; legacy records are excluded. No claim of end-to-end deduplication across different IDs. |
| Personal workspaces represented | Distinct tenant IDs across eligible events. Current architecture creates a personal tenant per account. IDs stay server-side; not a DAU/WAU or retention definition. |
| Success rate | Successful event documents ÷ eligible request documents. Counts are shown beside the percentage; zero denominator displays unavailable. |
| Credits charged | Sum of recorded `creditsCharged`, not wallet balance, revenue or reconciled ledger settlement. |
| Reported provider cost | Sum of finite, nonnegative reported USD costs; missing values excluded. Count of requests with known cost shown. Does not include unreported spend, hosting, tax, retries missing from telemetry or invoices. |
| Tokens | Sum of known input/output counts. Coverage shows requests where both are known. |
| Latency median/p95 | Nearest-rank percentiles of recorded nonnegative milliseconds. Includes successful and failed requests; not browser-perceived time. |
| Daily/task/provider views | Counts in UTC/allowlisted categories. Unrecognized providers map to `unknown`; arbitrary diagnostic strings are not labels. |

All windows start at UTC midnight `days−1` days before today and end at the query time (exclusive). Today is partial. Daily series includes zero-request days when not suppressed. The app displays the actual period/update time, missing-cost coverage and excluded record counts.

## Coverage and privacy limits

Legacy records, invalid/out-of-window records, and events explicitly marked `isInternal`, `isSynthetic`, or nonproduction `environment` are excluded. Current writers do not reliably emit these flags, so unmarked staff/test traffic can remain. This is disclosed in the UI; there is no claim of clean beta product metrics.

At more than 10,000 matching documents, totals/percentiles/groups describe the latest eligible subset only; the UI shows a partial-data notice. Account counts are separate aggregate queries and not subject to this row cap. Each refresh uses new queries, not a static list of users.

Daily, task and provider dimensions are each withheld entirely if any nonempty group contains fewer than five distinct tenants. This avoids exposing one small residual group by subtraction within the same dimension. Overall totals remain restricted to the owner. Multiple overlapping queries and external knowledge can still reveal information; this is not an anonymous public dashboard. No row-level identities or drilldown/export added.

Optional adoption, activation, retention, feedback and content-research metrics remain blocked on purpose/consent design. Operational data must not be presented as consenting-user behavior or proof of downstream value.

## Local files / further validation

UI/types: `src/components/owner-analytics-panel.tsx`, `src/lib/owner-analytics.ts`, AdminPanel tab integration. Server: `src/lib/server/owner-analytics.ts`, `owner-analytics-request.ts`, route above. Tests: `tests/owner-analytics.test.ts`.

Before deployment: review source projection, owner checks, bounded query cost, database index availability and the stated limitations. Actual Firestore reads, deployed owner access, live profiles, browser authentication, vendor settings and production performance are not verified by local doubles.

The actual report view was also rendered with project CSS and synthetic data in headless Chromium at desktop/mobile widths. Screenshots were visually inspected and no horizontal overflow was found; see [test evidence](11-test-plan-and-evidence.md). This checks presentation, not authenticated application interaction.

## Current extension of the report

Source accounting, requested/detected technique signals, redo depth/counts and parameter-change categories are specified in [the release contract](13-refinement-metrics-release.md). These are default-off optional observations alongside essential accounting. The earlier no-new-collection statement describes PA-008a only.
