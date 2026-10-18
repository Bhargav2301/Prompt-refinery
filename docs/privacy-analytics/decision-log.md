# Decision log

Established 2026-10-18 from the current task and code audit. Earlier assumptions and prior-session test claims are not current evidence.

| ID | Decision / provenance | Consequence |
| --- | --- | --- |
| D-001 | Founder explicitly approved “Establish records and implement the local fix” after the missing-records question | Authorizes local documentation, existing-telemetry hardening and synthetic tests. No push/deploy/external mutation. |
| D-002 | Engineering choice within D-001: project known fields through runtime schemas before the two usage writers | TypeScript types and truncation alone do not protect stored data. Unknown properties are discarded; invalid required metadata skips the write silently. |
| D-003 | Engineering choice: categorical allowlists for optional text; unrecognized model/provider/technique/fallback values become null, unrecognized nonempty errors become `UnknownError` | Loses detail for custom/new categories until reviewed. Does not restrict inference model selection. Preserves valid numeric cost/accounting fields. |
| D-004 | Engineering choice: retain existing request/tenant/workspace/principal references from authenticated server callers, with bounded format checks | These records remain linkable operational data. This does not anonymize them or authorize optional behavioral reuse. No new public ingestion route. |
| D-005 | Engineering choice: no raw payloads, schema issues or arbitrary error names in the changed wrapper's logs | Failed optional recording emits only a constant warning. Other logging paths require separate inspection. |
| D-006 | Scope boundary: no migration/backfill, TTL configuration, consent UI, flags, vendors, SDKs or browser storage changes | Existing retention and consent gaps remain explicitly open. No claims about already-stored records. |
| D-007 | Attachment's opt-in/no routine content/no replay/no fingerprinting/no beta training preferences are design requirements | They are not evidence that all current processing already enforces them. Optional analytics implementation and legal/purpose decisions remain pending. |
| D-008 | Founder explicitly requested the automatic migration fix, tests, updated records and no deployment/external changes, then selected **“Private owner dashboard (Recommended)”** | Authorizes local PA-003 and PA-008a. This extends D-006's code scope; it does not authorize running migrations or modifying production data. |
| D-009 | Engineering choice: legacy usage gets a separate runtime projection and replacement writes at the existing hashed destination ID | Unknown/private fields and actor-supplied identities cannot migrate. Valid retries replace unsafe fields from partial older copies. Content collections keep their separate behavior. |
| D-010 | Engineering choice: preserve original Timestamp and any earlier expiry, cap at original creation + existing 90-day root window; skip missing/future/expired dates and invalid required metadata | No fresh retention clock or invented event date. Invalid source records remain untouched; no deletion performed. `usageEvents` count now reports eligible records, including in dry runs. |
| D-011 | Keep migration version 2 and its existing completed-user guard | No automatic rerun or historical cleanup for previously migrated users. This patch prevents future unsafe copies; previously stored private fields require a separately reviewed cleanup. |
| D-012 | Owner dashboard purpose: service operation/reliability/cost and administrative account totals across all profiles, including future profiles | Reuse existing records without new tracking. No activation, retention, satisfaction, content research or user profiling inferred from operational data. |
| D-013 | Dashboard minimizes reads, validates metadata again, returns aggregates only, requires a current active owner and rate limits requests | No emails, user IDs, raw prompts, attachments, model/error strings or record-level drilldowns returned. `ENABLE_ADMIN_CENTER=false` disables this read endpoint. |
| D-014 | Dashboard windows are 7/30/90 UTC calendar days including partial today; scan up to 10,000 recent events with visible truncation | All-profile counts remain exact as reported by Firestore aggregation; usage totals are bounded observations, not an exhaustive activity claim. No beta tenant allowlist. |
| D-015 | Suppress a whole daily/task/provider dimension if any nonempty group has fewer than five distinct tenant IDs | Reduces small-group and complementary-subtotal disclosure. Overall owner operational totals remain visible. This is not a guarantee of anonymization/differential privacy. |

## Tradeoffs and unresolved decisions

