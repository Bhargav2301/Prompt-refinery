import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { aggregateOwnerAnalytics, readOwnerAnalytics, ownerAnalyticsPeriod, OWNER_ANALYTICS_FIELDS, OWNER_ANALYTICS_EVENT_LIMIT } from '../src/lib/server/owner-analytics';
import { handleOwnerAnalytics } from '../src/lib/server/owner-analytics-request';
import { AuthorizationError, type CurrentUserContext } from '../src/lib/server/user-access';
import { OwnerAnalyticsView } from '../src/components/owner-analytics-panel';
import { GET } from '../src/app/api/admin/analytics/route';

const now = new Date('2026-10-18T12:00:00Z');
const secret = 'synthetic-private-story@example.test';
function event(index = 0) {
  return { tenantId: `personal_synthetic-${index}`, task: 'quick_refine', source: 'app', status: 'succeeded', provider: 'gemma', qualityTier: 'generative', inputTokens: 100, outputTokens: 40, creditsCharged: 3, providerCostUsd: 0.001, latencyMs: 100 + index, createdAt: Timestamp.fromDate(new Date('2026-10-17T12:00:00Z')) };
}
function report(events: unknown[] = []) {
  return aggregateOwnerAnalytics({ events, totalProfiles: 12, newProfiles: 3, days: 7, now, truncated: false });
}

test('owner report computes totals, denominators, percentiles, costs and zero-request days', () => {
  const result = report(Array.from({ length: 5 }, (_, index) => ({ ...event(index), status: index === 4 ? 'failed' : 'succeeded' })));
  assert.deepEqual(result.accounts, { totalProfiles: 12, newProfiles: 3 });
  assert.deepEqual(result.totals, { requests: 5, succeeded: 4, failed: 1, successRate: 80, reportingTenants: 5, creditsCharged: 15, inputTokens: 500, outputTokens: 200, providerCostUsd: 0.005, costKnownRequests: 5, tokenKnownRequests: 5 });
  assert.deepEqual(result.latencyMs, { p50: 102, p95: 104 });
  assert.equal(result.daily.length, 7);
  assert.deepEqual(result.daily[5], { day: '2026-10-17', requests: 5, succeeded: 4, failed: 1 });
  assert.equal(result.daily[0].requests, 0);
  assert.deepEqual(result.breakdowns.tasks, [{ label: 'quick_refine', requests: 5 }]);
  assert.deepEqual(result.breakdowns.providers, [{ label: 'gemma', requests: 5 }]);
});

test('private historical metadata cannot become labels, identifiers, logs or serialized report fields', () => {
  const events = Array.from({ length: 5 }, (_, index) => ({ ...event(index), provider: secret, prompt: secret, email: secret, errorCode: secret, model: secret, attachments: [{ text: secret }], requestId: secret, principalId: secret }));
  const result = report(events);
  assert.equal(result.totals.requests, 5);
  assert.deepEqual(result.breakdowns.providers, [{ label: 'unknown', requests: 5 }]);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).includes('personal_synthetic'));
  assert.doesNotMatch(JSON.stringify(result), /"(?:email|prompt|tenantId|principalId|requestId|model|errorCode)"\s*:/);
});

test('legacy, invalid, future and explicitly marked nonproduction events are excluded with counts', () => {
  const start = ownerAnalyticsPeriod(7, now).from;
  const result = report([
    { ...event(), legacy: true, prompt: secret }, { ...event(), task: secret },
    { ...event(), createdAt: Timestamp.fromDate(now) }, { ...event(), createdAt: Timestamp.fromMillis(start.getTime() - 1) },
    { ...event(), isSynthetic: true }, { ...event(), isInternal: true }, { ...event(), environment: 'staging' },
    { ...event(), createdAt: Timestamp.fromDate(start) },
  ]);
  assert.equal(result.totals.requests, 1);
  assert.equal(result.coverage.legacyExcluded, 1);
  assert.equal(result.coverage.invalid, 3);
  assert.equal(result.coverage.flaggedExcluded, 3);
});

