'use server';

import { z } from 'zod';

import { deleteSavedPromptForUser, savePromptForUser, updateSavedPromptMetadataForUser } from '@/lib/server/account-service';
import { MAX_FIREBASE_ID_TOKEN_CHARACTERS } from '@/lib/input-limits';
import type { SavePromptRequest, SavePromptResult } from '@/lib/saved-prompts';
import { savePromptRequest } from '@/lib/server/save-prompt-request';

export async function savePromptAction(data: SavePromptRequest): Promise<SavePromptResult> {
  return savePromptRequest(data, savePromptForUser);
}

export async function updateSavedPromptMetadataAction(data: {
  firebaseIdToken: string;
  promptId: string;
  name: string;
  folder?: string | null;
  tags: string[];
}) {
  const parsed = z.object({
    firebaseIdToken: z.string().min(1).max(MAX_FIREBASE_ID_TOKEN_CHARACTERS),
    promptId: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(160),
    folder: z.string().trim().max(80).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(10),
  }).parse(data);
  return updateSavedPromptMetadataForUser(parsed.firebaseIdToken, parsed.promptId, parsed);
}

export async function deleteSavedPromptAction(data: { firebaseIdToken: string; promptId: string }) {
  const parsed = z.object({
    firebaseIdToken: z.string().min(1).max(MAX_FIREBASE_ID_TOKEN_CHARACTERS),
    promptId: z.string().min(1).max(200),
  }).parse(data);

  return deleteSavedPromptForUser(parsed.firebaseIdToken, parsed.promptId);
}
