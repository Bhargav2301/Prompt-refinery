'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { requestPasswordResetEmail } from '@/lib/account-email-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountErrorMessage } from '@/lib/account-security';

export function PasswordResetRequest() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      await requestPasswordResetEmail(email);
      setSent(true);
    } catch (error) {
      setError(accountErrorMessage(error));
    } finally { setPending(false); }
  }
  return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-5 py-12">
    <h1 className="text-2xl font-semibold">Reset your password</h1>
    <p className="text-sm text-muted-foreground">Enter the email you used to sign up. The email link confirms access to that inbox and lets you choose a new password.</p>
    {sent ? <p role="status" className="rounded-lg border p-4">If this address has a password account, a reset email is on its way. Check your inbox and spam folder, then open the latest link.</p> : <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="reset-email">Account email</Label><Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={pending} className="w-full">{pending ? 'Sending...' : 'Send reset link'}</Button>
    </form>}
    <Link href="/" className="text-sm text-primary underline">Back to sign in</Link>
  </div>;
}
