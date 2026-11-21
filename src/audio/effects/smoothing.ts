/** Short linear ramps avoid the click caused by jumping an AudioParam. */
export function rampParam(
  context: AudioContext | BaseAudioContext,
  param: AudioParam,
  value: number,
  seconds = 0.025,
): void {
  const start = context.currentTime + 0.005;
  param.cancelScheduledValues(start);
  param.setValueAtTime(param.value, start);
  param.linearRampToValueAtTime(value, start + seconds);
}
