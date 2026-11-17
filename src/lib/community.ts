import { z } from 'zod';

export const communityId = z.string().uuid();
export const messageText = z.string().trim().min(1, 'Enter a message.').max(3000, 'Use 3,000 characters or fewer.');
export const newFeedbackSchema = z.object({
  id: communityId, category: z.enum(['suggestion', 'complaint']),
  subject: z.string().trim().min(3).max(120), message: messageText,
}).strict();
export const feedbackReplySchema = z.object({ id: communityId, message: messageText }).strict();
export const feedbackStatusSchema = z.object({ status: z.enum(['open', 'resolved']) }).strict();
export const readNotificationsSchema = z.object({ ids: z.array(z.string().max(100)).min(1).max(60) }).strict();

export interface FeedbackMessage { id: string; author: 'user' | 'owner'; text: string; createdAt: string }
export interface FeedbackSummary {
  id: string; category: 'suggestion' | 'complaint'; subject: string;
  status: 'open' | 'resolved'; createdAt: string; updatedAt: string; lastAuthor: 'user' | 'owner';
}
export interface FeedbackThread extends FeedbackSummary { messages: FeedbackMessage[] }
export interface NotificationItem {
  id: string; kind: 'release' | 'reply'; title: string; body: string;
  createdAt: string; read: boolean; version?: string; threadId?: string;
}
export interface CommunityPage<T> { items: T[]; nextCursor: string | null }
export interface NotificationPage extends CommunityPage<NotificationItem> { unread: number; currentVersion: string }
export const MAX_THREAD_MESSAGES = 50;
