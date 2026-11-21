import { isHookableDomain } from '../sites/hookable-sites';
import { findSite } from '../sites/site-manager';
import { getSettings, settingsForDomain } from '../storage/settings';
import { errorMessage, handleMessage, sendMessage } from '../utils/messaging';
import type { EngineStatus, ExtensionMessage, LofiSettings, MessageResponse, StartCapturePayload } from '../types';

const OFFSCREEN_PATH = 'offscreen.html';
const NOT_RUNNING: EngineStatus = { running: false, tabId: null, error: null };
let creatingOffscreen: Promise<void> | null = null;
const autoEnabling = new Set<number>();

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (contexts.length > 0) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Capture tab audio and process it in real time',
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function toOffscreen<T>(message: ExtensionMessage): Promise<MessageResponse<T>> {
  await ensureOffscreen();
  return sendMessage<T>({ ...message, target: 'offscreen' } as ExtensionMessage);
}

async function getSessionTabId(): Promise<number | null> {
  const session = await chrome.storage.session.get({ tabId: null });
  return typeof session.tabId === 'number' ? session.tabId : null;
}

async function setSessionTabId(tabId: number | null): Promise<void> {
  await chrome.storage.session.set({ tabId });
}

async function getHookTabId(): Promise<number | null> {
  const session = await chrome.storage.session.get({ hookTabId: null });
  return typeof session.hookTabId === 'number' ? session.hookTabId : null;
}

async function setHookTabId(tabId: number | null): Promise<void> {
  await chrome.storage.session.set({ hookTabId: tabId });
}

async function getAutoHookTabId(): Promise<number | null> {
  const session = await chrome.storage.session.get({ autoHookTabId: null });
  return typeof session.autoHookTabId === 'number' ? session.autoHookTabId : null;
}

async function setAutoHookTabId(tabId: number | null): Promise<void> {
  await chrome.storage.session.set({ autoHookTabId: tabId });
}

async function getAutoSuppressedTabId(): Promise<number | null> {
  const session = await chrome.storage.session.get({ autoSuppressedTabId: null });
  return typeof session.autoSuppressedTabId === 'number' ? session.autoSuppressedTabId : null;
}

async function setAutoSuppressedTabId(tabId: number | null): Promise<void> {
  await chrome.storage.session.set({ autoSuppressedTabId: tabId });
}

function broadcastStatus(status: EngineStatus): void {
  void sendMessage({ type: 'STATUS_CHANGED', target: 'popup', payload: status });
}

function broadcastHookStatus(tabId: number, active: boolean, error: string | null): void {
  void sendMessage({ type: 'HOOK_STATUS_CHANGED', target: 'popup', payload: { tabId, active, error } });
}

async function applySettingsToHook(settings: LofiSettings): Promise<void> {
  const tabId = await getHookTabId();
  if (tabId === null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUDIO', settings, enabled: true });
  } catch {
    await setHookTabId(null);
  }
}

async function canReachPageHook(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_STATUS' });
    return response !== undefined && response !== null;
  } catch {
    return false;
  }
}

async function clearHookSession(tabId: number): Promise<void> {
  if ((await getHookTabId()) === tabId) await setHookTabId(null);
  if ((await getAutoHookTabId()) === tabId) await setAutoHookTabId(null);
  if ((await getAutoSuppressedTabId()) === tabId) await setAutoSuppressedTabId(null);
}

async function disableHook(tabId: number, notifyPage = true): Promise<void> {
  if (notifyPage) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUDIO', settings: await getSettings(), enabled: false });
    } catch {
      // The old page context may already be gone.
    }
  }
  await clearHookSession(tabId);
  broadcastHookStatus(tabId, false, null);
  await updateBadge(tabId);
}

async function updateBadge(tabId: number | null, url?: string): Promise<void> {
  if (tabId === null) return;
  const settings = await getSettings();
  const sessionTabId = await getSessionTabId();
  const hookTabId = await getHookTabId();
  const resolvedUrl = url ?? (await chrome.tabs.get(tabId).then((tab) => tab.url).catch(() => undefined));
  const supported = resolvedUrl ? findSite(resolvedUrl, settings.sites) !== null : false;
  const running = sessionTabId === tabId || hookTabId === tabId;
  const text = running ? '♪' : supported && settings.autoEnable ? '•' : '';
  await chrome.action.setBadgeText({ tabId, text });
  if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#7c6aa4' });
}

