import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBoardSoundController } from "../public/prototypes/universal-board/sound-cues.js";

class FakeParameter {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push(["ramp", value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.events.push(["linear-ramp", value, time]);
  }
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeGain extends FakeAudioNode {
  constructor() {
    super();
    this.gain = new FakeParameter();
  }
}

class FakeOscillator extends FakeAudioNode {
  constructor() {
    super();
    this.frequency = new FakeParameter();
    this.listeners = new Map();
    this.type = "sine";
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  start(time) {
    this.startedAt = time;
  }

  stop(time) {
    this.stoppedAt = time;
  }
}

class FakeAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }

  getChannelData(channel) {
    return this.channels[channel];
  }
}

class FakeBufferSource extends FakeAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.listeners = new Map();
    this.playbackRate = new FakeParameter(1);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  start(time) {
    this.startedAt = time;
  }

  stop(time) {
    this.stoppedAt = time;
  }
}

class FakeBiquadFilter extends FakeAudioNode {
  constructor() {
    super();
    this.type = "lowpass";
    this.frequency = new FakeParameter();
    this.detune = new FakeParameter();
    this.Q = new FakeParameter();
    this.gain = new FakeParameter();
  }
}

class FakeDynamicsCompressor extends FakeAudioNode {
  constructor() {
    super();
    this.threshold = new FakeParameter();
    this.knee = new FakeParameter();
    this.ratio = new FakeParameter();
    this.attack = new FakeParameter();
    this.release = new FakeParameter();
  }
}

class FakeWaveShaper extends FakeAudioNode {
  constructor() {
    super();
    this.curve = null;
  }
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.currentTime = 4;
    this.state = "suspended";
    this.sampleRate = 44_100;
    this.destination = new FakeAudioNode();
    this.gains = [];
    this.oscillators = [];
    this.buffers = [];
    this.bufferSources = [];
    this.filters = [];
    this.compressors = [];
    this.limiters = [];
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createBuffer(numberOfChannels, length, sampleRate) {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = new FakeBiquadFilter();
    this.filters.push(filter);
    return filter;
  }

  createDynamicsCompressor() {
    const compressor = new FakeDynamicsCompressor();
    this.compressors.push(compressor);
    return compressor;
  }

  createWaveShaper() {
    const limiter = new FakeWaveShaper();
    this.limiters.push(limiter);
    return limiter;
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }
}

function createFaultyLayerContext(operation) {
  return class FaultyLayerAudioContext extends FakeAudioContext {
    createGain() {
      if (operation === "createGain" && this.gains.length > 0) {
        throw new Error("createGain failed");
      }
      const gain = super.createGain();
      if (operation === "envelope-connect" && this.gains.length > 1) {
        gain.connect = () => {
          throw new Error("envelope connect failed");
        };
      }
      return gain;
    }

    createOscillator() {
      if (operation === "createOscillator") {
        throw new Error("createOscillator failed");
      }
      const oscillator = super.createOscillator();
      if (operation === "source-connect") {
        oscillator.connect = () => {
          throw new Error("source connect failed");
        };
      }
      return oscillator;
    }

    createBuffer(...args) {
      if (operation === "createBuffer") {
        throw new Error("createBuffer failed");
      }
      return super.createBuffer(...args);
    }

    createBufferSource() {
      if (operation === "createBufferSource") {
        throw new Error("createBufferSource failed");
      }
      return super.createBufferSource();
    }

    createBiquadFilter() {
      if (operation === "createBiquadFilter") {
        throw new Error("createBiquadFilter failed");
      }
      const filter = super.createBiquadFilter();
      if (operation === "filter-connect") {
        filter.connect = () => {
          throw new Error("filter connect failed");
        };
      }
      return filter;
    }

    createDynamicsCompressor() {
      if (operation === "createDynamicsCompressor") {
        throw new Error("createDynamicsCompressor failed");
      }
      const compressor = super.createDynamicsCompressor();
      if (operation === "compressor-connect") {
        compressor.connect = () => {
          throw new Error("compressor connect failed");
        };
      }
      return compressor;
    }
  };
}

