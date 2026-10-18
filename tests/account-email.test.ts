import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserRecord, DecodedIdToken } from 'firebase-admin/auth';
import { accountEmailOrigin, buildAccountEmail, clariftEmailActionLink, handleAccountEmail, type AccountEmailDependencies } from '../src/lib/server/account-email';

const environment = { NODE_ENV: 'production', APP_BASE_URL: 'https://clarift.dpdns.org', AUTH_EMAIL_FROM: 'Clarift <accounts@mail.clarift.org>', RESEND_API_KEY: 'test-only' };
const user = { uid: 'owner', email: 'owner@example.com', emailVerified: false, disabled: false, providerData: [{ providerId: 'password' }] } as UserRecord;
function setup() {
  const sent: Parameters<AccountEmailDependencies['send']>[0][] = [];
  const limits: Parameters<AccountEmailDependencies['limit']>[0][] = [];
  const reports: string[] = [];
  const auth = {
    verifyIdToken: async (token: string, revoked?: boolean) => { assert.equal(token, 'valid'); assert.equal(revoked, true); return { uid: user.uid } as DecodedIdToken; },
    getUser: async () => user,
    getUserByEmail: async () => user,
    generateEmailVerificationLink: async (email: string) => { assert.equal(email, user.email); return 'https://project.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=verification-secret&continueUrl=https://evil.test'; },
    generatePasswordResetLink: async (email: string) => { assert.equal(email, user.email); return 'https://project.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=reset-secret'; },
  } as AccountEmailDependencies['auth'];
  const deps: AccountEmailDependencies = {
    auth, environment,
    limit: async input => { limits.push(input); return { allowed: true, remaining: 2, retryAfterSeconds: 60 }; },
    send: async email => { sent.push(email); }, report: (action, code) => { reports.push(`${action}:${code}`); },
  };
  return { deps, sent, limits, reports };
}
function request(body: unknown, options: { origin?: string; token?: string; type?: string } = {}) {
  return new Request('https://clarift.dpdns.org/api/auth/email', {
    method: 'POST', headers: { Origin: options.origin ?? environment.APP_BASE_URL, 'Content-Type': options.type ?? 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('action links use configured HTTPS origin, preserve only action/code, and reject mismatches', () => {
  const link = new URL(clariftEmailActionLink('https://project.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=one-use&continueUrl=https://evil.test&apiKey=untrusted', 'resetPassword', environment));
  assert.equal(link.origin, environment.APP_BASE_URL); assert.equal(link.pathname, '/auth/action');
  assert.deepEqual([...link.searchParams], [['mode', 'resetPassword'], ['oobCode', 'one-use']]);
  assert.throws(() => clariftEmailActionLink('https://project.test/?mode=verifyEmail&oobCode=x', 'resetPassword', environment));
  assert.throws(() => clariftEmailActionLink('https://project.test/?mode=resetPassword', 'resetPassword', environment));
  for (const url of ['http://clarift.org', 'https://user:pass@clarift.org', 'javascript:alert(1)', '']) assert.throws(() => accountEmailOrigin({ ...environment, APP_BASE_URL: url }));
  const email = buildAccountEmail('resetPassword', link.href);
  assert.match(email.text, /create and confirm a new password/); assert.match(email.html, /&amp;oobCode=/);
});

test('verification requires authenticated owner and never accepts a caller-selected recipient', async () => {
  const { deps, sent } = setup();
  assert.equal((await handleAccountEmail(request({ action: 'verifyEmail' }), deps)).status, 401);
  assert.equal((await handleAccountEmail(request({ action: 'verifyEmail' }, { token: 'bad' }), deps)).status, 401);
  assert.equal((await handleAccountEmail(request({ action: 'verifyEmail', email: 'victim@example.com' }, { token: 'valid' }), deps)).status, 400);
  const result = await handleAccountEmail(request({ action: 'verifyEmail' }, { token: 'valid' }), deps);
  assert.equal(result.status, 200); assert.equal(sent.length, 1); assert.equal(sent[0].to, user.email);
  assert.match(sent[0].text, /https:\/\/clarift\.dpdns\.org\/auth\/action\?mode=verifyEmail/);
  assert.doesNotMatch(sent[0].text, /evil\.test/); assert.deepEqual(await result.json(), { ok: true });
});

test('verified and disabled users cannot trigger verification email', async () => {
  for (const change of [{ emailVerified: true }, { disabled: true }]) {
    const { deps, sent } = setup(); deps.auth.getUser = async () => ({ ...user, ...change } as UserRecord);
    await handleAccountEmail(request({ action: 'verifyEmail' }, { token: 'valid' }), deps);
    assert.equal(sent.length, 0);
  }
});

test('reset response does not reveal missing accounts, Google-only accounts, throttling or delivery failures', async () => {
  const outcomes: string[] = [];
  for (const scenario of ['exists', 'missing', 'disabled', 'google', 'limited', 'provider-failed']) {
    const { deps, sent } = setup();
    if (scenario === 'missing') deps.auth.getUserByEmail = async () => { throw Object.assign(new Error('private email'), { code: 'auth/user-not-found' }); };
    if (scenario === 'disabled') deps.auth.getUserByEmail = async () => ({ ...user, disabled: true } as UserRecord);
    if (scenario === 'google') deps.auth.getUserByEmail = async () => ({ ...user, providerData: [{ providerId: 'google.com' }] } as UserRecord);
    if (scenario === 'limited') deps.limit = async input => ({ allowed: input.bucket !== 'account-email-address', remaining: 0, retryAfterSeconds: 60 });
    if (scenario === 'provider-failed') deps.send = async () => { throw new Error('API secret and private address'); };
    const response = await handleAccountEmail(request({ action: 'resetPassword', email: user.email }), deps);
    assert.equal(response.status, 200); outcomes.push(await response.text());
    if (scenario === 'exists') assert.equal(sent.length, 1); else assert.equal(sent.length, 0);
  }
  assert.equal(new Set(outcomes).size, 1);
});

test('invalid origins, payloads, content types, and oversized streaming bodies never send mail', async () => {
  const { deps, sent, limits } = setup();
  assert.equal((await handleAccountEmail(request({ action: 'resetPassword', email: user.email }, { origin: 'https://evil.test' }), deps)).status, 403);
  assert.equal((await handleAccountEmail(request({ action: 'resetPassword', email: user.email }, { type: 'text/plain' }), deps)).status, 415);
  assert.equal((await handleAccountEmail(request({ action: 'resetPassword', email: 'invalid' }), deps)).status, 400);
  assert.equal((await handleAccountEmail(request('{invalid'), deps)).status, 400);
  assert.equal((await handleAccountEmail(request('a'.repeat(2049)), deps)).status, 413);
  assert.equal(sent.length, 0); assert.equal(limits.length, 0);
});

test('distributed IP, address and global budgets stop sending and return safe errors', async () => {
  for (const bucket of ['account-email-ip', 'account-email-address', 'account-email-daily']) {
    const { deps, sent } = setup();
    deps.limit = async input => ({ allowed: input.bucket !== bucket, remaining: 0, retryAfterSeconds: 60 });
    const response = await handleAccountEmail(request({ action: 'verifyEmail' }, { token: 'valid' }), deps);
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60'); assert.equal(sent.length, 0);
  }
  const { deps, sent } = setup(); deps.environment = { ...environment, RESEND_API_KEY: '' };
  assert.equal((await handleAccountEmail(request({ action: 'verifyEmail' }, { token: 'valid' }), deps)).status, 503); assert.equal(sent.length, 0);
});
