import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminFirestore } from './firebase-admin';
import { AuthorizationError } from './user-access';
import { communityId, MAX_THREAD_MESSAGES, type FeedbackThread, type FeedbackSummary, type CommunityPage, type NotificationItem, type NotificationPage } from '@/lib/community';
import { APP_VERSION, RELEASE_NOTES } from '@/lib/releases';

export interface CommunityActor { uid: string; role: string }
export class CommunityError extends Error { constructor(message: string, public status = 400) { super(message); } }
const pageSize = 20;
const account = (uid: string) => getAdminFirestore().collection('feedbackAccounts').doc(uid);
const threadRef = (id: string) => getAdminFirestore().collection('feedbackThreads').doc(communityId.parse(id));
function checkAccess(actor: CommunityActor, thread: FeedbackThread & { uid: string }) {
  if (actor.role !== 'owner' && actor.uid !== thread.uid) throw new CommunityError('Conversation not found.', 404);
}
function summary(thread: FeedbackSummary): FeedbackSummary {
  const { id, category, subject, status, createdAt, updatedAt, lastAuthor } = thread;
  return { id, category, subject, status, createdAt, updatedAt, lastAuthor };
}
function publicThread(thread: FeedbackThread): FeedbackThread { return { ...summary(thread), messages: thread.messages }; }
function assertOwner(actor: CommunityActor) {
  if (actor.role !== 'owner') throw new AuthorizationError('Owner access is required.');
}
const cursorSchema = z.object({ at: z.string().datetime(), id: communityId }).strict();
function parseCursor(cursor?: string | null) {
  if (!cursor) return null;
  try { if (cursor.length > 300) throw new Error(); return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())); }
  catch { throw new CommunityError('Invalid page cursor.'); }
}
function nextCursor(data: { id: string; updatedAt?: string; createdAt: string }) {
  return Buffer.from(JSON.stringify({ at: data.updatedAt ?? data.createdAt, id: data.id })).toString('base64url');
}
export async function listFeedback(actor: CommunityActor, owner: boolean, cursor?: string | null): Promise<CommunityPage<FeedbackSummary>> {
  if (owner) assertOwner(actor);
  const collection = owner ? getAdminFirestore().collection('feedbackThreads') : account(actor.uid).collection('threads');
  let query = collection.select('id', 'category', 'subject', 'status', 'createdAt', 'updatedAt', 'lastAuthor').orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(pageSize + 1);
  const after = parseCursor(cursor);
  if (after) query = query.startAfter(after.at, after.id);
  const result = await query.get();
  const items = result.docs.slice(0, pageSize).map(doc => summary(doc.data() as FeedbackSummary));
  return { items, nextCursor: result.size > pageSize ? nextCursor(items[items.length - 1]) : null };
}
export async function readFeedback(actor: CommunityActor, id: string): Promise<FeedbackThread> {
  const doc = await threadRef(id).get();
  if (!doc.exists) throw new CommunityError('Conversation not found.', 404);
  const thread = doc.data() as FeedbackThread & { uid: string }; checkAccess(actor, thread);
  return publicThread(thread);
}
export async function createFeedback(actor: CommunityActor, input: { id: string; category: 'suggestion' | 'complaint'; subject: string; message: string }) {
  const db = getAdminFirestore(); const ref = threadRef(input.id);
  return db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    if (previous.exists) {
      const existing = previous.data() as FeedbackThread & { uid: string };
      if (existing.uid !== actor.uid || existing.subject !== input.subject || existing.category !== input.category || existing.messages[0].text !== input.message) throw new CommunityError('Request ID already used. Start a new request.', 409);
      return publicThread(existing);
    }
    const now = new Date().toISOString();
    const thread: FeedbackThread & { uid: string } = {
      id: input.id, uid: actor.uid, category: input.category, subject: input.subject, status: 'open',
      createdAt: now, updatedAt: now, lastAuthor: 'user',
      messages: [{ id: input.id, author: 'user', text: input.message, createdAt: now }],
    };
    tx.create(ref, thread); tx.create(account(actor.uid).collection('threads').doc(thread.id), summary(thread));
    return publicThread(thread);
  });
}
export async function replyFeedback(actor: CommunityActor, id: string, input: { id: string; message: string }, owner: boolean) {
  if (owner) assertOwner(actor);
  const db = getAdminFirestore(); const ref = threadRef(id);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new CommunityError('Conversation not found.', 404);
    const thread = doc.data() as FeedbackThread & { uid: string };
    if (!owner && actor.uid !== thread.uid) throw new CommunityError('Conversation not found.', 404);
    const author = owner ? 'owner' : 'user';
    const previous = thread.messages.find(message => message.id === input.id);
    if (previous) {
      if (previous.author !== author || previous.text !== input.message) throw new CommunityError('Request ID already used.', 409);
      return publicThread(thread);
    }
    if (thread.messages.length >= MAX_THREAD_MESSAGES) throw new CommunityError('This conversation is full. Please start a new one.', 409);
    const now = new Date().toISOString();
    const updated = { ...thread, updatedAt: now, lastAuthor: author, status: 'open', messages: [...thread.messages, { id: input.id, author, text: input.message, createdAt: now }] } as typeof thread;
    tx.set(ref, updated); tx.set(account(thread.uid).collection('threads').doc(id), summary(updated));
    if (owner) tx.create(account(thread.uid).collection('notifications').doc(input.id), {
      id: input.id, kind: 'reply', title: 'Clarift replied: ' + thread.subject, body: input.message,
      threadId: id, createdAt: now, read: false,
    } satisfies NotificationItem);
    return publicThread(updated);
  });
}
export async function setFeedbackStatus(actor: CommunityActor, id: string, status: 'open' | 'resolved') {
  assertOwner(actor);
  const ref = threadRef(id);
  return getAdminFirestore().runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new CommunityError('Conversation not found.', 404);
    const thread = { ...doc.data(), status, updatedAt: new Date().toISOString() } as FeedbackThread & { uid: string };
    tx.set(ref, thread); tx.set(account(thread.uid).collection('threads').doc(id), summary(thread));
    return publicThread(thread);
  });
}
export async function listNotifications(actor: CommunityActor, cursor?: string | null): Promise<NotificationPage> {
  const ref = account(actor.uid);
  let query = ref.collection('notifications').orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(pageSize + 1);
  const after = parseCursor(cursor);
  if (after) query = query.startAfter(after.at, after.id);
  const [result, unread, receipts] = await Promise.all([
    query.get(), ref.collection('notifications').where('read', '==', false).count().get(), ref.collection('releaseReads').get(),
  ]);
  const readIds = new Set(receipts.docs.map(doc => doc.id));
  const releases = RELEASE_NOTES.map(note => ({ ...note, read: readIds.has(note.id) }));
  const replies = result.docs.slice(0, pageSize).map(doc => doc.data() as NotificationItem);
  return {
    items: [...(!after ? releases : []), ...replies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    nextCursor: result.size > pageSize ? nextCursor(replies[replies.length - 1]) : null,
    unread: unread.data().count + releases.filter(note => !note.read).length, currentVersion: APP_VERSION,
  };
}
export async function markNotificationsRead(actor: CommunityActor, ids: string[]) {
  const releaseIds = new Set<string>(RELEASE_NOTES.map(note => note.id));
  for (const id of ids) if (!releaseIds.has(id) && !communityId.safeParse(id).success) throw new CommunityError('Invalid notification.');
  const ref = account(actor.uid);
  await getAdminFirestore().runTransaction(async tx => {
    const replyIds = [...new Set(ids)].filter(id => !releaseIds.has(id));
    const docs = await Promise.all(replyIds.map(id => tx.get(ref.collection('notifications').doc(id))));
    for (const doc of docs) if (doc.exists) tx.update(doc.ref, { read: true });
    for (const id of ids.filter(id => releaseIds.has(id))) tx.set(ref.collection('releaseReads').doc(id), { read: true });
  });
}
