# Privacy analytics implementation checklist

Established 2026-10-18. This is a new record, not a reconstruction of an earlier approval log. The requested checklist and decision log were not found in the inspected checkout, saved branches, or task attachments. The founder then authorized: **“Establish records and implement the local fix.”**

Status meanings: **Verified existing** means inspected code, not verified production behavior. **Implemented** means a local change exists. **Tested** requires a recorded executed check. **Planned** conveys no deployment authorization. **Blocked** identifies a dependency or decision. **Not inspected** must not be read as absent.

| ID / phase | Work | Status | Dependency / evidence |
| --- | --- | --- | --- |
| PA-000 / 0 | Establish baseline, scoped discovery, decisions and evidence | Implemented | [Discovery](00-discovery.md), [inventory](01-data-inventory.md), [decisions](decision-log.md) |
| PA-001 / 4, 7 | Prevent arbitrary fields and text metadata entering the two existing usage writers; safe wrapper warning | Tested locally | Approved local slice; [field contract](06-event-dictionary.md), [test evidence](11-test-plan-and-evidence.md) |
| PA-002 / 0, 1 | Complete purpose/vendor/logging inventory and validate legal requirements | Planned; external facts not verified | Confirm operating entity, markets, ages, processors, regions, vendor terms and applicable law from authoritative dated sources |
| PA-003 / 4 | Harden the automatic legacy usage migration | Tested locally | Explicit follow-up authorization, 2026-10-18; allowlisted projection, replacement writes, trusted identity, original-date expiry, retry/dry-run/batch tests |
| PA-003b / 4 | Review remaining gateway/circuit/admin diagnostic sinks | Planned | These older sinks remain outside PA-001/PA-003; historical production cleanup is not authorized |
| PA-004 / 2 | Approve measurement purposes and minimal event dictionary, separating operational accounting from optional behavior | Planned | PA-002; do not repurpose existing usage data as consented behavior |
| PA-005 / 3, 4 | Consent state/receipts, default-deny ingestion, withdrawal races and collection kill switch | Planned | PA-004 and reviewed design; no new collection in PA-001 |
| PA-006 / 4, 7 | Isolate telemetry storage failures from completed inference/conversion and test replay/deduplication | Tested locally | Transactional deduplication and constant-warning failure isolation; credit settlement remains separate |
| PA-007 / 5 | Approve retention schedules, implement expiry/deletion/export and backup safeguards | Planned; operational settings not verified | Purpose/obligation decisions; timestamp fields alone do not prove deletion |
| PA-008a / 6 | Private owner operational dashboard for all Clarift profiles and existing request telemetry | Tested locally | Founder selected private owner dashboard. Full regression suite passed; [definitions and limits](10-metrics-and-dashboards.md); no optional behavioral instrumentation |
| PA-008b / 6 | Optional behavioral metrics, activation/retention, complete internal-traffic exclusion | Blocked | PA-004, PA-005, PA-007; operational reporting is not consent evidence |
| PA-009 / 7 | Full privacy QA: first visit/refusal/withdrawal, concurrency, isolation, retention, network and accessibility | Blocked | Implement relevant systems first; individual scoped tests do not satisfy full QA |
| PA-010 / 8 | CI, staging, internal testing and reviewed beta rollout | Release authorized; validation in progress | D-016 supersedes prior local-only boundary; see release evidence |

## Latest approved slice

PA-008c adds default-off technique/version statistics, explicit redo tracking, content-free parameter categories and source accounting. See [release contract](13-refinement-metrics-release.md). This does not complete the broader consent, rights, retention or legal program.

## Prior session boundary (historical)

Reinspect the working tree and these records first. PA-003b (remaining diagnostic sinks) and PA-006 (failure isolation/deduplication) are the next bounded engineering candidates. The automatic migration and owner dashboard have been implemented locally following the founder's explicit request. Do not infer approval for the full consent system, historical cleanup or release.

The full attached specification remains incomplete: no consent UI/receipts, new tracking, ingestion API, retention job or rights workflow has been implemented. PA-008a is an operational owner view, not the future optional product analytics system. No production deployment or external change was performed in that earlier slice. The later D-016 request authorizes the current release.
