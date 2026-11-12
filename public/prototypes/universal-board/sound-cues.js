import { BOARD_SOUND_GAIN, createSoundOutput } from "./sound-output.js";

const STORAGE_KEY = "voice-word-attack:board-sound-enabled";
const MIN_GAIN = 0.0001;

const CUE_PATTERNS = Object.freeze({
  step: Object.freeze([
    Object.freeze({ frequency: 360, endFrequency: 430, duration: 0.055, gain: 0.065, wave: "triangle" }),
  ]),
  "pawn-ready": Object.freeze([
    Object.freeze({ frequency: 392, endFrequency: 466, duration: 0.08, gain: 0.045, wave: "triangle" }),
    Object.freeze({ frequency: 587, endFrequency: 698, duration: 0.13, gain: 0.055, wave: "sine", offset: 0.06 }),
  ]),
  "pawn-hop": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 520, endFilterFrequency: 240, duration: 0.075, gain: 0.028 }),
    Object.freeze({ frequency: 330, endFrequency: 415, duration: 0.075, gain: 0.052, wave: "triangle", offset: 0.012 }),
    Object.freeze({ frequency: 622, endFrequency: 698, duration: 0.07, gain: 0.028, wave: "sine", offset: 0.055 }),
  ]),
  "pawn-land": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 440, endFilterFrequency: 150, duration: 0.14, gain: 0.042 }),
    Object.freeze({ frequency: 196, endFrequency: 131, duration: 0.13, gain: 0.065, wave: "triangle", offset: 0.012 }),
    Object.freeze({ frequency: 659, endFrequency: 784, duration: 0.14, gain: 0.04, wave: "sine", offset: 0.09 }),
  ]),
  pickup: Object.freeze([
    Object.freeze({ frequency: 620, endFrequency: 760, duration: 0.07, gain: 0.06, wave: "triangle" }),
    Object.freeze({ frequency: 820, endFrequency: 980, duration: 0.11, gain: 0.07, wave: "sine", offset: 0.055 }),
  ]),
  exchange: Object.freeze([
    Object.freeze({ frequency: 440, endFrequency: 520, duration: 0.09, gain: 0.055, wave: "triangle" }),
    Object.freeze({ frequency: 554, endFrequency: 659, duration: 0.11, gain: 0.065, wave: "sine", offset: 0.07 }),
    Object.freeze({ frequency: 698, endFrequency: 831, duration: 0.15, gain: 0.07, wave: "sine", offset: 0.14 }),
  ]),
  "dice-ready-bright": Object.freeze([
    Object.freeze({ frequency: 523, endFrequency: 587, duration: 0.1, gain: 0.065, wave: "triangle" }),
    Object.freeze({ frequency: 659, endFrequency: 740, duration: 0.12, gain: 0.075, wave: "sine", offset: 0.065 }),
    Object.freeze({ frequency: 880, endFrequency: 988, duration: 0.18, gain: 0.085, wave: "sine", offset: 0.135 }),
  ]),
  "dice-ready-steady": Object.freeze([
    Object.freeze({ frequency: 330, endFrequency: 349, duration: 0.14, gain: 0.055, wave: "triangle" }),
    Object.freeze({ frequency: 392, endFrequency: 415, duration: 0.18, gain: 0.06, wave: "sine", offset: 0.09 }),
  ]),
  "dice-lock-bright": Object.freeze([
    Object.freeze({ frequency: 587, endFrequency: 659, duration: 0.08, gain: 0.07, wave: "triangle" }),
    Object.freeze({ frequency: 740, endFrequency: 831, duration: 0.1, gain: 0.08, wave: "sine", offset: 0.055 }),
    Object.freeze({ frequency: 988, endFrequency: 1175, duration: 0.15, gain: 0.09, wave: "triangle", offset: 0.115 }),
    Object.freeze({ frequency: 1319, endFrequency: 1397, duration: 0.22, gain: 0.075, wave: "sine", offset: 0.19 }),
  ]),
  "dice-lock-steady": Object.freeze([
    Object.freeze({ frequency: 440, endFrequency: 392, duration: 0.13, gain: 0.06, wave: "triangle" }),
    Object.freeze({ frequency: 330, endFrequency: 349, duration: 0.2, gain: 0.065, wave: "sine", offset: 0.095 }),
  ]),
  "dice-spin": Object.freeze([
    Object.freeze({ frequency: 220, endFrequency: 330, duration: 0.12, gain: 0.05, wave: "triangle" }),
    Object.freeze({ frequency: 440, endFrequency: 698, duration: 0.18, gain: 0.06, wave: "sawtooth", offset: 0.07 }),
    Object.freeze({ frequency: 784, endFrequency: 988, duration: 0.2, gain: 0.07, wave: "sine", offset: 0.16 }),
  ]),
  "route-open": Object.freeze([
    Object.freeze({ frequency: 349, endFrequency: 370, duration: 0.09, gain: 0.07, wave: "sine" }),
    Object.freeze({ frequency: 466, endFrequency: 494, duration: 0.1, gain: 0.075, wave: "sine", offset: 0.075 }),
    Object.freeze({ frequency: 587, endFrequency: 622, duration: 0.13, gain: 0.08, wave: "triangle", offset: 0.15 }),
  ]),
  "route-confirm": Object.freeze([
    Object.freeze({ frequency: 440, endFrequency: 494, duration: 0.09, gain: 0.075, wave: "triangle" }),
    Object.freeze({ frequency: 659, endFrequency: 698, duration: 0.16, gain: 0.09, wave: "sine", offset: 0.075 }),
  ]),
  "world-portal": Object.freeze([
    Object.freeze({ frequency: 196, endFrequency: 784, duration: 0.72, gain: 0.045, wave: "sine", attack: 0.05 }),
    Object.freeze({ frequency: 294, endFrequency: 1175, duration: 0.78, gain: 0.04, wave: "triangle", offset: 0.08, attack: 0.06 }),
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 420, endFilterFrequency: 2600, duration: 0.82, gain: 0.035, offset: 0.04, attack: 0.08 }),
    Object.freeze({ frequency: 1568, endFrequency: 988, duration: 0.3, gain: 0.045, wave: "sine", offset: 0.72 }),
  ]),
  "world-arrival": Object.freeze([
    Object.freeze({ frequency: 392, endFrequency: 523, duration: 0.18, gain: 0.05, wave: "triangle" }),
    Object.freeze({ frequency: 659, endFrequency: 784, duration: 0.22, gain: 0.06, wave: "sine", offset: 0.12 }),
    Object.freeze({ frequency: 988, endFrequency: 1319, duration: 0.34, gain: 0.065, wave: "sine", offset: 0.26 }),
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 1500, endFilterFrequency: 4200, duration: 0.3, gain: 0.018, offset: 0.28 }),
  ]),
  "world-scan": Object.freeze([
    Object.freeze({ frequency: 330, endFrequency: 990, duration: 0.38, gain: 0.04, wave: "sine", attack: 0.03 }),
    Object.freeze({ frequency: 660, endFrequency: 1320, duration: 0.3, gain: 0.035, wave: "triangle", offset: 0.12 }),
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 900, endFilterFrequency: 3100, duration: 0.42, gain: 0.02, offset: 0.04 }),
  ]),
  "world-prism": Object.freeze([
    Object.freeze({ frequency: 523, endFrequency: 784, duration: 0.18, gain: 0.045, wave: "sine" }),
    Object.freeze({ frequency: 659, endFrequency: 1047, duration: 0.22, gain: 0.05, wave: "sine", offset: 0.09 }),
    Object.freeze({ frequency: 988, endFrequency: 1568, duration: 0.32, gain: 0.045, wave: "triangle", offset: 0.2 }),
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 2400, endFilterFrequency: 5200, duration: 0.22, gain: 0.014, offset: 0.24 }),
  ]),
  "world-whale": Object.freeze([
    Object.freeze({ frequency: 164, endFrequency: 220, duration: 0.62, gain: 0.065, wave: "sine", attack: 0.07 }),
    Object.freeze({ frequency: 246, endFrequency: 330, duration: 0.54, gain: 0.035, wave: "triangle", offset: 0.08, attack: 0.06 }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 700, endFilterFrequency: 1500, duration: 0.48, gain: 0.018, offset: 0.12 }),
  ]),
  "world-aurora": Object.freeze([
    Object.freeze({ frequency: 392, endFrequency: 1175, duration: 0.58, gain: 0.042, wave: "sine", attack: 0.05 }),
    Object.freeze({ frequency: 587, endFrequency: 1568, duration: 0.64, gain: 0.035, wave: "triangle", offset: 0.08, attack: 0.06 }),
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 1200, endFilterFrequency: 4800, duration: 0.52, gain: 0.02, offset: 0.06 }),
  ]),
  "world-moon": Object.freeze([
    Object.freeze({ frequency: 220, endFrequency: 196, duration: 0.46, gain: 0.05, wave: "sine", attack: 0.04 }),
    Object.freeze({ frequency: 440, endFrequency: 659, duration: 0.34, gain: 0.04, wave: "triangle", offset: 0.12 }),
    Object.freeze({ frequency: 880, endFrequency: 988, duration: 0.26, gain: 0.035, wave: "sine", offset: 0.3 }),
  ]),
  "event-open": Object.freeze([
    Object.freeze({ frequency: 294, endFrequency: 330, duration: 0.16, gain: 0.075, wave: "triangle" }),
    Object.freeze({ frequency: 440, endFrequency: 466, duration: 0.13, gain: 0.07, wave: "sine", offset: 0.065 }),
    Object.freeze({ frequency: 587, endFrequency: 622, duration: 0.15, gain: 0.075, wave: "sine", offset: 0.13 }),
    Object.freeze({ frequency: 784, endFrequency: 831, duration: 0.2, gain: 0.08, wave: "sine", offset: 0.205 }),
  ]),
  "harbor-foghorn": Object.freeze([
    Object.freeze({ frequency: 131, endFrequency: 123, duration: 0.72, gain: 0.1, wave: "triangle", attack: 0.07 }),
    Object.freeze({ frequency: 196, endFrequency: 185, duration: 0.68, gain: 0.055, wave: "sine", offset: 0.015, attack: 0.06 }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 620, endFilterFrequency: 300, duration: 0.62, gain: 0.028, offset: 0.02, attack: 0.05 }),
    Object.freeze({ frequency: 131, endFrequency: 116, duration: 0.4, gain: 0.045, wave: "sine", offset: 0.68, attack: 0.045 }),
    Object.freeze({ frequency: 196, endFrequency: 175, duration: 0.34, gain: 0.025, wave: "sine", offset: 0.72, attack: 0.04 }),
  ]),
  "mooring-ready": Object.freeze([
    Object.freeze({ frequency: 392, endFrequency: 349, duration: 0.11, gain: 0.035, wave: "triangle" }),
    Object.freeze({ frequency: 659, endFrequency: 587, duration: 0.16, gain: 0.04, wave: "sine", offset: 0.08 }),
  ]),
  "mooring-select": Object.freeze([
    Object.freeze({ frequency: 1100, endFrequency: 700, duration: 0.045, gain: 0.035, wave: "square" }),
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 2200, endFilterFrequency: 900, duration: 0.09, gain: 0.025, offset: 0.025 }),
    Object.freeze({ frequency: 440, endFrequency: 247, duration: 0.12, gain: 0.045, wave: "triangle", offset: 0.04 }),
  ]),
  "mooring-grant": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 420, endFilterFrequency: 260, duration: 0.48, gain: 0.025, attack: 0.04 }),
    Object.freeze({ frequency: 820, endFrequency: 610, duration: 0.055, gain: 0.035, wave: "square", offset: 0.12 }),
    Object.freeze({ frequency: 760, endFrequency: 570, duration: 0.05, gain: 0.032, wave: "square", offset: 0.24 }),
    Object.freeze({ frequency: 190, endFrequency: 130, duration: 0.18, gain: 0.07, wave: "triangle", offset: 0.44 }),
    Object.freeze({ frequency: 523, endFrequency: 659, duration: 0.2, gain: 0.045, wave: "sine", offset: 0.56 }),
  ]),
  "mooring-anchor": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 2600, endFilterFrequency: 900, duration: 0.34, gain: 0.035 }),
    Object.freeze({ frequency: 740, endFrequency: 420, duration: 0.055, gain: 0.035, wave: "square", offset: 0.1 }),
    Object.freeze({ frequency: 660, endFrequency: 360, duration: 0.055, gain: 0.032, wave: "square", offset: 0.19 }),
    Object.freeze({ frequency: 165, endFrequency: 82, duration: 0.24, gain: 0.09, wave: "sine", offset: 0.3 }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 900, endFilterFrequency: 240, duration: 0.28, gain: 0.055, offset: 0.32 }),
    Object.freeze({ frequency: 494, endFrequency: 523, duration: 0.16, gain: 0.035, wave: "sine", offset: 0.5 }),
  ]),
  "mooring-return": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 520, endFilterFrequency: 880, duration: 0.35, gain: 0.025, attack: 0.035 }),
    Object.freeze({ frequency: 620, endFrequency: 790, duration: 0.05, gain: 0.03, wave: "square", offset: 0.08 }),
    Object.freeze({ frequency: 700, endFrequency: 920, duration: 0.05, gain: 0.028, wave: "square", offset: 0.18 }),
    Object.freeze({ frequency: 330, endFrequency: 587, duration: 0.25, gain: 0.045, wave: "triangle", offset: 0.28 }),
    Object.freeze({ frequency: 784, endFrequency: 988, duration: 0.18, gain: 0.04, wave: "sine", offset: 0.47 }),
  ]),
  "signal-cannon": Object.freeze([
    Object.freeze({ frequency: 220, endFrequency: 880, duration: 0.32, gain: 0.035, wave: "sawtooth" }),
    Object.freeze({ frequency: 440, endFrequency: 1320, duration: 0.28, gain: 0.03, wave: "sine", offset: 0.08 }),
    Object.freeze({ frequency: 120, endFrequency: 55, duration: 0.32, gain: 0.105, wave: "sine", offset: 0.28 }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 1800, endFilterFrequency: 180, duration: 0.34, gain: 0.085, offset: 0.29 }),
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 1400, endFilterFrequency: 720, duration: 0.55, gain: 0.042, offset: 0.46, attack: 0.04 }),
    Object.freeze({ frequency: 880, endFrequency: 440, duration: 0.16, gain: 0.04, wave: "triangle", offset: 0.92 }),
    Object.freeze({ frequency: 160, endFrequency: 92, duration: 0.18, gain: 0.055, wave: "sine", offset: 0.99 }),
  ]),
  "signal-cannon-charge": Object.freeze([
    Object.freeze({ frequency: 220, endFrequency: 880, duration: 0.24, gain: 0.035, wave: "sawtooth" }),
    Object.freeze({ frequency: 440, endFrequency: 1320, duration: 0.2, gain: 0.03, wave: "sine", offset: 0.055 }),
  ]),
  "signal-cannon-launch": Object.freeze([
    Object.freeze({ frequency: 120, endFrequency: 55, duration: 0.3, gain: 0.105, wave: "sine" }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 1800, endFilterFrequency: 180, duration: 0.32, gain: 0.085 }),
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 1400, endFilterFrequency: 720, duration: 0.5, gain: 0.042, offset: 0.12, attack: 0.04 }),
  ]),
  "signal-cannon-reef": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 2600, endFilterFrequency: 980, duration: 0.15, gain: 0.055 }),
    Object.freeze({ frequency: 880, endFrequency: 440, duration: 0.16, gain: 0.04, wave: "triangle", offset: 0.015 }),
  ]),
  "signal-cannon-land": Object.freeze([
    Object.freeze({ frequency: 160, endFrequency: 92, duration: 0.18, gain: 0.055, wave: "sine" }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 560, endFilterFrequency: 170, duration: 0.16, gain: 0.04, offset: 0.015 }),
  ]),
  "cloudfall-gate": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 320, endFilterFrequency: 520, duration: 0.58, gain: 0.022, attack: 0.04 }),
    Object.freeze({ frequency: 260, endFrequency: 180, duration: 0.055, gain: 0.045, wave: "square", offset: 0.02 }),
    Object.freeze({ frequency: 245, endFrequency: 170, duration: 0.05, gain: 0.042, wave: "square", offset: 0.13 }),
    Object.freeze({ frequency: 230, endFrequency: 160, duration: 0.05, gain: 0.04, wave: "square", offset: 0.24 }),
    Object.freeze({ kind: "noise", filterType: "lowpass", filterFrequency: 700, endFilterFrequency: 2600, duration: 0.72, gain: 0.05, offset: 0.24, attack: 0.06 }),
    Object.freeze({ frequency: 523, endFrequency: 587, duration: 0.18, gain: 0.04, wave: "sine", offset: 0.42 }),
    Object.freeze({ frequency: 659, endFrequency: 740, duration: 0.18, gain: 0.045, wave: "sine", offset: 0.58 }),
    Object.freeze({ frequency: 784, endFrequency: 880, duration: 0.18, gain: 0.05, wave: "sine", offset: 0.74 }),
    Object.freeze({ frequency: 1047, endFrequency: 1319, duration: 0.24, gain: 0.05, wave: "sine", offset: 0.86 }),
  ]),
  "departure-beacon": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "bandpass", filterFrequency: 800, endFilterFrequency: 2200, duration: 0.65, gain: 0.028, attack: 0.08 }),
    Object.freeze({ frequency: 392, endFrequency: 370, duration: 0.65, gain: 0.06, wave: "sine" }),
    Object.freeze({ frequency: 784, endFrequency: 740, duration: 0.55, gain: 0.035, wave: "sine", offset: 0.02 }),
    Object.freeze({ frequency: 523, endFrequency: 659, duration: 0.22, gain: 0.045, wave: "triangle", offset: 0.18 }),
    Object.freeze({ frequency: 659, endFrequency: 784, duration: 0.22, gain: 0.05, wave: "triangle", offset: 0.42 }),
    Object.freeze({ frequency: 784, endFrequency: 1047, duration: 0.25, gain: 0.055, wave: "triangle", offset: 0.68 }),
    Object.freeze({ frequency: 1319, endFrequency: 1568, duration: 0.3, gain: 0.045, wave: "sine", offset: 0.92 }),
  ]),
  // Coin-gain FX: one bright ding per arriving coin (callers raise pitch per coin).
  "coin-ding": Object.freeze([
    Object.freeze({ frequency: 1568, endFrequency: 1661, duration: 0.07, gain: 0.05, wave: "sine" }),
    Object.freeze({ frequency: 2093, endFrequency: 2217, duration: 0.11, gain: 0.032, wave: "triangle", offset: 0.03 }),
  ]),
  "coin-burst": Object.freeze([
    Object.freeze({ kind: "noise", filterType: "highpass", filterFrequency: 2400, endFilterFrequency: 5200, duration: 0.18, gain: 0.03 }),
    Object.freeze({ frequency: 784, endFrequency: 1175, duration: 0.14, gain: 0.05, wave: "triangle", offset: 0.01 }),
  ]),
  "coin-jackpot": Object.freeze([
    Object.freeze({ frequency: 659, endFrequency: 698, duration: 0.12, gain: 0.06, wave: "triangle" }),
    Object.freeze({ frequency: 880, endFrequency: 932, duration: 0.12, gain: 0.065, wave: "sine", offset: 0.08 }),
    Object.freeze({ frequency: 1319, endFrequency: 1397, duration: 0.3, gain: 0.07, wave: "sine", offset: 0.16 }),
  ]),
  positive: Object.freeze([
    Object.freeze({ frequency: 523, endFrequency: 554, duration: 0.12, gain: 0.075, wave: "sine" }),
    Object.freeze({ frequency: 659, endFrequency: 698, duration: 0.13, gain: 0.08, wave: "sine", offset: 0.07 }),
    Object.freeze({ frequency: 784, endFrequency: 880, duration: 0.2, gain: 0.09, wave: "triangle", offset: 0.14 }),
  ]),
  challenge: Object.freeze([
    Object.freeze({ frequency: 196, endFrequency: 220, duration: 0.16, gain: 0.055, wave: "triangle" }),
    Object.freeze({ frequency: 294, endFrequency: 311, duration: 0.15, gain: 0.065, wave: "triangle", offset: 0.08 }),
    Object.freeze({ frequency: 392, endFrequency: 415, duration: 0.2, gain: 0.075, wave: "sine", offset: 0.16 }),
  ]),
  complete: Object.freeze([
    Object.freeze({ frequency: 523, endFrequency: 554, duration: 0.11, gain: 0.07, wave: "sine" }),
    Object.freeze({ frequency: 659, endFrequency: 698, duration: 0.12, gain: 0.075, wave: "sine", offset: 0.065 }),
    Object.freeze({ frequency: 784, endFrequency: 831, duration: 0.13, gain: 0.08, wave: "sine", offset: 0.13 }),
    Object.freeze({ frequency: 988, endFrequency: 1047, duration: 0.16, gain: 0.08, wave: "triangle", offset: 0.2 }),
    Object.freeze({ frequency: 1175, endFrequency: 1245, duration: 0.27, gain: 0.085, wave: "sine", offset: 0.285 }),
  ]),
  skip: Object.freeze([
    Object.freeze({ frequency: 392, endFrequency: 330, duration: 0.13, gain: 0.06, wave: "triangle" }),
    Object.freeze({ frequency: 294, endFrequency: 247, duration: 0.18, gain: 0.055, wave: "sine", offset: 0.085 }),
  ]),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeStorage(windowRef, providedStorage) {
  if (providedStorage) return providedStorage;
  try {
    return windowRef?.localStorage || null;
  } catch {
    return null;
  }
}

