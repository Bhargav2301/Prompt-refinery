import assert from 'node:assert/strict';
import test from 'node:test';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import { PROMPT_TECHNIQUES } from '../src/lib/constants';
import { recordTenantUsage, type TenantUsageInput } from '../src/lib/server/usage-meter';
import { recordUsageEvent, recordUsageEventFromToken } from '../src/lib/server/usage-analytics';

const now = new Date('2026-10-18T10:00:00.000Z');
const privateValues = [
  'Write a private story about the synthetic lighthouse.',
  'synthetic-person@example.test',
  'sk-synthetic-credential-not-a-real-key',
  'https://example.test/private-chat?token=synthetic-secret',
];

function usage(): TenantUsageInput {
  return {
    requestId: '4c080b12-dc92-4f77-bf41-6cd0fdf5c9cb',
    tenantId: 'personal_synthetic-user', workspaceId: 'workspace_synthetic-user', principalId: 'synthetic-user',
    task: 'quick_refine', inferenceMode: 'managed', provider: 'gemma',
    creditsCharged: 3, status: 'succeeded', latencyMs: 120, source: 'app',
    inputTokens: 100, outputTokens: 40, providerCostUsd: 0.000123, qualityTier: 'generative',
  };
}

function store() {
  const writes: Array<{ path: string; data: Record<string, unknown>; options?: unknown }> = [];
  let commits = 0;
  const firestore = {
    doc: (path: string) => ({ path }),
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) => {
      await callback({ get: async (ref: { path: string }) => ({ exists: writes.some(write => write.path === ref.path) }), set: (ref: { path: string }, data: Record<string, unknown>, options: unknown) => writes.push({ path: ref.path, data, options }) }); commits++;
    },
    batch: () => ({
      set: (ref: { path: string }, data: Record<string, unknown>, options: unknown) => writes.push({ path: ref.path, data, options }),
      commit: async () => { commits++; },
    }),
    collection: (path: string) => ({ add: async (data: Record<string, unknown>) => { writes.push({ path, data }); } }),
  } as unknown as Firestore;
  return { writes, commits: () => commits, getFirestore: () => firestore, now: () => now };
}

function assertNoPrivateValues(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const privateValue of privateValues) assert.ok(!serialized.includes(privateValue), 'Private fixture reached stored data or logs.');
}

test('tenant writer preserves operational accounting and server-owned timestamps', async () => {
  const db = store();
  await recordTenantUsage(usage(), db);
  assert.equal(db.commits(), 1);
  assert.equal(db.writes.length, 3);
  const [event, aggregate] = db.writes;
  assert.equal(event.path, `usageEvents/${usage().requestId}`);
  assert.deepEqual(event.options, { merge: false });
  assert.equal(event.data.creditsCharged, 3);
  assert.equal(event.data.inputTokens, 100);
  assert.equal(event.data.outputTokens, 40);
  assert.equal(event.data.providerCostUsd, 0.000123);
  assert.equal(event.data.principalId, 'synthetic-user');
  assert.deepEqual(event.data.createdAt, Timestamp.fromDate(now));
  assert.deepEqual(event.data.expiresAt, Timestamp.fromMillis(now.getTime() + 90 * 86400000));
  assert.equal(aggregate.path, 'usageDailyAggregates/personal_synthetic-user_2026-10-18');
  assert.deepEqual(aggregate.options, { merge: true });
  for (const [field, value] of Object.entries({ requestCount: 1, successCount: 1, failureCount: 0, generativeCount: 1, fallbackCount: 0, inputTokens: 100, outputTokens: 40, providerCostUsd: 0.000123 })) {
    assert.deepEqual(aggregate.data[field], FieldValue.increment(value));
  }
  assert.equal(db.writes[2].path, 'usageSourceDailyAggregates/personal_synthetic-user_2026-10-18_app');
  assert.deepEqual(db.writes[2].data.creditsCharged, FieldValue.increment(3));
});

test('duplicate telemetry requests cannot increment either daily aggregate twice', async () => {
  const db = store();
  await recordTenantUsage(usage(), db);
  await recordTenantUsage(usage(), db);
  assert.equal(db.writes.length, 3);
  await recordTenantUsage({ ...usage(), requestId: '5c080b12-dc92-4f77-bf41-6cd0fdf5c9cb', source: 'extension' }, db);
  assert.equal(db.writes.length, 6);
  assert.equal(db.writes[5].path, 'usageSourceDailyAggregates/personal_synthetic-user_2026-10-18_extension');
});

test('telemetry outages do not fail completed work or log exception payloads', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  await recordTenantUsage(usage(), { getFirestore: () => { throw new Error(privateValues[0]); }, now: () => now });
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0].arguments, ['Usage telemetry write unavailable.']);
});

