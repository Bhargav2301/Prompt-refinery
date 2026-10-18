import { handleOwnerAnalytics } from '@/lib/server/owner-analytics-request';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleOwnerAnalytics(request);
}
