// Real React screens; synthetic auth/API responses. No customer data or paid inference.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CLARIFT_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const user = `const user = { email: 'synthetic@example.test', emailVerified: false, providerData: [{providerId:'password'}], getIdToken: async () => 'synthetic-token' }; export const useFirebase = () => ({ user }); export const useAuth = () => ({});`;
const mocks = {
  '@/firebase': user,
  '@/firebase/non-blocking-login': `export async function initiateEmailSignUp() { window.authCalls.push('signup'); return {user:{getIdToken:async()=> 'synthetic-token'}}; } export async function initiateEmailSignIn() {} export async function initiateGoogleSignIn() {} `,
  '@/hooks/use-toast': `export const useToast = () => ({toast: value => window.testToasts.push(value)});`,
  '@/context/subscription-context': `import { createContext } from 'react'; export const SubscriptionContext = createContext({ refreshTenant: async () => {}, updateFreeAllowance: () => {}, capabilities: { byok: false } });`,
  '@/context/workflow-context': `const state = { refineryTransfer: null, clearRefineryTransfer: () => {} }; export const useWorkflow = () => state;`,
  '@/components/settings-dialog': `export const SettingsDialog = () => null;`,
  '@/components/theme-toggle': `export const ThemeToggle = () => null;`,
  'firebase/auth': `export const getAuth = () => ({}); export const signOut = async () => {}; export const EmailAuthProvider = { credential: (email, password) => ({email,password}) }; export async function reauthenticateWithCredential(user, credential) { window.authCalls.push('reauth'); if (credential.password !== 'Old-Password-123') throw {code:'auth/invalid-credential'}; } export async function updatePassword() { window.authCalls.push('update'); } export async function reload() {} export async function sendEmailVerification() { window.authCalls.push('verification-email'); } export async function verifyPasswordResetCode(auth, code) { if (code !== 'valid-code') throw {code:'auth/invalid-action-code'}; return 'synthetic@example.test'; } export async function confirmPasswordReset(auth, code, password) { window.authCalls.push('reset'); } export async function applyActionCode() {} export async function checkActionCode() { return {data:{email:'synthetic@example.test'}}; }`,
};
const bundle = await build({ absWorkingDir: root, stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ChatWorkspace} from '@/components/chats/chat-workspace';import {WorkspaceShell} from '@/components/workspace-v2/workspace-shell';import {LoginPage} from '@/components/auth/login-page';import {EmailActionPage} from '@/components/auth/email-action-page';import {AccountSecurityPanel} from '@/components/auth/account-security-panel';function App(){const [view,setView]=useState('refinery');if(location.pathname==='/login-test')return <LoginPage/>;if(location.pathname==='/auth/action')return <EmailActionPage/>;if(location.pathname==='/settings-test')return <AccountSecurityPanel/>;return <WorkspaceShell activeDestination={view} onDestinationChange={setView} isPro={true} planLabel="Pro" savedPromptCount={0} savedPromptLimit={null} dailyUnits={null} monthlyUnits={null} availableCredits={100} reservedCredits={0} showAccountControls={false}><ChatWorkspace view={view} onView={setView}/></WorkspaceShell>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}'  }, plugins: [{ name: 'synthetic-boundaries', setup(builder) { builder.onResolve({ filter: /^(?:@\/|firebase\/auth$)/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], resolveDir: root, loader: 'js' })); } }] });
const css = await postcss([tailwind(loadConfig(resolve(root, 'tailwind.config.ts')))]).process(await readFile(resolve(root, 'src/app/globals.css'), 'utf8'), { from: undefined });
const store = new Map(); const requests = []; let saveFailure = false;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (/^\/(?:images|brand|logos|fonts)\/[a-zA-Z0-9_./-]+$/.test(url.pathname) && !url.pathname.includes('..')) {
    try { const file = await readFile(resolve(root, 'public', url.pathname.slice(1))); response.setHeader('Content-Type', url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png'); response.end(file); return; } catch { response.writeHead(404).end(); return; }
  }
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    response.setHeader('Content-Type', 'application/json');
    const json = value => response.end(JSON.stringify(value));
    if (url.pathname === '/api/chats/refine') {
      requests.push(body); const chat = { ...body.chat, title: body.chat.turns.length ? body.chat.title : body.prompt.split(' ').slice(0, 8).join(' '), turns: [...body.chat.turns, { id: body.requestId, prompt: body.prompt, output: `Refined: ${body.prompt}`, createdAt: new Date().toISOString(), mode: body.mode, tool: body.tool, references: body.chat.references.map(reference => reference.title) }] };
      if (!body.temporary && !saveFailure) { chat.revision++; store.set(chat.id, chat); }
      return json({ chat, saveError: saveFailure ? 'History unavailable. Retry saving.' : null, qualityTier: 'managed', coverage: { total: 100, included: 100, truncated: false }, allowance: null });
    }
    if (url.pathname === '/api/chats' && request.method === 'POST') { body.revision++; store.set(body.id, body); return json({ chat: body }); }
    if (url.pathname === '/api/chats') return json({ chats: [...store.values()].map(chat => ({ id: chat.id, title: chat.title, revision: chat.revision, turnCount: chat.turns.length, updatedAt: new Date().toISOString() })), nextCursor: null });
    const id = url.pathname.split('/').at(-1);
    if (request.method === 'DELETE') { store.delete(id); return json({ ok: true }); }
    return json({ chat: store.get(id) });
  }
  response.setHeader('Content-Type', url.pathname === '/app.js' ? 'text/javascript' : url.pathname === '/app.css' ? 'text/css' : 'text/html');
  response.end(url.pathname === '/app.js' ? bundle.outputFiles[0].text : url.pathname === '/app.css' ? css.css : '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root, 'tmp/chat-workspace'), { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CLARIFT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CLARIFT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); }); page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => { window.authCalls = []; window.testToasts = []; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(base);
  const prompt = page.getByLabel('Your prompt or follow-up');
  await prompt.fill('Write a story about a lighthouse'); await page.getByRole('button', { name: 'Refine prompt', exact: true }).click();
  await page.getByText('Refined: Write a story about a lighthouse', { exact: true }).waitFor(); assert.equal(store.size, 1);
  await prompt.fill('Make the ending hopeful'); await page.getByRole('button', { name: 'Refine prompt', exact: true }).click();
  await page.getByText('Refined: Make the ending hopeful', { exact: true }).waitFor(); assert.equal(requests.at(-1).chat.turns.length, 1);
  const nav = page.getByTestId('workspace-mobile-nav');
  await nav.getByRole('button', { name: 'History', exact: true }).click(); await page.getByRole('button', { name: /Write a story about a lighthouse.*refinements/ }).click();
  assert.equal(await page.getByText('Refined: Make the ending hopeful', { exact: true }).count(), 1);
  console.log('PASS saved history, automatic title, reopen and follow-up context');
  saveFailure = true;
  await prompt.fill('Preserve my output when storage fails'); await page.getByRole('button', { name: 'Refine prompt', exact: true }).click();
  await page.getByText('Refined: Preserve my output when storage fails', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click(); await page.getByText('Chat saved to history.', { exact: true }).waitFor();
  assert.equal([...store.values()][0].turns.length, 3); saveFailure = false;
  console.log('PASS storage failure preserves the result and retry saves the complete conversation');
  await page.getByRole('button', { name: 'New chat', exact: true }).click(); await page.getByRole('switch', { name: 'Temporary chat' }).click();
  await prompt.fill('Temporary secret draft'); await page.getByRole('button', { name: 'Refine prompt', exact: true }).click(); await page.getByText('Refined: Temporary secret draft', { exact: true }).waitFor();
  assert.equal(requests.at(-1).temporary, true); assert.equal(store.size, 1);
  await page.reload(); assert.equal(await page.getByText('Refined: Temporary secret draft', { exact: true }).count(), 0); assert.equal(store.size, 1);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('Temporary secret')), false);
  console.log('PASS temporary chat stays out of storage and clears on refresh');
  await page.getByRole('button', { name: 'Add references', exact: true }).click();
  await page.getByText('Paste or upload a transcript / context pill', { exact: true }).click();
  await page.getByLabel('Chat transcript or context pill').fill('[1 · user]\nUse outline.md and the attached image to write a scene.\n[2 · assistant]\nKeep the lighthouse setting.');
  await page.getByRole('button', { name: 'Import transcript', exact: true }).click();
  await page.getByLabel('Select the exact prompt to refine').selectOption('message-1');
  assert.match(await prompt.inputValue(), /outline.md/); await page.getByText('Unnamed image', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refine prompt', exact: true }).click(); await page.getByText('Review each imported conversation before refining.', { exact: true }).waitFor();
  await page.getByLabel('Upload documents or images').setInputFiles({ name: 'outline.md', mimeType: 'text/markdown', buffer: Buffer.from('A lighthouse keeper reunites with her sister.') });
  await page.getByLabel(/I reviewed this context/).check();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow on mobile');
  await page.screenshot({ path: resolve(root, 'tmp/chat-workspace/mobile-references.png'), fullPage: true });
  await page.getByRole('button', { name: 'Refine prompt', exact: true }).click(); await page.getByText('Refined: Use outline.md and the attached image to write a scene.', { exact: true }).waitFor();
  assert.equal(requests.at(-1).chat.references[0].selectedMessageId, 'message-1'); assert.equal(requests.at(-1).chat.references[0].reviewed, true); assert.match(requests.at(-1).chat.attachments[0].content, /sister/);
  console.log('PASS exact prompt selection, missing attachment messages, review gate and supplied context');
  await nav.getByRole('button', { name: 'Prompt library', exact: true }).click(); await page.getByLabel('Filter by AI tool').selectOption('veo');
  assert.equal(await page.getByRole('button', { name: 'Use in chat', exact: true }).count(), 4);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: resolve(root, 'tmp/chat-workspace/desktop-library.png'), fullPage: true });
  await page.getByRole('button', { name: 'Use in chat', exact: true }).first().click(); assert.equal(await page.getByLabel('Prompt destination', { exact: true }).inputValue(), 'veo');
  await page.getByRole('button', { name: 'Create media prompt', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('article').length >= 2); assert.equal(requests.at(-1).tool, 'veo');
  console.log('PASS tool-specific library to media-prompt conversation');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.evaluate(() => window.postMessage({ channel: 'clarift-reference', text: '[1 · user]\nA new reference from my open tab', title: 'Open-tab context pill' }, location.origin));
  await page.getByText('Open-tab context pill', { exact: true }).waitFor();
  console.log('PASS extension pill delivery reaches the review screen');
  await page.goto(`${base}/auth/action?mode=resetPassword&oobCode=valid-code&apiKey=ignored`);
  await page.getByLabel('New password', { exact: true }).fill('New-Password-456'); await page.getByLabel('Confirm new password', { exact: true }).fill('Different-Password');
  await page.getByRole('button', { name: 'Save new password', exact: true }).click(); await page.getByText('The passwords do not match.', { exact: true }).waitFor(); assert.deepEqual(await page.evaluate(() => window.authCalls), []);
  await page.getByLabel('Confirm new password', { exact: true }).fill('New-Password-456'); await page.getByRole('button', { name: 'Save new password', exact: true }).click(); await page.getByText('Account updated', { exact: true }).waitFor(); assert.equal(page.url(), `${base}/auth/action`);
  await page.goto(`${base}/settings-test`); await page.getByLabel('Old password', { exact: true }).fill('Wrong-Password-123'); await page.getByLabel('New password', { exact: true }).fill('New-Password-456'); await page.getByLabel('Confirm new password', { exact: true }).fill('New-Password-456');
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await page.getByRole('alert').waitFor(); assert.deepEqual(await page.evaluate(() => window.authCalls), ['reauth']);
  await page.getByLabel('Old password', { exact: true }).fill('Old-Password-123'); await page.getByRole('button', { name: 'Change password', exact: true }).click(); await page.getByText('Your password has been changed.', { exact: true }).waitFor();
  console.log('PASS reset form confirmation, action-code removal and old-password reauthentication UI');
  await page.goto(`${base}/login-test`); await page.getByRole('tab', { name: 'Sign Up', exact: true }).click();
  const signup = page.getByRole('tabpanel');
  await signup.locator('input[name=email]').fill('new-user@example.test'); await signup.locator('input[name=password]').fill('Signup-Password-123');
  await signup.getByLabel('Confirm password', { exact: true }).fill('Mismatch'); await signup.getByRole('button', {name:'Sign Up', exact:true}).click();
  await page.getByText('The passwords do not match.', {exact:true}).waitFor(); assert.deepEqual(await page.evaluate(() => window.authCalls), []);
  await signup.getByLabel('Confirm password', { exact: true }).fill('Signup-Password-123'); await signup.getByRole('button', {name:'Sign Up', exact:true}).click();
  await page.waitForFunction(() => window.authCalls.includes('verification-email')); assert.deepEqual(await page.evaluate(() => window.authCalls), ['signup', 'verification-email']);
  assert.equal(await signup.getByRole('link', {name:'Already have an account? Reset your password'}).count(), 1);
  console.log('PASS signup confirmation and first-signup verification email request');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
