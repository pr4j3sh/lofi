import { useEffect, useState } from 'react';
import { addCustomSite, removeSite, setSiteEnabled } from '../sites/site-manager';
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
    void getSettings().then(setSettings).catch((cause: unknown) => setError(errorMessage(cause)));
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

  function handleAdd(): void {
    if (!settings) return;
    setError(null);
    const result = addCustomSite(settings.sites, newDomain);
    if (result.error) {
      setError(result.error);
      return;
    }
    patchSites(result.sites);
    setNewDomain('');
  }

  if (!settings) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <header>
        <h1>lofi settings</h1>
        <p>Quiet defaults for your listening.</p>
      </header>

      {error && <div className="error">{error}</div>}

      <section>
        <h2>Activation</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.autoEnable}
            onChange={(event) => void patch({ autoEnable: event.target.checked })}
          />
          <span>
            Automatically enable lofi on supported websites
            <small>Chrome still requires one click to grant audio capture.</small>
          </span>
        </label>
      </section>

      <section>
        <h2>Defaults</h2>
        <label className="field">
          <span>Playback speed ({settings.playbackSpeed.toFixed(2)}x)</span>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.01}
            value={settings.playbackSpeed}
            onChange={(event) => void patch({ playbackSpeed: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Reverb ({Math.round(settings.reverbMix * 100)}%)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.reverbMix}
            onChange={(event) => void patch({ reverbMix: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Bass ({settings.bassGain >= 0 ? '+' : ''}{settings.bassGain.toFixed(0)} dB)</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={settings.bassGain}
            onChange={(event) => void patch({ bassGain: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Treble ({settings.trebleGain >= 0 ? '+' : ''}{settings.trebleGain.toFixed(0)} dB)</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={settings.trebleGain}
            onChange={(event) => void patch({ trebleGain: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Default preset</span>
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
          <button type="button" className="reset-button" onClick={() => void resetToDefaults()}>
            Reset to defaults
          </button>
        )}
      </section>

      <section>
        <h2>Supported websites</h2>
        <ul className="site-list">
          {settings.sites.map((site) => (
            <li key={site.domain}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={site.enabled}
                  onChange={(event) => patchSites(setSiteEnabled(settings.sites, site.domain, event.target.checked))}
                />
                <span>
                  {site.name}
                  <small>{site.domain}</small>
                </span>
              </label>
              {site.custom && (
                <button type="button" className="danger" onClick={() => patchSites(removeSite(settings.sites, site.domain))}>
                  Remove
                </button>
              )}
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
              if (event.key === 'Enter') handleAdd();
            }}
          />
          <button type="button" onClick={handleAdd}>Add website</button>
        </div>
      </section>
    </div>
  );
}
