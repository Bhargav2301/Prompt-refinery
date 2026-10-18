import { z } from 'zod';
import { refinementObservationSchema } from '@/lib/refinement-observation';

// These identifiers come from authenticated server context, never event payloads
// from a browser. Format validation does not establish ownership or anonymity.
export const UsageSubjectIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const SourceSchema = z.enum(['app', 'api', 'extension']);
const ProviderSchema = z.enum(['gemini', 'openrouter', 'local', 'gemma', 'together', 'markitdown', 'none']);
const CountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const AmountSchema = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);

// Explicit values, not a model-name regex or environment-derived allowlist: both
// could admit user text. New/custom models require review before telemetry stores
// their names; inference and numeric cost accounting do not depend on this list.
const ModelSchema = z.enum([
  'google/gemma-4-E4B-it',
  'google/gemma-4-31B-it',
  'google/gemma-4-26b-a4b-it',
  'openai/gpt-4o-mini',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3.5-flash-lite',
]).nullable().catch(null);

const ErrorCodeSchema = z.union([
  z.enum([
    'Error', 'UnknownError', 'TypeError', 'AbortError', 'TimeoutError',
    'OpenModelProviderError', 'OpenRouterError', 'ProviderSchemaError',
    'EmptyAIOutputError', 'ProviderTimeoutError', 'ProviderCircuitOpenError',
    'ProviderConfigurationMissing', 'ProviderKeyMissingError',
    'ProviderBudgetLimitError', 'ProviderNotSupportedError',
    'ManagedProviderUnavailableError', 'ByokDisabledError',
    'RemoteDeadlineExceeded', 'ManagedRateLimitError', 'ConcurrencyLimitError',
    'InsufficientCreditsError', 'IdempotencyReplayError', 'IdempotencyInProgressError',
  ]),
  z.string().regex(/^ProviderHttp[45][0-9]{2}$/),
]).catch('UnknownError');

const OptionalErrorCodeSchema = z.preprocess(
  (value) => value === undefined || value === null || value === '' ? null : value,
  ErrorCodeSchema.nullable(),
);

const AttemptSchema = z.object({
  provider: ProviderSchema.nullable().catch(null),
  model: ModelSchema,
  status: z.enum(['succeeded', 'failed', 'malformed', 'skipped']).nullable().catch(null),
  inputTokens: CountSchema.nullable().catch(null),
  outputTokens: CountSchema.nullable().catch(null),
  costUsd: AmountSchema.nullable().catch(null),
  errorCode: OptionalErrorCodeSchema,
  httpStatus: z.number().int().min(100).max(599).nullable().catch(null),
}).strip();

// Only the parsed projection may reach storage. Unknown properties are discarded
// for these existing internal writers so accidental extras cannot leak or break
// a completed operation. This is not a public analytics ingestion contract.
export const TenantUsageSchema = z.object({
  requestId: z.string().uuid(),
  tenantId: UsageSubjectIdSchema,
  workspaceId: UsageSubjectIdSchema,
  principalId: UsageSubjectIdSchema,
  task: z.enum(['quick_refine', 'guided_fix', 'full_council', 'evaluate', 'apply_fix', 'convert_document']),
  inferenceMode: z.enum(['managed', 'byok', 'system']),
  provider: ProviderSchema.nullable().catch(null),
  model: ModelSchema,
  inputTokens: CountSchema.nullable().catch(null),
  outputTokens: CountSchema.nullable().catch(null),
  providerCostUsd: AmountSchema.nullable().catch(null),
  creditsCharged: CountSchema,
  status: z.enum(['succeeded', 'failed']),
  latencyMs: CountSchema,
  source: SourceSchema,
  refinement: refinementObservationSchema.nullable().catch(null),
  errorCode: OptionalErrorCodeSchema,
  itemCount: CountSchema.nullable().catch(null),
  qualityTier: z.enum(['generative', 'fallback']).nullable().catch(null),
  fallbackReason: z.enum(['daily_limit', 'monthly_limit', 'budget_limit', 'request_size', 'service_busy']).nullable().catch(null),
  attempts: z.preprocess(
    (value) => Array.isArray(value) ? value.slice(0, 3) : [],
    z.array(AttemptSchema.nullable().catch(null)).transform((items) => items.filter((item) => item !== null)),
  ),
}).strip();

export const UserUsageSchema = z.object({
  kind: z.enum(['refinement', 'evaluation', 'conversion', 'model_test', 'api_request']),
  technique: z.enum([
    'Zero-shot', 'Few-shot', 'Chain-of-thought', 'Tree-of-thoughts',
    'Role / persona', 'Prompt chaining', 'ReAct', 'Meta / reflection',
  ]).nullable().catch(null),
  score: z.number().finite().transform((value) => Math.max(0, Math.min(100, value))).nullable().catch(null),
  itemCount: AmountSchema.transform((value) => Math.max(1, Math.min(100, Math.floor(value)))).catch(1),
  provider: ProviderSchema.nullable().catch(null),
  source: SourceSchema.default('app'),
  success: z.boolean().default(true),
}).strip();