test('unexpected top-level and nested content never enters the actual write batch', async () => {
  const db = store();
  const input = {
    ...usage(), prompt: privateValues[0], email: privateValues[1], apiKey: privateValues[2], url: privateValues[3],
    attachments: [{ content: privateValues[0] }], createdAt: privateValues[0], expiresAt: privateValues[1],
    attempts: [{ provider: 'gemma', model: 'google/gemma-4-E4B-it', status: 'succeeded', inputTokens: 100, outputTokens: 40, costUsd: 0.000123, response: privateValues[0], headers: { Authorization: privateValues[2] } }],
  };
  await recordTenantUsage(input, db);
  assert.equal(db.commits(), 1);
  assertNoPrivateValues(db.writes);
  const event = db.writes[0].data;
  assert.deepEqual(Object.keys(event).sort(), [
    'requestId', 'tenantId', 'workspaceId', 'principalId', 'task', 'inferenceMode', 'provider', 'model',
    'inputTokens', 'outputTokens', 'providerCostUsd', 'creditsCharged', 'status', 'latencyMs', 'source',
    'refinement', 'errorCode', 'itemCount', 'qualityTier', 'fallbackReason', 'attempts', 'createdAt', 'expiresAt',
  ].sort());
  assert.deepEqual(event.attempts, [{ provider: 'gemma', model: 'google/gemma-4-E4B-it', status: 'succeeded', inputTokens: 100, outputTokens: 40, costUsd: 0.000123, errorCode: null, httpStatus: null }]);
});

test('free text in optional metadata is neutralized, including syntactically plausible custom models', async () => {
  for (const value of [...privateValues, 'custom/private-customer-model']) {
    const db = store();
    await recordTenantUsage({
      ...usage(), provider: value, model: value, errorCode: value, fallbackReason: value, qualityTier: value,
      attempts: [{ provider: value, model: value, status: value, errorCode: value, inputTokens: null, outputTokens: null, costUsd: null }],
    } as TenantUsageInput, db);
    assert.equal(db.commits(), 1);
    const event = db.writes[0].data;
    for (const field of ['provider', 'model', 'fallbackReason', 'qualityTier']) assert.equal(event[field], null);
    assert.equal(event.errorCode, 'UnknownError');
    assert.deepEqual(event.attempts, [{ provider: null, model: null, status: null, errorCode: 'UnknownError', inputTokens: null, outputTokens: null, costUsd: null, httpStatus: null }]);
    assert.equal(event.providerCostUsd, usage().providerCostUsd);
    assertNoPrivateValues(db.writes);
  }
});

