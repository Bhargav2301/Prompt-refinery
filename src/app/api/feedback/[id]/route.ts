import { handleCommunity } from '@/lib/server/community-request';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handleCommunity(request, { action: 'read', id: (await context.params).id }); }
export async function POST(request: Request, context: Context) { return handleCommunity(request, { action: 'reply', id: (await context.params).id }); }
