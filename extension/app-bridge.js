/* A narrow, user-operated bridge on Clarift's own pages. No credentials cross it. */
(() => {
  if (globalThis.__clariftAppBridge) return;
  globalThis.__clariftAppBridge = true;
  const origins = ['https://clarift.dpdns.org', 'https://clarift--clarift-e4f6f.us-east4.hosted.app', 'http://localhost:9002'];
  if (!origins.includes(location.origin) || window.top !== window) return;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'clarift-app-request') return;
    const { id, action, tabId } = event.data;
    if (typeof id !== 'string' || id.length > 80 || !['list-tabs', 'open-context'].includes(action)) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'clarift-app', action, tabId });
      window.postMessage({ channel: 'clarift-app-response', id, result }, location.origin);
    } catch { window.postMessage({ channel: 'clarift-app-response', id, result: { ok: false, error: 'Reload the updated Clarift extension and this page.' } }, location.origin); }
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'clarift-deliver-reference') return false;
    if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 120000) { sendResponse({ ok: false, error: 'Use a context pill under 120,000 characters.' }); return false; }
    window.postMessage({ channel: 'clarift-reference', text: message.text, title: String(message.title || 'Chat context').slice(0, 200) }, location.origin);
    sendResponse({ ok: true }); return false;
  });
})();
