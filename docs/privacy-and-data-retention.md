# Privacy And Data Retention

This document describes design requirements, not a production compliance or retention attestation. The 2026-10-18 scoped code audit, known gaps and local test evidence are in [the privacy analytics records](privacy-analytics/implementation-checklist.md).

## Stored Data

The app may store account metadata, subscription metadata, saved prompts, projects, project sessions, project memory entries, evaluation history, share grants, hashed Clarift API keys, promo redemptions, entitlement grants, audit logs, and usage metadata. Usage records remain linked to account/tenant identifiers and are not anonymous. When BYOK is enabled and a user configures a provider key, `provider-key-service.ts` stores encrypted key material and a key hint in `tenantProviderKeys`.

## Data Exclusion Requirements

- Plaintext user BYOK Gemini/OpenRouter API keys. Encrypted user-configured keys are stored as described above; production flags were not inspected in this audit.
- Raw Firebase, Stripe, Gemini, or OpenRouter secrets.
- Full payment card data.
- Raw provider responses in logs.
- Uploaded document contents in logs.
- Prompt, saved prompt, or project memory content in analytics by default.
- Plaintext Clarift API keys or promo codes. Only HMAC hashes and non-sensitive prefixes are retained.

## Usage Metadata

Usage analytics must track metadata only: user ID, provider, model ID, estimated tokens, success/failure, error category, cost estimate, and timestamps. It must not include prompt text, uploaded contents, BYOK keys, project memory, saved prompts, or raw provider responses by default.

The local PA-001 patch applies a runtime field projection and categorical allowlists to the two normal usage writers. PA-003 applies projection to automatic legacy usage migration, with original-date expiry and no raw provenance fields. This is not consent enforcement or a guarantee about all logs, vendor processing or historical records already stored. The explicitly requested PA-008a owner dashboard summarizes existing operational metadata and profile counts; it adds no behavioral collection. Essential accounting must not be silently repurposed for optional behavioral analytics.

## Support Access

Support/admin users must not view sensitive user content unless a later scoped support-access flow gives temporary explicit user approval. Minimal admin v1 is limited to account metadata, entitlement state, audit logs, and system health.

## Deletion And Export

Before launch, add an account export/deletion procedure covering saved prompts, projects, project sessions, usage metadata, Stripe customer references, entitlement records, and audit-log retention.

## Retention Defaults

These are requirements/proposals, not verified lifecycle behavior. The root writer currently sets event expiry at 90 days and aggregate expiry at 403 days after each write; the legacy user writer sets no expiry. Deployed TTL, deletion/export jobs, backup handling and applicable retention obligations have not been verified by the scoped audit.

- Audit logs: retain for security and compliance review.
- Usage events: aggregate daily/monthly; delete or compact raw events after the chosen retention window.
- Support requests: retain for support accountability.
- Trashed projects: purge after 30 days unless restored.
- Revoked shares and API-key metadata: retain for security auditing; their secret values are never recoverable.
- Deleted accounts: mark as `deleted_pending` before final deletion workflow.

## Refinement statistics release

The explicitly approved follow-up adds default-off optional technique signals, redo counts and changed parameter names, with a per-request choice and server kill switch. No prompt/reference content is copied into analytics. Essential usage is split by website, extension and API source for future accounting without changing prices. See [the contract and limits](privacy-analytics/13-refinement-metrics-release.md). The earlier no-behavioral-collection description applies to PA-008a only.