function createFakeWindow({ AudioContext = FakeAudioContext } = {}) {
  let timerId = 0;
  const timers = new Map();
  return {
    AudioContext,
    webkitAudioContext: null,
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
    timerCount() {
      return timers.size;
    },
  };
}

function createMemoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set("voice-word-attack:board-sound-enabled", initialValue);
  }
  return {
    writes: [],
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
      this.writes.push([key, value]);
    },
  };
}

async function scheduleCue(cue, detail = {}) {
  FakeAudioContext.instances = [];
  const windowRef = createFakeWindow();
  const controller = createBoardSoundController({ windowRef });
  assert.equal(await controller.unlock(), true);
  assert.equal(controller.play(cue, detail), true);
  return {
    context: FakeAudioContext.instances[0],
    controller,
    windowRef,
  };
}

function frequencySweeps(nodes) {
  return nodes.map((node) => ({
    start: node.frequency.events[0][1],
    end: node.frequency.events.at(-1)[1],
  }));
}

function scheduledSpan(context) {
  const sources = [...context.oscillators, ...context.bufferSources];
  return Math.max(...sources.map((source) => source.stoppedAt))
    - Math.min(...sources.map((source) => source.startedAt));
}

test("board sounds require unlock and schedule every supported cue at classroom volume", async () => {
  FakeAudioContext.instances = [];
  const windowRef = createFakeWindow();
  const controller = createBoardSoundController({ windowRef });

  assert.equal(controller.isEnabled(), true);
  assert.equal(controller.play("event-open"), false);
  assert.equal(FakeAudioContext.instances.length, 0);
  assert.equal(await controller.unlock(), true);

  const context = FakeAudioContext.instances[0];
  assert.equal(context.state, "running");
  assert.equal(context.gains[0].gain.value, 2.56);
  assert.equal(context.compressors.length, 1);
  assert.equal(context.compressors[0].threshold.value, -6);
  assert.equal(context.compressors[0].knee.value, 6);
  assert.equal(context.compressors[0].ratio.value, 12);
  assert.equal(context.compressors[0].attack.value, 0.003);
  assert.equal(context.compressors[0].release.value, 0.18);
  assert.equal(context.limiters.length, 1);
  assert.deepEqual(context.gains[0].connections, [context.compressors[0]]);
  assert.deepEqual(context.compressors[0].connections, [context.limiters[0]]);
  assert.deepEqual(context.limiters[0].connections, [context.destination]);
  const curve = context.limiters[0].curve;
  assert.equal(curve[2048], 0, "no DC offset or sound when input is silent");
  assert.equal(curve[3072], 0.5, "ordinary peaks retain their original timbre");
  assert.ok(curve.every((sample) => Math.abs(sample) < 0.9), "overlapping peaks stay below clipping");
  assert.ok(curve.every((sample, index) => index === 0 || sample >= curve[index - 1]));

  const cueLayerCounts = {
    step: { tones: 1, noise: 0 },
    "pawn-ready": { tones: 2, noise: 0 },
    "pawn-hop": { tones: 2, noise: 1 },
    "pawn-land": { tones: 2, noise: 1 },
    pickup: { tones: 2, noise: 0 },
    exchange: { tones: 3, noise: 0 },
    "dice-ready-bright": { tones: 3, noise: 0 },
    "dice-ready-steady": { tones: 2, noise: 0 },
    "dice-lock-bright": { tones: 4, noise: 0 },
    "dice-lock-steady": { tones: 2, noise: 0 },
    "dice-spin": { tones: 3, noise: 0 },
    "route-open": { tones: 3, noise: 0 },
    "route-confirm": { tones: 2, noise: 0 },
    "event-open": { tones: 4, noise: 0 },
    "harbor-foghorn": { tones: 4, noise: 1 },
    "mooring-ready": { tones: 2, noise: 0 },
    "mooring-select": { tones: 2, noise: 1 },
    "mooring-grant": { tones: 4, noise: 1 },
    "mooring-anchor": { tones: 4, noise: 2 },
    "mooring-return": { tones: 4, noise: 1 },
    "signal-cannon": { tones: 5, noise: 2 },
    "signal-cannon-charge": { tones: 2, noise: 0 },
    "signal-cannon-launch": { tones: 1, noise: 2 },
    "signal-cannon-reef": { tones: 1, noise: 1 },
    "signal-cannon-land": { tones: 1, noise: 1 },
    "cloudfall-gate": { tones: 7, noise: 2 },
    "departure-beacon": { tones: 6, noise: 1 },
    positive: { tones: 3, noise: 0 },
    challenge: { tones: 3, noise: 0 },
    complete: { tones: 5, noise: 0 },
    skip: { tones: 2, noise: 0 },
  };
  let expectedOscillators = 0;
  let expectedNoiseSources = 0;
  for (const [cue, layerCount] of Object.entries(cueLayerCounts)) {
    assert.equal(controller.play(cue), true, `${cue} should schedule a sound`);
    expectedOscillators += layerCount.tones;
    expectedNoiseSources += layerCount.noise;
    assert.equal(context.oscillators.length, expectedOscillators);
    assert.equal(context.bufferSources.length, expectedNoiseSources);
  }

  assert.equal(controller.play("unknown-cue"), false);
  assert.ok(context.oscillators.every((oscillator) => oscillator.startedAt >= context.currentTime));
  assert.ok(context.oscillators.every((oscillator) => oscillator.stoppedAt > oscillator.startedAt));
  assert.ok(context.oscillators.every((oscillator) => oscillator.frequency.events.length === 2));
  assert.ok(context.bufferSources.every((source) => source.startedAt >= context.currentTime));
  assert.ok(context.bufferSources.every((source) => source.stoppedAt > source.startedAt));
  assert.ok(context.bufferSources.every((source) => source.loop));
  assert.equal(context.filters.length, expectedNoiseSources);
  assert.ok(context.filters.every((filter) => filter.frequency.events.length === 2));
  assert.ok(context.buffers.length >= 1);
  assert.equal(windowRef.timerCount(), expectedOscillators + expectedNoiseSources);

  windowRef.flushTimers();
  assert.ok(context.oscillators.every((oscillator) => oscillator.disconnected));
  assert.ok(context.bufferSources.every((source) => source.disconnected));
  assert.ok(context.filters.every((filter) => filter.disconnected));
  assert.ok(context.gains.slice(1).every((gain) => gain.disconnected));
  assert.equal(windowRef.timerCount(), 0);

  controller.destroy();
  await Promise.resolve();
  assert.equal(context.state, "closed");
  assert.ok(context.compressors[0].disconnected);
});

