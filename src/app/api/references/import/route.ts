import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateChatRequest, chatFailure, readChatJson } from '@/lib/server/chat-http';
import { importSharedChat } from '@/lib/server/shared-chat-import';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { await authenticateChatRequest(request); const input = z.object({ url: z.string().max(2048) }).parse(await readChatJson(request, 4096)); return NextResponse.json({ reference: await importSharedChat(input.url) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return chatFailure(error); }
}