function readEnabled(storage) {
  if (!storage) return true;
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (value === null || value === undefined) return true;
    return value !== false && !["0", "false", "off"].includes(String(value).toLowerCase());
  } catch {
    return true;
  }
}

function writeEnabled(storage, enabled) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Sound remains usable when storage is unavailable or full.
  }
}

function setParameter(parameter, value, time) {
  parameter?.setValueAtTime?.(Math.max(MIN_GAIN, value), time);
}

function rampParameter(parameter, value, time) {
  parameter?.exponentialRampToValueAtTime?.(Math.max(MIN_GAIN, value), time);
}

/**
 * Small, asset-free sound palette for the board prototype.
 *
 * Calling play() never creates or resumes an AudioContext. unlock() must first
 * succeed from a user gesture, keeping the controller within browser autoplay
 * rules.
 */
export function createBoardSoundController({ windowRef = globalThis, storage } = {}) {
  const Context = windowRef?.AudioContext || windowRef?.webkitAudioContext || null;
  const persistence = safeStorage(windowRef, storage);
  const scheduleTimeout = windowRef?.setTimeout?.bind(windowRef) || globalThis.setTimeout?.bind(globalThis);
  const cancelTimeout = windowRef?.clearTimeout?.bind(windowRef) || globalThis.clearTimeout?.bind(globalThis);

  let enabled = readEnabled(persistence);
  let context = null;
  let master = null;
  let output = null;
  let noiseBuffer = null;
  let unlocked = false;
  let destroyed = false;
  const activeVoices = new Set();

  function createContext() {
    if (destroyed || context || !Context) return context;
    try {
      context = new Context();
      output = createSoundOutput(context, BOARD_SOUND_GAIN);
      master = output.input;
      return context;
    } catch {
      output?.disconnect();
      context = null;
      master = null;
      output = null;
      return null;
    }
  }

  function createNoiseBuffer() {
    if (noiseBuffer || !context) return noiseBuffer;
    if (typeof context.createBuffer !== "function") return null;

    const sampleRate = clamp(Number(context.sampleRate) || 44_100, 8_000, 192_000);
    const frameCount = Math.ceil(sampleRate * 2);
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const samples = buffer?.getChannelData?.(0);
    if (!samples) return null;

    // A local xorshift seed keeps presentation audio deterministic without
    // consuming the global gameplay RNG used for legal dice outcomes.
    let state = 0x6d2b79f5;
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      samples[index] = (state / 0xffffffff) * 2 - 1;
    }
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  function stopActiveVoices() {
    for (const voice of [...activeVoices]) {
      try {
        voice.source.stop(context?.currentTime || 0);
      } catch {
        // It is safe to disconnect a source that has already stopped.
      }
      voice.cleanup();
    }
  }

  function scheduleVoice(spec, baseTime, { durationScale, intensity, pitchRatio }) {
    if (!context || !master) return false;

    let source = null;
    let envelope = null;
    let filter = null;
    let cleanupTimer = null;
    let cleaned = false;

    const rawOffset = Math.max(0, Number(spec.offset) || 0);
    const rawDuration = Math.max(0.018, Number(spec.duration) || 0.08);
    const offset = rawOffset * durationScale;
    const duration = rawDuration * durationScale;
    const start = baseTime + offset;
    const end = start + duration;
    const rawAttack = Number.isFinite(Number(spec.attack))
      ? Math.max(0.004, Number(spec.attack))
      : Math.min(0.018, rawDuration * 0.22);
    const attack = Math.min(rawAttack * durationScale, duration * 0.45);

    const voice = {
      get source() {
        return source;
      },
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (cleanupTimer !== null) cancelTimeout?.(cleanupTimer);
        source?.disconnect?.();
        filter?.disconnect?.();
        envelope?.disconnect?.();
        activeVoices.delete(voice);
      },
    };

    try {
      envelope = context.createGain();
      setParameter(envelope.gain, MIN_GAIN, start);
      rampParameter(envelope.gain, Number(spec.gain) * intensity, start + attack);
      rampParameter(envelope.gain, MIN_GAIN, end);

      if (spec.kind === "noise") {
        if (
          typeof context.createBufferSource !== "function"
          || typeof context.createBiquadFilter !== "function"
        ) {
          voice.cleanup();
          return false;
        }
        const buffer = createNoiseBuffer();
        if (!buffer) {
          voice.cleanup();
          return false;
        }
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        filter = context.createBiquadFilter();
        filter.type = spec.filterType || "bandpass";
        if (filter.Q) filter.Q.value = Math.max(0.0001, Number(spec.q) || 0.8);
        const filterStart = Math.max(20, Number(spec.filterFrequency) || 800) * pitchRatio;
        const filterEnd = Math.max(
          20,
          Number(spec.endFilterFrequency) || Number(spec.filterFrequency) || 800,
        ) * pitchRatio;
        setParameter(filter.frequency, filterStart, start);
        rampParameter(filter.frequency, filterEnd, end);
        source.connect(filter);
        filter.connect(envelope);
      } else {
        if (typeof context.createOscillator !== "function") {
          voice.cleanup();
          return false;
        }
        source = context.createOscillator();
        source.type = spec.wave || "sine";
        const frequency = Math.max(20, Number(spec.frequency) || 440);
        const endFrequency = Math.max(20, Number(spec.endFrequency) || frequency);
        setParameter(source.frequency, frequency * pitchRatio, start);
        rampParameter(source.frequency, endFrequency * pitchRatio, end);
        source.connect(envelope);
      }

      envelope.connect(master);
      activeVoices.add(voice);
      source.addEventListener?.("ended", voice.cleanup, { once: true });
      source.start(start);
      source.stop(end + 0.012);
    } catch {
      try {
        source?.stop?.(context?.currentTime || 0);
      } catch {
        // A partially-created Web Audio node may not have started.
      }
      voice.cleanup();
      return false;
    }

    if (scheduleTimeout) {
      cleanupTimer = scheduleTimeout(voice.cleanup, Math.ceil((offset + duration + 0.08) * 1000));
      cleanupTimer?.unref?.();
    }
    return true;
  }

  async function unlock() {
    if (destroyed || !enabled) return false;
    const audioContext = createContext();
    if (!audioContext) return false;

    if (
      audioContext.state !== "running"
      && audioContext.state !== "closed"
      && typeof audioContext.resume === "function"
    ) {
      try {
        await audioContext.resume();
      } catch {
        unlocked = false;
        return false;
      }
    }
    unlocked = audioContext.state === "running";
    return unlocked;
  }

  function setEnabled(nextEnabled) {
    if (destroyed) return false;
    enabled = Boolean(nextEnabled);
    writeEnabled(persistence, enabled);
    if (!enabled) stopActiveVoices();
    return enabled;
  }

  function isEnabled() {
    return enabled && !destroyed;
  }

  function play(cue, detail = {}) {
    try {
      const pattern = CUE_PATTERNS[String(cue || "")];
      if (
        destroyed
        || !enabled
        || !unlocked
        || !context
        || context.state !== "running"
        || !pattern
      ) {
        return false;
      }

      const intensity = clamp(Number(detail.intensity) || 1, 0.5, 1.25);
      const pitchSemitones = clamp(Number(detail.pitch) || 0, -3, 3);
      const durationScale = clamp(Number(detail.durationScale) || 1, 0.15, 1.25);
      const pitchRatio = 2 ** (pitchSemitones / 12);
      const currentTime = Number(context.currentTime);
      const baseTime = (Number.isFinite(currentTime) ? currentTime : 0) + 0.012;
      let scheduled = 0;
      for (const spec of pattern) {
        if (scheduleVoice(spec, baseTime, {
          durationScale,
          intensity,
          pitchRatio,
        })) {
          scheduled += 1;
        }
      }
      return scheduled > 0;
    } catch {
      // Presentation audio must never interrupt dice, movement, or settlement.
      return false;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    unlocked = false;
    stopActiveVoices();
    output?.disconnect();
    if (context && context.state !== "closed") {
      try {
        const result = context.close?.();
        result?.catch?.(() => {});
      } catch {
        // Closing is best-effort during page teardown.
      }
    }
    noiseBuffer = null;
    output = null;
    master = null;
    context = null;
  }

  return {
    unlock,
    setEnabled,
    isEnabled,
    play,
    destroy,
  };
}