test('private owner sees every aggregate even when a group contains only one workspace', () => {
  const events = Array.from({ length: 5 }, (_, index) => event(index));
  const result = report([...events, { ...event(6), task: 'evaluate', provider: 'openrouter', createdAt: Timestamp.fromDate(new Date('2026-10-16T12:00:00Z')) }]);
  assert.equal(result.totals.requests, 6);
  assert.deepEqual(result.breakdowns.tasks, [{ label: 'quick_refine', requests: 5 }, { label: 'evaluate', requests: 1 }]);
  assert.deepEqual(result.breakdowns.providers, [{ label: 'gemma', requests: 5 }, { label: 'openrouter', requests: 1 }]);
  assert.equal(result.daily.length, 7);
  assert.equal(result.daily.find(day => day.day === '2026-10-16')?.requests, 1);
  assert.equal(result.totals.reportingTenants, 6);
});

test('empty and missing numeric data remain explicit, not invented successes or zero-cost coverage', () => {
  assert.equal(report().totals.successRate, null);
  assert.deepEqual(report().latencyMs, { p50: null, p95: null });
  const result = report([{ ...event(), inputTokens: NaN, outputTokens: -2, providerCostUsd: Infinity }]);
  assert.equal(result.totals.requests, 1);
  assert.equal(result.totals.costKnownRequests, 0);
  assert.equal(result.totals.tokenKnownRequests, 0);
  assert.equal(result.totals.providerCostUsd, 0);
});

test('reader includes all profiles/future accounts, projects metadata, bounds reads and reports truncation', async () => {
  const calls: Array<{ path: string; method: string; args: unknown[] }> = [];
  let totalProfiles = 100;
  const firestore = {
    collection: (path: string) => {
      const filters: unknown[][] = [];
      const query = {
        where: (...args: unknown[]) => { calls.push({ path, method: 'where', args }); filters.push(args); return query; },
        orderBy: (...args: unknown[]) => { calls.push({ path, method: 'orderBy', args }); return query; },
        select: (...args: unknown[]) => { calls.push({ path, method: 'select', args }); return query; },
        limit: (...args: unknown[]) => { calls.push({ path, method: 'limit', args }); return query; },
        count: () => {
          // A Firestore aggregate captures its query; later where() calls must
          // not turn the all-profile count into the new-profile count.
          const count = filters.length ? 2 : totalProfiles;
          return { get: async () => ({ data: () => ({ count }) }) };
        },
        get: async () => ({ size: OWNER_ANALYTICS_EVENT_LIMIT + 1, docs: Array.from({ length: OWNER_ANALYTICS_EVENT_LIMIT + 1 }, (_, index) => ({ data: () => event(index % 5) })) }),
      };
      return query;
    },
  } as unknown as Firestore;
  const dependencies = { getFirestore: () => firestore, now: () => now };
  const first = await readOwnerAnalytics(30, dependencies);
  assert.equal(first.accounts.totalProfiles, 100);
  assert.equal(first.coverage.truncated, true);
  assert.equal(first.coverage.scanned, OWNER_ANALYTICS_EVENT_LIMIT);
  assert.equal(first.totals.requests, OWNER_ANALYTICS_EVENT_LIMIT);
  totalProfiles = 101;
  assert.equal((await readOwnerAnalytics(30, dependencies)).accounts.totalProfiles, 101);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [...OWNER_ANALYTICS_FIELDS]);
  assert.deepEqual(calls.find((call) => call.method === 'limit')?.args, [OWNER_ANALYTICS_EVENT_LIMIT + 1]);
  assert.ok(calls.filter((call) => call.method === 'where').every((call) => call.args[0] === 'createdAt'));
  assert.ok(!OWNER_ANALYTICS_FIELDS.some((field: string) => ['email', 'prompt', 'attachments', 'model', 'errorCode', 'principalId'].includes(field)));
});

