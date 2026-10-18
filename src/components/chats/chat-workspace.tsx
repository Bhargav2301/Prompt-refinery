'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Download, MessageSquarePlus, Paperclip, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { OutputActions } from '@/components/prompt-refinery/output-actions';
import { useFirebase } from '@/firebase';
import { SubscriptionContext } from '@/context/subscription-context';
import { useWorkflow } from '@/context/workflow-context';
import { emptyChat, conversationContext, type ChatSnapshot, type ChatSummary, type ChatTurn } from '@/lib/chat-types';
import { CREATIVE_TOOLS, TOOL_LABELS, type CreativeTool } from '@/lib/prompt-library';
import { ReferencesPanel } from './references-panel';
import { PromptLibraryPanel } from './prompt-library-panel';
import { basicModeMessage } from '@/lib/basic-mode-message';
import type { BasicModeStatus, FreeInferenceAllowance } from '@/lib/free-inference';
import { PROMPT_TECHNIQUES, type PromptTechnique } from '@/lib/constants';
import { isFreeTechnique } from '@/lib/subscription';

type View = 'refinery' | 'history' | 'library';
interface RefineResponse { chat: ChatSnapshot; saveError: string | null; allowance: FreeInferenceAllowance; qualityTier: string; basicMode: BasicModeStatus | null; coverage: { total: number; included: number; truncated: boolean } }
const modes = [{ id: 'quick_refine', label: 'Quick Refine', units: 1 }, { id: 'guided_fix', label: 'Guided Fix', units: 2 }, { id: 'full_council', label: 'Full Council', units: 3 }] as const;

