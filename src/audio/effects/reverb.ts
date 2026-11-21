import { rampParam } from './smoothing';

function createImpulseResponse(context: AudioContext, presetId: string): AudioBuffer {
  // Short, smoothly decaying stereo noise. Kept simple on purpose: a low wet
  // level (see setMix) matters more for a natural tail than an elaborate IR.
  const presets: Record<string, { seconds: number; decay: number }> = {
    slowed: { seconds: 2.0, decay: 2.5 },
    dreamy: { seconds: 2.0, decay: 2.5 },
    rainy: { seconds: 2.6, decay: 2.3 },
    vinyl: { seconds: 1.0, decay: 3.2 },
    focus: { seconds: 0.7, decay: 3.5 },
    original: { seconds: 0.3, decay: 5 },
  };
  const config = presets[presetId] ?? presets.slowed;
  const length = Math.max(1, Math.floor(context.sampleRate * config.seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, config.decay);
    }
  }
  return buffer;
}

/**
 * Convolver reverb with the conservative wet/dry scaling used by good
 * slowed+reverb presets: even at 100% the dry path keeps most of the signal.
 */
export class Reverb {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly convolver: ConvolverNode;

  constructor(private readonly context: AudioContext, mix: number, presetId: string) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.convolver = context.createConvolver();

    this.setImpulse(presetId);
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(this.convolver).connect(this.wet).connect(this.output);
    this.setMix(mix);
  }

  setMix(mix: number): void {
    const clamped = Math.min(1, Math.max(0, mix));
    rampParam(this.context, this.dry.gain, 1 - clamped * 0.3);
    rampParam(this.context, this.wet.gain, clamped * 0.7);
  }

  setImpulse(presetId: string): void {
    this.convolver.buffer = createImpulseResponse(this.context, presetId);
  }

  dispose(): void {
    this.input.disconnect();
    this.dry.disconnect();
    this.convolver.disconnect();
    this.wet.disconnect();
    this.output.disconnect();
  }
}