function requestFixture(role = 'owner', accountStatus = 'active') {
  const actor = { uid: 'synthetic-owner', role, profile: { accountStatus } } as CurrentUserContext;
  const calls: string[] = [];
  const dependencies = {
    enabled: () => true,
    authenticate: async () => actor,
    rateLimit: async (id: string) => { assert.equal(id, actor.uid); calls.push('limit'); return { allowed: true, retryAfterSeconds: 0 }; },
    read: async () => { calls.push('read'); return report(); },
    audit: async (verified: CurrentUserContext, days: number) => { assert.equal(verified, actor); assert.equal(days, 30); calls.push('audit'); },
  };
  return { dependencies, calls };
}
const request = () => new Request('https://clarift.test/api/admin/analytics');

test('API permits only an active server-verified owner and never queries for other roles', async () => {
  for (const [role, status] of [['user', 'active'], ['support', 'active'], ['admin', 'active'], ['owner', 'disabled'], ['owner', 'suspended'], ['owner', 'deleted_pending']]) {
    const fixture = requestFixture(role, status);
    const response = await handleOwnerAnalytics(request(), fixture.dependencies);
    assert.equal(response.status, 403);
    assert.deepEqual(fixture.calls, []);
    assert.match(response.headers.get('Cache-Control')!, /no-store/);
  }
  const fixture = requestFixture();
  const response = await handleOwnerAnalytics(request(), fixture.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.calls, ['limit', 'read', 'audit']);
  assert.equal((await response.json()).accounts.totalProfiles, 12);
});

test('disabled feature, missing auth, invalid windows and rate limits never read analytics', async () => {
  const fixture = requestFixture();
  assert.equal((await handleOwnerAnalytics(request(), { ...fixture.dependencies, enabled: () => false })).status, 503);
  assert.equal((await handleOwnerAnalytics(request(), { ...fixture.dependencies, authenticate: async () => { throw new AuthorizationError(secret, 401); } })).status, 401);
  for (const days of ['0', '365', 'NaN', '7.5', '30abc']) assert.equal((await handleOwnerAnalytics(new Request(`https://clarift.test/api/admin/analytics?days=${days}`), fixture.dependencies)).status, 400);
  assert.equal((await handleOwnerAnalytics(request(), { ...fixture.dependencies, rateLimit: async () => ({ allowed: false, retryAfterSeconds: 20 }) })).status, 429);
  assert.deepEqual(fixture.calls, []);
});

test('all supported windows use UTC calendar days, and no caller can choose a user cohort', async () => {
  for (const days of [7, 30, 90] as const) {
    const period = ownerAnalyticsPeriod(days, new Date('2026-10-02T01:00:00Z'));
    assert.equal(period.from.getUTCHours(), 0);
    assert.equal((Date.UTC(2026, 9, 2) - period.from.getTime()) / 86400000, days - 1);
    const fixture = requestFixture();
    const response = await handleOwnerAnalytics(new Request(`https://clarift.test/api/admin/analytics?days=${days}&uid=someone-else&role=owner`), {
      ...fixture.dependencies,
      read: async (requested) => { assert.equal(requested, days); return report(); },
      audit: async (_actor, requested) => { assert.equal(requested, days); },
    });
    assert.equal(response.status, 200);
  }
});

test('storage and audit failures expose no private data in API or logs', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const fixture = requestFixture();
  const fail = async () => { throw Object.assign(new Error(secret), { name: secret, cause: secret }); };
  for (const dependencies of [{ ...fixture.dependencies, read: fail }, { ...fixture.dependencies, audit: fail }]) {
    const response = await handleOwnerAnalytics(request(), dependencies);
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes(secret));
  }
  for (const call of warn.mock.calls) assert.deepEqual(call.arguments, ['Owner analytics could not be loaded.']);
});

test('wired GET route rejects an unauthenticated request', async () => {
  assert.equal((await GET(request())).status, 401);
});

