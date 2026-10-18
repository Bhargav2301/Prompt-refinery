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
