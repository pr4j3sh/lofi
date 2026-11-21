export interface SupportedSite {
  name: string;
  domain: string;
  enabled: boolean;
  custom: boolean;
}

export interface SiteAudioSettings {
  playbackSpeed: number;
  reverbMix: number;
  enabled: boolean;
}

export interface LofiSettings {
  enabled: boolean;
  autoEnable: boolean;
  playbackSpeed: number;
  reverbMix: number;
  bassGain: number;
  trebleGain: number;
  selectedPreset: string;
  sites: SupportedSite[];
  siteSettings: Record<string, SiteAudioSettings>;
}

export interface Preset {
  id: string;
  name: string;
  playbackSpeed: number;
  reverbMix: number;
}

export interface EngineStatus {
  running: boolean;
  tabId: number | null;
  error: string | null;
}

export interface StartCapturePayload {
  tabId: number;
  streamId: string;
  settings: LofiSettings;
}

export type MessageTarget = 'background' | 'offscreen' | 'popup';

export type ExtensionMessage =
  | { type: 'PING'; target?: MessageTarget }
  | { type: 'GET_STATUS'; target?: MessageTarget }
  | { type: 'REQUEST_CAPTURE'; target: MessageTarget; payload: { tabId: number; settings: LofiSettings } }
  | { type: 'START_CAPTURE'; target: MessageTarget; payload: StartCapturePayload }
  | { type: 'STOP_CAPTURE'; target?: MessageTarget }
  | { type: 'UPDATE_SETTINGS'; target?: MessageTarget }
  | { type: 'APPLY_SETTINGS'; target: MessageTarget; payload: { settings: LofiSettings } }
  | { type: 'APPLY_AUDIO'; target: MessageTarget; payload: { settings: LofiSettings; enabled: boolean } }
  | { type: 'GET_PAGE_STATUS'; target?: MessageTarget }
  | { type: 'PAGE_HOOK_STATUS'; target: MessageTarget; payload: { active: boolean; error: string | null } }
  | { type: 'HOOK_STATUS_CHANGED'; target: MessageTarget; payload: { tabId: number; active: boolean; error: string | null } }
  | { type: 'STATUS_CHANGED'; target: MessageTarget; payload: EngineStatus };

export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return typeof value === 'object' && value !== null && 'type' in value && typeof (value as { type: unknown }).type === 'string';
}
