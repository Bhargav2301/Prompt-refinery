export interface OpenChatTab { id: number; title: string; provider: string }
export async function extensionRequest(action: 'list-tabs' | 'open-context', tabId?: number): Promise<{ ok: boolean; tabs?: OpenChatTab[]; error?: string }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Install or update the Clarift extension in Settings, then reload this page. You can also paste a context pill below.')); }, 4000);
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'clarift-app-response' || event.data.id !== id) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data.result);
    }
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'clarift-app-request', id, action, tabId }, location.origin);
  });
}
