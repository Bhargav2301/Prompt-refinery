// Exercise the real composer and output controls with synthetic auth/actions only.
// No customer data, Firebase writes, or paid model requests are used.
// As with test-extension-browser.mjs, configure Playwright/Chromium via environment.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CLARIFT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const mocks = {
  '@/firebase': `
    const user = { getIdToken: async () => 'synthetic-token' };
    const empty = [];
    export const useFirebase = () => ({ user, firestore: null });
    export const useMemoFirebase = () => null;
    export const useCollection = () => ({ data: empty });`,
  '@/context/subscription-context': `
    import { createContext } from 'react';
    export const SubscriptionContext = createContext({
      isPro: true, savedPromptCount: 0, savedPromptLimit: null,
      freeTaskUnits: 20, freeAllowance: null, usesFreeManagedInference: false,
      refreshTenant: async () => {}, updateFreeAllowance: () => {},
      capabilities: { inference: 'managed', byok: false }
    });`,
  '@/context/workflow-context': `
    const state = { refineryTransfer: null, clearRefineryTransfer: () => {} };
    export const useWorkflow = () => state;`,
  '@/hooks/use-toast': `
    const toast = (value) => window.testToasts.push(value);
    export const useToast = () => ({ toast });`,
  '@/app/actions': `
    export async function refinePromptAction(data) {
      window.testRefinements.push(data);
      return { refinedPrompt: 'Completed lighthouse refinement', refinements: [] };
    }
    export async function getTokenCountsAction() {
      return { gemini: 10, openai: 10, deepseek: 10, qwen: 10 };
    }`,
  '@/app/subscription-actions': `
    export async function savePromptAction(data) {
      window.testSaves.push(data);
      if (window.testSaveMode === 'pending') return new Promise(resolve => { window.finishSave = resolve; });
      if (window.testSaveMode === 'quota') return { ok: false, code: 'limit_reached', message: 'Delete an older prompt or upgrade to Pro, then try again.' };
      if (window.testSaveMode === 'offline') throw new Error('Server Components render private diagnostic');
      return { ok: true, id: 'synthetic-save' };
    }`,
  '@/app/project-actions': `export async function addProjectSessionAction() { throw new Error('Unexpected project write'); }`,
};
const bundle = await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { RefineryTab } from '@/components/prompt-refinery/refinery-tab'; createRoot(document.getElementById('root')).render(<RefineryTab selectedProject={null} variant="workspace-v2" />);`,
    resolveDir: root, loader: 'tsx',
  },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'synthetic-boundaries', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], resolveDir: root, loader: 'js' }));
  } }],
});
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/app.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CLARIFT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLARIFT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => { window.testToasts = []; window.testSaves = []; window.testRefinements = []; });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const composer = page.getByPlaceholder('Describe the result you need, the audience, constraints, and preferred format.');
  const original = 'Write a story about a lighthouse and a lost sailor.';
  await composer.fill(original);
  await page.getByRole('button', { name: /^Refine ·/ }).click();
  const save = page.getByRole('button', { name: 'Save Prompt', exact: true });
  await save.waitFor();
  await page.getByRole('button', { name: 'Clear prompt', exact: true }).click();
  assert.equal(await composer.inputValue(), '');
  await save.click();
  await page.waitForFunction(() => window.testToasts.some(toast => toast.title === 'Prompt Saved!'));
  let saved = await page.evaluate(() => window.testSaves[0].prompt);
  assert.equal(saved.originalPrompt, original);
  assert.equal(saved.refinedPrompt, 'Completed lighthouse refinement');
  assert.equal(saved.promptType, 'Zero-shot');
  assert.equal(saved.versions[0].rawPrompt, original);
  console.log('PASS mobile composer: refine, clear input, save completed result');

  await composer.fill('A completely different draft that has not been refined.');
  await page.getByRole('radio', { name: /Few-shot/ }).first().click();
  await page.evaluate(() => { window.testSaveMode = 'pending'; });
  await save.evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => window.testSaves.length === 2);
  assert.equal(await page.getByRole('button', { name: 'Saving...', exact: true }).isDisabled(), true);
  saved = await page.evaluate(() => window.testSaves[1].prompt);
  assert.equal(saved.originalPrompt, original);
  assert.equal(saved.promptType, 'Zero-shot');
  await page.evaluate(() => window.finishSave({ ok: true, id: 'synthetic-save-2' }));
  await save.waitFor();
  assert.equal(await page.evaluate(() => window.testSaves.length), 2);
  console.log('PASS edited draft/technique do not replace completed result; double-tap sends one request');

  await page.evaluate(() => { window.testSaveMode = 'quota'; window.testToasts = []; });
  await save.click();
  await page.waitForFunction(() => window.testToasts.length > 0);
  assert.equal(await page.evaluate(() => window.testToasts.at(-1).title), 'Saved Prompt Limit Reached');
  assert.equal(await save.isEnabled(), true);
  await page.evaluate(() => { window.testSaveMode = 'offline'; window.testToasts = []; });
  await save.click();
  await page.waitForFunction(() => window.testToasts.length > 0);
  const toasts = await page.evaluate(() => window.testToasts);
  assert.equal(toasts[0].title, 'Could Not Save Prompt');
  assert.match(toasts[0].description, /connection/);
  assert.doesNotMatch(JSON.stringify(toasts), /Server Components|private diagnostic|Prompt Saved!/);
  assert.equal(await page.locator('pre code').first().textContent(), 'Completed lighthouse refinement');
  assert.deepEqual(errors, []);
  console.log('PASS save failures stay actionable, preserve output, and allow retry');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
