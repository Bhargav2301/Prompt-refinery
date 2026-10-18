'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import type { AnalyticsWindowDays, OwnerAnalyticsReport } from '@/lib/owner-analytics';

const count = (value: number) => value.toLocaleString('en-US');
const taskNames: Record<string, string> = { quick_refine: 'Quick Refine', guided_fix: 'Guided Fix', full_council: 'Full Council', evaluate: 'Evaluate', apply_fix: 'Apply fix', convert_document: 'Convert document' };

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="min-w-0 rounded-lg border bg-card p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-2 break-words text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
  </div>;
}

function Breakdown({ title, rows, suppressed, minimum }: { title: string; rows: Array<{ label: string; requests: number }>; suppressed: boolean; minimum: number }) {
  const max = Math.max(1, ...rows.map((row) => row.requests));
  return <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-label={title}>
    <h5 className="text-sm font-semibold">{title}</h5>
    {suppressed ? <p className="text-xs text-muted-foreground">Hidden until every group includes at least {minimum} personal workspaces.</p> : rows.length === 0 ? <p className="text-xs text-muted-foreground">No recorded requests in this period.</p> : <ul className="space-y-3">{rows.map((row) => <li key={row.label}>
      <div className="mb-1 flex justify-between gap-2 text-sm"><span>{taskNames[row.label] ?? row.label}</span><span className="tabular-nums">{count(row.requests)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${row.requests / max * 100}%` }} /></div>
    </li>)}</ul>}
  </section>;
}

export function OwnerAnalyticsView({ report }: { report: OwnerAnalyticsReport }) {
  const { totals, coverage, latencyMs } = report;
  const { channels, channelsSuppressed, optional } = report.refinementAnalytics;
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">{report.period.from.slice(0, 10)} to {report.period.to.slice(0, 10)} · UTC · Today is partial. Updated {new Date(report.generatedAt).toLocaleString()}.</p>
    {coverage.truncated && <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">Partial usage totals: showing the latest {count(coverage.limit)} records. Choose a shorter period for better coverage. Account counts cover all profiles.</p>}
    <div className="grid grid-cols-2 gap-3">
      <Metric label="Clarift accounts" value={count(report.accounts.totalProfiles)} note={`${count(report.accounts.newProfiles)} new in this period`} />
      <Metric label="Recorded requests" value={count(totals.requests)} note={`${count(totals.reportingTenants)} personal workspaces represented`} />
      <Metric label="Successful requests" value={totals.successRate === null ? '—' : `${totals.successRate}%`} note={`${count(totals.succeeded)} of ${count(totals.requests)} requests · ${count(totals.failed)} failed`} />
      <Metric label="Reported provider cost" value={`$${totals.providerCostUsd.toFixed(4)}`} note={`USD · cost reported on ${count(totals.costKnownRequests)} of ${count(totals.requests)} requests`} />
      <Metric label="Credits charged" value={count(totals.creditsCharged)} note="Recorded charges, not wallet balance" />
      <Metric label="Latency · median / p95" value={`${latencyMs.p50 === null ? '—' : count(latencyMs.p50)} / ${latencyMs.p95 === null ? '—' : count(latencyMs.p95)}`} note="Milliseconds per recorded request" />
    </div>
    {totals.requests === 0 && <p role="status" className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No eligible usage records in this period. New accounts and recorded requests appear here on refresh; no beta enrollment list is needed.</p>}
    <section aria-label="Daily requests" className="rounded-lg border p-4">
      <h5 className="mb-3 text-sm font-semibold">Daily requests</h5>
      {coverage.dailySuppressed ? <p className="text-xs text-muted-foreground">Daily details are hidden until every nonempty day includes at least {coverage.minimumGroupTenants} personal workspaces.</p> : <div className="max-h-64 overflow-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">Recorded requests by UTC day, including zero-request days</caption>
          <thead><tr className="border-b"><th scope="col" className="py-2">Day (UTC)</th><th scope="col" className="py-2 text-right">Requests</th><th scope="col" className="py-2 text-right">Succeeded</th><th scope="col" className="py-2 text-right">Failed</th></tr></thead>
          <tbody>{report.daily.map((day) => <tr className="border-b last:border-0" key={day.day}><th scope="row" className="py-2 font-normal">{day.day.slice(5)}</th><td className="text-right">{count(day.requests)}</td><td className="text-right">{count(day.succeeded)}</td><td className="text-right">{count(day.failed)}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>
    <div className="grid gap-3 sm:grid-cols-2">
      <Breakdown title="Requests by task" rows={report.breakdowns.tasks} suppressed={coverage.tasksSuppressed} minimum={coverage.minimumGroupTenants} />
      <Breakdown title="Requests by provider" rows={report.breakdowns.providers} suppressed={coverage.providersSuppressed} minimum={coverage.minimumGroupTenants} />
    </div>
    <section aria-label="Usage by source" className="space-y-3 rounded-lg border p-4">
      <h5 className="text-sm font-semibold">Website, extension and API usage</h5>
      <p className="text-xs text-muted-foreground">Separate accounting for future billing. Existing prices and shared allowances are unchanged. Historical records without a source remain unknown.</p>
      {channelsSuppressed ? <p className="text-xs text-muted-foreground">Source details are hidden until every source includes at least {coverage.minimumGroupTenants} workspaces.</p> : channels.length === 0 ? <p className="text-xs">No source records yet.</p> : <div className="overflow-auto"><table className="w-full text-left text-xs tabular-nums [&_th]:pr-3 [&_td]:pr-3"><caption className="sr-only">Usage and charged credits by source</caption><thead><tr><th scope="col">Source</th><th scope="col">Requests</th><th scope="col">Credits</th><th scope="col">Input / output tokens</th><th scope="col">Reported cost</th></tr></thead><tbody>{channels.map(row => <tr key={row.source} className="border-t"><th scope="row" className="py-3 font-normal">{row.source === 'app' ? 'Website' : row.source === 'api' ? 'API' : row.source === 'extension' ? 'Extension' : 'Unknown'}</th><td>{count(row.requests)}</td><td>{count(row.credits)}</td><td>{count(row.inputTokens)} / {count(row.outputTokens)}</td><td>${row.costUsd.toFixed(4)}</td></tr>)}</tbody></table></div>}
    </section>
    <section aria-label="Optional refinement statistics" className="space-y-3 rounded-lg border p-4">
      <h5 className="text-sm font-semibold">Technique fit and refinement versions</h5>
      <p className="text-xs text-muted-foreground">Opt-in completed refinements only. A structural signal check compares the requested technique with the generated output. It is a heuristic, not verified AI accuracy; techniques can overlap and unrecognized wording is uncertain. Basic mode and unknown-quality outputs are excluded from technique comparisons.</p>
      {optional.suppressed ? <p className="text-xs">Statistics are hidden until at least {coverage.minimumGroupTenants} workspaces contribute.</p> : <>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Shared refinements" value={count(optional.samples)} note={`${count(optional.generativeSamples)} generative · ${count(optional.fallbackSamples)} basic or unknown quality`} />
          <Metric label="Redo refinements" value={count(optional.redos)} note={`${count(optional.initial)} initial · ${count(optional.followUps)} follow-ups; redos do not imply dissatisfaction`} />
          <Metric label="Deepest redo chain" value={count(optional.maxRedoDepth)} note="Successful versions after the original" />
          <Metric label="Comparable versions" value={count(optional.knownBaselines)} note="Versions with prior parameter metadata; older history may lack it" />
        </div>
        {!optional.samples && <p className="text-xs">No shared refinement statistics in this period. Users can opt in from the chat composer or extension settings.</p>}
        <Breakdown title="Technique signal match" rows={optional.matches} suppressed={optional.matchesSuppressed} minimum={coverage.minimumGroupTenants} />
        <Breakdown title="Requested → detected techniques" rows={optional.techniques} suppressed={optional.techniquesSuppressed} minimum={coverage.minimumGroupTenants} />
        <Breakdown title="Changed parameters across versions" rows={optional.changes} suppressed={optional.changesSuppressed} minimum={coverage.minimumGroupTenants} />
      </>}
      <p className="text-xs text-muted-foreground">Website redos use “Refine this version.” Extension redos refine the preceding output again in the same editor or text tool. Edited or replaced extension text starts a new sequence. Counts are observational, not billing inputs. Change counts record names only, never prompt text, files, URLs or setting values.</p>
    </section>
    <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
      <p><strong className="text-foreground">Coverage:</strong> {count(coverage.scanned)} records checked. Excluded: {count(coverage.legacyExcluded)} legacy, {count(coverage.invalid)} invalid or outside the period, and {count(coverage.flaggedExcluded)} explicitly marked internal/test records.</p>
      <p>Reported tokens: {count(totals.inputTokens)} input / {count(totals.outputTokens)} output. Both counts are present on {count(totals.tokenKnownRequests)} of {count(totals.requests)} requests. Missing costs are unknown, not zero-cost requests.</p>
      <p>Account counts include Clarift profiles, including staff accounts; incomplete sign-ups without a profile are not counted. Unmarked staff/test usage may remain. These operational totals do not measure adoption, retention, revenue or user satisfaction.</p>
      <p>This view combines service accounting and explicitly shared refinement statistics. Prompts, outputs, email addresses and user identities are not included in this dashboard.</p>
    </div>
  </div>;
}

export function OwnerAnalyticsPanel() {
  const { user } = useFirebase();
  const [days, setDays] = useState<AnalyticsWindowDays>(30);
  const [revision, setRevision] = useState(0);
  const key = `${user?.uid ?? ''}:${days}:${revision}`;
  const [result, setResult] = useState<{ key: string; report?: OwnerAnalyticsReport; error?: string } | null>(null);
  const current = result?.key === key ? result : null;
  const loading = Boolean(user) && !current;

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        if (!active) return;
        const response = await fetch(`/api/admin/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? 'Owner access is required.' : 'Analytics could not be loaded. Please refresh to try again.');
        const report = await response.json() as OwnerAnalyticsReport;
        if (active) setResult({ key, report });
      } catch {
        if (active) setResult({ key, error: 'Analytics could not be loaded. Check your owner access and refresh to try again.' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [user, days, key]);

  return <section className="space-y-4" aria-label="Owner analytics" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-lg font-semibold">Owner analytics</h4><p className="text-sm text-muted-foreground">Account-wide service usage, reliability and cost.</p></div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="owner-analytics-days">Analytics period</label>
        <select id="owner-analytics-days" className="h-9 rounded-md border bg-background px-2 text-sm" value={days} onChange={(event) => setDays(Number(event.target.value) as AnalyticsWindowDays)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        <Button type="button" variant="outline" size="icon" disabled={loading || !user} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="sr-only">Refresh owner analytics</span></Button>
      </div>
    </div>
    {!user && <p role="status">Sign in with your owner account to view analytics.</p>}
    {loading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading analytics…</p>}
    {current?.error && <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">{current.error}</p>}
    {user && current?.report && <OwnerAnalyticsView report={current.report} />}
  </section>;
}
