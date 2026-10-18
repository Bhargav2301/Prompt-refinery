# Scoped discovery — 2026-10-18

Follow-up status: PA-003 now hardens the automatic usage migration locally, and PA-008a adds the explicitly requested private owner operational dashboard. The baseline findings below describe the pre-fix audit unless marked otherwise. See the checklist, metric definitions and executed evidence for current status; production remains uninspected/unmodified.

## Baseline and evidence limits

Workspace: `C:\Projects\prompt_refinery`. Branch inspected: `codex/account-email-delivery`, HEAD `b4f8236` (account email documentation), following `6e58e91` (account email delivery) and `f2b462d` (saved chats/account recovery/references). The initial working tree had no tracked edits and contained unrelated untracked work, which is preserved.

The checked-out tree matched saved `origin/main` (`a74619b8ed3c6aeb756383cc736a947f55c20842`) at discovery. No remote fetch or current production inspection was performed; this is not a claim about latest GitHub or deployed code. `git diff --name-only f2b462d..HEAD` showed account email/security/client/config/tests and TypeScript configuration changes, with no usage-writer changes in that range. The latest local email changes do not establish any privacy analytics approval or test result. No earlier privacy checklist or decision log was found in the inspected local sources; D-001 authorizes establishing them now.

Inspected: package/test configuration, existing privacy/readiness/analytics notes, usage writers and their inference/conversion callers, tenant identity resolution, provider credentials/client, migration and admin report consumers, and relevant Firestore rules. Searches covered telemetry SDK names and browser storage APIs. This is the discovery needed for PA-001, not a complete application/security/vendor audit. No production secrets, user records, provider requests or external account settings were accessed.

## Architecture and feature evidence

| Finding | Source | What the evidence establishes |
| --- | --- | --- |
| Next.js App Router, React, Firebase Auth/Admin Firestore, Genkit, Zod, Stripe dependencies | `package.json`, `src/lib/server/firebase-admin.ts`, `src/lib/server/user-access.ts` | Source architecture; deployed versions/settings not checked |
| Refinement/evaluation with credits, managed/BYOK inference and fallback | `ai-gateway.ts`, `free-inference-gateway.ts`, `credit-service.ts`, `provider-key-service.ts` under `src/lib/server/` | Implemented server paths; not live provider verification |
| Conversion with operational usage recording | `src/app/api/markitdown/route.ts` | Conversion event producer; separate file metadata writes remain outside this patch |
| Saved prompts/chats and account email work exists in this checkout | Recent commit history, `src/app/subscription-actions.ts`, `tests/save-prompt.test.ts` | Code exists; no current end-to-end claim |
| Owner diagnostic/beta reports consume root usage records | `src/lib/server/admin-service.ts` | Existing reuse/access checks in code; purpose/consent and report privacy review still needed |
| User usage dashboard reads legacy per-user events | `src/lib/server/usage-analytics.ts` | `ENABLE_USAGE_ANALYTICS` gates reads, not writes; no external callers of the legacy writer found in `src` search |
| Browser clients cannot directly read/write usage collections in checked rules | `firestore.rules` | Source rule denial for root/per-user usage and aggregate collections; deployed rules/emulator behavior not verified this slice |
| No common third-party analytics SDK found in scoped source search | Searches for PostHog, Mixpanel, Amplitude, gtag, Google/Firebase Analytics, Sentry, session replay | Negative search evidence only; does not prove lack of hosting, proxy or provider logging |
| Browser storage includes UI/provider preferences and session transfer data | `src/components/ui/sidebar.tsx`, `src/context/workflow-context.tsx`, related source searches | Some existing storage is functional/content-bearing; not an exhaustive cookie/extension inventory |

## Data flow for this slice

Authenticated app/API/extension request → server resolves user/tenant/workspace → inference or conversion → provider processing and separate credit/quota accounting → `recordTenantUsage` → `usageEvents` and `usageDailyAggregates` → owner reports. Existing operational records are linked to account/tenant identity.

Legacy token wrapper → verified UID → `recordUsageEvent` → `users/{uid}/usageEvents` → Pro usage dashboard. No current call sites outside the legacy module were found for that writer. `account-service.ts:getVerifiedUserProfile` automatically invokes migration for users not already marked migrated; job/CLI entry points also exist. At baseline this copied historical records without projection. PA-003 now applies the shared legacy schema and trusted context before replacement writes; completed historical migrations are not retroactively cleaned.

Before PA-001, root writes spread the runtime input and diagnostic fields were only truncated. The local patch introduces a runtime field projection for normal writes. Provider prompts/responses and saved content remain separate flows and were not audited end to end here.

## Evidence-based risks

| Risk | Finding | Status / follow-up |
| --- | --- | --- |
| Arbitrary event fields and private text in diagnostic metadata | `usage-meter.ts` spread; truncation in both usage modules | Addressed locally by PA-001; see executed test evidence |
| Arbitrary error names in wrapper warnings | Legacy `recordUsageEventFromToken` warning | Addressed locally with a constant message |
| Collection without a demonstrated optional-purpose gate | Both writers lack consent checks; analytics env flag only controls dashboard read | Open; classify purposes before new collection/reuse |
| Other diagnostic sinks and automatic migration | Original migration spread old data; gateways/circuit breaker retain other diagnostics | Migration fixed locally in PA-003; remaining sinks open under PA-003b. No global no-content guarantee |
| Telemetry outage can fail a completed operation | Gateway/conversion paths await the meter; storage errors still propagate | Open PA-006; transaction/credit effects need targeted tests |
| Replay can double-count aggregates | Meter overwrites event ID but increments daily counters on each call | Open PA-006; no deduplication guarantee added |
| Retention documentation overstates evidence | Expiration fields exist, but TTL execution not checked; legacy writer has no expiry | Open PA-007; timestamp tests do not verify deletion |
| Linkable records and small cohorts | Raw IDs and request links; existing owner report breakdowns | Open purpose/access/suppression review; not anonymous |
| Vendor/legal/logging facts unknown | Source cannot establish production settings or contractual terms | Not inspected externally; no compliance conclusion |

## Minimal beta direction (proposal, not rollout approval)

First harden existing metadata locally (PA-001). Next inventory remaining sinks and resolve essential processing versus optional purposes. Then design a first-party default-deny consent/ingestion path using existing infrastructure, with restricted identity mappings, explicit event schema, server collection controls, failure isolation and deduplication. Implement retention/rights controls before optional metrics and cohort views. Validate actual network/accessibility/concurrency behavior in an approved test environment before any beta rollout.

Critical unanswered facts are operating entity, target markets/user ages, approved purposes/retention, vendor terms and deployment configuration. None blocks PA-001. Answer them at the phase where they affect implementation; do not infer them from the founder's location or domain names.
