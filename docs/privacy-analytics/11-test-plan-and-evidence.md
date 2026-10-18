# Test plan and evidence — PA-001

Date: 2026-10-18 (Asia/Calcutta). All new fixtures are synthetic. No real account, inbox, provider request or Firestore instance is used by the new tests. Prior-session test totals are not evidence for this patch.

## Executed checks

| Command | Actual result | Limits |
| --- | --- | --- |
| `node --import tsx --test tests/usage-telemetry.test.ts` | PASS: 11 tests, 0 failures, 0 skipped | Actual writer functions with in-memory Firestore doubles, real Timestamp/FieldValue objects; no deployed/emulator proof |
| `npm.cmd run typecheck` | PASS: exit code 0, no TypeScript diagnostics | Static checking only |
| `npm.cmd run lint` | PASS: exit code 0, no lint diagnostics | Static checking only |
| `npm.cmd test` (sandbox) | FAIL: 129 tests, 125 passed, 4 failed, 0 skipped | Four MCP local transport tests failed: three `fetch failed`, one stdio `usage_get` returned `isError: true`. All 11 new tests passed |
| `node --import tsx --test tests/mcp-protocol.test.ts` (approved local loopback access) | PASS: 7 tests, 0 failures, 0 skipped; exit code 0 | Same test file/code, synthetic local servers and child process; all four previously failing cases passed |

The rerun supports the sandbox loopback restriction as the cause of the four transport failures. All 129 suite cases have passing evidence across the initial run and targeted rerun; there was no single all-green full-suite run. No test implementation was changed to bypass a failure. The suite's extension packaging step produced no tracked change to the download ZIP.

The shell printed an `InitializeDefaultDrives` warning before some commands. The targeted runner nevertheless completed with exit code 0 and its explicit test summary. Command exit/results, not command dispatch, determine status.

## Targeted scenarios

Each test starts with a synthetic event and fake storage. Steps call the real writer; assertions inspect the outgoing batch/documents, increments, storage access and captured console calls. The initial targeted run passed all rows below.

| Scenario | Expected and observed result | Limitation |
| --- | --- | --- |
| Valid usage | Costs, credits, counts, categories and timestamps preserved; one batch | Does not settle real credits |
| Extra content fields, including nested response/headers | No unknown fields or private fixture values in writes; supplied timestamps cannot override server values | Historical records not scanned |
| Private text/email/key/URL in optional string fields | Null or fixed category; costs preserved | Authenticated ID provenance not proven by syntax |
| Known and tampered diagnostic codes | Known code preserved, appended text/invalid HTTP error rejected | Other logging paths not covered |
| Invalid required metadata | Storage not accessed; no raw-input/schema logging | Missing-event monitoring not added |
| Malformed numbers | No NaN/Infinity/negative/unsafe value in event or increments; zero/fractional cost preserved | Aggregate retry dedup remains open |
| Oversized/malformed attempts | At most three inspected entries; malformed entries omitted without throwing | Not a public request-size guard |
| Conversion, BYOK, API, extension categories | Existing categorical metadata preserved | No real inference/conversion performed |
| Legacy techniques and private metadata | Existing technique values retained; private values/extra properties excluded | No legacy caller activation added |
| Legacy invalid subject/core values | Rejected before storage | Cross-tenant authorization requires caller tests |
| Token wrapper and error paths | Verified UID forwarded; missing token ignored; verification/storage failures emit only fixed warning | Root meter outage still propagates to callers |

## Not run / not established

- Production build, CI, staging, deployment, production smoke tests and browser/network inspection.
- Firestore emulator/rules tests, actual TTL cleanup, account deletion/export, backup restoration.
- First-visit consent, refusal/withdrawal, cross-tab/device/login handling, receipt replay and concurrent withdrawal/ingestion; no consent system added in this slice.
- End-to-end telemetry outage isolation, aggregate duplicate handling, internal/synthetic cohort filtering, small-slice suppression and privacy UI accessibility.
- Vendor logging/terms/data locations or legal compliance validation.

These remain unverified rather than passed. See the implementation checklist for dependencies before expanding QA.

## Follow-up: migration and owner dashboard — 2026-10-18

Authorization: founder requested migration hardening/tests/docs and a private owner dashboard, with no deployment/external changes. Earlier results above remain historical evidence; the following checks ran against the follow-up code.

