import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { handleCommunity, type CommunityDependencies } from '../src/lib/server/community-request';
import * as service from '../src/lib/server/community-service';
import { AuthorizationError, type CurrentUserContext } from '../src/lib/server/user-access';
import { newFeedbackSchema } from '../src/lib/community';
import { TECHNIQUE_GUIDE } from '../src/lib/technique-guide';
import { PROMPT_TECHNIQUES } from '../src/lib/constants';
import { APP_VERSION, RELEASE_NOTES } from '../src/lib/releases';
import { TechniqueGuide } from '../src/components/technique-guide';
import { readFileSync } from 'node:fs';

function dependencies(role = 'user', status = 'active') {
  let calls = 0;
  const deps: CommunityDependencies = {
    authenticate: async () => ({ uid: 'synthetic-user', role, profile: { accountStatus: status }, entitlement: { tier: 'free' } } as CurrentUserContext),
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }), ownerEnabled: () => true, allowedOrigin: req => new URL(req.url).origin,
    service: { ...service, listFeedback: async () => { calls++; return { items: [], nextCursor: null }; },
      createFeedback: async (_actor, input) => { calls++; return { ...input, messages: [] } as never; },
      markNotificationsRead: async () => { calls++; } },
  };
  return { deps, calls: () => calls };
}
function request(body?: unknown, origin?: string) {
  return new Request('https://clarift.example/api/feedback', { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(origin ? { Origin: origin } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test('technique guide covers every selectable technique, with original examples, skeletons, use cases and sources', () => {
  assert.deepEqual(TECHNIQUE_GUIDE.map(entry => entry.technique).sort(), PROMPT_TECHNIQUES.map(entry => entry.value).sort());
  assert.equal(new Set(TECHNIQUE_GUIDE.map(entry => entry.id)).size, 8);
  for (const entry of TECHNIQUE_GUIDE) for (const field of ['explanation','where','when','why','limitation','skeleton','example'] as const) assert.ok(entry[field].length > 20);
  const markup = renderToStaticMarkup(React.createElement(TechniqueGuide));
  for (const entry of TECHNIQUE_GUIDE) { assert.ok(markup.includes(entry.technique)); assert.ok(entry.sources.every(source => source.url.startsWith('https://'))); }
  assert.match(markup, /Copy Zero-shot basic skeleton/);
  assert.match(markup, /Search prompting techniques/);
});
test('release version matches application metadata and read receipt IDs are unique', () => {
  assert.equal(JSON.parse(readFileSync('package.json','utf8')).version, APP_VERSION);
  assert.equal(JSON.parse(readFileSync('package-lock.json','utf8')).packages[''].version, APP_VERSION);
  assert.equal(new Set(RELEASE_NOTES.map(note => note.id)).size, RELEASE_NOTES.length);
  for (const note of RELEASE_NOTES) assert.ok(Number.isFinite(Date.parse(note.createdAt)));
});
test('all tiers can submit feedback, authenticated identity is supplied by the server', async () => {
  for (const tier of ['free', 'pro', 'pro-max']) {
    const { deps, calls } = dependencies();
    const auth = deps.authenticate; deps.authenticate = async req => ({ ...await auth(req), entitlement: { tier } } as CurrentUserContext);
    const response = await handleCommunity(request({ id: crypto.randomUUID(), category: 'complaint', subject: 'Synthetic problem', message: 'A synthetic report.' }), { action: 'create' }, deps);
    assert.equal(response.status, 200); assert.equal(calls(), 1); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
});
test('owner inbox is owner-only, including active-account and administration switch checks', async () => {
  for (const role of ['user', 'support', 'admin']) {
    const { deps, calls } = dependencies(role);
    assert.equal((await handleCommunity(request(), { action: 'list', owner: true }, deps)).status, 403); assert.equal(calls(), 0);
  }
  const { deps, calls } = dependencies('owner');
  assert.equal((await handleCommunity(request(), { action: 'list', owner: true }, deps)).status, 200); assert.equal(calls(), 1);
  deps.ownerEnabled = () => false;
  assert.equal((await handleCommunity(request(), { action: 'list', owner: true }, deps)).status, 503);
  const blocked = dependencies('owner', 'suspended');
  assert.equal((await handleCommunity(request(), { action: 'list', owner: true }, blocked.deps)).status, 403); assert.equal(blocked.calls(), 0);
});
test('unauthenticated, cross-origin, forged identity and invalid payloads never reach storage', async () => {
  const { deps, calls } = dependencies();
  const valid = { id: crypto.randomUUID(), category: 'suggestion', subject: 'A new feature', message: 'Synthetic idea' };
  for (const invalid of [{ ...valid, uid: 'another-user' }, { ...valid, category: 'admin' }, { ...valid, message: ' ' }, { ...valid, message: 'x'.repeat(3001) }, { ...valid, subject: 'x'.repeat(121) }]) {
    assert.equal((await handleCommunity(request(invalid), { action: 'create' }, deps)).status, 400);
  }
  assert.equal((await handleCommunity(request(valid, 'https://other.example'), { action: 'create' }, deps)).status, 403);
  deps.authenticate = async () => { throw new AuthorizationError('Private detail', 401); };
  const response = await handleCommunity(request(), { action: 'list' }, deps);
  assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /Private detail/); assert.equal(calls(), 0);
});
test('body byte cap, rate limit and failures have safe responses', async () => {
  const { deps, calls } = dependencies();
  assert.equal((await handleCommunity(request({ text: 'x'.repeat(16001) }), { action: 'create' }, deps)).status, 413);
  deps.rateLimit = async () => ({ allowed: false, retryAfterSeconds: 42 });
  const limited = await handleCommunity(request(), { action: 'list' }, deps);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '42'); assert.equal(calls(), 0);
  deps.rateLimit = async () => { throw new Error('private database or credential detail'); };
  const failure = await handleCommunity(request(), { action: 'list' }, deps);
  assert.equal(failure.status, 500); assert.doesNotMatch(await failure.text(), /private database|credential/);
});
test('plain text content is preserved rather than treated as executable markup', () => {
  const input = newFeedbackSchema.parse({ id: crypto.randomUUID(), category: 'suggestion', subject: '<script>hello</script>', message: '<img src=x onerror=alert(1)>\nExample' });
  assert.match(input.message, /<img/);
  const rendered = renderToStaticMarkup(React.createElement('p', null, input.message));
  assert.doesNotMatch(rendered, /<img/); assert.match(rendered, /&lt;img/);
});

test('configured public origin works behind an internal hosting proxy', async () => {
  const { deps } = dependencies(); deps.allowedOrigin = () => 'https://clarift.example';
  const request = new Request('http://internal-host/api/feedback', { method: 'POST', headers: { Origin: 'https://clarift.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: crypto.randomUUID(), category: 'suggestion', subject: 'Proxy test', message: 'Synthetic' }) });
  assert.equal((await handleCommunity(request, { action: 'create' }, deps)).status, 200);
});
