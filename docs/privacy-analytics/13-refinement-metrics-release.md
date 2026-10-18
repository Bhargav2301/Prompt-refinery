# Refinement metrics and extension 2.5 release

## Authorization and scope

On 2026-10-18 the founder requested technique-match, redo and parameter-change reporting, separate website/extension usage, simpler extension setup, tests, a push and deployment. This expressly supersedes the earlier local-only release boundary for these changes. It includes the previously prepared telemetry/migration hardening and private owner dashboard. It does not authorize historical data cleanup, changing prices, or publishing to browser stores.

## Measurement contract

- Essential accounting always retains the server-selected source: app (website), extension, or api. Neither request bodies nor query parameters choose it. Credit reservations and settled ledger charges carry that source; existing prices, wallets and quotas remain shared and unchanged. Free-inference reservations also carry source. Historical missing sources are unknown, not backfilled guesses.
- Usage events and both tenant/day and tenant/day/source totals are written in one transaction. An existing event ID prevents duplicate increments. Storage errors produce only a constant warning and cannot turn completed inference into a retry. Financial settlement is separate and remains idempotent; missing telemetry is not a billing ledger.
- Optional statistics require an explicit per-request boolean, default false, AND ENABLE_REFINEMENT_ANALYTICS=true. The website checkbox applies to the current tab and resets on account change. Extension consent is stored locally, defaults false, and clears on sign-out or invalid refresh. Turning it off stops future sharing; already submitted work retains its submitted choice. No site browsing, keystrokes, background capture or extra model call is added.
- The new usage event refinement object contains consentVersion=1, requested technique, detected technique categories, matched/different/uncertain, method=structural-signals-v1, and optional revision metadata. Arbitrary fields/categories are stripped or rejected. No original/refined prompt, hash, URL, reference title/file name, model reasoning, old/new setting value or chat ID enters it.
- Structural signals are a heuristic, not an independently validated semantic classification. Multiple techniques may coexist. Absence of recognized signals is uncertain, never assumed zero-shot. Only generative results enter technique comparisons; fallback/unknown quality counts remain separate. This is not user satisfaction, dissatisfaction, need-to-redo or accuracy ground truth.
- Website redo means the user selected Refine this version, including an edited version; ordinary later prompts are follow-ups. Depth is successful ancestor depth, capped at 100. Parent turn IDs, typed setting snapshots and reference/attachment comparison digests remain solely in the user's private chat, or in memory for temporary chats. Previous metadata missing from older history is unknown.
- Website comparison covers prompt edit, technique, mode, destination, maximum length, inference mode, BYOK provider, reference content/selection and attachments. Only changed category names are counted. Content comparison digests never enter analytics. A changed reference or file with the same count is detected. Refinement snapshots are not reconstructed from private historical prompts for analytics.
- Extension redo means refining the preceding returned output again in the same editor/document or standalone text tool. Edited/replaced text begins a new sequence; worker restart/page reload can lose baselines. Technique, mode and reviewed context changes are categorized. Prior output/context are kept only in page memory. Client-supplied version metadata is observational, untrusted for billing.
- Samples cover successful, opted-in events in the selected UTC window, not every user/request. Low-count dimensions are suppressed at five workspaces, consistent with the owner dashboard. Sources, technique pairs and change categories have independent coverage. No per-user content or identities are returned.

## Delivery

Extension 2.5.0 uses the trusted Clarift production address regardless of stale API URL settings. The API URL field and Save Settings step are removed; settings save on change. The popup offers Connect Clarift account when disconnected. Device approval is still required. Local context pills remain usable without an account. The website reads the manifest version for its download label and cache-busting URL.

All previous migration guards remain: version 2, no retroactive cleanup, source-date retention, replacement of partial copies, no aggregate increments. No manual production migration is part of deployment.

## Limits and controls

Event expiry fields remain 90 days; daily accounting totals 403 days. Actual TTL enforcement, account export/deletion, backups, full account-wide consent receipts and vendor/logging guarantees are not established by these tests. Raw new optional payloads share existing tenant-linked usage records and are not anonymous. These changes are not a full privacy compliance certification. Set ENABLE_REFINEMENT_ANALYTICS=false and redeploy to stop new optional observations; essential source accounting continues. Older already-stored contamination requires a separately reviewed cleanup.

Rollback target observed before release: App Hosting build-2026-10-18-001, rollout SUCCEEDED. Prefer disabling optional measurement over reverting the legacy privacy fix.

## Evidence

Executed evidence and final release identifiers are recorded in 11-test-plan-and-evidence.md and the release receipt. Fixtures use synthetic data; simulated linking does not establish a live user's end-to-end sign-in or paid provider refinement. Live browser-store compatibility is not inferred from Chromium fixtures.
