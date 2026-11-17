import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { getAdminFirestore } from '../../src/lib/server/firebase-admin';
import { createFeedback, listFeedback, readFeedback, replyFeedback, setFeedbackStatus, listNotifications, markNotificationsRead } from '../../src/lib/server/community-service';
import { RELEASE_NOTES } from '../../src/lib/releases';
import { MAX_THREAD_MESSAGES } from '../../src/lib/community';

test('feedback persists privately; owner replies atomically create one notification and survive retries', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator only; never create production feedback');
  const a = { uid: 'feedback-a', role: 'user' }, b = { uid: 'feedback-b', role: 'user' }, owner = { uid: 'feedback-owner', role: 'owner' };
  const input = { id: crypto.randomUUID(), category: 'complaint' as const, subject: 'Synthetic complaint', message: 'Synthetic initial message' };
  const created = await createFeedback(a, input);
  assert.deepEqual(await createFeedback(a, input), created);
  await assert.rejects(createFeedback(b, input));
  assert.equal((await listFeedback(a, false)).items.length, 1);
  assert.equal((await listFeedback(b, false)).items.length, 0);
  await assert.rejects(listFeedback(a, true));
  await assert.rejects(readFeedback(b, input.id), /not found/);
  await assert.rejects(replyFeedback(b, input.id, { id: crypto.randomUUID(), message: 'Intrusion' }, false), /not found/);
  await assert.rejects(replyFeedback(a, input.id, { id: crypto.randomUUID(), message: 'Impersonation' }, true), /Owner access/);
  const reply = { id: crypto.randomUUID(), message: 'Synthetic owner reply' };
  await Promise.all([replyFeedback(owner, input.id, reply, true), replyFeedback(owner, input.id, reply, true)]);
  const read = await readFeedback(a, input.id);
  assert.equal(read.messages.length, 2); assert.equal(read.messages[1].author, 'owner'); assert.ok(!('uid' in read));
  const notifications = await listNotifications(a);
  assert.equal(notifications.items.filter(note => note.kind === 'reply').length, 1);
  assert.equal(notifications.unread, RELEASE_NOTES.length + 1);
  assert.equal((await listNotifications(b)).unread, RELEASE_NOTES.length);
  await markNotificationsRead(b, [reply.id]); assert.equal((await listNotifications(a)).unread, RELEASE_NOTES.length + 1);
  await markNotificationsRead(a, [reply.id, RELEASE_NOTES[0].id]);
  await markNotificationsRead(a, [reply.id, RELEASE_NOTES[0].id]);
  assert.equal((await listNotifications(a)).unread, 0);
  await replyFeedback(a, input.id, { id: crypto.randomUUID(), message: 'Thanks, one more detail.' }, false);
  assert.equal((await listNotifications(a)).unread, 0);
  await setFeedbackStatus(owner, input.id, 'resolved');
  assert.equal((await readFeedback(a, input.id)).status, 'resolved');
  await assert.rejects(setFeedbackStatus(a, input.id, 'resolved'));
  await replyFeedback(a, input.id, { id: crypto.randomUUID(), message: 'Reopening with new information.' }, false);
  assert.equal((await readFeedback(a, input.id)).status, 'open');
  const again = { id: crypto.randomUUID(), message: 'Another owner response' };
  await replyFeedback(owner, input.id, again, true);
  assert.equal((await listNotifications(a)).unread, 1);
  await assert.rejects(replyFeedback(owner, input.id, { ...again, message: 'Changed retry' }, true), /already used/);
  assert.equal((await readFeedback(a, input.id)).messages.length, 5);
  await Promise.all([replyFeedback(owner, input.id, { id: crypto.randomUUID(), message: 'Concurrent A' }, true), replyFeedback(owner, input.id, { id: crypto.randomUUID(), message: 'Concurrent B' }, true)]);
  assert.equal((await readFeedback(a, input.id)).messages.length, 7);
  assert.equal((await listNotifications(a)).unread, 3);
  const collision = crypto.randomUUID();
  await getAdminFirestore().doc('feedbackAccounts/' + a.uid + '/notifications/' + collision).set({ synthetic: true });
  await assert.rejects(replyFeedback(owner, input.id, { id: collision, message: 'Must roll back' }, true));
  assert.equal((await readFeedback(a, input.id)).messages.length, 7);

});

test('paginated owner/user inboxes and replies include older records without identity leakage', async () => {
  const a = { uid: 'pagination-user', role: 'user' }, owner = { uid: 'feedback-owner', role: 'owner' };
  for (let i = 0; i < 23; i++) await createFeedback(a, { id: crypto.randomUUID(), category: 'suggestion', subject: 'Synthetic idea ' + i, message: 'Synthetic only' });
  const first = await listFeedback(a, false); assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  const second = await listFeedback(a, false, first.nextCursor); assert.equal(second.items.length, 3); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items,...second.items].map(item => item.id)).size, 23);
  assert.ok((await listFeedback(owner, true)).items.length >= 20);
  await assert.rejects(listFeedback(a, false, '../invalid'), /cursor/);
  const id = first.items[0].id;
  for (let i = 0; i < 23; i++) await replyFeedback(owner, id, { id: crypto.randomUUID(), message: 'Synthetic reply ' + i }, true);
  const notes = await listNotifications(a); assert.equal(notes.items.filter(note => note.kind === 'reply').length, 20); assert.ok(notes.nextCursor);
  const older = await listNotifications(a, notes.nextCursor); assert.equal(older.items.length, 3); assert.equal(older.nextCursor, null);
  assert.equal(notes.unread, 23 + RELEASE_NOTES.length);
  assert.equal(older.items.some(note => note.kind === 'release'), false);
  const db = getAdminFirestore();
  const ref = db.collection('feedbackThreads').doc(id);
  await ref.update({ messages: Array.from({ length: MAX_THREAD_MESSAGES }, () => ({ id: crypto.randomUUID(), text: '🙂'.repeat(1500), author: 'user', createdAt: new Date().toISOString() })) });
  await assert.rejects(replyFeedback(owner, id, { id: crypto.randomUUID(), message: 'Too many' }, true), /full/);
});

test('browser clients cannot read or forge any feedback, replies, or receipts directly', async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  const env = await initializeTestEnvironment({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
  try {
    for (const role of ['feedback-a', 'feedback-owner']) {
      const db = env.authenticatedContext(role).firestore();
      for (const path of ['feedbackThreads/synthetic', 'feedbackAccounts/' + role + '/threads/synthetic', 'feedbackAccounts/' + role + '/notifications/synthetic', 'feedbackAccounts/' + role + '/releaseReads/release-0.2.0']) {
        await assertFails(getDoc(doc(db, path))); await assertFails(setDoc(doc(db, path), { read: true, role: 'owner' }));
      }
    }
  } finally { await env.cleanup(); }
});
