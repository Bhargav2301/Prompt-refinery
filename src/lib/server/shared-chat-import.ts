import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import { CHAT_HOSTS, normalizeRole, publicChatUrl } from '@/lib/chat-reference';
import { MAX_REFERENCE_CHARACTERS, type ChatReference, type ReferenceMessage } from '@/lib/chat-types';
import { ChatError } from './chat-service';

function textContent(value: unknown, depth = 0): string {
  if (depth > 30) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => textContent(item, depth + 1)).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return textContent(record.text ?? record.parts ?? (record.type === 'text' ? record.content : undefined), depth + 1);
  }
  return '';
}

export function parseSharedChatHtml(html: string, sourceUrl: string): ChatReference {
  const url = publicChatUrl(sourceUrl);
  const $ = load(html);
  const messages: ReferenceMessage[] = [];
  const selector = '[data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"], [data-testid="human-message"], [data-role="user"], [data-role="assistant"], user-query, model-response, .font-user-message, .font-claude-message';
  const title = ($('meta[property="og:title"]').attr('content') || $('title').text() || `${CHAT_HOSTS[url.hostname]} conversation`).trim().slice(0, 200);
  $(selector).each((index, element) => {
    if ($(element).parents(selector).length) return;
    const clone = $(element).clone();
    const filenames = $(element).find('[data-testid*="attachment"], [data-testid*="file"], a[download], img[alt]').map((_i, file) => $(file).attr('download') || $(file).attr('alt') || $(file).text()).get().filter(name => /\.(pdf|docx?|md|txt|png|jpe?g|webp|xlsx?|csv|pptx?)\b/i.test(name)).map(name => name.trim().slice(0, 200));
    clone.find('script,style,button,nav,input,textarea,[hidden],[aria-hidden="true"]').remove();
    clone.find('br').replaceWith('\n'); clone.find('p,pre,div,li').append('\n');
    const label = $(element).attr('data-message-author-role') || $(element).attr('data-role') || $(element).attr('data-testid') || $(element).attr('class') || element.tagName;
    const role = /user|human/.test(label) ? 'user' : /assistant|model|claude/.test(label) ? 'assistant' : 'unknown';
    const text = (clone.text() + (filenames.length ? `\nAttachments mentioned: ${[...new Set(filenames)].join(', ')}` : '')).replace(/\n{3,}/g, '\n\n').trim();
    if (text) messages.push({ id: `message-${index + 1}`, role, text });
  });
  if (!messages.length) {
    const seen = new Set<string>(); let visited = 0;
    function walk(value: unknown, depth = 0) {
      if (++visited > 50_000 || depth > 35 || !value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      const role = normalizeRole((record.author as { role?: unknown })?.role ?? record.role ?? record.sender);
      const text = textContent(record.content ?? record.text ?? record.parts);
      if (role !== 'unknown' && text.trim()) {
        const key = typeof record.id === 'string' ? record.id : null;
        if (!key || !seen.has(key)) {
          if (key) seen.add(key);
          const files = Array.isArray(record.attachments) ? record.attachments.map(file => String(file.file_name || file.filename || file.name || 'Unnamed attachment')).join(', ') : '';
          messages.push({ id: `message-${messages.length + 1}`, role, text: text.trim() + (files ? `\nAttachments mentioned: ${files}` : '') });
        }
        return;
      }
      for (const child of Object.values(value)) walk(child, depth + 1);
    }
    $('script[type="application/json"],script#__NEXT_DATA__').each((_index, script) => { try { walk(JSON.parse($(script).text())); } catch { /* Non-JSON scripts are never evaluated. */ } });
    if (!messages.length) $('script').each((_index, script) => {
      const match = $(script).text().match(/self\.__next_f\.push\((\[[\s\S]*\])\)/);
      if (!match) return;
      try {
        const payload = JSON.parse(match[1]);
        if (typeof payload[1] === 'string') for (const line of payload[1].split('\n')) {
          const body = line.slice(line.indexOf(':') + 1);
          try { walk(JSON.parse(body)); } catch { /* Ignore non-data flight records. */ }
        }
      } catch { /* A source script cannot execute in the importer. */ }
    });
  }
  if (!messages.length) throw new ChatError('This site did not expose a readable shared conversation. Import it from the open tab with the extension, or paste/export the transcript.');
  if (messages.length > 1000 || messages.reduce((sum, message) => sum + message.text.length, 0) > MAX_REFERENCE_CHARACTERS) throw new ChatError('The shared conversation is too large. Import a focused context pill instead.');
  return { id: crypto.randomUUID(), title, provider: CHAT_HOSTS[url.hostname], url: url.href, messages, warnings: ['Only messages exposed by this public share page were imported. Review the transcript for completeness.', 'Attachments in the original chat are not available automatically. Upload the originals listed below.'], reviewed: false };
}

export async function importSharedChat(value: string) {
  let url: URL;
  try { url = publicChatUrl(value); } catch (error) { throw new ChatError((error as Error).message); }
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|f[cd]|fe[89ab])/i.test(address))) throw new ChatError('This link could not be reached safely.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Clarift-Reference-Importer/1.0' }, cache: 'no-store' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      try { url = publicChatUrl(new URL(response.headers.get('location') || '', url).href); } catch { throw new ChatError('The share link redirected to a page that cannot be imported. Use the extension or an exported transcript.'); }
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new ChatError('The share page is private, unavailable or requires a browser. Use Import from open tab or paste a transcript.'); }
    const reader = response.body?.getReader(); if (!reader) throw new ChatError('The share page was empty.');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 3_000_000) { await reader.cancel(); throw new ChatError('This share page is too large. Use the extension or an exported transcript.'); } chunks.push(value); }
    return parseSharedChatHtml(Buffer.concat(chunks).toString('utf8'), url.href);
  }
  throw new ChatError('This share link redirected too many times.');
}
