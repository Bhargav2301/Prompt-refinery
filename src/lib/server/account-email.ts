import { randomUUID } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
import { consumeDistributedLimit } from './distributed-limits';
import { ExtensionRequestSecurityError, readBoundedExtensionJson } from './extension-request-security';
import { getClientIp } from './request-rate-limit';

type Action = 'verifyEmail' | 'resetPassword';
type Environment = Record<string, string | undefined>;
type EmailAuth = Pick<Auth, 'verifyIdToken' | 'getUser' | 'getUserByEmail' | 'generateEmailVerificationLink' | 'generatePasswordResetLink'>;
export interface AccountEmailDependencies {
  auth: EmailAuth;
  limit: typeof consumeDistributedLimit;
  send: (email: { to: string; subject: string; text: string; html: string }) => Promise<void>;
  environment: Environment;
  report: (action: Action, code: string) => void;
}

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verifyEmail') }).strict(),
  z.object({ action: z.literal('resetPassword'), email: z.string().trim().email().max(254) }).strict(),
]);

export function accountEmailOrigin(environment: Environment): string {
  const url = new URL(environment.APP_BASE_URL || '');
  if (url.username || url.password || (url.protocol !== 'https:' && !(environment.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Invalid account email origin configuration');
  }
  return url.origin;
}

export function clariftEmailActionLink(generatedLink: string, action: Action, environment: Environment): string {
  const generated = new URL(generatedLink);
  const code = generated.searchParams.get('oobCode');
  if (generated.searchParams.get('mode') !== action || !code || code.length > 2048) throw new Error('Invalid generated action link');
  const link = new URL('/auth/action', accountEmailOrigin(environment));
  link.searchParams.set('mode', action);
  link.searchParams.set('oobCode', code);
  // The page uses its own Firebase configuration; never forward arbitrary redirect parameters.
  return link.href;
}

export function buildAccountEmail(action: Action, link: string) {
  const reset = action === 'resetPassword';
  const subject = reset ? 'Reset your Clarift password' : 'Verify your Clarift email';
  const description = reset
    ? 'Use the link below to create and confirm a new password for your Clarift account.'
    : 'Confirm this email address to finish setting up your Clarift account.';
  const label = reset ? 'Create a new password' : 'Verify email';
  const escapedLink = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    subject,
    text: `${subject}\n\n${description}\n\n${link}\n\nThis link can be used once. If you did not request this email, you can ignore it.\n\nClarift`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><h1>Clarift</h1><h2>${subject}</h2><p>${description}</p><p style="margin:28px 0"><a href="${escapedLink}" style="background:#d96300;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none">${label}</a></p><p>This link can be used once. If you did not request this email, you can ignore it.</p></div>`,
  };
}

export async function sendAccountEmail(email: Parameters<AccountEmailDependencies['send']>[0], environment: Environment = process.env) {
  if (!environment.RESEND_API_KEY?.trim() || !environment.AUTH_EMAIL_FROM?.trim()) throw new Error('Account email delivery is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${environment.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': `clarift-account/${randomUUID()}` },
    body: JSON.stringify({ from: environment.AUTH_EMAIL_FROM.trim(), ...email }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !result.id) throw Object.assign(new Error('Account email delivery failed'), { code: `provider/http-${response.status}` });
}

const reply = (status = 200, code?: string, retryAfter?: number) => Response.json(code ? { error: { code } } : { ok: true }, {
  status, headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
});

export async function handleAccountEmail(request: Request, deps: AccountEmailDependencies): Promise<Response> {
  let origin: string;
  try {
    origin = accountEmailOrigin(deps.environment);
    if (!deps.environment.RESEND_API_KEY?.trim() || !deps.environment.AUTH_EMAIL_FROM?.trim()) throw new Error();
  } catch { return reply(503, 'auth/email-delivery-unavailable'); }
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply(403, 'auth/unauthorized-request');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, 'auth/invalid-request');
  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(await readBoundedExtensionJson(request, 2048)); }
  catch (error) { return reply(error instanceof ExtensionRequestSecurityError ? error.status : 400, 'auth/invalid-request'); }

  try {
    const ipLimit = await deps.limit({ bucket: 'account-email-ip', key: getClientIp(request), limit: 20, windowMs: 60 * 60_000 });
    if (!ipLimit.allowed) return reply(429, 'auth/too-many-requests', ipLimit.retryAfterSeconds);
    let email: string;
    if (input.action === 'verifyEmail') {
      const bearer = request.headers.get('authorization');
      if (!bearer?.startsWith('Bearer ') || bearer.length > 8192) return reply(401, 'auth/requires-recent-login');
      let user;
      try {
        const token = await deps.auth.verifyIdToken(bearer.slice(7), true);
        user = await deps.auth.getUser(token.uid);
      } catch { return reply(401, 'auth/requires-recent-login'); }
      if (!user.email || user.disabled) return reply(401, 'auth/requires-recent-login');
      if (user.emailVerified) return reply();
      email = user.email;
    } else {
      email = input.email;
    }
    // One shared address bucket also prevents alternating reset and verification requests.
    const addressLimit = await deps.limit({ bucket: 'account-email-address', key: email.toLowerCase(), limit: 3, windowMs: 60 * 60_000 });
    if (!addressLimit.allowed) return input.action === 'resetPassword' ? reply() : reply(429, 'auth/too-many-requests', addressLimit.retryAfterSeconds);
    if (input.action === 'resetPassword') {
      const user = await deps.auth.getUserByEmail(email);
      if (user.disabled || !user.providerData.some(provider => provider.providerId === 'password')) return reply();
      email = user.email!;
    }
    const dailyLimit = Number(deps.environment.AUTH_EMAIL_DAILY_LIMIT || 80);
    const budget = await deps.limit({ bucket: 'account-email-daily', key: 'all', limit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.min(Math.floor(dailyLimit), 10000) : 80, windowMs: 24 * 60 * 60_000 });
    if (!budget.allowed) return input.action === 'resetPassword' ? reply() : reply(429, 'auth/too-many-requests', budget.retryAfterSeconds);
    const settings = { url: `${origin}/`, handleCodeInApp: false };
    const generated = input.action === 'verifyEmail'
      ? await deps.auth.generateEmailVerificationLink(email, settings)
      : await deps.auth.generatePasswordResetLink(email, settings);
    const link = clariftEmailActionLink(generated, input.action, deps.environment);
    await deps.send({ to: email, ...buildAccountEmail(input.action, link) });
    return reply();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    if (code !== 'auth/user-not-found') deps.report(input.action, /^[a-zA-Z0-9/\-]{1,80}$/.test(code) ? code : 'unknown');
    // Keep reset responses identical for absent accounts and provider failures; do not return links, addresses, or provider errors.
    return input.action === 'resetPassword' ? reply() : reply(503, 'auth/email-delivery-unavailable');
  }
}
