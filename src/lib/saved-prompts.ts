import { z } from 'zod';

import {
  MAX_FIREBASE_ID_TOKEN_CHARACTERS,
  MAX_PROMPT_CHARACTERS,
  MAX_PROMPT_VERSIONS,
  MAX_REFINED_PROMPT_CHARACTERS,
} from './input-limits';

const promptVersionSchema = z.object({
  version: z.number().int().positive(),
  rawPrompt: z.string().max(MAX_PROMPT_CHARACTERS),
  refinedPrompt: z.string().max(MAX_REFINED_PROMPT_CHARACTERS),
  promptType: z.string().max(80),
  createdAt: z.string().max(80),
});

export const savePromptSchema = z.object({
  firebaseIdToken: z.string().min(1).max(MAX_FIREBASE_ID_TOKEN_CHARACTERS),
  prompt: z.object({
    name: z.string().trim().min(1).max(160),
    originalPrompt: z.string().min(1).max(MAX_PROMPT_CHARACTERS),
    refinedPrompt: z.string().min(1).max(MAX_REFINED_PROMPT_CHARACTERS),
    promptType: z.string().min(1).max(80),
    latestVersion: z.number().int().positive(),
    versionCount: z.number().int().positive(),
    versions: z.array(promptVersionSchema).min(1).max(MAX_PROMPT_VERSIONS),
    folder: z.string().trim().max(80).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  }),
});

export type SavePromptRequest = z.infer<typeof savePromptSchema>;
export type SavedPromptInput = SavePromptRequest['prompt'];
export type SavedPromptVersion = z.infer<typeof promptVersionSchema>;
export type SavePromptResult =
  | { ok: true; id: string }
  | { ok: false; code: 'invalid_input' | 'authentication_required' | 'account_inactive' | 'limit_reached' | 'save_failed'; message: string };

// Saving belongs to the completed result, even after the composer is edited or cleared.
export function buildSavedPromptInput(versions: readonly SavedPromptVersion[]): SavedPromptInput | null {
  const latest = versions.at(-1);
  if (!latest) return null;
  return {
    name: `Refined: ${latest.rawPrompt.substring(0, 30)}...`,
    originalPrompt: latest.rawPrompt,
    refinedPrompt: latest.refinedPrompt,
    promptType: latest.promptType,
    latestVersion: latest.version,
    versionCount: versions.length,
    versions: versions.map((version) => ({ ...version })),
  };
}