test('known diagnostic categories remain useful and cannot carry appended private text', async () => {
  for (const [code, expected] of [['ProviderHttp429', 'ProviderHttp429'], ['ProviderTimeoutError', 'ProviderTimeoutError'], ['ProviderSchemaError', 'ProviderSchemaError'], ['ProviderHttp999', 'UnknownError'], [`ProviderHttp429 ${privateValues[0]}`, 'UnknownError']]) {
    const db = store();
    await recordTenantUsage({ ...usage(), status: 'failed', qualityTier: 'fallback', fallbackReason: 'service_busy', errorCode: code, attempts: [{ provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it', status: 'failed', inputTokens: null, outputTokens: null, costUsd: null, errorCode: code, httpStatus: 429 }] }, db);
    assert.equal(db.writes[0].data.errorCode, expected);
    assert.equal(db.writes[0].data.fallbackReason, 'service_busy');
    assert.equal((db.writes[0].data.attempts as Array<{ errorCode: string }>)[0].errorCode, expected);
    assert.deepEqual(db.writes[1].data.failureCount, FieldValue.increment(1));
    assert.deepEqual(db.writes[1].data.fallbackCount, FieldValue.increment(1));
    assertNoPrivateValues(db.writes);
  }
});

test('invalid required fields drop the event before accessing storage and without logging payloads', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const error = context.mock.method(console, 'error', () => {});
  const inputs: unknown[] = [null, [], {}, ...['requestId', 'tenantId', 'workspaceId', 'principalId', 'task', 'inferenceMode', 'status', 'source', 'creditsCharged', 'latencyMs'].map((field) => ({ ...usage(), [field]: privateValues[0] })),
    { ...usage(), tenantId: '../other-tenant' }, { ...usage(), principalId: privateValues[1] }, { ...usage(), creditsCharged: -1 }, { ...usage(), latencyMs: Infinity }];
  for (const input of inputs) {
    await recordTenantUsage(input as TenantUsageInput, { getFirestore: () => { assert.fail('Invalid usage accessed storage.'); }, now: () => now });
  }
  assert.equal(warn.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});

test('optional numeric metadata cannot pollute event or aggregate values', async () => {
  for (const value of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, privateValues[2], { content: privateValues[0] }]) {
    const db = store();
    await recordTenantUsage({ ...usage(), inputTokens: value, outputTokens: value, providerCostUsd: value, itemCount: value, attempts: [{ provider: 'gemma', model: 'google/gemma-4-E4B-it', status: 'malformed', inputTokens: value, outputTokens: value, costUsd: value, httpStatus: value }] } as TenantUsageInput, db);
    for (const field of ['inputTokens', 'outputTokens', 'providerCostUsd', 'itemCount']) assert.equal(db.writes[0].data[field], null);
    for (const field of ['inputTokens', 'outputTokens', 'providerCostUsd']) assert.deepEqual(db.writes[1].data[field], FieldValue.increment(0));
    assertNoPrivateValues(db.writes);
  }
  const db = store();
  await recordTenantUsage({ ...usage(), inputTokens: 0.5, outputTokens: 0, providerCostUsd: 0 }, db);
  assert.equal(db.writes[0].data.inputTokens, null);
  assert.equal(db.writes[0].data.outputTokens, 0);
  assert.equal(db.writes[0].data.providerCostUsd, 0);
});

test('attempt collections are bounded and malformed optional values do not throw', async () => {
  const attempt = { provider: 'gemma', model: 'google/gemma-4-E4B-it', status: 'skipped', inputTokens: null, outputTokens: null, costUsd: null };
  for (const [attempts, expectedCount] of [[Array(100).fill(attempt), 3], [[null, privateValues[0], attempt], 1], [{ content: privateValues[0] }, 0]] as const) {
    const db = store();
    await recordTenantUsage({ ...usage(), model: {}, errorCode: {}, attempts } as unknown as TenantUsageInput, db);
    assert.equal((db.writes[0].data.attempts as unknown[]).length, expectedCount);
    assertNoPrivateValues(db.writes);
  }
});

test('conversion, BYOK and extension usage preserve their existing categories', async () => {
  for (const overrides of [
    { task: 'convert_document', inferenceMode: 'system', provider: 'markitdown', itemCount: 2 },
    { task: 'full_council', inferenceMode: 'byok', provider: 'openrouter', source: 'api' },
    { task: 'evaluate', provider: 'local', source: 'extension', qualityTier: 'fallback', fallbackReason: 'daily_limit' },
  ] as const) {
    const db = store();
    await recordTenantUsage({ ...usage(), ...overrides }, db);
    for (const [field, value] of Object.entries(overrides)) assert.equal(db.writes[0].data[field], value);
  }
});

test('legacy user writer strips extra properties and allowlists technique/provider metadata', async () => {
  for (const technique of PROMPT_TECHNIQUES) {
    const db = store();
    await recordUsageEvent('synthetic-user', { kind: 'refinement', technique: technique.value, provider: 'gemini', score: 75, itemCount: 2 }, db.getFirestore);
    assert.equal(db.writes[0].data.technique, technique.value);
    assert.equal(db.writes[0].data.provider, 'gemini');
    assert.equal(db.writes[0].data.score, 75);
  }
  const db = store();
  const input = { kind: 'evaluation' as const, technique: privateValues[0], provider: privateValues[1], score: NaN, itemCount: Infinity, apiKey: privateValues[2], url: privateValues[3] };
  await recordUsageEvent('synthetic-user', input, db.getFirestore);
  assert.equal(db.writes[0].path, 'users/synthetic-user/usageEvents');
  assert.deepEqual(Object.keys(db.writes[0].data).sort(), ['kind', 'technique', 'provider', 'score', 'itemCount', 'source', 'success', 'createdAt'].sort());
  assert.equal(db.writes[0].data.technique, null);
  assert.equal(db.writes[0].data.provider, null);
  assert.equal(db.writes[0].data.score, null);
  assert.equal(db.writes[0].data.itemCount, 1);
  assertNoPrivateValues(db.writes);
});

test('legacy user writer rejects invalid required metadata and unsafe subject paths before storage', async () => {
  const forbiddenStore = () => { assert.fail('Invalid usage accessed storage.'); };
  for (const input of [{ kind: privateValues[0] }, { kind: 'refinement', source: privateValues[3] }, { kind: 'refinement', success: privateValues[2] }, null]) {
    await recordUsageEvent('synthetic-user', input as Parameters<typeof recordUsageEvent>[1], forbiddenStore);
  }
  for (const uid of [privateValues[1], '../another-user', 'x'.repeat(201)]) {
    await recordUsageEvent(uid, { kind: 'refinement' }, forbiddenStore);
  }
});

test('token wrapper uses verified identity and emits only a fixed failure message', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const input = { kind: 'refinement' as const };
  let records = 0;
  const dependencies = {
    verifyToken: async () => ({ uid: 'verified-synthetic-user' }),
    record: async (uid: string) => { assert.equal(uid, 'verified-synthetic-user'); records++; },
  };
  await recordUsageEventFromToken(undefined, input, dependencies);
  assert.equal(records, 0);
  await recordUsageEventFromToken('synthetic-token', input, dependencies);
  assert.equal(records, 1);
  const fail = async () => { throw Object.assign(new Error(privateValues[2]), { name: privateValues[0], cause: privateValues[3] }); };
  await recordUsageEventFromToken('synthetic-token', input, { ...dependencies, verifyToken: fail });
  await recordUsageEventFromToken('synthetic-token', input, { ...dependencies, record: fail });
  assert.equal(warn.mock.callCount(), 2);
  for (const call of warn.mock.calls) assert.deepEqual(call.arguments, ['Usage event could not be recorded.']);
  assertNoPrivateValues(warn.mock.calls.map((call) => call.arguments));
});
