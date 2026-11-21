// AudioWorklet globals live in a WorkletGlobalScope, not in the DOM lib.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(name: string, processorConstructor: new () => AudioWorkletProcessor): void;

interface AudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: 'a-rate' | 'k-rate';
}

declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;