async function maybeAutoEnableHook(tabId: number, url: string): Promise<void> {
  if (autoEnabling.has(tabId)) return;
  autoEnabling.add(tabId);
  try {
    const settings = await getSettings();
    if (!settings.autoEnable) return;
    const site = findSite(url, settings.sites);
    if (!site || !isHookableDomain(site.domain)) return;

    const captureTabId = await getSessionTabId();
    if (captureTabId !== null && captureTabId !== tabId) return;
    if ((await getAutoSuppressedTabId()) === tabId) return;

    // A stale session entry after a reload must not block re-injection.
    if ((await getHookTabId()) === tabId) {
      if (await canReachPageHook(tabId)) return;
      await setHookTabId(null);
    }

    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page-hook.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['content.js'] });
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'APPLY_AUDIO',
      settings: settingsForDomain(settings, site.domain),
      enabled: true,
    })) as { ok?: boolean } | undefined;
    if (!response?.ok) throw new Error('The page did not confirm audio processing');

    await setHookTabId(tabId);
    await setAutoHookTabId(tabId);
    await setAutoSuppressedTabId(null);
    await updateBadge(tabId, url);
    broadcastHookStatus(tabId, true, null);
  } catch (cause) {
    broadcastHookStatus(tabId, false, errorMessage(cause));
  } finally {
    autoEnabling.delete(tabId);
  }
}

async function refreshActiveTabBadge(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id === 'number') {
    await updateBadge(tab.id, tab.url);
    if (tab.url) await maybeAutoEnableHook(tab.id, tab.url);
  }
}

async function ensureNoConflictingCapture(tabId: number): Promise<void> {
  const captured = await chrome.tabCapture.getCapturedTabs();
  const conflict = captured.find(
    (info) => info.tabId !== tabId && info.status !== 'stopped' && info.status !== 'error',
  );
  if (conflict) throw new Error('Audio capture is already active in another tab. Stop it there first.');
}

async function finishStart(tabId: number, response: MessageResponse<EngineStatus>): Promise<MessageResponse<EngineStatus>> {
  if (response.ok) {
    await setSessionTabId(tabId);
    await updateBadge(tabId);
    if (response.data) broadcastStatus(response.data);
  }
  return response;
}

