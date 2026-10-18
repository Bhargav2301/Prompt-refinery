# Analytics V2 Follow-up

Workspace V2 intentionally uses only metrics already available to Clarift: plan, weighted refinement allowance, managed credits, saved prompts, aggregate refinements, evaluations, conversions, score improvement, most-used technique, and monthly activity.

The next analytics stage requires server-side, tenant-scoped aggregation for:

- credits used over time;
- top refinement modes and templates;
- recent content-free activity events;
- cost and latency trends by task quality tier.

The root usage writer sets an expiry timestamp 90 days after creation; actual TTL deletion has not been verified, and the legacy per-user writer has no expiry field. Do not treat those timestamps as an enforced retention policy. Any new metrics require purpose/consent review, content exclusion, tenant-isolation and aggregate-reconciliation tests before exposure.

The 2026-10-18 local audit and approved writer-hardening slice are tracked in [the privacy analytics checklist](privacy-analytics/implementation-checklist.md). It does not enable new tracking, establish consent enforcement, sanitize historical events or verify production retention.

The founder subsequently approved a private owner operational dashboard in Settings → Admin → Analytics. Its [metric definitions and limits](privacy-analytics/10-metrics-and-dashboards.md) cover all current/future Clarift profiles and recorded operational usage, with bounded queries and small-group suppression. This is locally implemented and tested; optional product adoption/retention analytics remain separate pending work.
