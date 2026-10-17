import type { ChatAttachment } from './chat-types';

export async function prepareChatAttachment(file: File, token: string, temporary: boolean): Promise<ChatAttachment> {
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  const base = { id: crypto.randomUUID(), name: file.name.slice(0, 255), mimeType: file.type || 'text/plain' };
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('This browser could not prepare the image.'); }
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    let dataUri = canvas.toDataURL('image/jpeg', .82);
    if (dataUri.length > 650_000) dataUri = canvas.toDataURL('image/jpeg', .55);
    if (dataUri.length > 650_000) throw new Error(`${file.name} is too detailed to attach. Upload a smaller crop.`);
    return { ...base, mimeType: 'image/jpeg', content: `Uploaded image reference: ${file.name}. Inspect the image; do not invent hidden or unreadable details.`, dataUri };
  }
  if (/\.(txt|md|markdown|csv|json|log)$/i.test(file.name)) {
    const content = await file.text();
    if (content.length > 12_000) throw new Error(`${file.name} exceeds the 12,000-character file-reference limit. Import a chat transcript in the transcript field, or upload a focused excerpt.`);
    return { ...base, content };
  }
  const form = new FormData(); form.append('file', file); form.append('temporary', String(temporary));
  const response = await fetch('/api/markitdown', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'This document could not be converted.');
  if (data.truncated || typeof data.content !== 'string' || data.content.length > 12_000) throw new Error(`${file.name} is too long for one reference. Upload a focused excerpt or convert it to Markdown first.`);
  return { ...base, content: data.content };
}
