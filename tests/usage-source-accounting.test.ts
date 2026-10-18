import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import { reserveCredits, settleCredits } from '../src/lib/server/credit-service';

test('server-selected source survives reservation and settlement, rejects channel replay and charges once', async () => {
  const documents = new Map<string, Record<string, unknown>>([['creditWallets/tenant', { balance: 100, reserved: 0 }]]);
  const firestore = {
    doc: (path: string) => ({ path }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      get: async (ref: { path: string }) => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
      set: (ref: { path: string }, data: Record<string, unknown>) => documents.set(ref.path, { ...documents.get(ref.path), ...data }),
      create: (ref: { path: string }, data: Record<string, unknown>) => { assert.equal(documents.has(ref.path), false); documents.set(ref.path, data); },
    }),
  } as unknown as Firestore;
  const dependencies = { getFirestore: () => firestore };
  for (const source of ['app', 'extension', 'api'] as const) {
    const input = { tenantId: 'tenant', workspaceId: 'workspace', principalId: 'user', task: 'quick_refine' as const, source, idempotencyKey: `request-${source}`, requestId: `id-${source}` };
    const reservation = await reserveCredits(input, dependencies);
    assert.equal(documents.get(`creditReservations/${reservation.id}`)?.source, source);
    await assert.rejects(reserveCredits({ ...input, source: source === 'app' ? 'extension' : 'app' }, dependencies), /source mismatch/);
    await settleCredits(reservation.id, 1, dependencies);
    await settleCredits(reservation.id, 1, dependencies);
    const ledger = documents.get(`creditLedger/spend_${reservation.id}`);
    assert.equal(ledger?.source, source); assert.equal(ledger?.amount, 1);
  }
  assert.equal(documents.get('creditWallets/tenant')?.balance, 97);
  assert.equal([...documents.keys()].filter(key => key.startsWith('creditLedger/')).length, 3);
});