test("harbor cues use distinct timbres and contours that match each map effect", async () => {
  const foghorn = await scheduleCue("harbor-foghorn");
  const foghornSweeps = frequencySweeps(foghorn.context.oscillators);
  assert.equal(foghorn.context.oscillators.length, 4);
  assert.deepEqual(foghorn.context.filters.map(({ type }) => type), ["lowpass"]);
  assert.ok(Math.min(...foghornSweeps.map(({ start }) => start)) < 140);
  assert.ok(foghornSweeps.every(({ start, end }) => end < start));
  assert.ok(
    Math.max(...foghorn.context.oscillators.map(({ startedAt }) => startedAt))
      - Math.min(...foghorn.context.oscillators.map(({ startedAt }) => startedAt))
      >= 0.68,
    "the foghorn should include a delayed harbor echo",
  );

  const mooringReady = await scheduleCue("mooring-ready");
  assert.equal(mooringReady.context.bufferSources.length, 0);
  assert.ok(
    frequencySweeps(mooringReady.context.oscillators)
      .every(({ start, end }) => end < start),
    "the ready cue should be a quiet downward sonar prompt",
  );

  const mooringSelect = await scheduleCue("mooring-select");
  assert.deepEqual(mooringSelect.context.filters.map(({ type }) => type), ["highpass"]);
  assert.ok(mooringSelect.context.oscillators.some(({ type }) => type === "square"));

  const mooringGrant = await scheduleCue("mooring-grant");
  assert.deepEqual(mooringGrant.context.filters.map(({ type }) => type), ["bandpass"]);
  assert.ok(
    frequencySweeps(mooringGrant.context.oscillators)
      .some(({ start, end }) => start < 200 && end < start),
    "the grant cue should contain the crane's low settling thud",
  );

  const mooringAnchor = await scheduleCue("mooring-anchor");
  assert.deepEqual(
    mooringAnchor.context.filters.map(({ type }) => type).sort(),
    ["highpass", "lowpass"],
  );
  assert.ok(
    frequencySweeps(mooringAnchor.context.oscillators)
      .some(({ start, end }) => start < 200 && end < start),
    "the anchor cue should combine chain detail with a soft low landing",
  );

  const mooringReturn = await scheduleCue("mooring-return");
  assert.deepEqual(mooringReturn.context.filters.map(({ type }) => type), ["bandpass"]);
  assert.ok(
    frequencySweeps(mooringReturn.context.oscillators)
      .filter(({ start, end }) => end > start).length >= 3,
    "returning an anchor should sound like an upward reel",
  );

  const cannon = await scheduleCue("signal-cannon");
  const cannonSweeps = frequencySweeps(cannon.context.oscillators);
  assert.deepEqual(
    cannon.context.filters.map(({ type }) => type).sort(),
    ["bandpass", "lowpass"],
  );
  assert.ok(cannonSweeps.some(({ start, end }) => start < 150 && end < start));
  assert.ok(cannonSweeps.filter(({ start, end }) => end > start).length >= 2);
  assert.ok(scheduledSpan(cannon.context) > 1.1);

  const cannonCharge = await scheduleCue("signal-cannon-charge");
  assert.equal(cannonCharge.context.bufferSources.length, 0);
  assert.ok(
    frequencySweeps(cannonCharge.context.oscillators)
      .every(({ start, end }) => end > start),
    "the charge phase should rise",
  );

  const cannonLaunch = await scheduleCue("signal-cannon-launch");
  assert.deepEqual(
    cannonLaunch.context.filters.map(({ type }) => type).sort(),
    ["bandpass", "lowpass"],
  );
  assert.ok(
    frequencySweeps(cannonLaunch.context.oscillators)
      .some(({ start, end }) => start < 150 && end < start),
    "the launch phase should begin with a soft low boom",
  );

  const cannonReef = await scheduleCue("signal-cannon-reef");
  assert.deepEqual(cannonReef.context.filters.map(({ type }) => type), ["highpass"]);
  assert.ok(
    frequencySweeps(cannonReef.context.oscillators)
      .every(({ start, end }) => end < start),
    "the reef phase should break downward",
  );

  const cannonLand = await scheduleCue("signal-cannon-land");
  assert.deepEqual(cannonLand.context.filters.map(({ type }) => type), ["lowpass"]);
  assert.ok(
    frequencySweeps(cannonLand.context.oscillators)
      .every(({ start, end }) => start < 200 && end < start),
    "the landing phase should end in a soft cloud puff",
  );

  const gate = await scheduleCue("cloudfall-gate");
  const gateSweeps = frequencySweeps(gate.context.oscillators);
  assert.deepEqual(
    gate.context.filters.map(({ type }) => type).sort(),
    ["bandpass", "lowpass"],
  );
  assert.ok(
    gateSweeps.filter(({ start, end }) => start < 300 && end < start).length >= 3,
    "the gate should have three mechanical clacks",
  );
  assert.ok(
    gateSweeps.filter(({ start, end }) => start >= 500 && end > start).length >= 4,
    "the opened cloud steps should chime upward in sequence",
  );

  const beacon = await scheduleCue("departure-beacon");
  const beaconSweeps = frequencySweeps(beacon.context.oscillators);
  assert.deepEqual(beacon.context.filters.map(({ type }) => type), ["bandpass"]);
  assert.ok(Math.max(...beaconSweeps.map(({ end }) => end)) >= 1_500);
  assert.ok(beaconSweeps.filter(({ start, end }) => end > start).length >= 4);

  for (const fixture of [
    foghorn,
    mooringReady,
    mooringSelect,
    mooringGrant,
    mooringAnchor,
    mooringReturn,
    cannon,
    cannonCharge,
    cannonLaunch,
    cannonReef,
    cannonLand,
    gate,
    beacon,
  ]) {
    fixture.controller.destroy();
  }
  await Promise.resolve();
});

