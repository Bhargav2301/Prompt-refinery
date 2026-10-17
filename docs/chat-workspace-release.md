# Clarift chat workspace — October 2026

Clarift now saves refinements as conversations. History and the image/video prompt library replace Projects in the application navigation. Existing saved prompts remain available under Saved; existing project records are preserved but the Projects UI is no longer exposed.

## Account security

- Both sign-in and sign-up offer password recovery.
- Email/password signup sends a verification email. Settings shows verification status and offers resend/check controls.
- `/auth/action` verifies Firebase's one-time code before showing the account email and a new-password/confirmation form. Successful completion removes the code from the URL. Invalid, expired and used links have a safe recovery message.
- Settings requires the old password before changing it, with matching new-password fields. Google accounts use their provider's password controls.
- Deployment configuration: Firebase Authentication's `notification.sendEmail.callbackUri` must be `https://clarift.dpdns.org/auth/action`. Configure it only after the route is live. ActionCodeSettings.url is the continuation URL, not the email handler. The custom domain must remain in authorized domains.

## Saved and temporary chats

- Each completed refinement saves the original request, final prompt, council passes, mode, technique, media destination, reviewed references and uploaded sources.
- The first request produces an automatic editable title. History supports reopening, continuing, deletion and paginated loading.
- Temporary mode is chosen before the first refinement. Its conversation stays in React memory and is not written to chat history or browser storage. Refreshing or closing the tab clears it. Turning temporary mode off explicitly saves it.
- Temporary document conversion skips attachment metadata persistence. Content-free usage/allowance records still exist, and inference still sends supplied content to the configured model provider.
- API routes derive ownership from the verified Firebase token. Firestore chat records are private server-managed documents. Revision checks prevent stale tabs from overwriting newer results; save failures preserve the generated output and offer retry, save-as-new and context export.
- Limits: 100 refinements, five conversation references, six uploaded sources, and 5 MB per saved chat. Text sources are limited to 12,000 characters each; larger sources must be narrowed explicitly. Reference imports accept up to 120,000 characters each. Large model inputs use disclosed excerpts; a stored full conversation is not a promise that every token fits one inference request.

## Chat references and extension v2.4.0

- Add references accepts supported public share links, pasted/exported transcripts, and extension context pills from open chatbot tabs.
- Supported share hosts include ChatGPT, Claude, Grok, DeepSeek, Qwen, Gemini and Perplexity. The server imports only exposed HTML/embedded JSON on allowlisted HTTPS share paths, with redirect, DNS, time and size limits. It does not use private provider APIs or login cookies. If a share page is not readable, the UI offers open-tab capture or transcript import.
- Review messages, select the exact source prompt, and acknowledge the supplied context before refinement. File mentions show their exact source message; users upload original documents/images. Links alone cannot retrieve private attachments. Images are resized in the browser and sent as image input to compatible model providers; Basic mode explicitly cannot inspect pixels.
- From Clarift choose **Add references → Import from open tab**. Choose a chatbot tab, collect/review its history in the extension, build a pill, then choose **Use reviewed pill in Clarift**. The app bridge is restricted to Clarift's own top-level pages and returns only supported chatbot tabs.
- Extension capture can collect older messages as the page scrolls, preserve repeated turns, restore scroll position, and report coverage. The pill can contain all captured text or disclosed compact excerpts. Copy or download Markdown for another chat.
- Updating requires extracting the new ZIP, reloading the unpacked extension and reloading Clarift/chat tabs. The in-app download reads the manifest version and includes the new bridge script.

## Image/video library

32 original starter templates cover Sora, Veo, Runway, Kling, Luma, Midjourney, Stable Diffusion and FLUX. Search/filter by tool or media type, then use a template in a chat or describe a new idea directly. Follow-up requests retain earlier decisions. Clarift generates prompts; it does not generate the image/video itself.

All supplied resource links are listed in Source guides & collections. Templates use general prompting principles and original text rather than reproducing community prompt collections. The supplied Runway Gen-3 guide is historical; current Runway guidance informs new templates. Sources are maintained in `src/lib/prompt-library.ts`.

## Validation

- `npm run verify`: lint, TypeScript, unit/regression tests and production build.
- `npm run test:firestore-emulator`: persistence, Unicode chunk round trips, owner isolation, simultaneous-edit conflicts, deletion and browser-rule restrictions.
- `tests/emulator/auth.test.ts`, run through Firebase Auth emulator: verification, single-use reset, old-password rejection and successful password change. No real emails sent.
- `scripts/test-chat-workspace-browser.mjs`: actual React UI with synthetic auth/API boundaries, mobile history/temporary behavior, references, missing files, media library, extension delivery and account forms.
- `npm run test:extension:browser`: capture, editors, automatic history collection, cancellation, context pills and clipboard/download behavior on synthetic pages.

Browser tests accept `CLARIFT_PLAYWRIGHT_MODULE` and `CLARIFT_CHROMIUM_EXECUTABLE` when Playwright/Chromium are supplied outside the repository. No paid model calls or customer data are needed by these tests.