async function stopCapture(): Promise<MessageResponse<EngineStatus>> {
  const response = await toOffscreen<EngineStatus>({ type: 'STOP_CAPTURE', target: 'offscreen' });
  await setSessionTabId(null);
  if (response.data) broadcastStatus(response.data);
  return response;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse): boolean | undefined => {
  // Page-hook state originates in the isolated content script, which reports
  // its tab through the sender rather than the message body.
  const incoming = message as { type?: string; payload?: { active?: boolean; error?: string | null } };
  if (incoming?.type === 'PAGE_HOOK_STATUS' && typeof sender.tab?.id === 'number') {
    const tabId = sender.tab.id;
    const active = incoming.payload?.active === true;
    const error = incoming.payload?.error ?? null;
    void (async () => {
      if (active) {
        await setHookTabId(tabId);
        if ((await getAutoSuppressedTabId()) === tabId) await setAutoSuppressedTabId(null);
      } else if ((await getHookTabId()) === tabId) {
        await setHookTabId(null);
        if ((await getAutoHookTabId()) === tabId) await setAutoHookTabId(null);
        // A manual off should stay off until the user navigates again.
        if ((await getSettings()).autoEnable) await setAutoSuppressedTabId(tabId);
      }
      await updateBadge(tabId);
      broadcastHookStatus(tabId, active, error);
    })();
    sendResponse({ ok: true });
    return true;
  }

  const handled = handleMessage(message, 'background', async (request: ExtensionMessage): Promise<MessageResponse> => {
    switch (request.type) {
      case 'PING':
        await ensureOffscreen();
        return { ok: true, data: 'pong' };

      case 'GET_STATUS': {
        const tabId = await getSessionTabId();
        if (tabId === null) return { ok: true, data: NOT_RUNNING };
        const response = await toOffscreen<EngineStatus>({ type: 'GET_STATUS', target: 'offscreen' });
        if (!response.ok || !response.data || !response.data.running) {
          await setSessionTabId(null);
          return { ok: true, data: { ...NOT_RUNNING, error: response.data?.error ?? response.error ?? null } };
        }
        return { ok: true, data: response.data };
      }

      case 'REQUEST_CAPTURE': {
        const { tabId, settings } = (request as { payload: { tabId: number; settings: LofiSettings } }).payload;
        try {
          await ensureNoConflictingCapture(tabId);
          // Documented path: service worker obtains the ID after an extension invocation.
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
          const response = await toOffscreen<EngineStatus>({
            type: 'START_CAPTURE',
            target: 'offscreen',
            payload: { tabId, streamId, settings },
          });
          return await finishStart(tabId, response);
        } catch (cause) {
          // Fallback for builds where the service worker has no live user gesture:
          // the popup retries with an ID obtained in its own click handler.
          return { ok: false, error: errorMessage(cause) };
        }
      }

      case 'START_CAPTURE': {
        const payload = (request as { payload: StartCapturePayload }).payload;
        try {
          await ensureNoConflictingCapture(payload.tabId);
        } catch (cause) {
          return { ok: false, error: errorMessage(cause) };
        }
        const response = await toOffscreen<EngineStatus>({ ...request, payload });
        return finishStart(payload.tabId, response);
      }

      case 'STOP_CAPTURE': {
        const tabId = await getSessionTabId();
        const response = await stopCapture();
        if (tabId !== null) await updateBadge(tabId);
        return response;
      }

      case 'UPDATE_SETTINGS': {
        const settings: LofiSettings = await getSettings();
        const response = await toOffscreen({ type: 'APPLY_SETTINGS', target: 'offscreen', payload: { settings } });
        await applySettingsToHook(settings);
        return response;
      }

      case 'STATUS_CHANGED': {
        const status = (request as { payload: EngineStatus }).payload;
        broadcastStatus(status);
        return { ok: true };
      }

      default:
        return { ok: false, error: 'Unsupported background message' };
    }
  });

  if (!handled) return undefined;
  void handled.then(sendResponse);
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    if ((await getSessionTabId()) === tabId) await stopCapture();
    if ((await getHookTabId()) === tabId) {
      await setHookTabId(null);
      broadcastHookStatus(tabId, false, null);
    }
    if ((await getAutoHookTabId()) === tabId) await setAutoHookTabId(null);
    if ((await getAutoSuppressedTabId()) === tabId) await setAutoSuppressedTabId(null);
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void (async () => {
    if (changeInfo.url && (await getHookTabId()) === tabId) {
      // YouTube Music changes the URL when a track changes without reloading
      // the document. Only a real navigation invalidates the injected page.
      const realNavigation = changeInfo.status === 'loading' || changeInfo.status === 'complete';
      const sameDocument = !realNavigation && (await canReachPageHook(tabId));
      if (sameDocument) {
        // Re-apply the hook's stored settings to the new media element.
        await chrome.tabs.sendMessage(tabId, { type: 'REAPPLY_AUDIO' }).catch(() => undefined);
      } else if ((await getSettings()).autoEnable) {
        // Auto-enable owns this tab: keep the logical state on and re-inject on complete.
        await clearHookSession(tabId);
        await updateBadge(tabId, changeInfo.url);
      } else {
        await disableHook(tabId, !realNavigation);
      }
    }
    if (changeInfo.url) await updateBadge(tabId, changeInfo.url);
    else if ((await getSessionTabId()) === tabId || (await getHookTabId()) === tabId) await updateBadge(tabId);

    if (changeInfo.status === 'complete') {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.url) await maybeAutoEnableHook(tabId, tab.url);
    }
  })();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    await updateBadge(tabId, tab?.url);
    if (tab?.url) await maybeAutoEnableHook(tabId, tab.url);
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshActiveTabBadge();
});

chrome.runtime.onInstalled.addListener(() => {
  void refreshActiveTabBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  void (async () => {
    if (area !== 'local') return;
    if ('autoEnable' in changes && changes.autoEnable.newValue === false) {
      const hookTabId = await getHookTabId();
      if (hookTabId !== null && (await getAutoHookTabId()) === hookTabId) {
        await disableHook(hookTabId);
        await setAutoSuppressedTabId(null);
      }
    }
    if ('autoEnable' in changes || 'sites' in changes) await refreshActiveTabBadge();
  })();
});

chrome.tabCapture.onStatusChanged.addListener((info) => {
  void (async () => {
    if (info.tabId !== (await getSessionTabId())) return;
    if (info.status === 'stopped' || info.status === 'error') await stopCapture();
  })();
});

// Surface unexpected background failures instead of leaving a stale "active" state.
self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('lofi background error', errorMessage(event.reason));
});
