import { createHash } from 'node:crypto';
import { compareRefinementParameters, type RefinementParameters } from '@/lib/refinement-parameters';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { chatSnapshotSchema, chatTechniqueSchema, chatTitle, conversationContext, findMissingReferences, type ChatTurn } from '@/lib/chat-types';
import { CREATIVE_TOOLS, creativeInstructions } from '@/lib/prompt-library';
import { authenticateChatRequest, chatFailure, readChatJson } from '@/lib/server/chat-http';
import { ChatError, readChat, saveChat } from '@/lib/server/chat-service';
import { executeRefinement } from '@/lib/server/ai-gateway';
import { assertRefinementAccess } from '@/lib/server/account-service';
import { resolveTenantFromToken } from '@/lib/server/tenant-service';
import { tenantUsesFreeManagedInference } from '@/lib/server/free-inference-gateway';
export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  analyticsConsent: z.boolean().default(false), parentTurnId: z.string().uuid().optional(),
  chat: chatSnapshotSchema, temporary: z.boolean(), prompt: z.string().trim().min(1).max(50_000),
  mode: z.enum(['quick_refine', 'guided_fix', 'full_council']), tool: z.enum(CREATIVE_TOOLS),
  requestId: z.string().uuid(), inferenceMode: z.enum(['managed', 'byok']).default('managed'), provider: z.enum(['gemini', 'openrouter']).optional(),
  promptType: chatTechniqueSchema.default('Zero-shot'), maxCharacters: z.number().int().min(100).max(50_000).optional(),
});
export async function POST(request: Request) {
  try {
    const { token, uid } = await authenticateChatRequest(request);
    const input = schema.parse(await readChatJson(request));
    if (input.chat.turns.length >= 100) throw new ChatError('Start a new chat to continue beyond 100 refinements. Export a context pill to carry this conversation forward.');
    if (input.chat.references.some(reference => !reference.reviewed)) throw new ChatError('Review each imported conversation before using it for refinement.');
    if (!input.temporary && input.chat.revision > 0) {
      const current = await readChat(uid, input.chat.id);
      if (current.revision !== input.chat.revision) throw new ChatError('This chat changed in another tab. Reopen the latest version before refining.', 409);
    }
    await assertRefinementAccess(token, input.promptType, false);
    const context = await resolveTenantFromToken(token);
    const limited = input.inferenceMode === 'managed' && await tenantUsesFreeManagedInference(context);
    const budget = limited ? Math.max(0, 38_000 - input.prompt.length - input.chat.attachments.reduce((sum, file) => sum + file.content.length + (file.dataUri ? 7168 : 0), 0)) : 120_000;
    const missing = findMissingReferences(input.chat.references, input.chat.attachments);
    const missingNotice = missing.length ? `\nSource files mentioned but not supplied: ${[...new Set(missing.map(file => file.name))].join(', ').slice(0, 1500)}. Do not assume their contents. State which missing files or details the user must provide if the refinement depends on them; preserve explicit placeholders until then.\n` : '';
    const coverage = conversationContext(input.chat, Math.max(0, budget - missingNotice.length));
    const parent = input.parentTurnId ? input.chat.turns.find(turn => turn.id === input.parentTurnId) : undefined;
    if (input.parentTurnId && !parent) throw new ChatError('The selected version is no longer available.');
    const previous = parent ?? input.chat.turns.at(-1);
    const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const parameters: RefinementParameters = { technique: input.promptType, mode: input.mode, destination: input.tool, maximumLength: input.maxCharacters ?? null, inferenceMode: input.inferenceMode, provider: input.inferenceMode === 'byok' ? input.provider ?? 'gemini' : null, references: digest(input.chat.references), attachments: digest(input.chat.attachments) };
    const revisionInfo = compareRefinementParameters(parameters, previous?.parameters, { kind: parent ? 'redo' : previous ? 'follow_up' : 'initial', depth: parent ? (parent.revisionInfo?.depth ?? 0) + 1 : 0, promptChanged: previous ? input.prompt !== previous.output : false });
    const result = await executeRefinement({ context, source: 'app', task: input.mode, inferenceMode: input.inferenceMode,
      refinementAnalytics: { consent: input.analyticsConsent, requested: input.promptType, revision: revisionInfo },
      preferredProvider: input.provider, idempotencyKey: input.requestId,
      refinement: { prompt: input.prompt, promptType: input.promptType, maxCharacters: input.maxCharacters, conversationContext: coverage.text + missingNotice, creativeInstructions: creativeInstructions(input.tool), attachments: input.chat.attachments.map(({ id: _id, ...file }) => file), explanationMode: true },
    });
    const turn: ChatTurn = { parameters, revisionInfo, ...(parent ? { parentTurnId: parent.id } : {}), id: input.requestId, prompt: input.prompt, output: result.result.refinedPrompt, createdAt: new Date().toISOString(), mode: input.mode, tool: input.tool, promptType: input.promptType, refinements: result.result.refinements, qualityTier: result.qualityTier, references: [...input.chat.references.map(reference => reference.title), ...input.chat.attachments.map(file => file.name.slice(0, 200))] };
    let chat = { ...input.chat, title: input.chat.turns.length || input.chat.title !== 'New chat' ? input.chat.title : chatTitle(input.prompt), turns: [...input.chat.turns, turn] };
    let saveError: string | null = null;
    if (!input.temporary) {
      try { chat = await saveChat(uid, chat); }
      catch (error) { saveError = error instanceof ChatError ? error.message : 'The refinement is ready, but history could not be saved. Use Retry saving before leaving this chat.'; }
    }
    return NextResponse.json({ chat, saveError, allowance: result.allowance, qualityTier: result.qualityTier, basicMode: result.basicMode || null, coverage: { total: coverage.total, included: coverage.included, truncated: coverage.truncated } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (['InsufficientCreditsError', 'ManagedRateLimitError', 'ConcurrencyLimitError'].includes(name)) return chatFailure(new ChatError('Your account has reached its current allowance or concurrency limit. Try again later or review your plan in Settings.', 429));
    if (name === 'ProviderKeyMissingError') return chatFailure(new ChatError('Configure your provider key in Settings or switch to managed inference.'));
    return chatFailure(error);
  }
}
