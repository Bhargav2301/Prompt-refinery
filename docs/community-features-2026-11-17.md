# Technique guide, feedback, and notifications

## Approved scope and decisions
The owner requested an explanation page for every prompting technique, all-tier suggestions/complaints with owner replies, and a navbar feed for releases/version details and replies. Existing push/deployment authorization remains applicable.

- Guide: all eight `PROMPT_TECHNIQUES`, in the workspace and public `/techniques` page. Original examples and copyable skeletons, where/when/why, limitations, and primary-source links. Tree-of-thoughts comparisons, chaining instructions, and ReAct prompts do not falsely claim to execute search, separate calls, or tools.
- Communication: in-app private conversations. No email or browser-push delivery is implied. Any active account can submit and follow up, regardless of subscription. Only an active server-verified owner can list all submissions, reply as Clarift, or resolve/reopen them.
- Feedback content is explicitly shared with the owner through the form. It is not added to analytics, AI prompts, audit payloads, or logs. Thread payloads do not expose account emails or UIDs; the server routes replies to the stored submitter.
- Notifications: global release catalog plus private replies, persistent per-account read receipts, exact unread total, cursor pagination, manual refresh and a 60-second visible-page/focus refresh while the inbox is closed. Opening the inbox alone does not mark everything read.
- App version becomes 0.2.0. Extension remains 2.5.0; this release does not modify its code or billing.
- No new service, secret, scheduled job, or paid dependency. Firestore single-field indexes suffice.

## Data and failure behavior
`feedbackThreads/{id}` stores category, subject, submitter UID, status, timestamps and up to 50 messages (3,000 UTF-16 characters each). Only the server can access it. `feedbackAccounts/{uid}/threads` stores per-user summaries; `notifications` stores owner replies and read state; `releaseReads` stores release receipts.

Creation and replies accept client operation UUIDs. Transactions atomically update the thread and summary and, for owner replies, create a notification. Identical retries return the committed result; changed reuse fails. Concurrent replies do not overwrite messages. A user follow-up reopens a resolved thread. Full conversations request a new thread.

Requests require revoked-token-aware Firebase authentication, active account state, ownership/owner role, body/schema limits, and per-user distributed throttling. Mutations reject mismatching browser origins. Errors and responses are private/no-store; unexpected errors are fixed strings. React renders message text without HTML interpretation. Direct browser Firestore reads/writes are denied, including for the owner.

Existing data is not migrated. Feedback is retained for follow-up; automatic expiration, self-service export/deletion, attachments, email delivery, and service-level response promises are not introduced. A future account deletion/export implementation must include both new root collections and descendants. No prompt history is attached automatically.

## Release publication procedure
For every user-visible release:
1. Bump the application version in package.json and the lockfile.
2. Set APP_VERSION and prepend an immutable entry in src/lib/releases.ts with a unique ID, version, real release date, title, and clear changes. Preserve older IDs so read receipts remain valid.
3. Test and deploy the version and catalog together. Do not claim an unpublished feature is available.
4. Users receive the new entry on the next poll, refresh, or sign-in; current users retain prior read state and future accounts can read the same catalog.

The public guide sources are linked per technique: Anthropic prompting guidance/building effective agents; Wei et al. CoT; Yao et al. ToT and ReAct; Madaan et al. Self-Refine. Retrieved 2026-11-17. Content is original explanatory guidance, not copied prompt collections.

## Implementation checklist / evidence
- [x] Guide covers the complete selectable-technique set; public route and desktop/mobile navigation.
- [x] All-tier submission and follow-up UI; owner Feedback tab; status management.
- [x] Navbar release/reply notifications with persistent read state and older pages.
- [x] Server ownership, owner-role, active-account, validation, origin and rate-limit tests.
- [x] Firestore emulator: transactional reply retries, private isolation, persistence, pagination, Unicode bound, status/reopening, unread receipts, browser rule denial. Full emulator suite: 8/8.
- [x] Regression suite: 168/168 after correcting an SSR React import; initial sandbox loopback restrictions required running network-dependent tests outside the sandbox.
- [x] Final lint/typecheck/build after UI checks. Local production: guide 200, fixture 404, all private APIs 401 with no-store.
- [x] Desktop/mobile synthetic browser walkthrough: submission, failed-send retry preserving ID/draft, owner reply, resolve, notification deep link, mark-read/reload, and user follow-up. Guide search and responsive layout passed. Clipboard writeText payload checked with a test spy because automation clipboard readback returned empty.
- GitHub CI, rollout and public production smoke receipts will be recorded on the feature PR after the tested source is committed.

The development fixture /community-preview returns 404 in production. UI tests must intercept its synthetic API calls; its synthetic token cannot authenticate against the real service. Emulator checks test actual Firestore behavior separately. Neither is a claim of a real user's production conversation.

Browser reproduction: start npm run dev, import runCommunityUi from tests/browser/community-ui.mjs in a Playwright session and call it with an isolated page. Optional baseUrl and outputDirectory configure the server and screenshot location. All API responses in this UI check are synthetic; the emulator suite separately verifies real storage semantics.
