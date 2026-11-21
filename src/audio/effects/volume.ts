import { rampParam } from './smoothing';

/** Master gain with a limiter so stacked wet/dry signals cannot clip. */
export class Volume {
  readonly input: GainNode;
  readonly output: DynamicsCompressorNode;
  private readonly gain: GainNode;

  constructor(private readonly context: AudioContext) {
    this.input = context.createGain();
    this.gain = context.createGain();
    this.output = context.createDynamicsCompressor();
    this.output.threshold.value = -3;
    this.output.knee.value = 3;
    this.output.ratio.value = 20;
    this.output.attack.value = 0.003;
    this.output.release.value = 0.25;
    this.input.connect(this.gain).connect(this.output);
    this.setLevel(1);
  }

  /** `headroom` is a linear gain that leaves room above the limiter for EQ boosts. */
  setLevel(headroom: number): void {
    const safeHeadroom = Math.min(1, Math.max(0, headroom));
    rampParam(this.context, this.gain.gain, safeHeadroom * 0.8);
  }

  dispose(): void {
    this.input.disconnect();
    this.gain.disconnect();
    this.output.disconnect();
  }
}
