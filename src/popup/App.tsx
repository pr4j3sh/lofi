import { useEffect, useRef, useState } from 'react';
import RangeSlider from '../components/RangeSlider';
import SiteIcon from '../components/SiteIcon';
import ErrorBanner from './components/ErrorBanner';
import PresetPicker from './components/PresetPicker';
import SettingsIcon from './components/SettingsIcon';
import { hasPageHookPermission } from '../sites/page-hook';
import { findSite } from '../sites/site-manager';
import { DEFAULT_SETTINGS, PRESETS, SPEED_MAX, SPEED_MIN } from '../storage/defaults';
import { getSettings, settingsForDomain, updateSettings } from '../storage/settings';
import { errorMessage, sendMessage } from '../utils/messaging';
import { isExtensionMessage, type EngineStatus, type LofiSettings } from '../types';

const IDLE_STATUS: EngineStatus = { running: false, tabId: null, error: null };

function isDefaultSettings(settings: LofiSettings): boolean {
  return (
    Math.abs(settings.playbackSpeed - DEFAULT_SETTINGS.playbackSpeed) < 0.001 &&
    Math.abs(settings.reverbMix - DEFAULT_SETTINGS.reverbMix) < 0.001 &&
    Math.abs(settings.bassGain - DEFAULT_SETTINGS.bassGain) < 0.001 &&
    Math.abs(settings.trebleGain - DEFAULT_SETTINGS.trebleGain) < 0.001 &&
    settings.selectedPreset === DEFAULT_SETTINGS.selectedPreset
  );
}

