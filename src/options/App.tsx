import { useEffect, useState } from 'react';
import RangeSlider from '../components/RangeSlider';
import { hasPageHookPermission, requestPageHookPermission } from '../sites/page-hook';
import { addCustomSite, normalizeDomain, removeSite, setSiteEnabled } from '../sites/site-manager';
import { DEFAULT_SETTINGS, PRESETS, SPEED_MAX, SPEED_MIN } from '../storage/defaults';
import { getSettings, updateSettings } from '../storage/settings';
import { errorMessage, sendMessage } from '../utils/messaging';
import type { LofiSettings, SupportedSite } from '../types';

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
  const [newDomain, setNewDomain] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getSettings();
        setSettings(loaded);
        await refreshPermissions(loaded.sites);
      } catch (cause) {
        setError(errorMessage(cause));
      }
    })();

    const onPermissionChange = () => {
      void getSettings()
        .then((loaded) => refreshPermissions(loaded.sites))
        .catch(() => undefined);
    };
    chrome.permissions.onAdded.addListener(onPermissionChange);
    chrome.permissions.onRemoved.addListener(onPermissionChange);
    return () => {
      chrome.permissions.onAdded.removeListener(onPermissionChange);
      chrome.permissions.onRemoved.removeListener(onPermissionChange);
    };
  }, []);

  async function refreshPermissions(sites: SupportedSite[]): Promise<void> {
    const entries = await Promise.all(
      sites.map(async (site) => [site.domain, await hasPageHookPermission(site.domain)] as const),
    );
    setPermissions(Object.fromEntries(entries));
  }

  async function patch(patch: Partial<LofiSettings>): Promise<void> {
    try {
      setSettings(await updateSettings(patch));
      const response = await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      if (!response.ok) setError(response.error ?? 'Could not apply settings');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function patchSites(sites: SupportedSite[]): void {
    void patch({ sites });
  }

  async function resetToDefaults(): Promise<void> {
    if (!settings) return;
    try {
      const updated = await updateSettings({
        playbackSpeed: DEFAULT_SETTINGS.playbackSpeed,
        reverbMix: DEFAULT_SETTINGS.reverbMix,
        bassGain: DEFAULT_SETTINGS.bassGain,
        trebleGain: DEFAULT_SETTINGS.trebleGain,
        selectedPreset: DEFAULT_SETTINGS.selectedPreset,
        siteSettings: {},
      });
      setSettings(updated);
      await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function grantSite(domain: string, warnOnDeny = true): Promise<boolean> {
    setError(null);
    try {
      const granted = await requestPageHookPermission(domain);
      if (!granted) {
        if (warnOnDeny) setError('Site access is required for automatic activation. You can still start lofi manually.');
        return false;
      }
      setPermissions((current) => ({ ...current, [domain]: true }));
      await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }

  async function handleAdd(): Promise<void> {
    if (!settings) return;
    setError(null);
    const domain = normalizeDomain(newDomain);
    if (!domain) {
      setError('Enter a valid domain, e.g. music.example.com');
      return;
    }
    const granted = await grantSite(domain, false);
    const result = addCustomSite(settings.sites, newDomain);
    if (result.error) {
      setError(result.error);
      return;
    }
    patchSites(result.sites);
    setNewDomain('');
    if (!granted) setError('Website added. Allow site access in Settings to start it automatically.');
  }

  async function handleSiteToggle(site: SupportedSite, enabled: boolean): Promise<void> {
    if (!settings) return;
    if (enabled && !permissions[site.domain] && !(await grantSite(site.domain))) return;
    patchSites(setSiteEnabled(settings.sites, site.domain, enabled));
  }

  if (!settings) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <h1>lofi <span>settings</span></h1>
        </div>
        <p>Quiet defaults for your listening.</p>
      </header>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Activation</h2>
        <label className="toggle-row">
          <span className="toggle-copy">
            <span className="toggle-title">Automatically enable lofi on supported websites</span>
            <small>Sites with site access start automatically. Others keep the one-click prompt.</small>
          </span>
          <span className="toggle">
            <input
              type="checkbox"
              checked={settings.autoEnable}
              onChange={(event) => void patch({ autoEnable: event.target.checked })}
              aria-label="Automatically enable lofi on supported websites"
            />
            <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
          </span>
        </label>
      </section>

      <section>
        <h2>Defaults</h2>
        <RangeSlider
          label="Playback speed"
          value={settings.playbackSpeed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.01}
          display={`${settings.playbackSpeed.toFixed(2)}x`}
          onChange={(value) => void patch({ playbackSpeed: value })}
        />
        <RangeSlider
          label="Reverb"
          value={settings.reverbMix}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(settings.reverbMix * 100)}%`}
          onChange={(value) => void patch({ reverbMix: value })}
        />
        <RangeSlider
          label="Bass"
          value={settings.bassGain}
          min={-12}
          max={12}
          step={1}
          display={`${settings.bassGain >= 0 ? '+' : ''}${settings.bassGain.toFixed(0)} dB`}
          onChange={(value) => void patch({ bassGain: value })}
        />
        <RangeSlider
          label="Treble"
          value={settings.trebleGain}
          min={-12}
          max={12}
          step={1}
          display={`${settings.trebleGain >= 0 ? '+' : ''}${settings.trebleGain.toFixed(0)} dB`}
          onChange={(value) => void patch({ trebleGain: value })}
        />
        <label className="select-field">
          <span className="select-label">Default preset</span>
          <select
            value={settings.selectedPreset}
            onChange={(event) => {
              const preset = PRESETS.find((candidate) => candidate.id === event.target.value);
              if (preset) void patch({ selectedPreset: preset.id, playbackSpeed: preset.playbackSpeed, reverbMix: preset.reverbMix });
            }}
          >
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </label>
        {!isDefaultSettings(settings) && (
          <button type="button" className="button button-ghost reset-button" onClick={() => void resetToDefaults()}>
            Reset to defaults
          </button>
        )}
      </section>

      <section>
        <h2>Supported websites</h2>
        <ul className="site-list">
          {settings.sites.map((site) => {
            const canAuto = site.domain !== 'self' && permissions[site.domain] === true;
            const status = site.domain === 'self' ? 'Test' : canAuto ? 'Auto' : 'Manual';
            return (
              <li className="site-row" key={site.domain}>
                <label className="toggle-row site-toggle">
                  <span className="toggle-copy">
                    <span className="site-name">
                      {site.name}
                      <span className={`status-pill ${canAuto ? 'auto' : ''}`}>{status}</span>
                    </span>
                    <small>{site.domain}</small>
                  </span>
                  <span className="toggle toggle-small">
                    <input
                      type="checkbox"
                      checked={site.enabled}
                      onChange={(event) => void handleSiteToggle(site, event.target.checked)}
                      aria-label={`Enable lofi on ${site.name}`}
                    />
                    <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
                  </span>
                </label>
                <div className="site-actions">
                  {site.domain !== 'self' && !canAuto && (
                    <button type="button" className="button button-subtle" onClick={() => void grantSite(site.domain)}>
                      Allow auto
                    </button>
                  )}
                  {site.custom && (
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => patchSites(removeSite(settings.sites, site.domain))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="add-site">
          <input
            type="text"
            placeholder="music.example.com"
            value={newDomain}
            onChange={(event) => setNewDomain(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleAdd();
            }}
            aria-label="Website domain"
          />
          <button type="button" className="button button-primary" onClick={() => void handleAdd()}>
            Add website
          </button>
        </div>
      </section>
    </div>
  );
}
