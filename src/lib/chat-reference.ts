import { MAX_REFERENCE_CHARACTERS, type ChatReference, type ReferenceMessage } from './chat-types';

export const CHAT_HOSTS: Record<string, string> = { 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'grok.com': 'Grok', 'chat.deepseek.com': 'DeepSeek', 'chat.qwen.ai': 'Qwen', 'qwen.ai': 'Qwen', 'www.perplexity.ai': 'Perplexity', 'perplexity.ai': 'Perplexity', 'gemini.google.com': 'Gemini' };
export function publicChatUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid shared-chat link.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !CHAT_HOSTS[url.hostname]) throw new Error('Use an HTTPS share link from ChatGPT, Claude, Grok, DeepSeek, Qwen, Gemini or Perplexity.');
  if (!/^\/(share|s|search)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw new Error('This is not a public share link. Use Import from open tab or paste an exported transcript.');
  url.search = ''; url.hash = '';
  return url;
}

export function normalizeRole(role: unknown): ReferenceMessage['role'] {
  const value = String(role || '').toLowerCase();
  if (/^(user|human|you)$/.test(value)) return 'user';
  if (/^(assistant|model|ai|gpt|chatgpt|claude|grok|deepseek|qwen)$/.test(value)) return 'assistant';
  return value === 'system' ? 'system' : 'unknown';
}

export function referenceFromText(text: string, title = 'Imported conversation'): ChatReference {
  if (!text.trim()) throw new Error('Paste or upload a chat transcript first.');
  if (text.length > MAX_REFERENCE_CHARACTERS) throw new Error('Import up to 120,000 characters per reference. Use a focused context pill for a longer conversation.');
  const messages: ReferenceMessage[] = [];
  let role: ReferenceMessage['role'] = 'unknown';
  let lines: string[] = []; let fence = '';
  const flush = () => { const body = lines.join('\n').trim(); if (body) messages.push({ id: `message-${messages.length + 1}`, role, text: body }); lines = []; };
  for (const line of text.split(/\r?\n/)) {
    const delimiter = line.trim().match(/^(`{3,}|~{3,})/);
    if (delimiter) { if (!fence) fence = delimiter[1][0]; else if (fence === delimiter[1][0]) fence = ''; lines.push(line); continue; }
    const marker = !fence && (line.match(/^\s*\[\d+\s*[·.:-]\s*(user|assistant|system|unknown)\]\s*$/i)
      || line.match(/^(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(user|human|you|assistant|model|ai|chatgpt|claude|grok|deepseek|qwen|system|unknown)(?:\s*\[[^\]]*\])?(?:\s*:\s*(.*)|\s*)$/i));
    if (marker) { flush(); role = normalizeRole(marker[1]); if (marker[2]) lines.push(marker[2]); }
    else lines.push(line);
  }
  flush();
  if (messages.length > 1000) throw new Error('Import up to 1,000 messages per reference. Use a focused context pill for longer chats.');
  return { id: crypto.randomUUID(), title: title.slice(0, 200), provider: 'Transcript', messages, warnings: ['Review the imported text and choose the exact prompt. Original attachments may not be included.'], reviewed: false };
}

export function referenceFromCapture(capture: { title?: string; provider?: string; url?: string; messages?: Array<{ id?: string; role?: string; text?: string }>; warnings?: string[] }): ChatReference {
  const messages = (capture.messages || []).filter(message => typeof message.text === 'string' && message.text.trim()).map((message, index) => ({ id: `capture-${index + 1}`, role: normalizeRole(message.role), text: message.text! }));
  if (!messages.length) throw new Error('No readable chat messages were found. Export the conversation or paste a transcript.');
  if (messages.length > 1000 || messages.reduce((total, message) => total + message.text.length, 0) > MAX_REFERENCE_CHARACTERS) throw new Error('This conversation is larger than the reference limit. Create a focused context pill in the extension and paste it here.');
  return { id: crypto.randomUUID(), title: (capture.title || 'Open chat').slice(0, 200), provider: (capture.provider || 'Browser extension').slice(0, 80), ...(capture.url ? { url: capture.url.slice(0, 2048) } : {}), messages, warnings: [...(capture.warnings || []).slice(0, 25), 'Attachments are not downloaded from the other chatbot. Upload the originals here.'], reviewed: false };
}
