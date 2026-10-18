'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { EmailAuthProvider, reauthenticateWithCredential, reload, updatePassword } from 'firebase/auth';
import { requestVerificationEmail } from '@/lib/account-email-client';
import { useFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountErrorMessage, passwordPairSchema } from '@/lib/account-security';

export function AccountSecurityPanel() {
  const { user } = useFirebase();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(Boolean(user?.emailVerified));
  if (!user) return null;
  const passwordAccount = user.providerData.some(provider => provider.providerId === 'password');
  async function change(event: FormEvent) {
    event.preventDefault();
    if (!user?.email || pending) return;
    const validation = passwordPairSchema.safeParse({ newPassword, confirmPassword });
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    if (newPassword === oldPassword) { setError('Choose a password different from your old password.'); return; }
    setPending(true); setError(''); setMessage('');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldPassword));
      await updatePassword(user, newPassword);
      await user.getIdToken(true);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage('Your password has been changed.');
    } catch (error) { setError(accountErrorMessage(error)); }
    finally { setPending(false); }
  }
  async function verification(check: boolean) {
    if (!user || pending) return;
    setPending(true); setError(''); setMessage('');
    try {
      if (check) { await reload(user); await user.getIdToken(true); setVerified(user.emailVerified); setMessage(user.emailVerified ? 'Your email is verified.' : 'Open the verification link in your inbox first.'); }
      else { await requestVerificationEmail(user); setMessage('Verification email sent. Open the latest link in your inbox.'); }
    } catch (error) { setError(accountErrorMessage(error)); }
    finally { setPending(false); }
  }
  return <section className="space-y-4 rounded-lg border p-4">
    <h3 className="font-semibold">Account security</h3>
    <p className="text-sm">Email: {verified ? 'Verified' : 'Verification pending'}</p>
    {!verified && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => verification(false)}>Resend verification email</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => verification(true)}>I have verified my email</Button></div>}
    {passwordAccount ? <form onSubmit={change} className="space-y-3">
      <h4 className="font-medium">Change password</h4>
      <div className="space-y-2"><Label htmlFor="old-password">Old password</Label><Input id="old-password" type="password" autoComplete="current-password" required value={oldPassword} onChange={event => setOldPassword(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="settings-new-password">New password</Label><Input id="settings-new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="settings-confirm-password">Confirm new password</Label><Input id="settings-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>
      <Button disabled={pending}>{pending ? 'Updating...' : 'Change password'}</Button>
      <Link href="/auth/forgot-password" className="ml-3 text-sm text-primary underline">Forgot password?</Link>
    </form> : <p className="text-sm text-muted-foreground">You sign in with Google. Manage that password in your Google account.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
