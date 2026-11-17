import { z } from 'zod';
import { communityId, newFeedbackSchema, feedbackReplySchema, feedbackStatusSchema, readNotificationsSchema } from '@/lib/community';
import { AuthorizationError, requireUser, type CurrentUserContext } from './user-access';
import { consumeDistributedLimit } from './distributed-limits';
import { getCheckoutReturnOrigin } from './checkout-origin';
import * as service from './community-service';

export type CommunityAction = 'list' | 'create' | 'read' | 'reply' | 'status' | 'notifications' | 'markRead';
export interface CommunityDependencies {
  authenticate: (request: Request) => Promise<CurrentUserContext>;
  rateLimit: (uid: string, write: boolean) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  service: typeof service;
  ownerEnabled: () => boolean;
  allowedOrigin: (request: Request) => string;
}
const defaults: CommunityDependencies = {
  authenticate: requireUser,
  rateLimit: (uid, write) => consumeDistributedLimit({ bucket: write ? 'community:write' : 'community:read', key: uid, limit: write ? 30 : 120, windowMs: 5 * 60_000 }),
  service, ownerEnabled: () => process.env.ENABLE_ADMIN_CENTER !== 'false',
  allowedOrigin: request => process.env.NODE_ENV === 'production' ? getCheckoutReturnOrigin(request.url) : new URL(request.url).origin,
};
async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new service.CommunityError('Send a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new service.CommunityError('Request body required.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_000) { await reader.cancel(); throw new service.CommunityError('Message is too large.', 413); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new service.CommunityError('Invalid JSON.'); }
  } finally { reader.releaseLock(); }
}
export async function handleCommunity(request: Request, options: { action: CommunityAction; owner?: boolean; id?: string }, deps: CommunityDependencies = defaults) {
  const json = (value: unknown, status = 200, headers?: Record<string, string>) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
  try {
    const actor = await deps.authenticate(request);
    if (actor.profile.accountStatus !== 'active') return json({ error: { message: 'An active account is required.' } }, 403);
    if (options.owner && actor.role !== 'owner') return json({ error: { message: 'Owner access is required.' } }, 403);
    if (options.owner && !deps.ownerEnabled()) return json({ error: { message: 'Administration is unavailable.' } }, 503);
    const write = ['create', 'reply', 'status', 'markRead'].includes(options.action);
    // Bearer auth is mandatory; same-origin checks additionally reject browser cross-site writes.
    const origin = request.headers.get('origin');
    if (write && origin && origin !== deps.allowedOrigin(request)) return json({ error: { message: 'Request origin is not allowed.' } }, 403);
    const limit = await deps.rateLimit(actor.uid, write);
    if (!limit.allowed) return json({ error: { message: 'Too many requests. Please wait and retry.' } }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
    const id = options.id === undefined ? undefined : communityId.parse(options.id);
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (options.action === 'list') return json(await deps.service.listFeedback(actor, Boolean(options.owner), cursor));
    if (options.action === 'create') return json(await deps.service.createFeedback(actor, newFeedbackSchema.parse(await body(request))));
    if (options.action === 'read' && id) return json(await deps.service.readFeedback(actor, id));
    if (options.action === 'reply' && id) return json(await deps.service.replyFeedback(actor, id, feedbackReplySchema.parse(await body(request)), Boolean(options.owner)));
    if (options.action === 'status' && id && options.owner) return json(await deps.service.setFeedbackStatus(actor, id, feedbackStatusSchema.parse(await body(request)).status));
    if (options.action === 'notifications') return json(await deps.service.listNotifications(actor, cursor));
    if (options.action === 'markRead') { await deps.service.markNotificationsRead(actor, readNotificationsSchema.parse(await body(request)).ids); return json({ ok: true }); }
    return json({ error: { message: 'Invalid operation.' } }, 400);
  } catch (error) {
    if (error instanceof AuthorizationError) return json({ error: { message: 'Sign in with an authorized account to continue.' } }, error.status);
    if (error instanceof service.CommunityError) return json({ error: { message: error.message } }, error.status);
    if (error instanceof z.ZodError) return json({ error: { message: 'Check your input: subject 3–120 characters, message 1–3,000 characters.' } }, 400);
    console.warn('Community request failed.'); // Do not log feedback, identities, or provider errors.
    return json({ error: { message: 'Could not complete your request. Please retry.' } }, 500);
  }
}
