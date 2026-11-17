# Password recovery for registered accounts

## Cause and scope

The deployed reset handler required a `password` entry in Firebase provider data before it generated or sent a link. Existing Google-only accounts were silently skipped with the same generic success response. The developer account was confirmed to use Google sign-in, and the live reset form reproduced that acknowledgement without taking the send path. No delivery errors were found in the inspected last-seven-day application log query. A disposable password account received a real reset email in the developer inbox, confirming that the existing Resend sender was working during this test.

## Decision

Recovery now supports any active registered email account, including Google-only, email-only and linked-provider accounts. Firebase's single-use action code proves access to the registered inbox before setting the password; requesting an email does not change credentials. The registered canonical email is the recipient. Disabled accounts, origin checks, body limits, address/IP/global send budgets and generic responses remain enforced. No OAuth permissions, sender/domain settings or account-email enumeration response is introduced.

The form copy includes Google sign-ups and acknowledges the request rather than claiming that an email was sent. Delivery errors remain logged as bounded codes; unknown/disabled accounts and delivery failures still have the same public response.

Reference: [Firebase Admin email-action links](https://firebase.google.com/docs/auth/admin/email-action-links).

## Verification evidence

- Added regression first: 6 existing tests passed; the new Google/email-only test failed because no email was sent.
- After the fix: 9/9 account-email tests passed, including active Google/email-only/linked accounts, canonical recipient, disabled users, missing users, delivery failures, throttling, origin/payload validation and private error handling.
- Live pre-fix password-account control: the requested email arrived in the developer inbox. Its link opened the correct account's Clarift page with New password and Confirm new password fields. The delivered one-time code was then used through Firebase SDK test tooling: reset succeeded, old-password sign-in and code reuse were rejected, and the new password signed into the same account. The disposable account and its ignored credentials/action-code files were deleted afterward. No real developer-account credential was changed.
- Full `npm run verify` passed: lint, typecheck, **160/160 tests**, SDK/CLI builds, extension packaging and Next.js production build. The extension ZIP has no tracked change.
- Production deployment and post-fix live Google-account delivery are pending at this commit. The pull request release receipt will record executed outcomes.
