import type { RefinementAnalyticsReport } from './server/refinement-analytics-report';
export type AnalyticsWindowDays = 7 | 30 | 90;

export interface OwnerAnalyticsReport {
  refinementAnalytics: RefinementAnalyticsReport;
  generatedAt: string;
  period: { from: string; to: string; days: AnalyticsWindowDays; timezone: 'UTC' };
  accounts: { totalProfiles: number; newProfiles: number };
  totals: {
    requests: number; succeeded: number; failed: number; successRate: number | null;
    reportingTenants: number; creditsCharged: number; inputTokens: number; outputTokens: number;
    providerCostUsd: number; costKnownRequests: number; tokenKnownRequests: number;
  };
  latencyMs: { p50: number | null; p95: number | null };
  daily: Array<{ day: string; requests: number; succeeded: number; failed: number }>;
  breakdowns: { tasks: Array<{ label: string; requests: number }>; providers: Array<{ label: string; requests: number }> };
  coverage: {
    scanned: number; invalid: number; legacyExcluded: number; flaggedExcluded: number;
    truncated: boolean; limit: number;
  };
}
