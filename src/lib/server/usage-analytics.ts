import { Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore } from './firebase-admin';
import { assertActiveAccount, requireUser } from './user-access';
import { getEffectiveUserEntitlement, verifyFirebaseIdToken } from './user-access';
import { UsageSubjectIdSchema, UserUsageSchema } from './usage-telemetry-schema';

export type UsageEventKind = 'refinement' | 'evaluation' | 'conversion' | 'model_test' | 'api_request';

interface UsageEventInput {
  kind: UsageEventKind;
  technique?: string;
  score?: number;
  itemCount?: number;
  provider?: string;
  source?: 'app' | 'api' | 'extension';
  success?: boolean;
}

export async function recordUsageEvent(uid: string, input: UsageEventInput, getFirestore = getAdminFirestore) {
  const subject = UsageSubjectIdSchema.safeParse(uid);
  const parsed = UserUsageSchema.safeParse(input);
  if (!subject.success || !parsed.success) return;
  await getFirestore().collection(`users/${subject.data}/usageEvents`).add({
    ...parsed.data,
    createdAt: Timestamp.now(),
  });
}

export async function recordUsageEventFromToken(firebaseIdToken: string | undefined, input: UsageEventInput, dependencies: {
  verifyToken: (token: string) => Promise<{ uid: string }>;
  record: (uid: string, event: UsageEventInput) => Promise<void>;
} = { verifyToken: verifyFirebaseIdToken, record: recordUsageEvent }) {
  if (!firebaseIdToken) return;
  try {
    const decodedToken = await dependencies.verifyToken(firebaseIdToken);
    await dependencies.record(decodedToken.uid, input);
  } catch {
    console.warn('Usage event could not be recorded.');
  }
}

export async function getUsageDashboard(request: Request) {
  if (process.env.ENABLE_USAGE_ANALYTICS !== 'true') {
    const error = new Error('Usage analytics are not currently enabled.');
    error.name = 'AnalyticsDisabledError';
    throw error;
  }
  const context = await requireUser(request);
  assertActiveAccount(context.profile, 'view usage analytics');
  const entitlement = await getEffectiveUserEntitlement(context.uid);
  if (!entitlement.isPro) {
    const error = new Error('Usage analytics are available on Pro.');
    error.name = 'ProFeatureRequiredError';
    throw error;
  }

  const since = Timestamp.fromDate(new Date(Date.now() - 366 * 24 * 60 * 60 * 1000));
  const snapshot = await getAdminFirestore()
    .collection(`users/${context.uid}/usageEvents`)
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'asc')
    .limit(5000)
    .get();

  const months = new Map<string, { month: string; refinements: number; evaluations: number; conversions: number; averageScore: number; scoreCount: number }>();
  const techniques = new Map<string, number>();
  const evaluationScores: Array<{ date: string; score: number }> = [];
  let totalRefinements = 0;
  let totalConversions = 0;

  for (const document of snapshot.docs) {
    const event = document.data();
    if (event.success === false) continue;
    const createdAt = event.createdAt instanceof Timestamp ? event.createdAt.toDate() : new Date();
    const monthKey = createdAt.toISOString().slice(0, 7);
    const bucket = months.get(monthKey) ?? { month: monthKey, refinements: 0, evaluations: 0, conversions: 0, averageScore: 0, scoreCount: 0 };
    const count = typeof event.itemCount === 'number' ? event.itemCount : 1;
    if (event.kind === 'refinement') {
      bucket.refinements += count;
      totalRefinements += count;
      if (typeof event.technique === 'string' && event.technique) techniques.set(event.technique, (techniques.get(event.technique) ?? 0) + count);
    }
    if (event.kind === 'conversion') {
      bucket.conversions += count;
      totalConversions += count;
    }
    if (event.kind === 'evaluation') {
      bucket.evaluations += count;
      if (typeof event.score === 'number') {
        bucket.averageScore += event.score;
        bucket.scoreCount += 1;
        evaluationScores.push({ date: createdAt.toISOString(), score: event.score });
      }
    }
    months.set(monthKey, bucket);
  }

  const monthly = Array.from(months.values()).map((bucket) => ({
    month: bucket.month,
    refinements: bucket.refinements,
    evaluations: bucket.evaluations,
    conversions: bucket.conversions,
    averageScore: bucket.scoreCount ? Math.round(bucket.averageScore / bucket.scoreCount) : null,
  }));
  const firstScore = evaluationScores[0]?.score ?? null;
  const latestScore = evaluationScores.at(-1)?.score ?? null;
  const mostUsedTechnique = Array.from(techniques.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalRefinements,
    totalConversions,
    evaluationCount: evaluationScores.length,
    scoreImprovement: firstScore !== null && latestScore !== null ? Math.round((latestScore - firstScore) * 10) / 10 : null,
    mostUsedTechnique,
    monthly,
  };
}