test('dashboard renders truthful coverage, accessible tables and single-workspace counts', () => {
  const complete = report(Array.from({ length: 5 }, (_, index) => event(index)));
  const html = renderToStaticMarkup(React.createElement(OwnerAnalyticsView, { report: complete }));
  assert.match(html, /Clarift accounts|Recorded requests/);
  assert.match(html, /caption class="sr-only"/);
  assert.match(html, /cost reported on 5 of 5/);
  assert.match(html, /do not measure adoption, retention/);
  assert.ok(!html.includes(secret));
  const single = renderToStaticMarkup(React.createElement(OwnerAnalyticsView, { report: report([event()]) }));
  assert.match(single, /Website/);
  assert.match(single, /<table/);
  assert.doesNotMatch(single, /hidden until|at least 5|personal_synthetic/i);
  assert.match(renderToStaticMarkup(React.createElement(OwnerAnalyticsView, { report: report() })), /No eligible usage records/);
  assert.match(renderToStaticMarkup(React.createElement(OwnerAnalyticsView, { report: { ...complete, coverage: { ...complete.coverage, truncated: true } } })), /Partial usage totals/);
});

function singleWorkspaceVersions() {
  const revisions = [
    { source: 'app', kind: 'initial', changedParameters: [] },
    { source: 'app', kind: 'redo', changedParameters: ['prompt', 'technique', 'mode', 'maximumLength'] },
    { source: 'app', kind: 'follow_up', changedParameters: ['prompt', 'mode'] },
    { source: 'extension', kind: 'initial', changedParameters: [] },
    { source: 'extension', kind: 'redo', changedParameters: [] },
  ];
  return revisions.map(revision => ({ ...event(), source: revision.source,
    prompt: secret, output: secret, email: secret, principalId: secret,
    refinement: { consentVersion: 1, requested: 'Role / persona', detected: ['Role / persona'], match: 'matched', method: 'structural-signals-v1',
      output: secret, revision: { kind: revision.kind, depth: revision.kind === 'redo' ? 1 : 0, baselineKnown: revision.kind !== 'initial', changedParameters: revision.changedParameters, previousPrompt: secret } },
  }));
}

test('single-workspace API exposes source, redo and change counts while excluding content and identities', async () => {
  const fixture = requestFixture();
  const response = await handleOwnerAnalytics(request(), { ...fixture.dependencies, read: async () => report(singleWorkspaceVersions()) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.deepEqual(result.refinementAnalytics.channels.map((row: { source: string; requests: number }) => [row.source, row.requests]), [['app', 3], ['extension', 2]]);
  const optional = result.refinementAnalytics.optional;
  assert.equal(optional.samples, 5); assert.equal(optional.redos, 2); assert.equal(optional.initial, 2);
  assert.equal(optional.followUps, 1); assert.equal(optional.maxRedoDepth, 1); assert.equal(optional.knownBaselines, 3);
  assert.deepEqual(Object.fromEntries(optional.changes.map((row: { label: string; requests: number }) => [row.label, row.requests])), { mode: 2, prompt: 2, maximumLength: 1, technique: 1 });
  assert.deepEqual(optional.matches, [{ label: 'matched', requests: 5 }]);
  assert.deepEqual(optional.techniques, [{ label: 'Role / persona → Role / persona', requests: 5 }]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(secret)); assert.ok(!serialized.includes('personal_synthetic'));
  assert.doesNotMatch(serialized, /"(?:tenantId|principalId|requestId|email|prompt|output|previousPrompt|attachments)"\s*:/);
  const html = renderToStaticMarkup(React.createElement(OwnerAnalyticsView, { report: result }));
  assert.match(html, /Website/); assert.match(html, /Extension/); assert.match(html, /Redo refinements/);
  assert.match(html, /maximumLength/); assert.doesNotMatch(html, /hidden until|at least 5/i);
  assert.ok(!html.includes(secret)); assert.ok(!html.includes('personal_synthetic'));
});
