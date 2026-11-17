'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { useCommunityApi } from '@/hooks/use-community-api';
import type { NotificationItem, NotificationPage } from '@/lib/community';
import { APP_VERSION } from '@/lib/releases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function NotificationBell({ onOpenFeedback }: { onOpenFeedback: (id: string) => void }) {
  const api = useCommunityApi();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const load = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const result = await api<NotificationPage>('/api/notifications' + (after ? '?cursor=' + encodeURIComponent(after) : ''));
      setItems(previous => after ? [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()] : result.items);
      setUnread(result.unread); setCursor(result.nextCursor); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load notifications.'); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    // Keep an open, paginated inbox stable; refresh automatically when it is closed.
    if (open) return;
    const interval = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [load, open]);
  async function mark(ids: string[]) {
    if (!ids.length) return; setMarking(true);
    try {
      await api('/api/notifications', 'POST', { ids });
      setItems(previous => previous.map(item => ids.includes(item.id) ? { ...item, read: true } : item));
      const result = await api<NotificationPage>('/api/notifications');
      setUnread(result.unread); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update notifications.'); }
    finally { setMarking(false); }
  }
  return <>
    <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label={`Notifications, ${unread} unread`} title={error ? 'Notifications could not refresh' : 'Notifications'}>
      <Bell className="h-5 w-5" />{unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 99 ? '99+' : unread}</span>}
      {error && unread === 0 && <span aria-hidden="true" className="absolute right-0 top-0 text-xs text-destructive">!</span>}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="w-[calc(100vw-2rem)] max-h-[85dvh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Notifications</DialogTitle><DialogDescription>Clarift v{APP_VERSION} · Release updates and private replies.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{unread} unread</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={marking || !items.some(item => !item.read)} onClick={() => void mark(items.filter(item => !item.read).slice(0, 60).map(item => item.id))}>Mark displayed as read</Button><Button size="icon" variant="outline" disabled={loading} onClick={() => void load()} aria-label="Refresh notifications"><RefreshCw className="h-4 w-4" /></Button></div></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
      <ul className="space-y-3">{items.map(item => <li key={item.id} className={'rounded-lg border p-4 ' + (!item.read ? 'border-primary/40 bg-primary/5' : '')}>
        <div className="mb-2 flex flex-wrap gap-2"><Badge variant="outline">{item.kind === 'release' ? 'Release · v' + item.version : 'Reply'}</Badge>{!item.read && <Badge>New</Badge>}</div>
        <h3 className="break-words text-sm font-semibold">{item.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
        <div className="mt-3 flex gap-2">{item.threadId && <Button size="sm" onClick={() => { if (!item.read) void mark([item.id]); setOpen(false); onOpenFeedback(item.threadId!); }}>Open conversation</Button>}
          {!item.read && <Button variant="ghost" size="sm" disabled={marking} onClick={() => void mark([item.id])}>Mark read</Button>}</div>
      </li>)}</ul>
      {!loading && !items.length && !error && <p className="text-sm text-muted-foreground">You’re all caught up.</p>}
      {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>Load older replies</Button>}
    </DialogContent></Dialog>
  </>;
}
