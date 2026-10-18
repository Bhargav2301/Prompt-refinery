import { getAdminAuth } from '@/lib/server/firebase-admin';
import { consumeDistributedLimit } from '@/lib/server/distributed-limits';
import { handleAccountEmail, sendAccountEmail } from '@/lib/server/account-email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleAccountEmail(request, {
    auth: getAdminAuth(),
    limit: consumeDistributedLimit,
    send: email => sendAccountEmail(email),
    environment: process.env,
    report: (action, code) => console.error('Account email delivery failed', { action, code }),
  });
}
