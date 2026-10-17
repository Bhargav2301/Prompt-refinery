import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { chatSnapshotSchema, MAX_CHAT_BYTES, type ChatSnapshot, type ChatSummary } from '@/lib/chat-types';
import { getAdminFirestore } from './firebase-admin';
import { getVerifiedUserProfile } from './account-service';
import { assertActiveAccount } from './user-access';

export class ChatError extends Error { constructor(message: string, public status = 400) { super(message); this.name = 'ChatError'; } }
export async function chatUser(token: string) {
  const { decodedToken, profile } = await getVerifiedUserProfile(token);
  assertActiveAccount(profile, 'use chats');
  return decodedToken.uid;
}
export function validateChatId(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new ChatError('Choose a valid chat.');
  return id;
}
function chatRef(uid: string, id: string) { return getAdminFirestore().doc(`users/${uid}/refinementChats/${validateChatId(id)}`); }

export function encodeChat(snapshot: ChatSnapshot) {
  const parsed = chatSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new ChatError(parsed.error.issues[0]?.message || 'This chat could not be saved.');
  const encoded = JSON.stringify(parsed.data);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_CHAT_BYTES) throw new ChatError('This chat has reached its storage limit. Export a context pill and start a new chat.', 413);
  const chunks = [];
  for (let offset = 0; offset < encoded.length;) {
    let end = Math.min(offset + 64_000, encoded.length);
    // Keep UTF-16 surrogate pairs together when Firestore encodes each chunk as UTF-8.
    if (end < encoded.length && /[\uD800-\uDBFF]/.test(encoded[end - 1])) end--;
    chunks.push(encoded.slice(offset, end)); offset = end;
  }
  return chunks;
}

export async function saveChat(uid: string, snapshot: ChatSnapshot) {
  const chunks = encodeChat(snapshot);
  const ref = chatRef(uid, snapshot.id);
  const revision = await getAdminFirestore().runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    const current = existing.data();
    if ((current?.revision || 0) !== snapshot.revision) throw new ChatError('This chat was changed in another tab. Your latest output is still here; save it as a new chat or reopen the latest history.', 409);
    const revision = snapshot.revision + 1;
    transaction.set(ref, { title: snapshot.title, revision, turnCount: snapshot.turns.length, chunkCount: chunks.length, createdAt: current?.createdAt || Timestamp.now(), updatedAt: Timestamp.now() });
    chunks.forEach((data, index) => transaction.set(ref.collection('payload').doc(String(index).padStart(4, '0')), { data, revision }));
    for (let index = chunks.length; index < (current?.chunkCount || 0); index++) transaction.delete(ref.collection('payload').doc(String(index).padStart(4, '0')));
    return revision;
  });
  return { ...snapshot, revision };
}

export async function readChat(uid: string, id: string): Promise<ChatSnapshot> {
  const ref = chatRef(uid, id);
  // One transaction keeps the metadata and chunks on the same revision during concurrent saves.
  return getAdminFirestore().runTransaction(async transaction => {
    const metadata = await transaction.get(ref);
    if (!metadata.exists) throw new ChatError('This chat no longer exists.', 404);
    const chunks = await transaction.get(ref.collection('payload').orderBy(FieldPath.documentId()));
    if (chunks.size !== metadata.get('chunkCount') || chunks.docs.some(chunk => chunk.get('revision') !== metadata.get('revision'))) throw new ChatError('This chat is being updated. Try opening it again.', 409);
    const snapshot = chatSnapshotSchema.parse(JSON.parse(chunks.docs.map(chunk => chunk.get('data')).join('')));
    return { ...snapshot, revision: metadata.get('revision') };
  });
}

export async function listChats(uid: string, cursor?: string) {
  let query = getAdminFirestore().collection(`users/${uid}/refinementChats`).orderBy('updatedAt', 'desc').limit(31);
  if (cursor) {
    const after = await chatRef(uid, cursor).get();
    if (after.exists) query = query.startAfter(after);
  }
  const docs = (await query.get()).docs;
  const page = docs.slice(0, 30);
  return { chats: page.map(doc => ({ id: doc.id, title: doc.get('title'), updatedAt: doc.get('updatedAt').toDate().toISOString(), turnCount: doc.get('turnCount'), revision: doc.get('revision') } as ChatSummary)), nextCursor: docs.length > 30 ? page.at(-1)!.id : null };
}

export async function deleteChat(uid: string, id: string) { await getAdminFirestore().recursiveDelete(chatRef(uid, id)); }
