import type { NotificationItem } from './community';

// Append a new immutable entry for every user-facing release. IDs also key read receipts.
export const APP_VERSION = '0.2.0';
export const RELEASE_NOTES = [{
  id: 'release-0.2.0', kind: 'release', version: '0.2.0',
  title: 'Learn prompting and stay in touch',
  body: 'Explore all eight prompting techniques with examples and copyable skeletons. Send suggestions or complaints from your workspace, follow the conversation with Clarift, and find owner replies and version updates here. Available on every plan.',
  createdAt: '2026-11-17T00:00:00.000Z',
}] as const satisfies ReadonlyArray<Omit<NotificationItem, 'read'>>;
