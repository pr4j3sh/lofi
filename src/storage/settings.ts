import { DEFAULT_SITES } from '../sites/supported-sites';
import { DEFAULT_SETTINGS, PRESETS, SPEED_MAX, SPEED_MIN } from './defaults';
import type { LofiSettings, SiteAudioSettings, SupportedSite } from '../types';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizeSites(value: unknown): SupportedSite[] {
  const stored = Array.isArray(value) ? value : [];
  const result: SupportedSite[] = [];

  for (const defaultSite of DEFAULT_SITES) {
    const found = stored.find(
      (site): site is SupportedSite =>
        typeof site === 'object' && site !== null && (site as SupportedSite).domain === defaultSite.domain,
    );
    result.push({
      ...defaultSite,
      enabled: typeof found?.enabled === 'boolean' ? found.enabled : defaultSite.enabled,
    });
  }

  for (const site of stored) {
    if (typeof site !== 'object' || site === null) continue;
    const candidate = site as Partial<SupportedSite>;
    if (typeof candidate.domain !== 'string' || !candidate.custom) continue;
    if (result.some((existing) => existing.domain === candidate.domain)) continue;
    result.push({
      name: typeof candidate.name === 'string' ? candidate.name : candidate.domain,
      domain: candidate.domain,
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
      custom: true,
    });
  }
  return result;
}

function normalizeSiteSettings(value: unknown): Record<string, SiteAudioSettings> {
  const result: Record<string, SiteAudioSettings> = {};
  if (typeof value !== 'object' || value === null) return result;
  for (const [domain, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<SiteAudioSettings>;
    result[domain] = {
      playbackSpeed: clamp(candidate.playbackSpeed, SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS.playbackSpeed),
      reverbMix: clamp(candidate.reverbMix, 0, 1, DEFAULT_SETTINGS.reverbMix),
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    };
  }
  return result;
}

function normalizeSettings(input: Partial<LofiSettings>): LofiSettings {
  const selectedPreset = PRESETS.some((preset) => preset.id === input.selectedPreset)
    ? (input.selectedPreset as string)
    : DEFAULT_SETTINGS.selectedPreset;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
    autoEnable: typeof input.autoEnable === 'boolean' ? input.autoEnable : DEFAULT_SETTINGS.autoEnable,
    playbackSpeed: clamp(input.playbackSpeed, SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS.playbackSpeed),
    reverbMix: clamp(input.reverbMix, 0, 1, DEFAULT_SETTINGS.reverbMix),
    bassGain: clamp(input.bassGain, -12, 12, DEFAULT_SETTINGS.bassGain),
    trebleGain: clamp(input.trebleGain, -12, 12, DEFAULT_SETTINGS.trebleGain),
    selectedPreset,
    sites: normalizeSites(input.sites),
    siteSettings: normalizeSiteSettings(input.siteSettings),
  };
}

/** Retired preset values; only used to upgrade users who never touched the sliders. */
const LEGACY_PRESET_VALUES: Record<string, { playbackSpeed: number; reverbMix: number }> = {
  dreamy: { playbackSpeed: 0.85, reverbMix: 0.65 },
  rainy: { playbackSpeed: 0.8, reverbMix: 0.8 },
  vinyl: { playbackSpeed: 0.9, reverbMix: 0.45 },
  focus: { playbackSpeed: 0.95, reverbMix: 0.3 },
};

function matchesLegacy(settings: LofiSettings, legacy: { playbackSpeed: number; reverbMix: number }): boolean {
  return (
    Math.abs(settings.playbackSpeed - legacy.playbackSpeed) < 0.001 &&
    Math.abs(settings.reverbMix - legacy.reverbMix) < 0.001
  );
}

export async function getSettings(): Promise<LofiSettings> {
  const stored = await chrome.storage.local.get(null);
  const settings = normalizeSettings(stored as Partial<LofiSettings>);

  if (stored.lofiSettingsVersion !== 2) {
    const legacy = LEGACY_PRESET_VALUES[settings.selectedPreset];
    const preset = PRESETS.find((candidate) => candidate.id === settings.selectedPreset);
    if (legacy && preset && matchesLegacy(settings, legacy)) {
      settings.playbackSpeed = preset.playbackSpeed;
      settings.reverbMix = preset.reverbMix;
    }
    await chrome.storage.local.set({
      lofiSettingsVersion: 2,
      playbackSpeed: settings.playbackSpeed,
      reverbMix: settings.reverbMix,
      selectedPreset: settings.selectedPreset,
    });
  }
  return settings;
}

/** Applies a domain's saved overrides to the global defaults. */
export function settingsForDomain(settings: LofiSettings, domain: string | null | undefined): LofiSettings {
  if (!domain) return settings;
  const site = settings.siteSettings[domain];
  if (!site) return settings;
  return { ...settings, playbackSpeed: site.playbackSpeed, reverbMix: site.reverbMix };
}

/** Patching only supplied keys avoids clobbering user settings during upgrades. */
export async function updateSettings(patch: Partial<LofiSettings>): Promise<LofiSettings> {
  await chrome.storage.local.set(patch);
  return getSettings();
}
