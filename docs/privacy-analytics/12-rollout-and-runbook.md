# Local review and release boundary — PA-001, PA-003, PA-008a

The earlier authorization ended at locally tested source changes and documentation. **D-016 now explicitly authorizes pushing and deploying the tested refinement analytics/extension release.** See [current release contract](13-refinement-metrics-release.md). The remainder of this paragraph records the earlier scope: Migration code changes and the private owner dashboard are explicitly approved; executing a live migration is not. No push, PR creation, deployment, provider call, analytics collection enablement, DNS/email configuration or other external mutation is part of this task.

## Change manifest

- Added `src/lib/server/usage-telemetry-schema.ts` and `tests/usage-telemetry.test.ts`.
- Updated `src/lib/server/usage-meter.ts` and `src/lib/server/usage-analytics.ts`.
- Established this documentation set; linked/corrected the relevant older analytics/privacy notes.
- Added `legacy-usage-migration.ts`, updated `tenant-migration.ts`, and added `tests/legacy-usage-migration.test.ts`. Usage migrations now project fields and replace eligible destination records. Migration version remains 2. Original dates and earlier expiry are retained; no historical cleanup executed.
- Added owner report types/service/request handler, `/api/admin/analytics` GET route, `owner-analytics-panel.tsx`, AdminPanel Analytics tab and `tests/owner-analytics.test.ts`. Added a synthetic browser-rendering script at `scripts/test-owner-analytics-browser.tsx`.
- No dependency, database rule/index, environment, browser storage or vendor changes. No new event stream or analytics SDK. The new server endpoint reads existing metadata for a current active owner and records a fixed administrative access audit using existing infrastructure.
- Existing normal-writer document fields/expiry calculations remain. Invalid optional metadata is null/fixed-category; malformed core metadata is skipped. Custom model names are omitted until reviewed. Production historical data is unchanged.
- Runtime cost after an approved deployment: each owner refresh performs two Firestore aggregate queries and a maximum 10,001 event-document reads, plus existing rate-limit/audit operations. Exact charges have not been researched; no added vendor subscription or paid model call. The UI makes no automatic polling requests.

## Before any release

Review the diff and executed evidence, confirm the reduced metadata is acceptable to operational report owners, and review the known collection/retention/failure-isolation limits. Obtain explicit approval for the concrete next external action (for example pushing the reviewed branch or deploying an identified revision). This patch does not authorize enabling optional analytics or certify the full privacy specification complete.

CI and staging require their own executed evidence. Use synthetic accounts/data and exclude internal test activity from any future product metrics. Actual network behavior, deployed authorization, vendor logging and expiry cannot be inferred from the unit tests.

## Rollback and monitoring

Before release, the local patch can be reverted by reversing only its changed hunks/files while preserving other work. No migration or external rollback is needed now. A future code rollback would restore the unsafe spread/truncation behavior; prefer fixing the allowlist/projection forward rather than reopening that path. Rollback cannot sanitize or delete old records.

After an approved staging deployment, inspect synthetic writer output and report compatibility without logging full payloads. Review unexpected null model/category counts and missing-event behavior with content-free diagnostics before a wider release. No monitoring job, alert or automation is scheduled by this document.

Do not run migration or infer cleanup from `expiresAt`. Profile loading also calls `migrateUserTenantData` for unmigrated users; PA-003 hardens that shared function locally. It does not remediate already-completed migrations or delete skipped source/destination records. Historical cleanup, TTL configuration and rights workflows still need reviewed plans and authorization for their external effects. Before release, also validate projected/count queries and owner access against an approved staging database; local doubles cannot establish index availability or production permissions.
