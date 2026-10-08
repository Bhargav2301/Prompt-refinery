# Save prompt regression fix — 2026-10-08

## Confirmed cause

Production error logs at 06:18:57, 06:19:03, and 06:19:31 UTC (11:48–11:49 IST) recorded Zod `too_small` validation failures for `prompt.originalPrompt`, with digest `633594489`. The save handler read the current composer even though the completed refinement retained its own original text and version history. Clearing the composer therefore sent an empty original prompt. Editing it could instead save unrelated draft text or the wrong technique.

The server action threw that validation error. Next.js concealed the exception details in production, producing the generic Server Components message in the screenshot.

## Change

- Build the save payload from the latest completed refinement and its version history.
- Return explicit success/failure results from the server action for invalid input, sign-in, account status, saved-prompt limits, and unexpected storage failures.
- Show success only after persistence succeeds. Keep the output available on failure and offer useful retry guidance without exposing internal exceptions.
- Disable saving while a request is pending and guard synchronous repeated taps.
- Preserve server authentication, account checks, input limits, and Firestore transaction behavior.

## Validation

- Lint and TypeScript checks passed.
- All 102 regression tests passed, including five new save tests. The reported empty-prompt payload is exercised against the real server action and returns a safe failure before any storage call.
- `node scripts/test-save-prompt-browser.mjs` passed using installed Chrome and Playwright. It exercises the real React composer/output components at a mobile viewport, with synthetic auth and actions: refine → clear → save; edit draft/technique → save; repeated taps; quota failure; and a rejected request. It makes no customer-data writes or model calls.
- The browser script follows the extension browser-test convention: set `CLARIFT_PLAYWRIGHT_MODULE` and `CLARIFT_CHROMIUM_EXECUTABLE` when those tools are not installed at their default locations.

The initial sandboxed full-test attempt could not access local loopback servers; the rerun with local network access passed all tests.
