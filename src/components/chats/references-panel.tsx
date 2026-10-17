'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link2, Monitor, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useFirebase } from '@/firebase';
import { findMissingReferences, referenceSchema, type ChatReference, type ChatAttachment } from '@/lib/chat-types';
import { referenceFromText } from '@/lib/chat-reference';
import { extensionRequest, type OpenChatTab } from '@/lib/extension-bridge';
import { prepareChatAttachment } from '@/lib/chat-upload';

interface Props {
  references: ChatReference[]; attachments: ChatAttachment[]; temporary: boolean; disabled: boolean;
  onBusy: (busy: boolean) => void;
  onReferences: (references: ChatReference[]) => void; onAttachments: (attachments: ChatAttachment[]) => void; onPrompt: (prompt: string) => void;
}
export function ReferencesPanel({ references, attachments, temporary, disabled, onReferences, onAttachments, onPrompt, onBusy }: Props) {
  const { user } = useFirebase();
  const [url, setUrl] = useState(''); const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [tabs, setTabs] = useState<OpenChatTab[] | null>(null);
  const [highlight, setHighlight] = useState('');
  const current = useRef({ references, onReferences, disabled }); current.current = { references, onReferences, disabled };
  const missing = findMissingReferences(references, attachments);
  useEffect(() => { if (highlight) document.getElementById(highlight.replace(':', '-'))?.scrollIntoView({ block: 'nearest' }); }, [highlight]);
  function add(reference: ChatReference) {
    if (current.current.references.length >= 5) throw new Error('Attach up to five conversations per chat.');
    const parsed = referenceSchema.parse(reference);
    current.current.onReferences([...current.current.references, parsed]);
    setNotice('Conversation imported. Select the exact prompt and review the missing files.');
  }
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'clarift-reference') return;
      if (current.current.disabled) { setError('A refinement is running. Import the context pill again after it finishes.'); return; }
      try {
        if (typeof event.data.text !== 'string' || event.data.text.length > 120_000) throw new Error('The extension pill is too large.');
        add(referenceFromText(event.data.text, String(event.data.title || 'Extension context pill')));
      } catch (error) { setError(error instanceof Error ? error.message : 'The context pill could not be imported.'); }
    }
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, []);
  async function run(operation: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true); onBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : 'The reference could not be imported.'); } finally { setBusy(false); onBusy(false); }
  }
  const importLink = () => run(async () => {
    const response = await fetch('/api/references/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user!.getIdToken()}` }, body: JSON.stringify({ url }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The shared chat could not be read.');
    add(data.reference); setUrl('');
  });
  const importTranscript = () => run(async () => { add(referenceFromText(transcript)); setTranscript(''); });
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]; event.target.value = '';
    await run(async () => {
      if (files.length + attachments.length > 6) throw new Error('Attach up to six files per chat.');
      const token = await user!.getIdToken();
      const prepared: ChatAttachment[] = [];
      for (const file of files) prepared.push(await prepareChatAttachment(file, token, temporary));
      onAttachments([...attachments, ...prepared]);
      setNotice('Files attached. Matching filenames are removed from the missing-file list.');
    });
  }
  function updateReference(id: string, update: Partial<ChatReference>) { onReferences(references.map(reference => reference.id === id ? { ...reference, ...update } : reference)); }
  return <section className="space-y-4 rounded-xl border bg-muted/10 p-4" aria-label="Add references">
    <div><h3 className="flex items-center gap-2 font-semibold"><Paperclip className="h-4 w-4" />Add references</h3><p className="mt-1 text-sm text-muted-foreground">Import a shared chat, an open browser chat, or a context pill. Review it and upload any missing source files.</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Shared chat link" type="url" placeholder="Paste a ChatGPT, Claude, Grok, DeepSeek or Qwen share link" value={url} onChange={event => setUrl(event.target.value)} disabled={busy || disabled} /><Button type="button" variant="outline" onClick={importLink} disabled={!url.trim() || busy || disabled}><Link2 className="h-4 w-4" />Import link</Button></div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => run(async () => { const result = await extensionRequest('list-tabs'); if (!result.ok) throw new Error(result.error); setTabs(result.tabs || []); })}><Monitor className="h-4 w-4" />Import from open tab</Button>
      <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm" htmlFor="chat-files">Upload documents or images</Label><input id="chat-files" className="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.txt,.csv,.json,.png,.jpg,.jpeg,.webp" disabled={busy || disabled} onChange={upload} />
    </div>
    {tabs && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Choose a chat. Review the extension’s context pill, then click “Use reviewed pill in Clarift”.</p>{!tabs.length && <p className="text-sm text-muted-foreground">No supported chat tabs are open in this browser.</p>}{tabs.map(tab => <Button key={tab.id} type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" disabled={busy || disabled} onClick={() => run(async () => { const result = await extensionRequest('open-context', tab.id); if (!result.ok) throw new Error(result.error); setNotice('The context pill editor is open. Finish reviewing it there, then send it back to Clarift.'); })}>{tab.provider} · {tab.title}</Button>)}</div>}
    <details><summary className="cursor-pointer text-sm font-medium">Paste or upload a transcript / context pill</summary><div className="mt-3 space-y-2"><Textarea aria-label="Chat transcript or context pill" rows={6} maxLength={120000} value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Paste the conversation or exported context pill here..." disabled={busy || disabled} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || disabled || !transcript.trim()} onClick={importTranscript}>Import transcript</Button><Input aria-label="Upload chat transcript" type="file" accept=".txt,.md,.json" disabled={busy || disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { if (file.size > 500_000) throw new Error('Use a transcript under 120,000 characters.'); add(referenceFromText(await file.text(), file.name)); }); }} /></div></div></details>
    {busy && <p role="status" className="text-sm">Reading reference...</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {attachments.length > 0 && <ul className="space-y-1">{attachments.map(file => <li key={file.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"><span className="break-all">{file.name}{file.dataUri ? ' · image' : ` · ${file.content.length.toLocaleString()} characters`}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} disabled={disabled || busy} onClick={() => onAttachments(attachments.filter(item => item.id !== file.id))}><X className="h-4 w-4" /></Button></li>)}</ul>}
    {missing.length > 0 && <div className="space-y-3 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3"><h4 className="font-semibold">Files mentioned in these chats</h4><p className="text-sm text-muted-foreground">Upload these originals if the refinement depends on them. A shared chat link does not include their contents.</p>{missing.map(file => <div key={file.key} className="space-y-1 text-sm"><p className="font-medium">{file.name}</p><blockquote className="whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground">{file.excerpt}</blockquote><Button type="button" variant="link" className="h-auto p-0" onClick={() => setHighlight(`${file.referenceId}:${file.messageId}`)}>Show exact message</Button></div>)}</div>}
    {references.map(reference => <article key={reference.id} className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3"><div><h4 className="font-medium">{reference.title}</h4><p className="text-xs text-muted-foreground">{reference.provider} · {reference.messages.length} messages</p></div><Button type="button" size="icon" variant="ghost" disabled={disabled || busy} aria-label={`Remove ${reference.title}`} onClick={() => onReferences(references.filter(item => item.id !== reference.id))}><X className="h-4 w-4" /></Button></div>
      <label className="block space-y-2 text-sm"><span>Select the exact prompt to refine</span><select className="w-full rounded-md border bg-background p-2" disabled={disabled || busy} value={reference.selectedMessageId || ''} onChange={event => { const message = reference.messages.find(message => message.id === event.target.value); updateReference(reference.id, { selectedMessageId: event.target.value || undefined, reviewed: false }); if (message) { onPrompt(message.text.slice(0, 50000)); setHighlight(`${reference.id}:${message.id}`); } }}><option value="">Use my own new prompt</option>{reference.messages.filter(message => ['user', 'unknown'].includes(message.role)).map(message => <option key={message.id} value={message.id}>{message.id} · {message.text.slice(0, 100)}</option>)}</select></label>
      <details open={highlight.startsWith(`${reference.id}:`) || Boolean(reference.selectedMessageId)}><summary className="cursor-pointer text-sm">Review imported messages</summary><div className="mt-2 max-h-80 space-y-3 overflow-y-auto">{reference.messages.map(message => <div key={message.id} id={`${reference.id}-${message.id}`} className={`rounded-md p-3 ${reference.selectedMessageId === message.id || highlight === `${reference.id}:${message.id}` ? 'border border-primary bg-primary/10' : 'bg-muted/40'}`}><p className="text-xs font-semibold uppercase">{message.role} · {message.id}{reference.selectedMessageId === message.id ? ' · Selected prompt' : ''}</p><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm">{message.text}</pre></div>)}</div></details>
      {reference.warnings.map((warning, index) => <p key={index} className="text-xs text-muted-foreground">{warning}</p>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reference.reviewed} disabled={disabled || busy} onChange={event => updateReference(reference.id, { reviewed: event.target.checked })} /><span>I reviewed this context and the missing-file list. Use the supplied material for my next refinement.</span></label>
    </article>)}
  </section>;
}
