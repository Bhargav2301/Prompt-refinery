import { NextResponse } from 'next/server';
import { chatSnapshotSchema } from '@/lib/chat-types';
import { listChats, saveChat } from '@/lib/server/chat-service';
import { authenticateChatRequest, readChatJson, chatFailure } from '@/lib/server/chat-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { const { uid } = await authenticateChatRequest(request); return NextResponse.json(await listChats(uid, new URL(request.url).searchParams.get('cursor') || undefined), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return chatFailure(error); }
}
export async function POST(request: Request) {
  try { const { uid } = await authenticateChatRequest(request); const snapshot = chatSnapshotSchema.parse(await readChatJson(request)); return NextResponse.json({ chat: await saveChat(uid, snapshot) }); }
  catch (error) { return chatFailure(error); }
}
