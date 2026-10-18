import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { migrateUserTenantData } from '../src/lib/server/tenant-migration';

const now = Timestamp.fromDate(new Date('2026-10-18T12:00:00Z'));
const createdAt = Timestamp.fromDate(new Date('2026-10-17T12:00:00Z'));
const privateText = 'synthetic-private-story-output';
const uid = 'synthetic-user';
const sourcePath = `users/${uid}/usageEvents`;
const legacyId = 'synthetic-person@example.test';
const targetId = `legacy_${createHash('sha256').update(`${uid}:${legacyId}`).digest('hex').slice(0, 40)}`;

function fixture(records: Array<{ id: string; data: Record<string, unknown> }>, version = 0) {
  const stored = new Map<string, Record<string, unknown>>([[`users/${uid}`, { tenantDataMigrationVersion: version }]]);
  const writes: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = [];
  const batches: number[] = [];
  const collections = new Map([[sourcePath, records]]);
  let ensured = 0;
  const firestore = {
    doc: (path: string) => ({
      path,
      get: async () => ({ exists: stored.has(path), data: () => stored.get(path) }),
      set: async (data: Record<string, unknown>) => { stored.set(path, { ...stored.get(path), ...data }); writes.push({ path, data, merge: true }); },
    }),
    collection: (path: string) => ({ get: async () => {
      const entries = collections.get(path) ?? [];
      return { size: entries.length, empty: entries.length === 0, docs: entries.map((entry) => ({ id: entry.id, ref: { path: `${path}/${entry.id}` }, data: () => entry.data })) };
    } }),
    batch: () => {
      const pending: typeof writes = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>, options: { merge: boolean }) => { pending.push({ path: ref.path, data, merge: options.merge }); },
        commit: async () => {
          batches.push(pending.length);
          for (const write of pending) { stored.set(write.path, write.merge ? { ...stored.get(write.path), ...write.data } : write.data); writes.push(write); }
        },
      };
    },
  } as unknown as Firestore;
  return { stored, writes, collections, batches, ensured: () => ensured, dependencies: {
    getFirestore: () => firestore, now: () => now,
    ensureTenant: async () => { ensured++; return { principalId: uid, tenantId: `personal_${uid}`, workspaceId: `personal_${uid}_default`, role: 'owner' as const, tenantType: 'personal' as const }; },
  } };
}

test('automatic migration writes only approved usage fields and trusted identities', async () => {
  const db = fixture([{ id: legacyId, data: {
    kind: 'refinement', technique: 'Zero-shot', provider: 'gemini', score: 80, itemCount: 2, source: 'app', success: true, createdAt,
    prompt: privateText, output: privateText, attachments: [{ text: privateText }], email: legacyId, apiKey: 'sk-synthetic-private',
    tenantId: 'other-tenant', workspaceId: 'other-workspace', createdBy: legacyId, actorUid: legacyId, userId: legacyId, principalId: legacyId,
    migratedFrom: `https://example.test/${privateText}`, legacyId,
  } }]);
  const result = await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(result.usageEvents, 1);
  const event = db.stored.get(`usageEvents/${targetId}`)!;
  assert.deepEqual(Object.keys(event).sort(), ['kind', 'technique', 'provider', 'score', 'itemCount', 'source', 'success', 'createdAt', 'tenantId', 'workspaceId', 'createdBy', 'legacy', 'migrationVersion', 'migratedAt', 'expiresAt'].sort());
  assert.equal(event.tenantId, `personal_${uid}`);
  assert.equal(event.workspaceId, `personal_${uid}_default`);
  assert.equal(event.createdBy, uid);
  assert.equal(event.score, 80);
  assert.equal(event.itemCount, 2);
  assert.deepEqual(event.createdAt, createdAt);
  assert.deepEqual(event.expiresAt, Timestamp.fromMillis(createdAt.toMillis() + 90 * 86400000));
  assert.doesNotMatch(JSON.stringify(db.writes), /synthetic-private|synthetic-person@example|other-tenant|other-workspace/);
});