export default function App() {
  const [settings, setSettings] = useState<LofiSettings | null>(null);
  const [status, setStatus] = useState<EngineStatus>(IDLE_STATUS);
  const [siteName, setSiteName] = useState('Checking website…');
  const [supported, setSupported] = useState(false);
  const [hookable, setHookable] = useState(false);
  const [hookActive, setHookActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTabId = useRef<number | null>(null);
  const activeDomain = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // PING warms the offscreen document so the one-time stream ID is consumed immediately.
        const [loaded, statusResponse] = await Promise.all([
          getSettings(),
          sendMessage<EngineStatus>({ type: 'GET_STATUS', target: 'background' }),
          sendMessage({ type: 'PING', target: 'background' }),
        ]);
        if (statusResponse.ok && statusResponse.data) setStatus(statusResponse.data);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabId.current = tab?.id ?? null;
        const site = tab?.url ? findSite(tab.url, loaded.sites) : null;
        activeDomain.current = site?.domain ?? null;
        const canUseHook = site && site.domain !== 'self' ? await hasPageHookPermission(site.domain) : false;
        setHookable(canUseHook);
        setSupported(site !== null);
        setSiteName(site?.name ?? (tab?.url ? 'Unsupported website' : 'Unknown website'));
        setSettings(settingsForDomain(loaded, activeDomain.current));

        if (canUseHook && typeof tab?.id === 'number') {
          const pageStatus = (await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' }).catch(() => null)) as
            | { active?: boolean; error?: string | null }
            | null;
          if (pageStatus) {
            setHookActive(pageStatus.active === true);
            if (pageStatus.error) setError(pageStatus.error);
          }
        }
      } catch (cause) {
        setError(errorMessage(cause));
      }
    })();
  }, []);

  useEffect(() => {
    const onStatus = (message: unknown) => {
      if (
        isExtensionMessage(message) &&
        message.type === 'STATUS_CHANGED' &&
        message.target === 'popup' &&
        'payload' in message
      ) {
        setStatus((message as { payload: EngineStatus }).payload);
        return;
      }
      if (
        isExtensionMessage(message) &&
        message.type === 'HOOK_STATUS_CHANGED' &&
        message.target === 'popup' &&
        'payload' in message
      ) {
        const payload = (message as { payload: { tabId: number; active: boolean; error: string | null } }).payload;
        if (payload.tabId === activeTabId.current) {
          setHookActive(payload.active);
          if (payload.error) setError(payload.error);
        }
      }
    };
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && Object.keys(changes).length > 0) {
        void getSettings().then((loaded) => setSettings(settingsForDomain(loaded, activeDomain.current)));
      }
    };
    chrome.runtime.onMessage.addListener(onStatus);
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      chrome.runtime.onMessage.removeListener(onStatus);
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  async function patchSettings(patch: Partial<LofiSettings>): Promise<void> {
    try {
      const domain = activeDomain.current;
      const fullPatch: Partial<LofiSettings> = { ...patch };
      if (domain && ('playbackSpeed' in patch || 'reverbMix' in patch)) {
        const base = settings ?? (await getSettings());
        fullPatch.siteSettings = {
          ...base.siteSettings,
          [domain]: {
            playbackSpeed: patch.playbackSpeed ?? base.playbackSpeed,
            reverbMix: patch.reverbMix ?? base.reverbMix,
            enabled: base.siteSettings[domain]?.enabled ?? true,
          },
        };
      }
      const updated = await updateSettings(fullPatch);
      setSettings(settingsForDomain(updated, domain));
      const response = await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      if (!response.ok) setError(response.error ?? 'Could not apply audio settings');
      if (hookActive && activeTabId.current !== null) {
        await chrome.tabs
          .sendMessage(activeTabId.current, {
            type: 'APPLY_AUDIO',
            settings: settingsForDomain(await getSettings(), domain),
            enabled: true,
          })
          .catch(() => undefined);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function siteEnabledPatch(enabled: boolean): Partial<LofiSettings> {
    const domain = activeDomain.current;
    if (!domain) return {};
    const existing = settings?.siteSettings[domain];
    return {
      siteSettings: {
        ...settings?.siteSettings,
        [domain]: {
          playbackSpeed: existing?.playbackSpeed ?? settings?.playbackSpeed ?? DEFAULT_SETTINGS.playbackSpeed,
          reverbMix: existing?.reverbMix ?? settings?.reverbMix ?? DEFAULT_SETTINGS.reverbMix,
          enabled,
        },
      },
    };
  }

  async function toggle(): Promise<void> {
    if (!settings || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (status.running) {
        const response = await sendMessage<EngineStatus>({ type: 'STOP_CAPTURE', target: 'background' });
        if (!response.ok) throw new Error(response.error ?? 'Could not stop audio processing');
        setStatus(response.data ?? IDLE_STATUS);
        setSettings(await updateSettings({ enabled: false, ...siteEnabledPatch(false) }));
        return;
      }

      if (!supported || activeTabId.current === null) {
        throw new Error('Open a supported music website first, or add it in Settings.');
      }
      const tabId = activeTabId.current;

      if (hookActive) {
        await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUDIO', settings, enabled: false });
        setHookActive(false);
        setSettings(await updateSettings({ enabled: false, ...siteEnabledPatch(false) }));
        return;
      }

      if (hookable) {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page-hook.js'] });
          await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', files: ['content.js'] });
          const response = (await chrome.tabs.sendMessage(tabId, {
            type: 'APPLY_AUDIO',
            settings,
            enabled: true,
          })) as { ok?: boolean } | undefined;
          if (!response?.ok) throw new Error('The page did not confirm audio processing');
          setHookActive(true);
          setSettings(await updateSettings({ enabled: true, ...siteEnabledPatch(true) }));
          return;
        } catch (cause) {
          // The native page hook is preferred; tabCapture remains a fallback.
          await chrome.tabs.sendMessage(tabId, { type: 'APPLY_AUDIO', settings, enabled: false }).catch(() => undefined);
          setHookActive(false);
          setError(errorMessage(cause));
        }
      }

      setError(null);
      let response = await sendMessage<EngineStatus>({
        type: 'REQUEST_CAPTURE',
        target: 'background',
        payload: { tabId, settings },
      });
      if (!response.ok || !response.data) {
        // Service worker may lack a live user gesture; retry from this click handler.
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        response = await sendMessage<EngineStatus>({
          type: 'START_CAPTURE',
          target: 'background',
          payload: { tabId, streamId, settings },
        });
      }
      if (!response.ok || !response.data) throw new Error(response.error ?? 'Could not start audio capture');
      setStatus(response.data);
      setSettings(await updateSettings({ enabled: true, ...siteEnabledPatch(true) }));
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus(IDLE_STATUS);
      setHookActive(false);
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefaults(): Promise<void> {
    if (!settings) return;
    try {
      const domain = activeDomain.current;
      const siteSettings = { ...settings.siteSettings };
      if (domain) delete siteSettings[domain];
      const updated = await updateSettings({
        playbackSpeed: DEFAULT_SETTINGS.playbackSpeed,
        reverbMix: DEFAULT_SETTINGS.reverbMix,
        bassGain: DEFAULT_SETTINGS.bassGain,
        trebleGain: DEFAULT_SETTINGS.trebleGain,
        selectedPreset: DEFAULT_SETTINGS.selectedPreset,
        siteSettings,
      });
      setSettings(settingsForDomain(updated, domain));
      await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      if (hookActive && activeTabId.current !== null) {
        await chrome.tabs
          .sendMessage(activeTabId.current, {
            type: 'APPLY_AUDIO',
            settings: settingsForDomain(updated, domain),
            enabled: true,
          })
          .catch(() => undefined);
      }
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (!settings) {
    return <div className="app">Loading…</div>;
  }

  const isOn = status.running || hookActive;
  const showAutoPrompt = supported && settings.autoEnable && !isOn;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo">lofi</span>
          <span className="tagline">slow it down</span>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <SettingsIcon />
        </button>
      </header>

      <div className="site">
        <SiteIcon domain={activeDomain.current ?? ''} label={siteName} />
        <span>{siteName}</span>
      </div>

      <button
        type="button"
        className={`power ${isOn ? 'on' : ''}`}
        onClick={() => void toggle()}
        disabled={busy || (!supported && !isOn)}
      >
        <span className="power-label">{busy ? 'Starting…' : isOn ? 'lofi is on' : 'Turn lofi on'}</span>
        <span className="switch" aria-hidden="true">
          <span className="knob" />
        </span>
      </button>

      {showAutoPrompt && <div className="auto-hint">Auto-enable is on. Click to start lofi.</div>}

      <ErrorBanner message={error ?? status.error} />

      <RangeSlider
        label="Playback speed"
        value={settings.playbackSpeed}
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={0.01}
        display={`${settings.playbackSpeed.toFixed(2)}x`}
        onChange={(playbackSpeed) => void patchSettings({ playbackSpeed })}
      />
      <RangeSlider
        label="Reverb"
        value={settings.reverbMix}
        min={0}
        max={1}
        step={0.01}
        display={`${Math.round(settings.reverbMix * 100)}%`}
        onChange={(reverbMix) => void patchSettings({ reverbMix })}
      />

      <div className="section-title">Presets</div>
      <PresetPicker
        presets={PRESETS}
        selected={settings.selectedPreset}
        onSelect={(id) => {
          const preset = PRESETS.find((candidate) => candidate.id === id);
          if (preset) void patchSettings({ selectedPreset: id, playbackSpeed: preset.playbackSpeed, reverbMix: preset.reverbMix });
        }}
      />

      {!isDefaultSettings(settings) && (
        <button type="button" className="reset-button" onClick={() => void resetToDefaults()}>
          Reset to defaults
        </button>
      )}

      <button className="settings-link" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
        Settings
      </button>
    </div>
  );
}
