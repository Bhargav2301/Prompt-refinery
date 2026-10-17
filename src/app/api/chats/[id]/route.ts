import { NextResponse } from 'next/server';
import { readChat, deleteChat } from '@/lib/server/chat-service';
import { authenticateChatRequest, chatFailure } from '@/lib/server/chat-http';
export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) {
  try { const { uid } = await authenticateChatRequest(request); return NextResponse.json({ chat: await readChat(uid, (await context.params).id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return chatFailure(error); }
}
export async function DELETE(request: Request, context: RouteContext) {
  try { const { uid } = await authenticateChatRequest(request); await deleteChat(uid, (await context.params).id); return NextResponse.json({ ok: true }); }
  catch (error) { return chatFailure(error); }
}