| Command / check | Actual result | Limitations |
| --- | --- | --- |
| Initial targeted migration/dashboard/writer tests | 27/28 passed; one fake-query count assertion failed | Test double evaluated its count after mutating its filter list; corrected to capture the aggregate query at construction. No application logic changed to bypass this assertion |
| `node --import tsx --test tests/legacy-usage-migration.test.ts tests/owner-analytics.test.ts tests/usage-telemetry.test.ts` | PASS: 29/29, zero skipped | Six migration tests, twelve dashboard tests, eleven writer tests; fake Firestore and synthetic input |
| `npm.cmd run typecheck` then `npm.cmd run lint` | PASS: both exit 0 | Static checks; no deployment |
| `npm.cmd test` with approved local loopback access | PASS: 147/147, zero failed/skipped, exit 0 | Full local suite including MCP loopback tests; synthetic provider/email fixtures only |
| `git diff --check` | PASS | No whitespace errors; existing line-ending warnings only |
| Extension ZIP comparison after test packaging | No tracked ZIP changes | No new extension release |
| `node --import tsx scripts/test-owner-analytics-browser.tsx` with bundled `CLARIFT_PLAYWRIGHT_MODULE` and approved headless-browser access | PASS at 1000×1100 and 390×844; table visible and no horizontal overflow; both screenshots visually inspected | Static rendering of the actual report component with synthetic data and project CSS. External requests blocked. Does not test sign-in, live API or period/refresh interactions |

Rendering evidence: [desktop](../../tmp/owner-analytics-preview/desktop.png), [mobile](../../tmp/owner-analytics-preview/mobile.png), [local HTML](../../tmp/owner-analytics-preview/index.html). An initial sandbox rendering attempt failed; a read-only check found the sandbox-resolved Chromium path missing. The approved local headless rerun passed. Type checking and lint were rerun after adding the rendering script and both passed.

Migration preconditions: synthetic unmigrated profile, valid/invalid legacy records and in-memory batch store. Assertions cover exact saved field keys, rejection of private fields and actor spoofing, preserved dates/earlier expiry, invalid/expired skips without logs, replacement of a contaminated partial copy, deterministic retry IDs, unchanged completed-user guard, no daily counter increments, dry-run no-write behavior, content-store separation, and 805 eligible records in batches of 400/400/5. These test the actual automatic-migration function, not just its projector.

Dashboard preconditions: synthetic current owner/user/support/admin identities and projected event fixtures. Assertions cover arithmetic/coverage/percentiles, zero days, all three UTC windows, future profile inclusion on refresh, bounded/projected reads, private-text label prevention, legacy/test exclusions, small-group suppression, owner/account-status denial before reads, disabled feature, invalid windows, throttling, missing authentication on the actual GET route, fixed error logs, and HTML rendering of empty/partial/suppressed states. Production identity verification and Firestore access are not replaced with a claim of live testing.

Still unrun: production build/CI/deployment, actual Firestore queries/indexes/rules/TTL, live authenticated browser flow, historical cleanup, consent/withdrawal system and rights/backup workflows. No production account, content, secret or external service was queried during this follow-up.

## Refinement metrics / extension release, 2026-10-18

- Targeted privacy/migration/owner/refinement tests: **37/37 passed**.
- Full regression suite after updating the stale extension version assertion: **156/156 passed**, zero failures/skips. Includes direct credit reservation/settlement tests, channel replay rejection and one-time charging, optional default denial/kill switch, classifier uncertainty/mixed techniques, complete parameter categories, source aggregation, suppression and telemetry outage/deduplication.
- Typecheck and lint passed during the build; final static checks rerun after follow-up edits.
- Local production build: **passed**. Windows intentionally skips packaged MarkItDown installation; Linux CI/App Hosting validate that packaging.
- Extension synthetic browser tests: **passed**, including privacy exclusions, virtualized/lazy history, delayed-editor race preservation, context pills, copy/download, API-URL-free setup, autosave, fixed trusted origin despite stale override, consent/withdrawal, mocked account linking and sign-out. No live email/provider action.
- Chat browser tests: **passed** against real React and synthetic APIs: initial/follow-up/edited redo lineage, consent default/refusal/opt-in/withdrawal, private/temporary chat persistence, references and context delivery. The old signup fixture still mocked Firebase email delivery; it was updated to mock the current account-email client before the final passing run.
- Owner report rendered at 1000px and 390px with the new source/quality/version sections; **passed**, no document overflow. Screenshots visually inspected. The old one-table assertion was corrected for the added source table.
- No historical data cleanup, user content inspection, billing price changes or browser-store publication is included. Optional metrics are observed categories, not verified semantic accuracy or user dissatisfaction.

- Real unpacked extension in an isolated bundled Chromium profile: **passed** service-worker startup, frame messaging, automatic history collection, context-pill draft and clipboard copy. The local fixture port was 9002; no personal browser profile was used.
- Final typecheck/lint: **passed**; downloadable archive regenerated from extension source.

