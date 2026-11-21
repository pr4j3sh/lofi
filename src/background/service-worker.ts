import { findSite } from '../sites/site-manager';
import { getSettings } from '../storage/settings';
import { errorMessage, handleMessage, sendMessage } from '../utils/messaging';
import type { EngineStatus, ExtensionMessage, LofiSettings, MessageResponse, StartCapturePayload } from '../types';

const OFFSCREEN_PATH = 'offscreen.html';
const NOT_RUNNING: EngineStatus = { running: false, tabId: null, error: null };
let creatingOffscreen: Promise<void> | null = null;

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

async function updateBadge(tabId: number | null, url?: string): Promise<void> {
  if (tabId === null) return;
  const settings = await getSettings();
  const sessionTabId = await getSessionTabId();
  const hookTabId = await getHookTabId();
  const supported = url ? findSite(url, settings.sites) !== null : false;
  const running = sessionTabId === tabId || hookTabId === tabId;
  const text = running ? '♪' : supported && settings.autoEnable ? '•' : '';
  await chrome.action.setBadgeText({ tabId, text });
  if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#7c6aa4' });
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
      if (active) await setHookTabId(tabId);
      else if ((await getHookTabId()) === tabId) await setHookTabId(null);
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
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void (async () => {
    if (changeInfo.url && (await getHookTabId()) === tabId) {
      // A navigation tears down the injected page context.
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUDIO', settings: await getSettings(), enabled: false });
      } catch {
        // The old context may already be gone.
      }
      await setHookTabId(null);
      broadcastHookStatus(tabId, false, null);
    }
    if (changeInfo.url) await updateBadge(tabId, changeInfo.url);
    else if ((await getSessionTabId()) === tabId || (await getHookTabId()) === tabId) await updateBadge(tabId);
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
