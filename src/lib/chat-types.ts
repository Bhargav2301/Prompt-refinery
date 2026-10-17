import { z } from 'zod';
import { CREATIVE_TOOLS } from './prompt-library';
import { PROMPT_TECHNIQUES, type PromptTechnique } from './constants';

export const chatTechniqueSchema = z.enum(PROMPT_TECHNIQUES.map(item => item.value) as [PromptTechnique, ...PromptTechnique[]]);

export const MAX_REFERENCE_CHARACTERS = 120_000;
export const MAX_CHAT_BYTES = 5_000_000;
export const referenceMessageSchema = z.object({ id: z.string().min(1).max(120), role: z.enum(['user', 'assistant', 'system', 'unknown']), text: z.string().max(MAX_REFERENCE_CHARACTERS) });
export const referenceSchema = z.object({
  id: z.string().uuid(), title: z.string().max(200), provider: z.string().max(80), url: z.string().max(2048).optional(),
  messages: z.array(referenceMessageSchema).min(1).max(1000), selectedMessageId: z.string().max(120).optional(),
  warnings: z.array(z.string().max(1000)).max(30), reviewed: z.boolean(),
}).refine(value => value.messages.reduce((sum, message) => sum + message.text.length, 0) <= MAX_REFERENCE_CHARACTERS, 'This reference exceeds the 120,000-character limit. Import a focused context pill.');
export type ChatReference = z.infer<typeof referenceSchema>;
export type ReferenceMessage = z.infer<typeof referenceMessageSchema>;
export const chatAttachmentSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(255), mimeType: z.string().max(120), content: z.string().max(12_000), dataUri: z.string().max(650_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional() });
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;
export const chatTurnSchema = z.object({
  id: z.string().uuid(), prompt: z.string().min(1).max(50_000), output: z.string().min(1).max(100_000), createdAt: z.string().datetime(),
  mode: z.enum(['quick_refine', 'guided_fix', 'full_council']), tool: z.enum(CREATIVE_TOOLS),
  qualityTier: z.string().max(30).optional(), references: z.array(z.string().max(200)).max(30),
  promptType: chatTechniqueSchema.optional(),
  refinements: z.array(z.object({ councilMember: z.string().max(160), thoughtProcess: z.string().max(4000), refinedText: z.string().max(100_000) })).max(5).optional(),
});
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export const chatSnapshotSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().min(0), title: z.string().trim().min(1).max(100),
  turns: z.array(chatTurnSchema).max(100), references: z.array(referenceSchema).max(5), attachments: z.array(chatAttachmentSchema).max(6),
});
export type ChatSnapshot = z.infer<typeof chatSnapshotSchema>;
export interface ChatSummary { id: string; title: string; updatedAt: string; turnCount: number; revision: number }

export function chatTitle(prompt: string) {
  const clean = prompt.replace(/\[[^\]]*\]/g, '').replace(/^\s*(please\s+)?(can you\s+|help me\s+)?/i, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').slice(0, 10).join(' ');
  return (words.length > 75 ? `${words.slice(0, 72).trim()}…` : words) || 'New refinement';
}

export function emptyChat(): ChatSnapshot { return { id: crypto.randomUUID(), revision: 0, title: 'New chat', turns: [], references: [], attachments: [] }; }

export interface MissingReference { key: string; name: string; excerpt: string; messageId: string; referenceId: string }
export function findMissingReferences(references: ChatReference[], attachments: ChatAttachment[]): MissingReference[] {
  const supplied = new Set(attachments.map(file => file.name.toLowerCase()));
  const missing: MissingReference[] = [];
  for (const reference of references) for (const message of reference.messages) {
    const names = [...message.text.matchAll(/(?:^|[\s"'`([/])([^\s"'`<>()[\]{}\/\\]{1,100}\.(?:pdf|docx?|md|txt|csv|xlsx?|pptx?|png|jpe?g|webp|gif|svg|json|zip))\b/gi)].map(match => match[1]);
    if (message.role !== 'assistant' && !names.some(name => /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) && /\b(attached|uploaded)\b[^.\n]{0,30}\b(image|photo|screenshot)\b|\b(image|photo|screenshot)\s+(?:attached|uploaded)\b/i.test(message.text)) names.push('Unnamed image');
    if (!names.length && message.role !== 'assistant' && /\b(attached|uploaded|attachment)\b[^.\n]{0,90}\b(file|document|image|photo|markdown|screenshot)\b|\b(file|image|document)\s+(?:attached|uploaded)\b/i.test(message.text)) names.push('Unnamed attachment');
    for (const name of names) {
      const key = `${reference.id}:${message.id}:${name.toLowerCase()}`;
      if (supplied.has(name.toLowerCase()) || missing.some(item => item.key === key)) continue;
      const at = Math.max(0, message.text.toLowerCase().indexOf(name.toLowerCase()));
      missing.push({ key, name, excerpt: message.text.slice(Math.max(0, at - 100), at + 180), messageId: message.id, referenceId: reference.id });
    }
  }
  return missing.slice(0, 50);
}

export function conversationContext(chat: Pick<ChatSnapshot, 'turns' | 'references'>, budget = 120_000) {
  const sections = [
    ...chat.references.filter(reference => reference.reviewed).map(reference => `REFERENCE: ${reference.title}\n${reference.messages.map(message => `${message.role.toUpperCase()} [${message.id}]${message.id === reference.selectedMessageId ? ' (selected prompt)' : ''}:\n${message.text}`).join('\n\n')}`),
    ...chat.turns.map(turn => `PRIOR USER REQUEST:\n${turn.prompt}\nPRIOR REFINEMENT:\n${turn.output}`),
  ];
  const full = sections.join('\n\n');
  if (budget < 200) return { text: '', total: full.length, included: 0, truncated: full.length > 0 };
  if (full.length <= budget) return { text: full, total: full.length, included: full.length, truncated: false };
  const marker = '\n[Context shortened to fit. Middle material omitted; ask the user if it is needed.]\n';
  const first = Math.floor((budget - marker.length) * .55);
  const text = full.slice(0, first) + marker + full.slice(-(budget - marker.length - first));
  return { text, total: full.length, included: text.length, truncated: true };
}