- **Strip versus reject:** these are existing internal operational writers. Discarding extra properties preserves valid accounting when a caller accidentally adds content. Invalid core fields skip the entire event. A future external optional-event endpoint must reject unknown event names/properties and enforce authoritative consent; these schemas alone are not that endpoint.
- **Missing telemetry:** malformed required fields are intentionally not logged or thrown. Counts can underreport invalid internal calls. A content-free pipeline-health mechanism needs separate design; none is added now.
- **Identities:** the checked format is compatible with the application's generated identifiers. Nonstandard/custom identifiers outside the allowed format are skipped. Format checks cannot detect a plausible-looking substituted ID or prove ownership. Server authentication/tenant authorization remain the caller's responsibility.
- **Retention:** retain the existing 90-day event and 403-day aggregate timestamp calculations in this patch. These are existing implementation values, not newly approved policy or statutory periods. Actual deletion and per-user legacy retention are not verified.
- **Historical records and migration:** the follow-up PA-003 closes the copy-all path in local code. Profile loading, job and CLI calls all use the same hardened function. No production records were inspected/changed; completed-user guards were not bumped. Invalid skipped events, their source records and already-migrated users are not cleaned retroactively. Historical cleanup/external execution still requires a reviewed plan and authorization.
- **Legal/vendor facts:** entity, user regions/ages, lawful purposes, notices, vendor terms, processor locations, backups and rights obligations remain unverified. No legal compliance conclusion is made.

No founder question blocks the approved local work. The owner has approved the operational dashboard purpose, not optional behavioral processing. Retention, vendor, consent and rollout decisions remain unresolved for later phases.

## 2026-10-18 release extension

| Decision | Evidence / choice | Consequence |
| --- | --- | --- |
| D-016 | Founder explicitly requests new metrics, extension simplification, push and deployment | Supersedes the previous local-only boundary for this release; no historical cleanup or price change |
| D-017 | Optional technique/version telemetry is default off with explicit UI choice and server kill switch | Separate from essential source/credit accounting; consentVersion 1 stored per observation, no content |
| D-018 | Classify structural output signals locally and label uncertainty | No added provider latency/cost; cannot claim semantic accuracy, dissatisfaction or complete historical coverage |
| D-019 | Explicit redo ancestry and private parameter snapshots; aggregate names only | Preserves privacy and separates follow-up work from redo versions; extension edited-text coverage is limited |
| D-020 | Server-selected source in events, daily totals, quota reservations and settled credit ledger | Future billing separation without changing today's prices or allowances; unknown historical channel remains unknown |
| D-021 | Transactional telemetry deduplication and failure isolation | Retries do not inflate aggregate usage; telemetry outages do not fail settled work |

See [release contract and limitations](13-refinement-metrics-release.md). Earlier decisions/evidence describe their historical scope, not the current deployment authorization.

## 2026-10-18 live verification

| Decision | Evidence / choice | Consequence |
| --- | --- | --- |
| D-022 | Founder explicitly requests live website and installed-extension tests using their account | Five synthetic production refinements authorized; opted-in metadata inspected only for this account; no mocks or new deployment |
| D-023 | Preserve the existing five-workspace reporting threshold during a one-account test | Verify exact source/redo/change records with a scoped read-only datastore query. Founder confirms the final dashboard total of 79 and its suppressed detailed rows; no fake workspaces or privacy-rule relaxation |

## 2026-10-18 private-owner threshold removal

| Decision | Evidence / choice | Consequence |
| --- | --- | --- |
| D-024 | Founder explicitly requests removing the five-workspace threshold from their private owner dashboard, retaining hidden prompts/identities, testing, GitHub push and deployment | Supersedes D-015 and the threshold-preservation choice in D-023 for this private report. Show daily/task/provider/source and opted-in technique/version/change aggregates for one or more contributing workspaces. No public or per-user view is introduced. |
| D-025 | Remove suppression in both server aggregation and rendering; stop retaining per-category participant sets | Keep the overall distinct-workspace count only. Existing active-owner checks, runtime field projection, opt-in collection, query bounds, private/no-store responses and audit metadata stay enforced. Small aggregates are not anonymous. |
