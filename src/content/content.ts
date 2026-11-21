/** Isolated-world bridge between extension messaging and the page's audio hook. */
(() => {
  interface ContentMarker {
    cleanup: () => void;
  }

  type ContentScope = Window & { __lofiContent?: ContentMarker };

  const scope = window as ContentScope;
  const CHANNEL = 'LOFI_AUDIO';
  let state = { active: false, error: null as string | null };

  function canUseRuntime(): boolean {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function cleanup(): void {
    window.removeEventListener('message', onWindowMessage);
    try {
      if (canUseRuntime()) chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    } catch {
      // The runtime may already be gone; nothing useful can be removed.
    }
    if (scope.__lofiContent?.cleanup === cleanup) delete scope.__lofiContent;
  }

  function forwardStatus(): void {
    if (!canUseRuntime()) {
      cleanup();
      return;
    }
    try {
      void chrome.runtime.sendMessage({ type: 'PAGE_HOOK_STATUS', payload: state }).catch(() => undefined);
    } catch {
      cleanup();
    }
  }

  function onWindowMessage(event: MessageEvent): void {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'STATE') return;
    state = { active: event.data.active === true, error: event.data.error ?? null };
    forwardStatus();
  }

  function onRuntimeMessage(
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | undefined {
    if (!canUseRuntime()) {
      cleanup();
      return undefined;
    }

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
  }

  const previous = scope.__lofiContent;
  if (previous) {
    if (canUseRuntime()) return;
    const previousCleanup = (previous as { cleanup?: unknown }).cleanup;
    if (typeof previousCleanup === 'function') {
      try {
        previousCleanup();
      } catch {
        // Old content scripts may not expose a cleanup function.
      }
    }
    delete scope.__lofiContent;
  }

  scope.__lofiContent = { cleanup };
  window.addEventListener('message', onWindowMessage);

  try {
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  } catch {
    cleanup();
    return;
  }

  window.postMessage({ channel: CHANNEL, type: 'GET_STATE' }, '*');
})();
