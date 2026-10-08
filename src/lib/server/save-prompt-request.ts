import { MAX_PROMPT_VERSIONS } from '@/lib/input-limits';
import { savePromptSchema, type SavedPromptInput, type SavePromptResult } from '@/lib/saved-prompts';
import { FREE_SAVED_PROMPT_LIMIT } from '@/lib/subscription';

type PersistPrompt = (firebaseIdToken: string, prompt: SavedPromptInput) => Promise<{ id: string }>;

export async function savePromptRequest(data: unknown, persist: PersistPrompt): Promise<SavePromptResult> {
  const parsed = savePromptSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    if (issues.some((issue) => issue.path[0] === 'firebaseIdToken')) {
      return { ok: false, code: 'authentication_required', message: 'Sign in again, then retry saving your prompt.' };
    }
    const tooManyVersions = issues.some((issue) => issue.path[1] === 'versions' && issue.path.length === 2 && issue.code === 'too_big');
    return {
      ok: false, code: 'invalid_input',
      message: tooManyVersions
        ? `A saved prompt can include up to ${MAX_PROMPT_VERSIONS} versions. Start a new refinement before saving more versions.`
        : 'The prompt could not be saved because its original text, refined text, or version history is missing or too long. Your output is still available to copy.',
    };
  }

  try {
    const saved = await persist(parsed.data.firebaseIdToken, parsed.data.prompt);
    return { ok: true, id: saved.id };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    if (name === 'SavedPromptLimitError') {
      return { ok: false, code: 'limit_reached', message: `Free accounts can save up to ${FREE_SAVED_PROMPT_LIMIT} prompts. Delete an older prompt or upgrade to Pro, then try again.` };
    }
    if (name === 'AuthenticationRequiredError') {
      return { ok: false, code: 'authentication_required', message: 'Sign in again, then retry saving your prompt.' };
    }
    if (name === 'AccountStatusBlockedError') {
      return { ok: false, code: 'account_inactive', message: 'Saving is unavailable while your account is inactive. Contact support for help.' };
    }
    // Do not log prompt content, tokens, or raw database messages.
    console.error('Saved prompt write failed.', { category: 'unexpected_persistence_error' });
    return { ok: false, code: 'save_failed', message: 'Clarift could not save your prompt. Your output is still available to copy. Please try again shortly.' };
  }
}
