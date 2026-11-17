'use client';
import React, { useState } from 'react';
import { Copy, Search, BookOpen } from 'lucide-react';
import { TECHNIQUE_GUIDE } from '@/lib/technique-guide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TechniqueGuide() {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const entries = TECHNIQUE_GUIDE.filter(entry => [entry.technique, entry.explanation, entry.where, entry.when].join(' ').toLowerCase().includes(search.toLowerCase()));
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setNotice(label + ' copied.'); }
    catch { setNotice('Copy was unavailable. Select and copy the text below.'); }
  }
  return <section className="mx-auto max-w-5xl space-y-6" aria-labelledby="techniques-heading">
    <div className="space-y-2"><div className="flex items-center gap-2 text-primary"><BookOpen className="h-5 w-5" /><span className="text-sm font-medium">Learn with Clarift</span></div>
      <h1 id="techniques-heading" className="text-3xl font-semibold tracking-tight">Prompting techniques</h1>
      <p className="max-w-3xl text-muted-foreground">Choose an approach for the job. Explore all eight techniques in Clarift, see when each helps, and copy a skeleton to adapt to your own task.</p>
    </div>
    <div className="rounded-xl border bg-muted/30 p-4 text-sm"><strong>Start simple.</strong> Try Zero-shot first; add examples for consistency, a role for perspective, or a structured workflow for complex work. Techniques can overlap. Test the result against your goal—no technique guarantees accuracy.</div>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search prompting techniques" placeholder="Search techniques or use cases…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <p role="status" className="text-sm text-muted-foreground">{notice || entries.length + ' techniques'}</p>
    <div className="grid gap-4">
      {entries.map(entry => <details key={entry.id} id={entry.id} className="group scroll-mt-20 rounded-xl border bg-card">
        <summary className="cursor-pointer p-5 font-semibold marker:text-primary">{entry.technique}<span className="mt-1 block pl-4 text-sm font-normal text-muted-foreground">{entry.explanation}</span></summary>
        <div className="space-y-5 border-t p-5">
          <dl className="grid gap-4 md:grid-cols-3">{([['Where', entry.where], ['When', entry.when], ['Why', entry.why]] as const).map(([label, value]) => <div key={label}><dt className="text-sm font-semibold text-primary">{label}</dt><dd className="mt-1 text-sm leading-relaxed">{value}</dd></div>)}</dl>
          <div className="grid gap-4 lg:grid-cols-2">{([['Basic skeleton', entry.skeleton], ['Example prompt', entry.example]] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-muted/40 p-4"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-medium">{label}</h2><Button size="sm" variant="outline" onClick={() => void copy(value, entry.technique + ' ' + label.toLowerCase())} aria-label={'Copy ' + entry.technique + ' ' + label.toLowerCase()}><Copy className="h-3.5 w-3.5" />Copy</Button></div><pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{value}</pre></div>)}</div>
          <p className="text-sm text-muted-foreground"><strong className="text-foreground">Keep in mind: </strong>{entry.limitation}</p>
          <p className="text-xs text-muted-foreground">Learn more: {entry.sources.map(source => <a key={source.url} className="underline underline-offset-4" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</p>
        </div>
      </details>)}
      {!entries.length && <p className="rounded-xl border p-6 text-muted-foreground">No matching techniques. Try “writing,” “planning,” or “examples.”</p>}
    </div>
  </section>;
}
