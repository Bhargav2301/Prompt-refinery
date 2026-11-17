import { handleCommunity } from '@/lib/server/community-request';
export const runtime = 'nodejs';
export const GET = (request: Request) => handleCommunity(request, { action: 'list', owner: true });
