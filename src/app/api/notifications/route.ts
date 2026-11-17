import { handleCommunity } from '@/lib/server/community-request';
export const runtime = 'nodejs';
export const GET = (request: Request) => handleCommunity(request, { action: 'notifications' });
export const POST = (request: Request) => handleCommunity(request, { action: 'markRead' });
