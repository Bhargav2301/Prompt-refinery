'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountErrorMessage, passwordPairSchema } from '@/lib/account-security';

export function EmailActionPage() {
  const auth = useAuth();
  const request = useRef<Promise<{ mode: string; code: string; email: string }>>();
  const [action, setAction] = useState<{ mode: string; code: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!request.current) request.current = (async () => {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode'); const code = params.get('oobCode');
      if (!code || !['resetPassword', 'verifyEmail', 'recoverEmail'].includes(mode || '')) throw Object.assign(new Error(), { code: 'auth/invalid-action-code' });
      const email = mode === 'resetPassword' ? await verifyPasswordResetCode(auth, code) : (await checkActionCode(auth, code)).data.email;
      return { mode: mode!, code, email: email || '' };
    })();
    request.current.then(result => { if (active) setAction(result); }).catch(error => { if (active) setError(accountErrorMessage(error)); });
    return () => { active = false; };
  }, [auth]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || pending) return;
    if (action.mode === 'resetPassword') {
      const validation = passwordPairSchema.safeParse({ newPassword, confirmPassword });
      if (!validation.success) { setError(validation.error.issues[0].message); return; }
    }
    setPending(true); setError('');
    try {
      if (action.mode === 'resetPassword') await confirmPasswordReset(auth, action.code, newPassword);
      else await applyActionCode(auth, action.code);
      setNewPassword(''); setConfirmPassword(''); setDone(true);
      // Drop the one-time secret from the address bar and browser history entry.
      window.history.replaceState(null, '', '/auth/action');
    } catch (error) { setError(accountErrorMessage(error)); }
    finally { setPending(false); }
  }
  const reset = action?.mode === 'resetPassword';
  return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-5 py-12">
    <h1 className="text-2xl font-semibold">{done ? 'Account updated' : reset ? 'Create a new password' : action?.mode === 'recoverEmail' ? 'Recover your email' : 'Verify your email'}</h1>
    {!action && !error && <p role="status">Checking your link...</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {done ? <p role="status">{reset ? 'Your password has been changed. Sign in with your new password.' : 'Your email has been confirmed. Return to Clarift to continue.'}</p> : action && <form onSubmit={submit} className="space-y-4">
      <p className="break-all text-sm text-muted-foreground">Account: {action.email}</p>
      {reset && <>
        <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
      </>}
      <Button className="w-full" disabled={pending}>{pending ? 'Updating...' : reset ? 'Save new password' : action.mode === 'recoverEmail' ? 'Recover email' : 'Verify email'}</Button>
    </form>}
    <Link href="/" className="text-sm text-primary underline">Back to Clarift</Link>
    {error && <Link href="/auth/forgot-password" className="text-sm text-primary underline">Request a new password reset link</Link>}
  </div>;
}
