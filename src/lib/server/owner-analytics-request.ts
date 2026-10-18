import type { AnalyticsWindowDays, OwnerAnalyticsReport } from '@/lib/owner-analytics';
import { requireUser, AuthorizationError, type CurrentUserContext } from './user-access';
import { consumeDistributedLimit } from './distributed-limits';
import { writeAdminAuditLog } from './admin-service';
import { readOwnerAnalytics } from './owner-analytics';

interface Dependencies {
  enabled: () => boolean;
  authenticate: (request: Request) => Promise<CurrentUserContext>;
  rateLimit: (uid: string) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  read: (days: AnalyticsWindowDays) => Promise<OwnerAnalyticsReport>;
  audit: (actor: CurrentUserContext, days: number) => Promise<void>;
}
const defaults: Dependencies = {
  enabled: () => process.env.ENABLE_ADMIN_CENTER !== 'false',
  authenticate: requireUser,
  rateLimit: (uid) => consumeDistributedLimit({ bucket: 'admin:owner_analytics', key: uid, limit: 20, windowMs: 5 * 60_000 }),
  read: readOwnerAnalytics,
  // Fixed metadata only. Avoid linking report rows or request payloads in logs.
  audit: (actor, days) => writeAdminAuditLog({ actor, action: 'admin.owner_analytics_read', metadata: { windowDays: days } }),
};

export async function handleOwnerAnalytics(request: Request, dependencies: Dependencies = defaults) {
  const json = (body: unknown, status = 200, headers?: Record<string, string>) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
  try {
    if (!dependencies.enabled()) return json({ error: { message: 'Admin center is disabled.' } }, 503);
    const actor = await dependencies.authenticate(request);
    if (actor.role !== 'owner' || actor.profile.accountStatus !== 'active') return json({ error: { message: 'An active owner account is required.' } }, 403);
    const value = new URL(request.url).searchParams.get('days') ?? '30';
    if (!['7', '30', '90'].includes(value)) return json({ error: { message: 'Choose a 7, 30 or 90 day window.' } }, 400);
    const days = Number(value) as AnalyticsWindowDays;
    const limit = await dependencies.rateLimit(actor.uid);
    if (!limit.allowed) return json({ error: { message: 'Too many requests. Please try again shortly.' } }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
    const report = await dependencies.read(days);
    await dependencies.audit(actor, days);
    return json(report);
  } catch (error) {
    if (error instanceof AuthorizationError) return json({ error: { message: 'Sign in with an active owner account to view analytics.' } }, error.status === 401 ? 401 : 403);
    console.warn('Owner analytics could not be loaded.');
    return json({ error: { message: 'Analytics could not be loaded. Please try again.' } }, 500);
  }
}
