import { DEFAULT_SITES } from '../sites/supported-sites';
import type { LofiSettings, Preset } from '../types';

/** Central preset definitions. Selecting one updates speed + reverb together. */
export const PRESETS: Preset[] = [
  { id: 'slowed', name: 'Slowed + Reverb', playbackSpeed: 0.8, reverbMix: 0.4 },
  { id: 'dreamy', name: 'Dreamy', playbackSpeed: 0.85, reverbMix: 0.35 },
  { id: 'rainy', name: 'Rainy Night', playbackSpeed: 0.8, reverbMix: 0.4 },
  { id: 'vinyl', name: 'Vinyl', playbackSpeed: 0.9, reverbMix: 0.22 },
  { id: 'focus', name: 'Deep Focus', playbackSpeed: 0.95, reverbMix: 0.15 },
  { id: 'original', name: 'Original', playbackSpeed: 1, reverbMix: 0 },
];

export const DEFAULT_SETTINGS: LofiSettings = {
  enabled: false,
  autoEnable: false,
  playbackSpeed: 0.8,
  reverbMix: 0.4,
  bassGain: 0,
  trebleGain: 0,
  selectedPreset: 'slowed',
  sites: DEFAULT_SITES,
  siteSettings: {},
};

export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1;
