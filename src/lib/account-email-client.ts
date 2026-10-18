import type { User } from 'firebase/auth';

async function requestAccountEmail(body: { action: 'verifyEmail' } | { action: 'resetPassword'; email: string }, token?: string) {
  let response: Response;
  try {
    response = await fetch('/api/auth/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch { throw Object.assign(new Error('Account email request failed'), { code: 'auth/network-request-failed' }); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Account email request failed'), { code: result.error?.code || 'auth/email-delivery-unavailable' });
  }
}

export async function requestVerificationEmail(user: User) {
  await requestAccountEmail({ action: 'verifyEmail' }, await user.getIdToken());
}

export async function requestPasswordResetEmail(email: string) {
  await requestAccountEmail({ action: 'resetPassword', email: email.trim() });
}
