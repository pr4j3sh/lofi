/** Isolated-world bridge between extension messaging and the page's audio hook. */
(() => {
  const scope = window as unknown as Record<string, unknown>;
  if (scope.__lofiContent) return;
  scope.__lofiContent = true;

  const CHANNEL = 'LOFI_AUDIO';
  let state = { active: false, error: null as string | null };

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'STATE') return;
    state = { active: event.data.active === true, error: event.data.error ?? null };
    void chrome.runtime.sendMessage({ type: 'PAGE_HOOK_STATUS', payload: state }).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const request = message as { type?: string; settings?: unknown; enabled?: boolean };
    if (request.type === 'APPLY_AUDIO') {
      window.postMessage(
        { channel: CHANNEL, type: 'APPLY', settings: request.settings, enabled: request.enabled === true },
        '*',
      );
      sendResponse({ ok: true });
      return true;
    }
    if (request.type === 'REAPPLY_AUDIO') {
      window.postMessage({ channel: CHANNEL, type: 'REAPPLY' }, '*');
      sendResponse({ ok: true });
      return true;
    }
    if (request.type === 'GET_PAGE_STATUS') {
      window.postMessage({ channel: CHANNEL, type: 'GET_STATE' }, '*');
      sendResponse({ ...state });
      return true;
    }
    return undefined;
  });

  window.postMessage({ channel: CHANNEL, type: 'GET_STATE' }, '*');
})();
