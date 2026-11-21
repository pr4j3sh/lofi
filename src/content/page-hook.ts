/**
 * Runs in the page's MAIN world. Native media playbackRate gives a clean
 * tape-style slowdown, so no AudioWorklet resampling is needed on this path.
 * Deliberately self-contained: executeScript injects only this single file.
 */
(() => {
  const scope = window as unknown as Record<string, unknown>;
  if (scope.__lofiPageHook) return;
  scope.__lofiPageHook = true;

  const CHANNEL = 'LOFI_AUDIO';

  interface PageSettings {
    playbackSpeed: number;
    reverbMix: number;
    bassGain: number;
    trebleGain: number;
  }

  interface Pipeline {
    media: HTMLMediaElement;
    source: MediaElementAudioSourceNode;
    eqLow: BiquadFilterNode;
    eqHigh: BiquadFilterNode;
    dry: GainNode;
    wet: GainNode;
    mixed: GainNode;
    bypass: GainNode;
    processed: GainNode;
  }

  const DEFAULT_SETTINGS: PageSettings = {
    playbackSpeed: 0.8,
    reverbMix: 0.4,
    bassGain: 0,
    trebleGain: 0,
  };

  let context: AudioContext | null = null;
  let impulse: AudioBuffer | null = null;
  let enabled = false;
  let error: string | null = null;
  let settings: PageSettings = { ...DEFAULT_SETTINGS };
  const pipelines = new WeakMap<HTMLMediaElement, Pipeline>();

  function ramp(param: AudioParam, value: number, audioContext: AudioContext): void {
    const start = audioContext.currentTime + 0.005;
    param.cancelScheduledValues(start);
    param.setValueAtTime(param.value, start);
    param.linearRampToValueAtTime(value, start + 0.025);
  }

  function createImpulse(audioContext: AudioContext): AudioBuffer {
    const length = Math.floor(audioContext.sampleRate * 2.0);
    const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return buffer;
  }

  function createPipeline(media: HTMLMediaElement): Pipeline | null {
    try {
      if (!context) context = new AudioContext();
      if (context.state === 'suspended') void context.resume();
      const audioContext = context;

      const source = audioContext.createMediaElementSource(media);
      const eqLow = audioContext.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 200;
      const eqHigh = audioContext.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 3200;

      const convolver = audioContext.createConvolver();
      impulse ??= createImpulse(audioContext);
      convolver.buffer = impulse;

      const dry = audioContext.createGain();
      const wet = audioContext.createGain();
      const mixed = audioContext.createGain();
      const limiter = audioContext.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      const processed = audioContext.createGain();
      processed.gain.value = 0;
      const bypass = audioContext.createGain();
      bypass.gain.value = 1;

      source.connect(eqLow);
      eqLow.connect(eqHigh);
      eqHigh.connect(dry).connect(mixed);
      eqHigh.connect(convolver).connect(wet).connect(mixed);
      mixed.connect(limiter).connect(processed).connect(audioContext.destination);
      source.connect(bypass).connect(audioContext.destination);

      return { media, source, eqLow, eqHigh, dry, wet, mixed, bypass, processed };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      return null;
    }
  }

  function normalizeSettings(candidate: unknown): PageSettings {
    const input = (candidate ?? {}) as Partial<PageSettings>;
    const clamp = (value: number | undefined, min: number, max: number, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    return {
      playbackSpeed: clamp(input.playbackSpeed, 0.7, 1, DEFAULT_SETTINGS.playbackSpeed),
      reverbMix: clamp(input.reverbMix, 0, 1, DEFAULT_SETTINGS.reverbMix),
      bassGain: clamp(input.bassGain, -12, 12, 0),
      trebleGain: clamp(input.trebleGain, -12, 12, 0),
    };
  }

  function postState(): void {
    window.postMessage({ channel: CHANNEL, type: 'STATE', active: enabled, error }, '*');
  }

  function apply(nextEnabled: boolean, candidate: unknown): void {
    settings = normalizeSettings(candidate);
    enabled = nextEnabled;
    error = null;
    if (!enabled && !context) {
      postState();
      return;
    }
    if (!context) context = new AudioContext();
    const audioContext = context;
    const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));
    let connected = 0;

    for (const media of mediaElements) {
      let pipeline: Pipeline | null | undefined = pipelines.get(media);
      if (!pipeline) {
        pipeline = createPipeline(media);
        if (pipeline) pipelines.set(media, pipeline);
      }
      if (!pipeline) continue;
      connected += 1;

      const pitchMedia = media as HTMLMediaElement & {
        webkitPreservesPitch?: boolean;
        mozPreservesPitch?: boolean;
      };
      media.playbackRate = enabled ? settings.playbackSpeed : 1;
      pitchMedia.preservesPitch = !enabled;
      pitchMedia.webkitPreservesPitch = !enabled;
      pitchMedia.mozPreservesPitch = !enabled;

      const reverbMix = settings.reverbMix;
      const boost = Math.max(0, settings.bassGain, settings.trebleGain);
      ramp(pipeline.dry.gain, 1 - reverbMix * 0.3, audioContext);
      ramp(pipeline.wet.gain, reverbMix * 0.7, audioContext);
      ramp(pipeline.eqLow.gain, settings.bassGain, audioContext);
      ramp(pipeline.eqHigh.gain, settings.trebleGain, audioContext);
      ramp(pipeline.mixed.gain, Math.pow(10, (-0.75 * boost) / 20), audioContext);
      ramp(pipeline.bypass.gain, enabled ? 0 : 1, audioContext);
      ramp(pipeline.processed.gain, enabled ? 1 : 0, audioContext);
    }

    enabled = enabled && connected > 0;
    postState();
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.data?.channel !== CHANNEL) return;
    if (event.data.type === 'APPLY') apply(event.data.enabled === true, event.data.settings);
    else if (event.data.type === 'GET_STATE') postState();
  });

  new MutationObserver(() => {
    if (enabled) apply(true, settings);
    else postState();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.setInterval(() => {
    if (enabled) apply(true, settings);
  }, 1000);

  postState();
})();
