/**
 * Live tape-style slowdown for captured tab audio.
 *
 * A MediaStreamAudioSourceNode has no playbackRate, so incoming frames are
 * written to a ring buffer and read back at `speed` (< 1) with Catmull-Rom
 * interpolation. Because the read rate is slower than the write rate, the
 * buffer inevitably fills; instead of jumping the read cursor (which made a
 * periodic click), a small skip is applied through a short crossfade. The
 * process() callback performs no allocations.
 */
class TimeStretchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'speed',
        defaultValue: 1,
        minValue: 0.7,
        maxValue: 1,
        automationRate: 'k-rate',
      },
    ];
  }

  private readonly capacity = 16384;
  private readonly highWater = 12288;
  private readonly slipSize = 128;
  private readonly crossfade = 64;
  private readonly buffers: Float32Array[];
  private writeIndex = 0;
  private readIndex = 0;
  private primed = false;
  private slipRemaining = 0;

  constructor() {
    super();
    this.buffers = [new Float32Array(this.capacity), new Float32Array(this.capacity)];
  }

  private sample(channel: number, position: number): number {
    const buffer = this.buffers[channel];
    const base = Math.floor(position);
    const fraction = position - base;
    const i1 = ((base % this.capacity) + this.capacity) % this.capacity;
    const i0 = (i1 + this.capacity - 1) % this.capacity;
    const i2 = (i1 + 1) % this.capacity;
    const i3 = (i1 + 2) % this.capacity;
    const p0 = buffer[i0];
    const p1 = buffer[i1];
    const p2 = buffer[i2];
    const p3 = buffer[i3];
    const f2 = fraction * fraction;
    const f3 = f2 * fraction;
    return (
      0.5 *
      (2 * p1 + (-p0 + p2) * fraction + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
    );
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channels = Math.min(2, output.length);
    const speed = parameters.speed?.[0] ?? 1;
    const frames = output[0].length;

    if (input && input.length > 0) {
      const inputChannels = input.length;
      for (let i = 0; i < frames; i += 1) {
        const slot = this.writeIndex % this.capacity;
        for (let ch = 0; ch < channels; ch += 1) {
          this.buffers[ch][slot] = input[Math.min(ch, inputChannels - 1)][i] ?? 0;
        }
        this.writeIndex += 1;
      }
    }

    if (!this.primed && this.writeIndex - this.readIndex < 256) {
      for (let ch = 0; ch < channels; ch += 1) output[ch].fill(0);
      return true;
    }
    this.primed = true;

    const available = this.writeIndex - this.readIndex;
    if (available < 1) {
      for (let ch = 0; ch < channels; ch += 1) output[ch].fill(0);
      this.readIndex = this.writeIndex;
      return true;
    }

    if (this.slipRemaining === 0 && available > this.highWater) {
      this.slipRemaining = this.crossfade;
    }

    let frameOffset = 0;
    if (this.slipRemaining > 0) {
      const progress = this.crossfade - this.slipRemaining;
      const count = Math.min(frames, this.slipRemaining);
      for (let i = 0; i < count; i += 1) {
        const position = this.readIndex + i * speed;
        const mix = (progress + i) / (this.crossfade - 1);
        for (let ch = 0; ch < channels; ch += 1) {
          const from = this.sample(ch, position);
          const to = this.sample(ch, position + this.slipSize);
          output[ch][i] = from * (1 - mix) + to * mix;
        }
      }
      this.readIndex += count * speed + this.slipSize;
      this.slipRemaining -= count;
      frameOffset = count;
    }

    for (let i = frameOffset; i < frames; i += 1) {
      const position = this.readIndex;
      for (let ch = 0; ch < channels; ch += 1) output[ch][i] = this.sample(ch, position);
      this.readIndex += speed;
    }

    if (this.readIndex > this.writeIndex) this.readIndex = this.writeIndex;
    if (this.readIndex > 1e7) {
      this.readIndex -= 1e7;
      this.writeIndex -= 1e7;
    }
    return true;
  }
}

registerProcessor('time-stretch-processor', TimeStretchProcessor);
