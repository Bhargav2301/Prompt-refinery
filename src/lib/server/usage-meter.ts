import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore } from './firebase-admin';
import type { ClariftTask } from './credit-service';
import type { InferenceMode, InferenceProviderName } from './provider-key-service';
import type { RefinementObservation } from '@/lib/refinement-observation';
import { TenantUsageSchema } from './usage-telemetry-schema';

export interface TenantUsageInput {
  requestId: string;
  tenantId: string;
  workspaceId: string;
  principalId: string;
  task: ClariftTask;
  inferenceMode: InferenceMode | 'system';
  provider?: InferenceProviderName | 'gemma' | 'together' | 'markitdown' | 'none';
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  providerCostUsd?: number | null;
  creditsCharged: number;
  status: 'succeeded' | 'failed';
  latencyMs: number;
  source: 'app' | 'api' | 'extension';
  refinement?: RefinementObservation | null;
  errorCode?: string | null;
  itemCount?: number | null;
  qualityTier?: 'generative' | 'fallback' | null;
  fallbackReason?: string | null;
  attempts?: Array<{
    provider: string;
    model: string;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    errorCode?: string;
    httpStatus?: number;
  }>;
}

export async function recordTenantUsage(input: TenantUsageInput, dependencies = {
  getFirestore: getAdminFirestore,
  now: () => new Date(),
}) {
  const parsed = TenantUsageSchema.safeParse(input);
  // Never log the input or Zod issues: either can contain private values.
  if (!parsed.success) return;
  const event = parsed.data;
  try {
    const firestore = dependencies.getFirestore();
    const now = dependencies.now();
    const day = now.toISOString().slice(0, 10);
    const eventRef = firestore.doc(`usageEvents/${event.requestId}`);
    const aggregateRef = firestore.doc(`usageDailyAggregates/${event.tenantId}_${day}`);
    const sourceRef = firestore.doc(`usageSourceDailyAggregates/${event.tenantId}_${day}_${event.source}`);
    await firestore.runTransaction(async (batch) => {
    if ((await batch.get(eventRef)).exists) return;
    batch.set(eventRef, {
      ...event,
      createdAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromMillis(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    }, { merge: false });
    const aggregate = {
      tenantId: event.tenantId,
      day,
      requestCount: FieldValue.increment(1),
      successCount: FieldValue.increment(event.status === 'succeeded' ? 1 : 0),
      failureCount: FieldValue.increment(event.status === 'failed' ? 1 : 0),
      generativeCount: FieldValue.increment(event.qualityTier === 'generative' ? 1 : 0),
      fallbackCount: FieldValue.increment(event.qualityTier === 'fallback' ? 1 : 0),
      inputTokens: FieldValue.increment(event.inputTokens ?? 0),
      outputTokens: FieldValue.increment(event.outputTokens ?? 0),
      providerCostUsd: FieldValue.increment(event.providerCostUsd ?? 0),
      expiresAt: Timestamp.fromMillis(now.getTime() + 13 * 31 * 24 * 60 * 60 * 1000),
      updatedAt: Timestamp.fromDate(now),
    };
    batch.set(aggregateRef, aggregate, { merge: true });
    batch.set(sourceRef, { ...aggregate, source: event.source, creditsCharged: FieldValue.increment(event.creditsCharged) }, { merge: true });
    });
  } catch {
    // Credit settlement is separate; telemetry failure must not retry a completed task.
    console.warn('Usage telemetry write unavailable.');
  }
}
