import { FirebaseClientProvider } from '@/firebase';
import { EmailActionPage } from '@/components/auth/email-action-page';
export default function AccountActionPage() { return <FirebaseClientProvider><EmailActionPage /></FirebaseClientProvider>; }
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
