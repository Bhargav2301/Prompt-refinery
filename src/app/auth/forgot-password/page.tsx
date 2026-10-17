'use client';
import { FirebaseClientProvider } from '@/firebase';
import { PasswordResetRequest } from '@/components/auth/password-reset-request';
export default function ForgotPasswordPage() { return <FirebaseClientProvider><PasswordResetRequest /></FirebaseClientProvider>; }
