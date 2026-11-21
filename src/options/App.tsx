import { useEffect, useState } from 'react';
import CreatorLinks from '../components/CreatorLinks';
import RangeSlider from '../components/RangeSlider';
import SiteIcon from '../components/SiteIcon';
import { pageHookOriginsForDomains } from '../sites/page-hook';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSettings()
      .then(setSettings)
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, []);

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

  async function requestSiteAccess(domains: string[], warnOnDeny = true): Promise<boolean> {
    const origins = pageHookOriginsForDomains(domains);
    if (origins.length === 0) return true;
    setError(null);
    try {
      const granted = await chrome.permissions.request({ origins });
      if (!granted && warnOnDeny) {
        setError('Site access was not granted. Lofi can still be started manually from the popup.');
      }
      if (granted) await sendMessage({ type: 'UPDATE_SETTINGS', target: 'background' });
      return granted;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }

  async function handleAutoEnable(checked: boolean): Promise<void> {
    if (!settings) return;
    if (checked) {
      await requestSiteAccess(settings.sites.filter((site) => site.enabled).map((site) => site.domain));
    }
    await patch({ autoEnable: checked });
  }

  async function handleAdd(): Promise<void> {
    if (!settings) return;
    setError(null);
    const domain = normalizeDomain(newDomain);
    if (!domain) {
      setError('Enter a valid domain, e.g. music.example.com');
      return;
    }
    const result = addCustomSite(settings.sites, newDomain);
    if (result.error) {
      setError(result.error);
      return;
    }
    patchSites(result.sites);
    setNewDomain('');
    const granted = await requestSiteAccess([domain], false);
    if (!granted) setError('Website added. Toggle it on to grant site access for automatic start.');
  }

  async function handleSiteToggle(site: SupportedSite, enabled: boolean): Promise<void> {
    if (!settings) return;
    if (enabled && site.domain !== 'self') await requestSiteAccess([site.domain]);
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
            <small>Site access is requested when this is turned on. Otherwise, use the popup to start lofi.</small>
          </span>
          <span className="toggle">
            <input
              type="checkbox"
              checked={settings.autoEnable}
              onChange={(event) => void handleAutoEnable(event.target.checked)}
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
          {settings.sites.map((site) => (
            <li className="site-row" key={site.domain}>
              <div className="site-main">
                <SiteIcon domain={site.domain} label={site.name} />
                <div className="site-copy">
                  <span className="site-name">{site.name}</span>
                  <small>{site.domain}</small>
                </div>
              </div>
              <div className="site-controls">
                {site.custom && (
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => patchSites(removeSite(settings.sites, site.domain))}
                  >
                    Remove
                  </button>
                )}
                <label className="toggle toggle-small">
                  <input
                    type="checkbox"
                    checked={site.enabled}
                    onChange={(event) => void handleSiteToggle(site, event.target.checked)}
                    aria-label={`Enable lofi on ${site.name}`}
                  />
                  <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
                </label>
              </div>
            </li>
          ))}
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

      <CreatorLinks className="options-footer" />
    </div>
  );
}