test('migration neutralizes private strings inside nominally allowed metadata', async () => {
  const db = fixture([{ id: 'event-a', data: { kind: 'evaluation', provider: privateText, technique: legacyId, score: privateText, itemCount: Infinity, createdAt } }]);
  await migrateUserTenantData(uid, true, db.dependencies);
  const event = db.writes.find((write) => write.path.startsWith('usageEvents/'))!.data;
  assert.equal(event.provider, null);
  assert.equal(event.technique, null);
  assert.equal(event.score, null);
  assert.equal(event.itemCount, 1);
  assert.doesNotMatch(JSON.stringify(db.writes), /synthetic-private|synthetic-person@example/);
});

test('invalid, undated, future and expired events are skipped without leaking to logs', async (context) => {
  const warning = context.mock.method(console, 'warn', () => {});
  const error = context.mock.method(console, 'error', () => {});
  const entries = [
    { kind: privateText, createdAt }, { kind: 'refinement' }, { kind: 'refinement', createdAt: privateText },
    { kind: 'refinement', createdAt: Timestamp.fromMillis(now.toMillis() + 1) },
    { kind: 'refinement', createdAt: Timestamp.fromMillis(now.toMillis() - 90 * 86400000) },
    { kind: 'refinement', createdAt, expiresAt: Timestamp.fromMillis(now.toMillis() - 1) },
    { kind: 'refinement', createdAt, source: privateText },
  ];
  const db = fixture(entries.map((data, index) => ({ id: String(index), data })));
  const result = await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(result.usageEvents, 0);
  assert.equal(db.writes.filter((write) => write.path.startsWith('usageEvents/')).length, 0);
  assert.equal(warning.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});

test('migration respects earlier expiry, replaces contaminated partial copies and stays idempotent', async () => {
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 86400000);
  const db = fixture([{ id: legacyId, data: { kind: 'refinement', createdAt, expiresAt } }]);
  db.stored.set(`usageEvents/${targetId}`, { prompt: privateText, unknownField: privateText });
  await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(db.writes.find((write) => write.path === `usageEvents/${targetId}`)?.merge, false);
  assert.deepEqual(db.stored.get(`usageEvents/${targetId}`)?.expiresAt, expiresAt);
  assert.doesNotMatch(JSON.stringify(db.stored.get(`usageEvents/${targetId}`)), /synthetic-private/);
  // Simulate a retry after a partial migration before the user marker was saved.
  db.stored.set(`users/${uid}`, { tenantDataMigrationVersion: 0 });
  await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(Array.from(db.stored.keys()).filter((path) => path.startsWith('usageEvents/')).length, 1);
  const before = db.writes.length;
  const skipped = await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(skipped.alreadyMigrated, true);
  assert.equal(db.writes.length, before);
  assert.ok(!db.writes.some((write) => write.path.startsWith('usageDailyAggregates/')));
});

test('dry runs count eligible events without writes and content collections remain separate', async () => {
  const db = fixture([{ id: 'one', data: { kind: 'refinement', createdAt } }, { id: 'two', data: { prompt: privateText } }]);
  db.collections.set(`users/${uid}/savedPrompts`, [{ id: 'saved', data: { originalPrompt: privateText } }]);
  const preview = await migrateUserTenantData(uid, false, db.dependencies);
  assert.equal(preview.usageEvents, 1);
  assert.equal(db.writes.length, 0);
  assert.equal(db.ensured(), 0);
  await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(db.writes.find((write) => write.path.startsWith('savedPrompts/'))?.data.originalPrompt, privateText);
  assert.ok(db.writes.filter((write) => write.path.startsWith('usageEvents/')).every((write) => !JSON.stringify(write.data).includes(privateText)));
});

test('usage migration batches beyond the Firestore write limit without dropping eligible events', async () => {
  const db = fixture(Array.from({ length: 805 }, (_, index) => ({ id: `event-${index}`, data: { kind: 'conversion', createdAt } })));
  const result = await migrateUserTenantData(uid, true, db.dependencies);
  assert.equal(result.usageEvents, 805);
  assert.deepEqual(db.batches, [400, 400, 5]);
});
