import { refinementAnalyticsAccumulator } from './refinement-analytics-report';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { AnalyticsWindowDays, OwnerAnalyticsReport } from '@/lib/owner-analytics';
import { getAdminFirestore } from './firebase-admin';
import { TenantUsageSchema } from './usage-telemetry-schema';

export const OWNER_ANALYTICS_EVENT_LIMIT = 10_000;
// Select only what aggregation needs, including for old/contaminated documents.
export const OWNER_ANALYTICS_FIELDS = [
  'source', 'qualityTier', 'refinement',
  'tenantId', 'task', 'status', 'provider', 'latencyMs',
  'inputTokens', 'outputTokens', 'providerCostUsd', 'creditsCharged', 'createdAt',
  'legacy', 'isInternal', 'isSynthetic', 'environment',
] as const;
const OperationalEventSchema = TenantUsageSchema.pick({
  source: true, qualityTier: true, refinement: true,
  tenantId: true, task: true, status: true, provider: true,
  latencyMs: true, inputTokens: true, outputTokens: true, providerCostUsd: true, creditsCharged: true,
}).extend({ source: z.enum(['app', 'api', 'extension']).nullable().catch(null), createdAt: z.instanceof(Timestamp) });

export function ownerAnalyticsPeriod(days: AnalyticsWindowDays, now: Date) {
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1)), to: now };
}

export function aggregateOwnerAnalytics(input: {
  events: unknown[]; totalProfiles: number; newProfiles: number;
  days: AnalyticsWindowDays; now: Date; truncated: boolean;
}): OwnerAnalyticsReport {
  const { from, to } = ownerAnalyticsPeriod(input.days, input.now);
  const totals: OwnerAnalyticsReport['totals'] = { requests: 0, succeeded: 0, failed: 0, successRate: null, reportingTenants: 0, creditsCharged: 0, inputTokens: 0, outputTokens: 0, providerCostUsd: 0, costKnownRequests: 0, tokenKnownRequests: 0 };
  const refinementAnalytics = refinementAnalyticsAccumulator();
  const tenants = new Set<string>();
  const latencies: number[] = [];
  const daily = new Map<string, { day: string; requests: number; succeeded: number; failed: number }>();
  const tasks = new Map<string, { requests: number }>();
  const providers = new Map<string, { requests: number }>();
  const coverage: OwnerAnalyticsReport['coverage'] = { scanned: input.events.length, invalid: 0, legacyExcluded: 0, flaggedExcluded: 0, truncated: input.truncated, limit: OWNER_ANALYTICS_EVENT_LIMIT };

  for (const raw of input.events) {
    if (raw && typeof raw === 'object') {
      const flags = raw as Record<string, unknown>;
      if (flags.legacy === true) { coverage.legacyExcluded++; continue; }
      if (flags.isInternal === true || flags.isSynthetic === true || ['staging', 'development', 'test'].includes(String(flags.environment))) { coverage.flaggedExcluded++; continue; }
    }
    const parsed = OperationalEventSchema.safeParse(raw);
    if (!parsed.success || parsed.data.createdAt.toMillis() < from.getTime() || parsed.data.createdAt.toMillis() >= to.getTime()) { coverage.invalid++; continue; }
    const event = parsed.data;
    refinementAnalytics.add(event);
    totals.requests++;
    totals[event.status === 'succeeded' ? 'succeeded' : 'failed']++;
    totals.creditsCharged += event.creditsCharged;
    totals.inputTokens += event.inputTokens ?? 0;
    totals.outputTokens += event.outputTokens ?? 0;
    totals.providerCostUsd += event.providerCostUsd ?? 0;
    totals.costKnownRequests += event.providerCostUsd !== null ? 1 : 0;
    totals.tokenKnownRequests += event.inputTokens !== null && event.outputTokens !== null ? 1 : 0;
    tenants.add(event.tenantId);
    latencies.push(event.latencyMs);
    const day = event.createdAt.toDate().toISOString().slice(0, 10);
    const bucket = daily.get(day) ?? { day, requests: 0, succeeded: 0, failed: 0 };
    bucket.requests++;
    bucket[event.status === 'succeeded' ? 'succeeded' : 'failed']++;
    daily.set(day, bucket);
    for (const [groups, label] of [[tasks, event.task], [providers, event.provider ?? 'unknown']] as const) {
      const group = groups.get(label) ?? { requests: 0 };
      group.requests++;
      groups.set(label, group);
    }
  }
  totals.reportingTenants = tenants.size;
  totals.successRate = totals.requests ? Math.round(totals.succeeded / totals.requests * 1000) / 10 : null;
  totals.providerCostUsd = Math.round(totals.providerCostUsd * 1_000_000) / 1_000_000;
  latencies.sort((a, b) => a - b);
  const percentile = (fraction: number) => latencies.length ? latencies[Math.ceil(latencies.length * fraction) - 1] : null;
  // This authenticated owner report exposes aggregate counts, including small groups.
  const rows = (groups: typeof tasks) => Array.from(groups, ([label, value]) => ({ label, requests: value.requests })).sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  return {
    refinementAnalytics: refinementAnalytics.finish(),
    generatedAt: to.toISOString(), period: { from: from.toISOString(), to: to.toISOString(), days: input.days, timezone: 'UTC' },
    accounts: { totalProfiles: input.totalProfiles, newProfiles: input.newProfiles }, totals,
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
    daily: Array.from({ length: input.days }, (_, offset) => {
      const day = new Date(from.getTime() + offset * 86400000).toISOString().slice(0, 10);
      const bucket = daily.get(day);
      return { day, requests: bucket?.requests ?? 0, succeeded: bucket?.succeeded ?? 0, failed: bucket?.failed ?? 0 };
    }),
    breakdowns: { tasks: rows(tasks), providers: rows(providers) }, coverage,
  };
}

export async function readOwnerAnalytics(days: AnalyticsWindowDays, dependencies = { getFirestore: getAdminFirestore, now: () => new Date() }) {
  const firestore = dependencies.getFirestore();
  const now = dependencies.now();
  const { from, to } = ownerAnalyticsPeriod(days, now);
  const users = firestore.collection('users');
  const [accounts, newAccounts, events] = await Promise.all([
    users.count().get(),
    users.where('createdAt', '>=', Timestamp.fromDate(from)).where('createdAt', '<', Timestamp.fromDate(to)).count().get(),
    firestore.collection('usageEvents')
      .where('createdAt', '>=', Timestamp.fromDate(from)).where('createdAt', '<', Timestamp.fromDate(to))
      .orderBy('createdAt', 'desc').select(...OWNER_ANALYTICS_FIELDS).limit(OWNER_ANALYTICS_EVENT_LIMIT + 1).get(),
  ]);
  return aggregateOwnerAnalytics({
    events: events.docs.slice(0, OWNER_ANALYTICS_EVENT_LIMIT).map((doc) => doc.data()),
    totalProfiles: accounts.data().count, newProfiles: newAccounts.data().count,
    days, now, truncated: events.size > OWNER_ANALYTICS_EVENT_LIMIT,
  });
}
