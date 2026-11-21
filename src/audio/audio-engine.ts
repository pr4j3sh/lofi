import { Equalizer } from './effects/equalizer';
import { Reverb } from './effects/reverb';
import { createSlowdownProcessor, setSlowdownSpeed } from './effects/slowdown';
import { Volume } from './effects/volume';
import { errorMessage } from '../utils/messaging';
import type { EngineStatus, LofiSettings, StartCapturePayload } from '../types';

const WORKLET_URL = 'worklets/time-stretch-processor.js';

/**
 * Owns the Web Audio graph. Lives only in the offscreen document so processing
 * continues while the popup is closed and the service worker is suspended.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private slowdown: AudioWorkletNode | null = null;
  private equalizer: Equalizer | null = null;
  private reverb: Reverb | null = null;
  private volume: Volume | null = null;
  private workletLoaded = false;
  private currentPreset = '';
  private status: EngineStatus = { running: false, tabId: null, error: null };

  getStatus(error?: string): EngineStatus {
    if (error !== undefined) this.status = { ...this.status, error };
    return { ...this.status };
  }

  async start(payload: StartCapturePayload): Promise<EngineStatus> {
    await this.stop();
    try {
      const constraints = {
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: payload.streamId,
          },
        },
      } as unknown as MediaStreamConstraints;
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') await this.context.resume();
      if (!this.workletLoaded) {
        await this.context.audioWorklet.addModule(chrome.runtime.getURL(WORKLET_URL));
        this.workletLoaded = true;
      }

      this.source = this.context.createMediaStreamSource(this.stream);
      this.slowdown = createSlowdownProcessor(this.context, payload.settings);
      this.equalizer = new Equalizer(this.context);
      this.reverb = new Reverb(this.context, payload.settings.reverbMix, payload.settings.selectedPreset);
      this.volume = new Volume(this.context);

      this.source.connect(this.slowdown);
      this.slowdown.connect(this.equalizer.input);
      this.equalizer.output.connect(this.reverb.input);
      this.reverb.output.connect(this.volume.input);
      this.volume.output.connect(this.context.destination);

      this.currentPreset = payload.settings.selectedPreset;
      this.status = { running: true, tabId: payload.tabId, error: null };
      this.updateSettings(payload.settings);
      return this.getStatus();
    } catch (error) {
      const message = errorMessage(error);
      await this.stop();
      this.status = { running: false, tabId: null, error: message };
      throw new Error(message);
    }
  }

  async stop(): Promise<EngineStatus> {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.source?.disconnect();
    this.slowdown?.disconnect();
    this.equalizer?.dispose();
    this.reverb?.dispose();
    this.volume?.dispose();
    this.source = null;
    this.slowdown = null;
    this.equalizer = null;
    this.reverb = null;
    this.volume = null;

    if (this.context && this.context.state === 'running') {
      try {
        await this.context.suspend();
      } catch {
        // A suspended context is safe to leave as-is.
      }
    }
    this.status = { running: false, tabId: null, error: null };
    return this.getStatus();
  }

  updateSettings(settings: LofiSettings): void {
    if (!this.status.running) return;
    if (this.slowdown) setSlowdownSpeed(this.slowdown, settings.playbackSpeed);
    this.equalizer?.setBass(settings.bassGain);
    this.equalizer?.setTreble(settings.trebleGain);
    this.reverb?.setMix(settings.reverbMix);
    const boost = Math.max(0, settings.bassGain, settings.trebleGain);
    this.volume?.setLevel(Math.pow(10, (-0.75 * boost) / 20));
    if (settings.selectedPreset !== this.currentPreset) {
      this.currentPreset = settings.selectedPreset;
      this.reverb?.setImpulse(settings.selectedPreset);
    }
  }
}
