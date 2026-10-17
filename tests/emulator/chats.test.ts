import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyChat, type ChatTurn } from '../../src/lib/chat-types';
import { saveChat, readChat, listChats, deleteChat } from '../../src/lib/server/chat-service';
import { getAdminFirestore } from '../../src/lib/server/firebase-admin';
import { referenceFromText } from '../../src/lib/chat-reference';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

test('saved chats survive reload, isolate owners, reject concurrent stale writes and delete chunks', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Only run this test in an emulator');
  const chat = emptyChat();
  const turn: ChatTurn = { id: crypto.randomUUID(), prompt: 'Lighthouse story', output: 'A cinematic sunrise', createdAt: new Date().toISOString(), mode: 'quick_refine', tool: 'sora', references: [] };
  chat.turns.push(turn); chat.references.push({ ...referenceFromText('🌅'.repeat(59000)), reviewed: true });
  const saved = await saveChat('chat-owner-a', chat);
  assert.equal(saved.revision, 1); assert.deepEqual(await readChat('chat-owner-a', chat.id), saved);
  assert.equal((await listChats('chat-owner-a')).chats.some(item => item.id === chat.id), true);
  assert.equal((await listChats('chat-owner-b')).chats.length, 0);
  await assert.rejects(readChat('chat-owner-b', chat.id), /no longer exists/);
  const writes = await Promise.allSettled([saveChat('chat-owner-a', { ...saved, title: 'First editor' }), saveChat('chat-owner-a', { ...saved, title: 'Second editor' })]);
  assert.equal(writes.filter(write => write.status === 'fulfilled').length, 1);
  assert.equal(writes.filter(write => write.status === 'rejected').length, 1);
  const latest = await readChat('chat-owner-a', chat.id);
  await saveChat('chat-owner-a', { ...latest, references: [] });
  assert.equal((await getAdminFirestore().collection(`users/chat-owner-a/refinementChats/${chat.id}/payload`).get()).size, 1);
  await deleteChat('chat-owner-b', chat.id); assert.equal((await readChat('chat-owner-a', chat.id)).revision, 3);
  await deleteChat('chat-owner-a', chat.id); await assert.rejects(readChat('chat-owner-a', chat.id), /no longer exists/);
  assert.equal((await getAdminFirestore().collection(`users/chat-owner-a/refinementChats/${chat.id}/payload`).get()).size, 0);
});

test('browser clients cannot bypass the authenticated chat API even for their own records', async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  const env = await initializeTestEnvironment({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
  try {
    const database = env.authenticatedContext('chat-owner-a').firestore();
    const path = `users/chat-owner-a/refinementChats/${crypto.randomUUID()}`;
    await assertFails(setDoc(doc(database, path), { title: 'Bypass' }));
    await assertFails(getDoc(doc(database, path)));
  } finally { await env.cleanup(); }
});