test("durationScale compresses both tonal and noise layers for repeat effects", async () => {
  const full = await scheduleCue("signal-cannon");
  const repeat = await scheduleCue("signal-cannon", { durationScale: 0.55 });

  assert.equal(repeat.context.oscillators.length, full.context.oscillators.length);
  assert.equal(repeat.context.bufferSources.length, full.context.bufferSources.length);
  assert.ok(scheduledSpan(repeat.context) < scheduledSpan(full.context) * 0.65);

  for (let index = 0; index < full.context.oscillators.length; index += 1) {
    const fullTone = full.context.oscillators[index];
    const repeatTone = repeat.context.oscillators[index];
    assert.ok(
      repeatTone.stoppedAt - repeatTone.startedAt
        < fullTone.stoppedAt - fullTone.startedAt,
    );
  }
  for (let index = 0; index < full.context.bufferSources.length; index += 1) {
    const fullNoise = full.context.bufferSources[index];
    const repeatNoise = repeat.context.bufferSources[index];
    assert.ok(
      repeatNoise.stoppedAt - repeatNoise.startedAt
        < fullNoise.stoppedAt - fullNoise.startedAt,
    );
  }

  full.controller.destroy();
  repeat.controller.destroy();
  await Promise.resolve();
});

test("compact harbor cues finish inside their reduced-motion visual phases", async () => {
  const compactPlans = [
    ["harbor-foghorn", 0.26, 0.3],
    ["mooring-grant", 0.27, 0.22],
    ["mooring-anchor", 0.27, 0.22],
    ["mooring-return", 0.27, 0.22],
    ["signal-cannon-charge", 0.18, 0.06],
    ["signal-cannon-launch", 0.15, 0.11],
    ["signal-cannon-reef", 0.25, 0.07],
    ["signal-cannon-land", 0.4, 0.09],
    ["cloudfall-gate", 0.22, 0.27],
    ["departure-beacon", 0.2, 0.27],
  ];

  for (const [cue, durationScale, maximumSpan] of compactPlans) {
    const fixture = await scheduleCue(cue, { durationScale });
    const span = scheduledSpan(fixture.context);
    assert.ok(
      span <= maximumSpan,
      `${cue} compact span ${span}s should stay within ${maximumSpan}s`,
    );
    fixture.controller.destroy();
  }
  await Promise.resolve();
});

