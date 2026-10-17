import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ChatError, chatUser } from './chat-service';
import { getBearerTokenFromRequest } from './user-access';
import { consumeDistributedLimit } from './distributed-limits';

export async function authenticateChatRequest(request: Request) {
  const token = getBearerTokenFromRequest(request);
  if (!token) throw new ChatError('Sign in to use your chats.', 401);
  let uid: string;
  try { uid = await chatUser(token); } catch { throw new ChatError('Your account could not be verified. Sign in again.', 401); }
  const rate = await consumeDistributedLimit({ bucket: 'chat-requests', key: uid, limit: 90, windowMs: 60_000 });
  if (!rate.allowed) throw new ChatError('Please wait a minute before trying again.', 429);
  return { token, uid };
}

export async function readChatJson(request: Request, maximum = 5_500_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ChatError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length')) > maximum) throw new ChatError('This request is too large. Remove a reference or start a new chat.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ChatError('The request is empty.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new ChatError('This request is too large. Remove a reference or start a new chat.', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ChatError('The request could not be read.'); }
}

export function chatFailure(error: unknown) {
  if (error instanceof ChatError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof ZodError) return NextResponse.json({ error: 'Check the prompt, references and attachment sizes, then try again.' }, { status: 400 });
  console.error('Chat operation failed.', { category: 'unexpected_chat_error' });
  return NextResponse.json({ error: 'Clarift could not complete this request. Your current work is still available; please try again.' }, { status: 500 });
}
