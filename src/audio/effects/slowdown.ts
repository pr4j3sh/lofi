import { rampParam } from './smoothing';
import type { LofiSettings } from '../../types';

export function createSlowdownProcessor(context: AudioContext, settings: LofiSettings): AudioWorkletNode {
  const node = new AudioWorkletNode(context, 'time-stretch-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    parameterData: { speed: settings.playbackSpeed },
  });
  return node;
}

export function setSlowdownSpeed(node: AudioWorkletNode, speed: number): void {
  const parameter = node.parameters.get('speed');
  if (parameter) rampParam(node.context, parameter, speed);
}
