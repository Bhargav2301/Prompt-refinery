export type ModelContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface ModelMessage { role: 'system' | 'user' | 'assistant'; content: string | ModelContentPart[] }
export function withReferenceImages(messages: ModelMessage[], attachments?: Array<{ dataUri?: string }>): ModelMessage[] {
  const images = (attachments || []).flatMap(file => file.dataUri && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(file.dataUri) ? [{ type: 'image_url' as const, image_url: { url: file.dataUri } }] : []);
  if (!images.length) return messages;
  const lastUser = messages.findLastIndex(message => message.role === 'user');
  return messages.map((message, index) => index !== lastUser ? message : { ...message, content: [...(typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content), ...images] });
}