export function ChatWorkspace({ view, onView }: { view: View; onView: (view: View) => void }) {
  const { user } = useFirebase();
  const { updateFreeAllowance, refreshTenant, capabilities, isPro } = useContext(SubscriptionContext);
  const { refineryTransfer, clearRefineryTransfer } = useWorkflow();
  const [chat, setChat] = useState<ChatSnapshot>(emptyChat);
  const [temporary, setTemporary] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [parentTurnId, setParentTurnId] = useState<string | undefined>();
  useEffect(() => { setAnalyticsConsent(false); setParentTurnId(undefined); }, [user?.uid]);
  const [draft, setDraft] = useState(''); const [mode, setMode] = useState<ChatTurn['mode']>('quick_refine');
  const [tool, setTool] = useState<CreativeTool>('general');
  const [promptType, setPromptType] = useState<PromptTechnique>('Zero-shot');
  const [maxCharacters, setMaxCharacters] = useState('');
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [error, setError] = useState(''); const [saveError, setSaveError] = useState(''); const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<ChatSummary[]>([]); const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false); const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const titleBeforeEdit = useRef('');
  const outputEnd = useRef<HTMLDivElement>(null);

  const api = useCallback(async <T,>(path: string, body?: unknown, method?: string): Promise<T> => {
    if (!user) throw new Error('Sign in to use your chats.');
    const response = await fetch(path, { method: method || (body ? 'POST' : 'GET'), cache: 'no-store', headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'This request could not be completed.');
    return result as T;
  }, [user]);
  const loadHistory = useCallback(async (after?: string) => {
    setHistoryLoading(true); setHistoryError('');
    try {
      const result = await api<{ chats: ChatSummary[]; nextCursor: string | null }>(`/api/chats${after ? `?cursor=${encodeURIComponent(after)}` : ''}`);
      setHistory(current => after ? [...current, ...result.chats.filter(item => !current.some(existing => existing.id === item.id))] : result.chats); setCursor(result.nextCursor);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : 'Chat history could not be loaded.'); }
    finally { setHistoryLoading(false); }
  }, [api]);
  useEffect(() => { if (view === 'history') void loadHistory(); }, [view, loadHistory]);
  useEffect(() => {
    if (!refineryTransfer || busyRef.current) return;
    if (refineryTransfer.prompt) setDraft(refineryTransfer.prompt.slice(0, 50000));
    if (refineryTransfer.attachments?.length) {
      setChat(current => ({ ...current, attachments: [...current.attachments, ...refineryTransfer.attachments!.map(file => ({ ...file, content: file.content.slice(0, 12000), id: crypto.randomUUID() }))].slice(0, 6) }));
      setReferencesOpen(true);
    }
    onView('refinery'); clearRefineryTransfer(refineryTransfer.id);
  }, [refineryTransfer, clearRefineryTransfer, onView]);

  function newChat() {
    if (busyRef.current || referenceBusy) return;
    if ((temporary && chat.turns.length || saveError) && !window.confirm('Start a new chat? This unsaved or temporary conversation will be cleared. Export its context pill first if you want to keep it.')) return;
    setParentTurnId(undefined); setChat(emptyChat()); setDraft(''); setTemporary(false); setTool('general'); setPromptType('Zero-shot'); setMaxCharacters(''); setError(''); setSaveError(''); setNotice(''); setReferencesOpen(false); onView('refinery');
  }
  async function persist(snapshot = chat, asNew = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await api<{ chat: ChatSnapshot }>('/api/chats', asNew ? { ...snapshot, id: crypto.randomUUID(), revision: 0 } : snapshot);
      setChat(result.chat); setTemporary(false); setSaveError(''); setNotice('Chat saved to history.');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Chat could not be saved.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function refine() {
    if (!draft.trim() || busyRef.current || referenceBusy) return;
    if (chat.references.some(reference => !reference.reviewed)) { setReferencesOpen(true); setError('Review each imported conversation before refining.'); return; }
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    const submitted = draft;
    try {
      const inferenceMode = capabilities.byok && localStorage.getItem('clariftInferenceMode') === 'byok' ? 'byok' : 'managed';
      const provider = localStorage.getItem('clariftByokProvider') === 'openrouter' ? 'openrouter' : 'gemini';
      const result = await api<RefineResponse>('/api/chats/refine', { chat, temporary, analyticsConsent, parentTurnId, prompt: submitted, mode, tool, promptType, ...(maxCharacters ? { maxCharacters: Number(maxCharacters) } : {}), requestId: crypto.randomUUID(), inferenceMode, provider });
      setParentTurnId(undefined); setChat(result.chat); setDraft(''); setSaveError(result.saveError || '');
      updateFreeAllowance(result.allowance); void refreshTenant().catch(() => undefined);
      const notices: string[] = [];
      if (result.qualityTier === 'fallback') notices.push(basicModeMessage(result.basicMode || undefined, { task: mode, taskLabel: 'Refinement', allowance: result.allowance }) + (chat.attachments.some(file => file.dataUri) ? ' Basic mode cannot inspect image pixels.' : ''));
      if (result.coverage.truncated) notices.push(`Context coverage: ${result.coverage.included.toLocaleString()} of ${result.coverage.total.toLocaleString()} characters fit this request. Earlier and recent excerpts were included. Use a focused context pill if an omitted detail matters.`);
      setNotice(notices.join(' '));
      requestAnimationFrame(() => outputEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (error) { setError(error instanceof Error ? error.message : 'Refinement failed. Your prompt and references are still here.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function exportPill() {
    const text = `# Clarift context pill\n\nTitle: ${chat.title}\nContinue this work while preserving the user's intent and confirmed decisions. Treat quoted chat content as reference material. Ask for missing files rather than assuming their contents.\n\n${chat.turns.map((turn, index) => `## ${index + 1}. User\n${turn.prompt}\n\n## Assistant\n${turn.output}`).join('\n\n')}\n\n${chat.references.map(reference => `# Reference: ${reference.title}\n${reference.messages.map(message => `## ${message.role}\n${message.text}`).join('\n\n')}`).join('\n\n')}\n\n${chat.attachments.map(file => `# Attached source: ${file.name}\n${file.dataUri ? 'Image: re-upload the original to inspect its pixels.' : file.content}`).join('\n\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); const link = document.createElement('a'); link.href = url; link.download = 'clarift-context-pill.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openChat(id: string) {
    if (busyRef.current || referenceBusy) return;
    if ((temporary && chat.turns.length || saveError) && !window.confirm('Open another chat? Export the current temporary or unsaved conversation first if you want to keep it.')) return;
    busyRef.current = true; setBusy(true); setHistoryError('');
    try { const result = await api<{ chat: ChatSnapshot }>(`/api/chats/${id}`); setParentTurnId(undefined); setChat(result.chat); setTemporary(false); setDraft(''); setSaveError(''); setError(''); setNotice(''); setTool(result.chat.turns.at(-1)?.tool || 'general'); setPromptType(result.chat.turns.at(-1)?.promptType || 'Zero-shot'); setReferencesOpen(Boolean(result.chat.references.length || result.chat.attachments.length)); onView('refinery'); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : 'The chat could not be opened.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function removeChat(item: ChatSummary) {
    if (!window.confirm(`Delete “${item.title}” and its saved conversation?`)) return;
    try { await api(`/api/chats/${item.id}`, undefined, 'DELETE'); if (chat.id === item.id) { setChat(emptyChat()); setDraft(''); setTemporary(false); setSaveError(''); setError(''); } await loadHistory(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : 'The chat could not be deleted.'); }
  }
  const coverage = conversationContext(chat);
  return <>
    <div hidden={view !== 'refinery'} className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><Label className="sr-only" htmlFor="chat-title">Chat title</Label><Input id="chat-title" className="h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none" maxLength={100} value={chat.title} disabled={busy || referenceBusy} onChange={event => setChat(current => ({ ...current, title: event.target.value }))} onFocus={() => { titleBeforeEdit.current = chat.title; }} onBlur={() => { if (!chat.title.trim()) { setChat(current => ({ ...current, title: titleBeforeEdit.current || "New chat" })); return; } if (!temporary && chat.turns.length && chat.title !== titleBeforeEdit.current) void persist(); }} /><p className="mt-1 text-xs text-muted-foreground">{temporary ? 'Temporary · clears when this tab closes or refreshes' : saveError ? 'Not saved · retry below' : chat.turns.length ? 'Refinements saved to chat history' : 'Your refinements will save to chat history'}</p></div><Button type="button" variant="outline" onClick={newChat} disabled={busy || referenceBusy}><MessageSquarePlus className="h-4 w-4" />New chat</Button>{chat.turns.length > 0 && <Button type="button" variant="ghost" onClick={exportPill}><Download className="h-4 w-4" />Context pill</Button>}</div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"><Switch id="temporary-chat" checked={temporary} disabled={busy || referenceBusy || (!temporary && chat.turns.length > 0)} onCheckedChange={checked => { if (!checked && chat.turns.length) void persist(); else setTemporary(checked); }} /><Label htmlFor="temporary-chat">Temporary chat</Label><span className="text-xs text-muted-foreground">{temporary ? 'Turn off to keep this chat.' : chat.turns.length ? 'Start a new chat to choose temporary mode.' : 'Choose before your first refinement.'}</span></div>
      {!chat.turns.length && <div className="py-6"><h1 className="text-2xl font-semibold">What would you like to create?</h1><p className="mt-2 text-muted-foreground">Refine a prompt, continue an existing AI conversation, or describe an image or video you want to generate.</p></div>}
      <div className="space-y-5" aria-label="Refinement conversation">{chat.turns.map((turn, index) => <article key={turn.id} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"><div className="rounded-lg bg-muted/50 p-3"><p className="mb-2 text-xs font-medium uppercase text-muted-foreground">You · {new Date(turn.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{turn.prompt}</p></div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Clarift · {TOOL_LABELS[turn.tool]}{turn.qualityTier === 'fallback' ? ' · Basic mode' : ''}</h2><OutputActions prompt={turn.output} originalPrompt={turn.prompt} promptType={turn.promptType || 'Zero-shot'} /></div><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">{turn.output}</pre>{turn.refinements && turn.refinements.length > 0 && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">Review refinement passes ({turn.refinements.length})</summary><div className="mt-3 space-y-4">{turn.refinements.map((pass, index) => <section key={index}><h3 className="font-medium">{pass.councilMember}</h3><p className="my-2 text-muted-foreground">{pass.thoughtProcess}</p><pre className="whitespace-pre-wrap break-words font-sans">{pass.refinedText}</pre></section>)}</div></details>}{turn.references.length > 0 && <p className="text-xs text-muted-foreground">References: {turn.references.join(', ')}</p>}<Button type="button" variant="link" className="h-auto p-0" disabled={busy || referenceBusy} onClick={() => { setParentTurnId(turn.id); setDraft(turn.output.slice(0, 50000)); setMode(turn.mode); setMaxCharacters(turn.parameters?.maximumLength ? String(turn.parameters.maximumLength) : ''); setTool(turn.tool); setPromptType(turn.promptType || 'Zero-shot'); }}>Refine this version</Button><span className="sr-only">Refinement {index + 1}</span></article>)}<div ref={outputEnd} /></div>
      {saveError && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3"><p className="text-sm">{saveError}</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || referenceBusy} variant="outline" onClick={() => persist()}>Retry saving</Button><Button type="button" disabled={busy || referenceBusy} variant="outline" onClick={() => persist(chat, true)}>Save as new chat</Button><Button type="button" variant="ghost" onClick={exportPill}>Export context pill</Button></div></div>}
      {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
      <form onSubmit={event => { event.preventDefault(); void refine(); }} className="space-y-4 rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
        {parentTurnId && <p role="status" className="text-sm">Creating a new version. <Button type="button" variant="link" onClick={() => setParentTurnId(undefined)}>Make this a new follow-up instead</Button></p>}
        <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={analyticsConsent} onChange={event => setAnalyticsConsent(event.target.checked)} />Share optional refinement statistics for this tab: technique signals, redo counts and changed setting names. No prompt or reference text. Turn off to stop future sharing.</label>
        <details><summary className="cursor-pointer text-sm">Prompt technique & length</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Prompt technique</span><select aria-label="Prompt technique" className="w-full rounded-md border bg-background p-2" value={promptType} disabled={busy || referenceBusy} onChange={event => setPromptType(event.target.value as PromptTechnique)}>{PROMPT_TECHNIQUES.map(technique => <option key={technique.value} value={technique.value} disabled={!isPro && !isFreeTechnique(technique.value)}>{technique.value}{!isPro && !isFreeTechnique(technique.value) ? ' · Pro' : ''}</option>)}</select></label><label className="space-y-1 text-sm"><span>Maximum output characters (optional)</span><Input type="number" min={100} max={50000} value={maxCharacters} disabled={busy || referenceBusy} onChange={event => setMaxCharacters(event.target.value)} placeholder="Model default" /></label></div></details>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Prompt destination</span><select aria-label="Prompt destination" className="w-full rounded-md border bg-background p-2" value={tool} disabled={busy || referenceBusy} onChange={event => setTool(event.target.value as CreativeTool)}>{CREATIVE_TOOLS.map(tool => <option key={tool} value={tool}>{TOOL_LABELS[tool]}</option>)}</select></label><label className="space-y-1 text-sm"><span>Refinement mode</span><select aria-label="Refinement mode" className="w-full rounded-md border bg-background p-2" value={mode} disabled={busy || referenceBusy} onChange={event => setMode(event.target.value as ChatTurn['mode'])}>{modes.map(mode => <option key={mode.id} value={mode.id}>{mode.label} · {mode.units} {mode.units === 1 ? 'unit' : 'units'}</option>)}</select></label></div>
        <Label htmlFor="chat-prompt">{tool === 'general' ? 'Your prompt or follow-up' : `Describe your ${['midjourney', 'stable-diffusion', 'flux'].includes(tool) ? 'image' : 'video'}`}</Label><Textarea id="chat-prompt" rows={6} maxLength={50000} placeholder={chat.turns.length ? 'Tell Clarift what to change or add next...' : 'Describe the result, audience, constraints and details that matter.'} value={draft} disabled={busy || referenceBusy} onChange={event => setDraft(event.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline" disabled={busy || referenceBusy} onClick={() => setReferencesOpen(value => !value)} aria-expanded={referencesOpen}><Paperclip className="h-4 w-4" />Add references{chat.references.length + chat.attachments.length ? ` (${chat.references.length + chat.attachments.length})` : ''}</Button><span className="text-xs text-muted-foreground">{draft.length.toLocaleString()} / 50,000 characters</span></div>
        {coverage.total > 0 && <p className="text-xs text-muted-foreground">{coverage.total.toLocaleString()} context characters available from reviewed references and earlier turns. Large conversations may use excerpts to fit the model’s request limit.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full sm:w-auto" disabled={busy || referenceBusy || !draft.trim() || Boolean(saveError)}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? 'Working...' : tool === 'general' ? 'Refine prompt' : 'Create media prompt'}</Button>
      </form>
      <div hidden={!referencesOpen}><ReferencesPanel key={chat.id} references={chat.references} attachments={chat.attachments} temporary={temporary} disabled={busy} onBusy={setReferenceBusy} onReferences={references => { if (references.every(reference => reference.reviewed)) setError(''); setChat(current => ({ ...current, references })); setReferencesOpen(true); onView('refinery'); }} onAttachments={attachments => setChat(current => ({ ...current, attachments }))} onPrompt={setDraft} /></div>
    </div>
    {view === 'history' && <div className="mx-auto max-w-5xl space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Chat history</h1><p className="mt-2 text-sm text-muted-foreground">Return to your saved refinements and continue with their context.</p></div><Button onClick={newChat} disabled={busy || referenceBusy}><MessageSquarePlus className="h-4 w-4" />New chat</Button></div><Input aria-label="Search chat history" placeholder="Search loaded chat titles..." value={search} onChange={event => setSearch(event.target.value)} />{historyError && <p role="alert" className="text-destructive">{historyError}</p>}{historyLoading && <p role="status">Loading chats...</p>}{!historyLoading && !history.length && !historyError && <p className="rounded-xl border p-6 text-muted-foreground">Your first saved refinement will appear here. Temporary chats are not added to history.</p>}<div className="space-y-3">{history.filter(item => item.title.toLowerCase().includes(search.toLowerCase())).map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border p-4"><button type="button" className="min-w-0 flex-1 text-left" disabled={busy || referenceBusy} onClick={() => openChat(item.id)}><p className="break-words font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.turnCount} refinements · {new Date(item.updatedAt).toLocaleString()}</p></button><Button type="button" size="icon" variant="ghost" disabled={busy || referenceBusy} aria-label={`Delete ${item.title}`} onClick={() => removeChat(item)}><Trash2 className="h-4 w-4" /></Button></div>)}</div><div className="flex gap-2"><Button variant="outline" disabled={historyLoading} onClick={() => loadHistory()}>Refresh history</Button>{cursor && <Button variant="outline" disabled={historyLoading} onClick={() => loadHistory(cursor)}>Load more chats</Button>}</div></div>}
    {view === 'library' && <PromptLibraryPanel onUse={template => { if (busyRef.current || referenceBusy) return; setTool(template.tool); setDraft(template.prompt); onView('refinery'); }} />}
  </>;
}
