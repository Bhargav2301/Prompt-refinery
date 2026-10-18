import { z } from 'zod';

export const newPasswordSchema = z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.');
export const passwordPairSchema = z.object({
  newPassword: newPasswordSchema,
  confirmPassword: z.string(),
}).refine(value => value.newPassword === value.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });

export function accountErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/expired-action-code', 'auth/invalid-action-code'].includes(code)) return 'This link has expired or has already been used. Request a new email and use its latest link.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return 'The email or password is incorrect. Please try again.';
  if (code === 'auth/email-already-in-use') return 'This email already has an account. Sign in or reset your password.';
  if (code === 'auth/too-many-requests') return 'Please wait a few minutes before trying again.';
  if (code === 'auth/network-request-failed') return 'Check your connection and try again.';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'Choose a stronger password that meets the account password requirements.';
  if (code === 'auth/requires-recent-login') return 'Sign in again to continue.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/email-delivery-unavailable') return 'Account emails are temporarily unavailable. Please try again shortly.';
  return 'This request could not be completed. Please try again.';
}
