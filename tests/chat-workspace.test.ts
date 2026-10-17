import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { referenceFromText, publicChatUrl } from '../src/lib/chat-reference';
import { emptyChat, chatTitle, conversationContext, findMissingReferences, chatSnapshotSchema } from '../src/lib/chat-types';
import { encodeChat, validateChatId } from '../src/lib/server/chat-service';
import { parseSharedChatHtml } from '../src/lib/server/shared-chat-import';
import { passwordPairSchema, accountErrorMessage } from '../src/lib/account-security';
import { withReferenceImages } from '../src/lib/model-messages';
import { estimateSerializedTokens } from '../src/lib/free-inference';
import { buildFreeRefinementRequest } from '../src/lib/server/free-model-inference';
import { CREATIVE_TOOLS, creativeInstructions, PROMPT_LIBRARY, PROMPT_SOURCES } from '../src/lib/prompt-library';

test('password pairs require a strong-enough matching password and safe errors', () => {
  assert.equal(passwordPairSchema.safeParse({ newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' }).success, true);
  assert.equal(passwordPairSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' }).success, false);
  assert.equal(passwordPairSchema.safeParse({ newPassword: 'abcdefgh', confirmPassword: 'different' }).success, false);
  assert.doesNotMatch(accountErrorMessage(new Error('private credentials')), /private credentials/);
});

test('context pill parser preserves metadata, exact prompts, inline roles and code fences', () => {
  const reference = referenceFromText('# Project: Lighthouse\nKeep the ending hopeful.\n[1 · user]\nUse outline.md and the attached image.\n[2 · assistant]\nDraft\n```text\nUser: not a new message\n```\n## 3. User\nImprove the ending.\nAssistant: A revised ending.');
  assert.deepEqual(reference.messages.map(message => message.role), ['unknown', 'user', 'assistant', 'user', 'assistant']);
  assert.match(reference.messages[0].text, /hopeful/);
  assert.match(reference.messages[2].text, /User: not a new message/);
  const missing = findMissingReferences([reference], []);
  assert.equal(missing[0].name, 'outline.md'); assert.equal(missing[0].messageId, reference.messages[1].id);
  assert.equal(findMissingReferences([reference], [{ id: crypto.randomUUID(), name: 'outline.md', mimeType: 'text/markdown', content: 'Outline' }]).filter(file => file.name === 'outline.md').length, 0);
});

test('only reviewed conversation context reaches prompts and clipping is explicit', () => {
  const chat = emptyChat(); const reference = referenceFromText('User: original decision\nAssistant: ' + 'Context '.repeat(1000));
  chat.references.push(reference);
  assert.equal(conversationContext(chat).text, '');
  reference.reviewed = true; reference.selectedMessageId = reference.messages[0].id;
  assert.match(conversationContext(chat).text, /selected prompt/);
  const clipped = conversationContext(chat, 300);
  assert.equal(clipped.truncated, true); assert.equal(clipped.text.length, 300); assert.match(clipped.text, /omitted/);
  assert.equal(conversationContext(chat, 0).included, 0);
  assert.ok(chatTitle('Please help me write a cinematic lighthouse story for a short film').length <= 75);
});

test('shared URLs reject private, credentialed and arbitrary destinations', () => {
  for (const value of ['http://chatgpt.com/share/abc', 'https://evil.test/share/abc', 'https://chatgpt.com@127.0.0.1/share/abc', 'https://chatgpt.com/c/private', 'https://chatgpt.com:444/share/abc', 'https://chatgpt.com/share/../../api']) assert.throws(() => publicChatUrl(value));
  assert.equal(publicChatUrl('https://chatgpt.com/share/abc?tracking=1#section').href, 'https://chatgpt.com/share/abc');
  for (const host of ['claude.ai', 'grok.com', 'chat.deepseek.com', 'chat.qwen.ai']) assert.equal(publicChatUrl(`https://${host}/share/example`).hostname, host);
});

test('public chat parser handles nested rendered messages, attachments, JSON and flight data without scripts', () => {
  const html = '<title>Story</title><article data-message-author-role="user"><div data-testid="user-message">Use this outline</div><button data-testid="file-attachment">outline.md</button><script>private()</script></article><article data-message-author-role="assistant">A story</article>';
  const dom = parseSharedChatHtml(html, 'https://chatgpt.com/share/test');
  assert.equal(dom.messages.length, 2); assert.match(dom.messages[0].text, /outline.md/); assert.doesNotMatch(dom.messages[0].text, /private/);
  const data = { messages: [{ id: 'one', sender: 'human', content: [{ type: 'text', text: 'Use the attached image' }], attachments: [{ file_name: 'scene.png' }] }, { id: 'two', sender: 'assistant', content: 'A scene' }] };
  const json = parseSharedChatHtml(`<script type="application/json">${JSON.stringify(data)}</script>`, 'https://claude.ai/share/test');
  assert.equal(json.messages.length, 2); assert.match(json.messages[0].text, /scene.png/);
  const flight = parseSharedChatHtml(`<script>self.__next_f.push(${JSON.stringify([1, '1:' + JSON.stringify(data) + '\n'])})</script>`, 'https://grok.com/share/test');
  assert.equal(flight.messages.length, 2);
  assert.throws(() => parseSharedChatHtml('<main>Sign in to continue</main>', 'https://chatgpt.com/share/test'), /did not expose/);
});

test('chat chunks round-trip Unicode across UTF-8 storage and reject invalid sizes and IDs', () => {
  const chat = emptyChat(); chat.references = [referenceFromText('🌅'.repeat(59999))];
  const chunks = encodeChat(chat);
  assert.ok(chunks.length > 1);
  const roundtrip = JSON.parse(chunks.map(chunk => Buffer.from(chunk).toString('utf8')).join(''));
  assert.deepEqual(roundtrip, chat);
  assert.throws(() => validateChatId('../other-user'));
  assert.equal(chatSnapshotSchema.safeParse({ ...chat, revision: -1 }).success, false);
});

test('image references are sent as multimodal input and budgeted independently from base64 length', () => {
  const dataUri = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
  const messages = withReferenceImages([{ role: 'user', content: 'Describe the reference' }], [{ dataUri }]);
  assert.ok(Array.isArray(messages[0].content));
  assert.ok(estimateSerializedTokens(messages) < 3000);
  const request = buildFreeRefinementRequest('quick_refine', { prompt: 'Refine my scene', promptType: 'Zero-shot', conversationContext: 'Confirmed lighthouse story', creativeInstructions: creativeInstructions('veo'), attachments: [{ name: 'scene.jpg', mimeType: 'image/jpeg', content: 'Image reference', dataUri }] });
  assert.match(JSON.stringify(request.messages), /Confirmed lighthouse story/);
  assert.match(JSON.stringify(request.messages), /image_url/);
});

test('media library has original templates and attributed guidance for every creative tool', () => {
  assert.ok(PROMPT_SOURCES.length >= 14);
  assert.ok(PROMPT_LIBRARY.length >= 30);
  for (const tool of CREATIVE_TOOLS.filter(tool => tool !== 'general')) { assert.ok(PROMPT_LIBRARY.some(template => template.tool === tool)); assert.ok(creativeInstructions(tool).length > 50); }
});

test('Projects is absent from live navigation and temporary chat persistence is explicitly guarded', () => {
  const shell = readFileSync('src/components/workspace-v2/workspace-shell.tsx', 'utf8');
  const app = readFileSync('src/components/workspace-v2/workspace-v2-app.tsx', 'utf8');
  assert.doesNotMatch(shell, /label: 'Projects'/); assert.doesNotMatch(app, /ProjectsTab|collection\(.*'projects'/);
  assert.match(shell, /label: 'History'/); assert.match(shell, /label: 'Prompt library'/);
  const route = readFileSync('src/app/api/chats/refine/route.ts', 'utf8');
  assert.match(route, /if \(!input\.temporary\)\s*\{\s*try \{ chat = await saveChat/);
});
