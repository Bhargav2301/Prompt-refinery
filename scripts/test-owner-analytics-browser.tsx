// Local rendering check with synthetic data only. No application sign-in or APIs.
// Set CLARIFT_PLAYWRIGHT_MODULE when using a bundled Playwright installation.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { Timestamp } from 'firebase-admin/firestore';
import tailwindConfig from '../tailwind.config';
import { OwnerAnalyticsView } from '../src/components/owner-analytics-panel';
import { observeRefinement } from '../src/lib/refinement-observation';
import { aggregateOwnerAnalytics } from '../src/lib/server/owner-analytics';

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.CLARIFT_PLAYWRIGHT_MODULE || 'playwright');
  const output = resolve('tmp/owner-analytics-preview');
  await mkdir(output, { recursive: true });
  const now = new Date('2026-10-18T12:00:00Z');
  const events = Array.from({ length: 70 }, (_, index) => ({
    tenantId: `personal_synthetic-${index % 10}`, task: index < 35 ? 'quick_refine' : 'evaluate',
    provider: index < 35 ? 'gemma' : 'openrouter', status: index % 9 === 0 ? 'failed' : 'succeeded',
    source: index < 35 ? 'app' : 'extension', qualityTier: 'generative',
    refinement: observeRefinement({ consent: true, requested: 'Role / persona', revision: { kind: 'redo', depth: 2, baselineKnown: true, changedParameters: ['mode', 'technique'] } }, { refinedPrompt: 'Act as an editor. Compare alternative approaches.' }, true),
    creditsCharged: 3, inputTokens: 300, outputTokens: 140, providerCostUsd: 0.001, latencyMs: 120 + index * 70,
    createdAt: Timestamp.fromDate(new Date(`2026-10-${12 + Math.floor(index / 10)}T10:00:00Z`)),
  }));
  const report = aggregateOwnerAnalytics({ events, totalProfiles: 42, newProfiles: 8, days: 7, now, truncated: false });
  const css = await postcss([tailwindcss(tailwindConfig)]).process(await readFile(resolve('src/app/globals.css'), 'utf8'), { from: resolve('src/app/globals.css') });
  const html = `<!doctype html><html lang="en" class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clarift owner analytics — synthetic preview</title><style>${css.css}</style><body class="bg-background text-foreground"><main class="mx-auto max-w-3xl p-4"><h1 class="mb-2 text-xl font-semibold">Owner analytics</h1><p class="mb-4 text-sm text-muted-foreground">Synthetic review fixture · no live user data</p>${renderToStaticMarkup(<OwnerAnalyticsView report={report} />)}</main></body></html>`;
  await writeFile(resolve(output, 'index.html'), html);
  const browser = await chromium.launch({ headless: true, ...(process.env.CLARIFT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLARIFT_CHROMIUM_EXECUTABLE } : {}) });
  try {
    for (const [name, width, height] of [['desktop', 1000, 1100], ['mobile', 390, 844]] as const) {
      const page = await browser.newPage({ viewport: { width, height } });
      // Block every external request even if a future style introduces one.
      await page.route('**/*', (route: { abort(): Promise<void> }) => route.abort());
      await page.setContent(html);
      assert.equal(await page.getByRole('table').count(), 2);
      assert.ok(await page.getByText('Clarift accounts', { exact: true }).isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} overflows horizontally`);
      await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
      await page.close();
    }
    console.log('Owner analytics synthetic rendering passed at 1000px and 390px. Screenshots: tmp/owner-analytics-preview.');
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => { console.error('Synthetic owner analytics rendering failed.', error instanceof Error ? error.message : 'Unknown test error'); process.exitCode = 1; });