test("noise synthesis is deterministic and never consumes gameplay Math.random", async () => {
  const source = await readFile(
    new URL("../public/prototypes/universal-board/sound-cues.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bMath\.random\s*\(/);

  const first = await scheduleCue("harbor-foghorn");
  const second = await scheduleCue("harbor-foghorn");
  assert.ok(first.context.buffers.length >= 1);
  assert.ok(second.context.buffers.length >= 1);

  const firstSamples = [...first.context.buffers[0].getChannelData(0).slice(0, 256)];
  const secondSamples = [...second.context.buffers[0].getChannelData(0).slice(0, 256)];
  assert.ok(firstSamples.some((sample) => sample !== 0));
  assert.deepEqual(firstSamples, secondSamples);

  first.controller.destroy();
  second.controller.destroy();
  await Promise.resolve();
});

test("harbor sound cues stay attached to their matching animation phases", async () => {
  const appSource = await readFile(
    new URL("../public/prototypes/universal-board/app.js", import.meta.url),
    "utf8",
  );
  const block = (startMarker, endMarker) => {
    const start = appSource.indexOf(startMarker);
    const end = appSource.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
    return appSource.slice(start, end);
  };

  const soundScale = block(
    "function facilitySoundDurationScale",
    "function sleep",
  );
  assert.match(soundScale, /reducedMotionRequested\(\)/);

  for (const [startMarker, endMarker, cue] of [
    ["async function playHarborFoghorn", "async function playCommittedRouteEventConfirmation", "harbor-foghorn"],
    ["async function playCloudfallGate", "async function playDepartureBeacon", "cloudfall-gate"],
    ["async function playDepartureBeacon", "async function playLandingConfirmation", "departure-beacon"],
  ]) {
    const presenter = block(startMarker, endMarker);
    assert.match(presenter, new RegExp(`boardSounds\\.play\\("${cue}"`));
    assert.match(presenter, /durationScale:\s*facilitySoundDurationScale/);
  }

  assert.doesNotMatch(appSource, /boardSounds\.play\("mooring-/,
    "retired anchor sounds must not be played by the classroom UI");

  const longTransport = block(
    "async function playLongTransportMove",
    "async function playTransportMove",
  );
  const longCharge = longTransport.indexOf('"signal-cannon-charge"');
  const longLaunch = longTransport.indexOf('"signal-cannon-launch"');
  const longLand = longTransport.indexOf('"signal-cannon-land"');
  assert.ok(longTransport.indexOf("await animateCameraTo") < longCharge);
  assert.ok(longTransport.indexOf("if (!sourcePawn)") < longCharge);
  assert.ok(longCharge < longLaunch);
  assert.ok(longLaunch < longTransport.lastIndexOf("await animateCameraTo"));
  assert.ok(longTransport.lastIndexOf("await animateCameraTo") < longLand);

  const shortTransport = block(
    "async function playTransportMove",
    "function normalizeDiceFaces",
  );
  const shortCharge = shortTransport.indexOf('"signal-cannon-charge"');
  const shortLaunch = shortTransport.indexOf('"signal-cannon-launch"');
  const shortReef = shortTransport.indexOf('"signal-cannon-reef"');
  const shortLand = shortTransport.indexOf('"signal-cannon-land"');
  assert.doesNotMatch(shortTransport, /boardSounds\.play\("signal-cannon"/);
  assert.ok(shortTransport.indexOf("await centerTransportPair") < shortCharge);
  assert.ok(shortTransport.indexOf("if (!sourceSpace") < shortCharge);
  assert.ok(shortCharge < shortLaunch);
  assert.ok(shortLaunch < shortReef);
  assert.ok(shortReef < shortLand);
  assert.match(shortTransport, /reefBurst && throughNodeId/);

  assert.doesNotMatch(appSource, /playground|PlaygroundTransport|rainbow-slide|cloud-trampoline/,
    "the slide and trampoline facilities were removed");
});

test("bright dice lock is richer and more upward than the steady lock", async () => {
  FakeAudioContext.instances = [];
  const brightWindow = createFakeWindow();
  const brightController = createBoardSoundController({
    windowRef: brightWindow,
  });
  await brightController.unlock();
  assert.equal(brightController.play("dice-lock-bright"), true);
  const brightContext = FakeAudioContext.instances[0];
  const brightTones = brightContext.oscillators.map((oscillator) => ({
    start: oscillator.frequency.events[0][1],
    end: oscillator.frequency.events[1][1],
  }));

  const steadyWindow = createFakeWindow();
  const steadyController = createBoardSoundController({
    windowRef: steadyWindow,
  });
  await steadyController.unlock();
  assert.equal(steadyController.play("dice-lock-steady"), true);
  const steadyContext = FakeAudioContext.instances[1];
  const steadyTones = steadyContext.oscillators.map((oscillator) => ({
    start: oscillator.frequency.events[0][1],
    end: oscillator.frequency.events[1][1],
  }));

  assert.ok(brightTones.length > steadyTones.length);
  assert.ok(brightTones.every(({ start, end }) => end > start));
  assert.ok(steadyTones.some(({ start, end }) => end < start));
  assert.ok(
    Math.max(...brightTones.map(({ end }) => end))
      > Math.max(...steadyTones.map(({ end }) => end)) * 2,
  );

  brightController.destroy();
  steadyController.destroy();
  await Promise.resolve();
});

test("disabling and destroy silence every active tone and noise voice", async () => {
  FakeAudioContext.instances = [];
  const storage = createMemoryStorage("false");
  const windowRef = createFakeWindow();
  const controller = createBoardSoundController({ windowRef, storage });

  assert.equal(controller.isEnabled(), false);
  assert.equal(await controller.unlock(), false);
  assert.equal(FakeAudioContext.instances.length, 0);

  assert.equal(controller.setEnabled(true), true);
  assert.deepEqual(storage.writes.at(-1), ["voice-word-attack:board-sound-enabled", "true"]);
  assert.equal(await controller.unlock(), true);
  assert.equal(controller.play("signal-cannon", { intensity: 99, pitch: 99 }), true);

  const context = FakeAudioContext.instances[0];
  assert.equal(context.oscillators.length, 5);
  assert.equal(context.bufferSources.length, 2);
  assert.equal(windowRef.timerCount(), 7);
  assert.equal(controller.setEnabled(false), false);
  assert.deepEqual(storage.writes.at(-1), ["voice-word-attack:board-sound-enabled", "false"]);
  assert.ok(context.oscillators.every((oscillator) => oscillator.disconnected));
  assert.ok(context.bufferSources.every((source) => source.disconnected));
  assert.ok(context.filters.every((filter) => filter.disconnected));
  assert.ok(context.gains.slice(1).every((gain) => gain.disconnected));
  assert.equal(windowRef.timerCount(), 0);
  assert.equal(controller.play("positive"), false);
  assert.equal(context.oscillators.length, 5);
  assert.equal(context.bufferSources.length, 2);

  assert.equal(controller.setEnabled(true), true);
  assert.equal(await controller.unlock(), true);
  assert.equal(controller.play("mooring-anchor"), true);
  assert.equal(context.oscillators.length, 9);
  assert.equal(context.bufferSources.length, 4);
  controller.destroy();
  controller.destroy();
  assert.ok(context.oscillators.every((oscillator) => oscillator.disconnected));
  assert.ok(context.bufferSources.every((source) => source.disconnected));
  assert.ok(context.filters.every((filter) => filter.disconnected));
  assert.ok(context.gains.every((gain) => gain.disconnected));
  assert.ok(context.compressors.every((compressor) => compressor.disconnected));
  assert.ok(context.limiters.every((limiter) => limiter.disconnected));
  assert.equal(windowRef.timerCount(), 0);
  assert.equal(context.state, "closed");
});

test("layer creation and connection failures never escape play()", async () => {
  const scenarios = [
    ["createDynamicsCompressor", "step"],
    ["compressor-connect", "step"],
    ["createGain", "signal-cannon-charge"],
    ["createOscillator", "signal-cannon-charge"],
    ["createBuffer", "signal-cannon-launch"],
    ["createBufferSource", "signal-cannon-launch"],
    ["createBiquadFilter", "signal-cannon-launch"],
    ["source-connect", "signal-cannon-charge"],
    ["filter-connect", "signal-cannon-launch"],
    ["envelope-connect", "signal-cannon-launch"],
  ];

  for (const [operation, cue] of scenarios) {
    FakeAudioContext.instances = [];
    const AudioContext = createFaultyLayerContext(operation);
    const windowRef = createFakeWindow({ AudioContext });
    const controller = createBoardSoundController({ windowRef });
    assert.equal(await controller.unlock(), true, `${operation}: unlock`);

    let result = null;
    assert.doesNotThrow(() => {
      result = controller.play(cue);
    }, `${operation}: play should remain fail-soft`);
    assert.equal(typeof result, "boolean");

    controller.destroy();
    const context = FakeAudioContext.instances[0];
    assert.ok(context.oscillators.every((oscillator) => oscillator.disconnected));
    assert.ok(context.bufferSources.every((source) => source.disconnected));
    assert.ok(context.filters.every((filter) => filter.disconnected));
    assert.equal(windowRef.timerCount(), 0);
  }
});

test("missing or failing Web Audio is a safe no-op and destroy is idempotent", async () => {
  const unavailable = createBoardSoundController({
    windowRef: createFakeWindow({ AudioContext: null }),
    storage: {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
    },
  });

  assert.equal(unavailable.isEnabled(), true);
  assert.equal(await unavailable.unlock(), false);
  assert.equal(unavailable.play("step"), false);
  assert.equal(unavailable.setEnabled(false), false);
  unavailable.destroy();
  unavailable.destroy();
  assert.equal(unavailable.isEnabled(), false);
});
