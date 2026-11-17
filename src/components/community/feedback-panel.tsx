'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import { useCommunityApi } from '@/hooks/use-community-api';
import { MAX_THREAD_MESSAGES, type CommunityPage, type FeedbackSummary, type FeedbackThread } from '@/lib/community';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function FeedbackPanel({ owner = false, initialThreadId }: { owner?: boolean; initialThreadId?: string }) {
  const api = useCommunityApi();
  const base = owner ? '/api/admin/feedback' : '/api/feedback';
  const [items, setItems] = useState<FeedbackSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState(initialThreadId ?? '');
  const [thread, setThread] = useState<FeedbackThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<'suggestion' | 'complaint'>('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const operation = useRef<{ body: string; id: string } | null>(null);
  const list = useCallback(async (after?: string) => {
    setLoading(true); setError('');
    try {
      const result = await api<CommunityPage<FeedbackSummary>>(base + (after ? '?cursor=' + encodeURIComponent(after) : ''));
      setItems(previous => after ? [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()] : result.items);
      setCursor(result.nextCursor);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load feedback.'); }
    finally { setLoading(false); }
  }, [api, base]);
  useEffect(() => { void list(); }, [list]);
  useEffect(() => {
    if (!selected) { setThread(null); return; }
    let active = true; setLoading(true); setThread(null); setError('');
    api<FeedbackThread>(base + '/' + selected).then(value => { if (active) setThread(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load the conversation.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, api, base]);

  async function send() {
    setBusy(true); setError('');
    const fields = composing ? { category, subject: subject.trim(), message: message.trim() } : { message: message.trim() };
    const signature = JSON.stringify({ selected, composing, ...fields });
    if (operation.current?.body !== signature) operation.current = { body: signature, id: crypto.randomUUID() };
    try {
      const value = await api<FeedbackThread>(composing ? base : base + '/' + selected, 'POST', { ...fields, id: operation.current.id });
      operation.current = null; setComposing(false); setSubject(''); setMessage(''); setSelected(value.id); setThread(value);
      await list();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send. Your draft is still here.'); }
    finally { setBusy(false); }
  }
  async function status() {
    if (!thread) return; setBusy(true); setError('');
    try { setThread(await api<FeedbackThread>(base + '/' + selected, 'PATCH', { status: thread.status === 'open' ? 'resolved' : 'open' })); await list(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update status.'); }
    finally { setBusy(false); }
  }
  const back = () => { setSelected(''); setComposing(false); setMessage(''); setError(''); void list(); };
  return <section className="space-y-4" aria-label={owner ? 'Owner feedback inbox' : 'Your feedback'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">{owner ? 'Suggestions & complaints' : 'Your conversations'}</h3><p className="text-sm text-muted-foreground">{owner ? 'Reply privately to the person who submitted each request.' : 'Send an idea or report a problem. Replies appear here and in Notifications.'}</p></div>
      <div className="flex gap-2">{!owner && !composing && <Button disabled={busy} onClick={() => { setSelected(''); setComposing(true); setMessage(''); setError(''); }}>New feedback</Button>}
        {!selected && !composing && <Button size="icon" variant="outline" disabled={loading || busy} onClick={() => void list()} aria-label="Refresh feedback"><RefreshCw className="h-4 w-4" /></Button>}</div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive">{error}</p>}
    {(selected || composing) && <Button variant="ghost" size="sm" disabled={busy} onClick={back}><ArrowLeft className="h-4 w-4" />All conversations</Button>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
    {!selected && !composing && <div className="space-y-2">
      {!loading && !items.length && !error && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground"><MessageSquare className="mx-auto mb-2 h-6 w-6" />{owner ? 'No feedback yet.' : 'No conversations yet. Your suggestions and complaints are welcome on every plan.'}</div>}
      {items.map(item => <button key={item.id} type="button" className="w-full rounded-lg border p-4 text-left hover:bg-muted/50" onClick={() => { setSelected(item.id); setMessage(''); }}>
        <div className="mb-2 flex flex-wrap gap-2"><Badge variant="outline">{item.category}</Badge><Badge variant={item.status === 'resolved' ? 'secondary' : 'default'}>{item.status}</Badge></div>
        <p className="break-words font-medium">{item.subject}</p><p className="mt-1 text-xs text-muted-foreground">Updated {new Date(item.updatedAt).toLocaleString()} · {item.lastAuthor === 'owner' ? 'Clarift replied' : 'User message'}</p>
      </button>)}
      {cursor && <Button variant="outline" disabled={loading} onClick={() => void list(cursor)}>Load older conversations</Button>}
    </div>}
    {thread && !composing && <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words font-semibold">{thread.subject}</h4><p className="text-sm text-muted-foreground">{thread.category} · {thread.status}</p></div>
        {owner && <Button size="sm" variant="outline" disabled={busy} onClick={() => void status()}>{thread.status === 'open' ? 'Mark resolved' : 'Reopen'}</Button>}</div>
      <ol className="space-y-3" aria-label="Conversation messages">{thread.messages.map(item => <li key={item.id} className={'rounded-lg border p-4 ' + (item.author === 'owner' ? 'border-primary/30 bg-primary/5' : 'bg-muted/30')}>
        <p className="mb-2 text-xs font-semibold">{item.author === 'owner' ? 'Clarift' : owner ? 'User' : 'You'} <span className="font-normal text-muted-foreground">· {new Date(item.createdAt).toLocaleString()}</span></p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.text}</p>
      </li>)}</ol>
    </div>}
    {(composing || thread) && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void send(); }}>
      {composing && <><div className="space-y-1"><Label htmlFor="feedback-category">Type</Label><select id="feedback-category" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value as typeof category)} disabled={busy}><option value="suggestion">Suggestion</option><option value="complaint">Complaint</option></select></div>
        <div className="space-y-1"><Label htmlFor="feedback-subject">Subject</Label><Input id="feedback-subject" value={subject} onChange={event => setSubject(event.target.value)} minLength={3} maxLength={120} required disabled={busy} /></div></>}
      <div className="space-y-1"><Label htmlFor={owner ? 'owner-feedback-message' : 'feedback-message'}>{composing ? 'What would you like to share?' : 'Reply'}</Label>
        <Textarea id={owner ? 'owner-feedback-message' : 'feedback-message'} value={message} onChange={event => setMessage(event.target.value)} rows={4} maxLength={3000} required disabled={busy || (thread?.messages.length ?? 0) >= MAX_THREAD_MESSAGES} />
        <p className="text-xs text-muted-foreground">{message.length}/3,000 characters · Shared privately with {owner ? 'this user' : 'the Clarift owner'}. Avoid passwords and sensitive information.</p></div>
      {(thread?.messages.length ?? 0) >= MAX_THREAD_MESSAGES ? <p className="text-sm text-muted-foreground">This conversation is full. Please start a new one.</p> : <Button type="submit" disabled={busy || !message.trim() || (composing && subject.trim().length < 3)}>{busy ? 'Sending…' : composing ? 'Send feedback' : 'Send reply'}</Button>}
    </form>}
  </section>;
}
export function FeedbackDialog({ open, onOpenChange, threadId }: { open: boolean; onOpenChange: (value: boolean) => void; threadId?: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Suggestions & complaints</DialogTitle><DialogDescription>Private conversations with Clarift, available on every plan.</DialogDescription></DialogHeader>{open && <FeedbackPanel key={threadId ?? 'inbox'} initialThreadId={threadId} />}</DialogContent></Dialog>;
}
