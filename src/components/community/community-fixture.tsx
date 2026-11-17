'use client';
// Development-only UI fixture. The route is a 404 in production; it grants no server access.
import { useState } from 'react';
import { FirebaseContext, type FirebaseContextState } from '@/firebase/provider';
import { FeedbackPanel, FeedbackDialog } from './feedback-panel';
import { NotificationBell } from './notification-bell';
import { TechniqueGuide } from '@/components/technique-guide';
import { Button } from '@/components/ui/button';

const context = {
  areServicesAvailable: true, firebaseApp: {}, firestore: {}, auth: {},
  user: { uid: 'synthetic-ui-user', getIdToken: async () => 'synthetic-ui-token' },
  isUserLoading: false, userError: null,
} as FirebaseContextState;

export function CommunityFixture() {
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | undefined>();
  return <FirebaseContext.Provider value={context}><main className="mx-auto max-w-5xl space-y-8 p-4">
    <header className="flex items-center justify-between gap-3"><p>Development fixture · synthetic data only</p><NotificationBell onOpenFeedback={value => { setId(value); setOpen(true); }} /></header>
    <Button onClick={() => setOwner(!owner)}>{owner ? 'Switch to user' : 'Switch to owner'}</Button>
    <FeedbackPanel key={String(owner)} owner={owner} />
    <FeedbackDialog open={open} onOpenChange={setOpen} threadId={id} />
    <TechniqueGuide />
  </main></FirebaseContext.Provider>;
}
