import assert from 'node:assert/strict';
import test from 'node:test';
import { savePromptAction } from '../src/app/subscription-actions';
import { buildSavedPromptInput, type SavedPromptVersion } from '../src/lib/saved-prompts';
import { savePromptRequest } from '../src/lib/server/save-prompt-request';
import { MAX_PROMPT_CHARACTERS, MAX_PROMPT_VERSIONS } from '../src/lib/input-limits';

function completedVersion(version = 1): SavedPromptVersion {
  return { version, rawPrompt: 'Write a story about a lighthouse.', refinedPrompt: `Completed refinement ${version}`, promptType: 'Role / persona', createdAt: '2026-10-08T06:00:00Z' };
}

test('saving a completed result preserves its original text, technique, and version history', async () => {
  const history = [completedVersion(), completedVersion(2)];
  const prompt = buildSavedPromptInput(history)!;
  // A later composer edit must not alter the captured save payload.
  history[1].rawPrompt = 'An unrelated new draft';
  history[1].promptType = 'Zero-shot';
  const result = await savePromptRequest({ firebaseIdToken: 'synthetic-token', prompt }, async (_token, saved) => {
    assert.equal(saved.originalPrompt, 'Write a story about a lighthouse.');
    assert.equal(saved.refinedPrompt, 'Completed refinement 2');
    assert.equal(saved.promptType, 'Role / persona');
    assert.equal(saved.latestVersion, 2);
    assert.equal(saved.versionCount, 2);
    assert.equal(saved.versions[1].rawPrompt, saved.originalPrompt);
    assert.equal(saved.versions[1].promptType, saved.promptType);
    return { id: 'saved-fixture' };
  });
  assert.deepEqual(result, { ok: true, id: 'saved-fixture' });
  assert.equal(buildSavedPromptInput([]), null);
});

test('the production save action returns a clear result for the reported empty original prompt', async () => {
  const prompt = { ...buildSavedPromptInput([completedVersion()])!, originalPrompt: '' };
  const result = await savePromptAction({ firebaseIdToken: 'synthetic-token', prompt });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'invalid_input');
    assert.match(result.message, /original text/);
    assert.doesNotMatch(result.message, /Server Components|digest|ZodError/);
  }
});

test('invalid or oversized saves never reach storage, and version limits remain enforced', async () => {
  const prompt = buildSavedPromptInput([completedVersion()])!;
  const inputs = [
    null,
    { firebaseIdToken: '', prompt },
    { firebaseIdToken: 'synthetic-token', prompt: { ...prompt, originalPrompt: 'x'.repeat(MAX_PROMPT_CHARACTERS + 1) } },
    { firebaseIdToken: 'synthetic-token', prompt: { ...prompt, versions: Array.from({ length: MAX_PROMPT_VERSIONS + 1 }, (_, index) => completedVersion(index + 1)) } },
  ];
  for (const input of inputs) {
    const result = await savePromptRequest(input, async () => { assert.fail('Invalid save reached storage.'); });
    assert.equal(result.ok, false);
  }
});

test('save limits, expired sign-in, and inactive accounts remain failures with usable messages', async () => {
  for (const [name, code] of [['SavedPromptLimitError', 'limit_reached'], ['AuthenticationRequiredError', 'authentication_required'], ['AccountStatusBlockedError', 'account_inactive']]) {
    const result = await savePromptRequest({ firebaseIdToken: 'synthetic-token', prompt: buildSavedPromptInput([completedVersion()]) }, async () => {
      throw Object.assign(new Error('private diagnostic sentinel'), { name });
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, code);
      assert.ok(result.message.length > 20);
      assert.doesNotMatch(result.message, /private diagnostic/);
    }
  }
});

test('unexpected storage failures never expose prompt content, tokens, or internal error details', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const result = await savePromptRequest({ firebaseIdToken: 'private-token-sentinel', prompt: buildSavedPromptInput([completedVersion()]) }, async () => {
    throw new Error('private-token-sentinel secret database detail Write a story about a lighthouse.');
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'save_failed');
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(log.mock.calls.map((call) => call.arguments)), /private-token-sentinel|secret database detail|lighthouse/);
});
