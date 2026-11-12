// Classroom speakers need substantially more level than the original quiet mix.
// Keep the cue envelopes/timbres intact; raise both output buses instead.
export const BOARD_SOUND_GAIN = 2.56; // Original 0.16: +24.1 dB (16x amplitude).
export const INTRO_SOUND_GAIN = 2.08; // Original 0.26: +18.1 dB (8x amplitude).

let limiterCurve = null;
function softLimiterCurve() {
  if (limiterCurve) return limiterCurve;
  limiterCurve = Float32Array.from({ length: 4097 }, (_, index) => {
    const sample = (index / 4096) * 2 - 1;
    const magnitude = Math.abs(sample);
    // Leave ordinary cues untouched; round off unusually loud overlapping peaks.
    const limited = magnitude <= 0.75
      ? magnitude
      : 0.75 + 0.15 * Math.tanh((magnitude - 0.75) / 0.15);
    return Math.sign(sample) * limited;
  });
  return limiterCurve;
}

export function createSoundOutput(context, gain) {
  const input = context.createGain();
  input.gain.value = gain;
  const nodes = [input];
  let destination = context.destination;

  try {
    const limiter = context.createWaveShaper();
    nodes.push(limiter);
    limiter.curve = softLimiterCurve();
    limiter.connect(destination);
    destination = limiter;
  } catch {
    // Older Web Audio implementations can still use the compressor alone.
  }

  try {
    const compressor = context.createDynamicsCompressor();
    nodes.push(compressor);
    compressor.threshold.value = -6;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    compressor.connect(destination);
    destination = compressor;
  } catch {
    // A missing compressor must not interrupt gameplay or mute every cue.
  }

  // Without either protection, keep the fallback gain at unity.
  if (destination === context.destination) input.gain.value = Math.min(gain, 1);
  try {
    input.connect(destination);
  } catch (error) {
    for (const node of nodes) node.disconnect?.();
    throw error;
  }
  return {
    input,
    disconnect() {
      for (const node of nodes) node.disconnect?.();
    },
  };
}