## Live developer-account verification, 2026-10-18, 14:48–14:59 UTC

The founder explicitly requested end-to-end tests of the deployed website and installed extension using their account. These used new synthetic book-swap prompts and real production inference (no mocks). The existing account was already signed in. The founder updated/reloaded extension 2.5.0 and enabled its optional statistics; the website checkbox was enabled for the test and restored to off afterward. Website technique/length/mode controls were restored to Zero-shot, no maximum, and Quick Refine.

| Check | Executed result |
| --- | --- |
| Website initial, explicit edited redo, ordinary follow-up | 3 successful generative events; source app on all 3 |
| Website redo changes | Exact array: prompt, technique, mode, maximumLength; depth 1; prior baseline known |
| Website follow-up | kind follow_up, depth 0; changed prompt and mode; did not count as redo |
| Installed extension, fresh HTTPS ChatGPT composer | Real inline refinement replaced the draft; no prompt was submitted to ChatGPT |
| Extension initial and same-editor redo | 2 successful generative events; source extension on both; redo depth 1; unchanged settings produced an empty change list |
| Combined optional metadata | 2 initial, 2 redos, 1 follow-up; 3 comparable versions; maximum redo depth 1 |
| Separate persisted source/day totals | app requestCount=3, successCount=3; extension requestCount=2, successCount=2; zero failures; totals exactly matched these events |
| Charges | creditsCharged=0 on all five events; request entitlement/quota use is separate from credit charges |
| Owner dashboard | Baseline directly observed: 74 requests. Founder pasted refreshed UI at 14:58:45 UTC: 79 requests, all successful, 70 with cost/token coverage |
| Small-group privacy behavior | Founder-confirmed UI hides source breakdowns until each source has five workspaces and hides optional statistics until five workspaces contribute. This test does not establish that detailed rows are visible for a single account |

The read-only verifier used the existing Firebase CLI project credential and selected only the developer account's projected metadata since the test start. No other users' event details, private chats, prompts, outputs, authentication tokens or credentials were read by that verifier. Assertions passed for all five event classifications, exact change lists, depths, known baselines, zero credit charges and agreement with source/day aggregates. A first verifier attempt used an incorrectly serialized field mask and failed before producing evidence; the corrected scoped read passed. Raw request IDs remain only in local scratch evidence, not this document.

Browser security policy blocked direct extension Settings access; the founder performed that setup. It subsequently blocked reopening the owner Analytics tab, so the final dashboard figures are explicitly founder-reported, not a fresh agent observation. No alternative browser route or token extraction was used. The independent account-scoped datastore verification had already been prepared before that navigation denial and did not query the owner dashboard or other accounts.

Artifacts (local only): [projected records](../../tmp/live-account-analytics-evidence.json), [inline result screenshot](../../tmp/live-account-e2e/extension-initial.png). The extension technique-change scenario was not performed: its settings stayed Zero-shot/Quick Refine, so its empty redo change list is the expected result. Website changes were exercised with actual different settings. These tests do not establish semantic technique-classifier accuracy, hidden dashboard row rendering, or every provider/browser combination. No code, deployment, pricing, retention policy or small-group threshold changed during this test. The saved synthetic Clarift chat remains as reviewable test evidence.

## Private owner threshold removal, 2026-10-18

The founder explicitly approved removing the five-workspace threshold and deploying the change. The preceding live-test suppression observations remain historical evidence; they are not the new reporting contract.

- Targeted owner/refinement tests: **19/19 passed**. Single-workspace fixtures expose website/extension counts, redo depth/counts, follow-up separation, parameter names and technique groups. Injected private prompt/output/email/identity fields are absent from the serialized API response and rendered HTML.
- Active owner, disabled/suspended/deleted owner, non-owner roles, missing authentication, invalid periods, no-store headers, read bounds and fixed-error behavior remain covered. Optional consent and the collection kill switch still gate observations.
- Full `npm.cmd run verify`: **passed**, exit 0 — lint, typecheck, **157/157 regression tests** (zero failed/skipped), extension packaging, SDK/CLI builds and Next.js production build. The extension archive has no tracked change; version 2.5.0 is retained. Windows intentionally skips packaged MarkItDown installation; the Linux release pipeline performs it.
- Real owner report component with one synthetic workspace rendered at **1000×1100 and 390×844**: passed source counts (website 3, extension 2), visible change groups, no suppression messages, no identity text and no document overflow. Both screenshots were visually inspected. This is a local component fixture, not a fresh authenticated production UI observation.
- GitHub CI and deployment remain pending at this commit; the pull request/release receipt will record their executed outcomes.
