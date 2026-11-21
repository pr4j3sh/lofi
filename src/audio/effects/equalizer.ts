import { rampParam } from './smoothing';

/** Simple two-band EQ: lowshelf + highshelf, gain in decibels. */
export class Equalizer {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;

  constructor(private readonly context: AudioContext) {
    this.input = context.createBiquadFilter();
    this.input.type = 'lowshelf';
    this.input.frequency.value = 200;
    this.output = context.createBiquadFilter();
    this.output.type = 'highshelf';
    this.output.frequency.value = 3200;
    this.input.connect(this.output);
  }

  setBass(db: number): void {
    rampParam(this.context, this.input.gain, db);
  }

  setTreble(db: number): void {
    rampParam(this.context, this.output.gain, db);
  }

  dispose(): void {
    this.input.disconnect();
    this.output.disconnect();
  }
}
