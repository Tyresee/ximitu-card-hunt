import test from "node:test";
import assert from "node:assert/strict";
import { BailianSentenceListener } from "../public/js/bailian-speech.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "suspended";
    this.audioWorklet = { addModule: async () => {} };
  }

  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }
}

class FakeAudioWorkletNode {
  constructor() {
    this.port = { onmessage: null };
  }

  disconnect() {}
}

const CURRENT_CONTEXT = Object.freeze({
  gameSessionId: "game-001",
  turnId: "turn-007",
  attemptId: "attempt-003",
  learningPackId: "family-have-has",
  learningPackVersion: "1.2.0",
  taskId: "family-task-04",
});

function createHarness(overrides = {}) {
  FakeWebSocket.instances = [];
  const states = [];
  const transcripts = [];
  const decisions = [];
  const microphone = { stopCount: 0 };
  const listener = new BailianSentenceListener({
    ...CURRENT_CONTEXT,
    WebSocketCtor: FakeWebSocket,
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{
          stop: () => {
            microphone.stopCount += 1;
          },
        }],
      }),
    },
    AudioContextCtor: FakeAudioContext,
    AudioWorkletNodeCtor: FakeAudioWorkletNode,
    onState: (state) => states.push(state),
    onTranscript: (payload) => transcripts.push(payload),
    onDecision: (payload) => decisions.push(payload),
    ...overrides,
  });
  return {
    listener,
    states,
    transcripts,
    decisions,
    microphone,
  };
}

async function connect(listener) {
  const started = listener.start();
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeWebSocket.instances.at(-1);
  assert.ok(socket, "listener should create a WebSocket");
  socket.open();
  socket.message({ type: "ready", provider: "bailian", model: "fun-asr-realtime" });
  await started;
  return socket;
}

function transcriptMessage(overrides = {}) {
  return {
    type: "transcript",
    ...CURRENT_CONTEXT,
    transcript: "She has a sister.",
    isFinal: false,
    sentenceId: 12,
    recognitionWindowId: "window-12",
    ...overrides,
  };
}

function decisionMessage(overrides = {}) {
  return {
    type: "answer-resolved",
    ...CURRENT_CONTEXT,
    transcript: "She has a sister.",
    sentenceId: 12,
    recognitionWindowId: "window-12",
    recognitionResultId: "result-12",
    decision: "accepted",
    ...overrides,
  };
}

test("sentence listener uses the dedicated voice-board route and sends identifiers only", async (t) => {
  const { listener } = createHarness();
  t.after(() => listener.destroy());

  const started = listener.start();
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeWebSocket.instances[0];

  assert.match(socket.url, /\/ws\/voice-board-asr$/);
  socket.open();
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    type: "start",
    ...CURRENT_CONTEXT,
  });

  socket.message({ type: "ready", provider: "bailian", model: "fun-asr-realtime" });
  await started;
});

test("interim transcript is displayed but never decides the answer", async (t) => {
  const { listener, transcripts, decisions } = createHarness();
  t.after(() => listener.destroy());
  const socket = await connect(listener);

  socket.message(transcriptMessage());

  assert.equal(transcripts.length, 1);
  assert.deepEqual(transcripts[0], {
    transcript: "She has a sister.",
    isFinal: false,
    sentenceId: 12,
    recognitionWindowId: "window-12",
    provider: "bailian",
  });
  assert.deepEqual(decisions, []);
  assert.equal(socket.readyState, FakeWebSocket.OPEN);
});

test("answer-resolved is handled only for the current turn and task", async (t) => {
  const { listener, transcripts, decisions } = createHarness();
  t.after(() => listener.destroy());
  const socket = await connect(listener);

  socket.message(decisionMessage({ turnId: "turn-old", recognitionResultId: "old-turn" }));
  socket.message(decisionMessage({ taskId: "another-task", recognitionResultId: "wrong-task" }));
  socket.message(decisionMessage());

  assert.equal(transcripts.length, 1);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].recognitionResultId, "result-12");
  assert.equal(decisions[0].turnId, CURRENT_CONTEXT.turnId);
  assert.equal(decisions[0].taskId, CURRENT_CONTEXT.taskId);
});

test("a recognitionResultId is decided only once even after microphone resume", async (t) => {
  const { listener, decisions } = createHarness();
  t.after(() => listener.destroy());
  const firstSocket = await connect(listener);
  const result = decisionMessage({ recognitionResultId: "stable-result-id" });

  firstSocket.message(result);
  assert.equal(decisions.length, 1);

  const resumed = listener.resume();
  await new Promise((resolve) => setImmediate(resolve));
  const secondSocket = FakeWebSocket.instances.at(-1);
  assert.notEqual(secondSocket, firstSocket);
  secondSocket.open();
  secondSocket.message({ type: "ready", provider: "bailian", model: "fun-asr-realtime" });
  await resumed;
  secondSocket.message(result);

  assert.equal(decisions.length, 1);
  assert.equal(secondSocket.readyState, FakeWebSocket.OPEN);
});

test("receiving a decision stops the microphone before notifying the game", async (t) => {
  let socketStateAtDecision = null;
  let stopCountAtDecision = null;
  const harness = createHarness({
    onDecision: () => {
      socketStateAtDecision = FakeWebSocket.instances.at(-1)?.readyState;
      stopCountAtDecision = harness.microphone.stopCount;
      harness.decisions.push("notified");
    },
  });
  const { listener, decisions, microphone, states } = harness;
  t.after(() => listener.destroy());
  const socket = await connect(listener);

  socket.message(decisionMessage());

  assert.equal(socketStateAtDecision, FakeWebSocket.CLOSED);
  assert.equal(stopCountAtDecision, 1);
  assert.equal(microphone.stopCount, 1);
  assert.ok(states.includes("paused"));
  assert.deepEqual(decisions, ["notified"]);
});

test("transcripts and decisions from an old turn are ignored without stopping listening", async (t) => {
  const { listener, transcripts, decisions, microphone, states } = createHarness();
  t.after(() => listener.destroy());
  const socket = await connect(listener);

  socket.message(transcriptMessage({ turnId: "turn-006", isFinal: true }));
  socket.message(decisionMessage({ turnId: "turn-006", recognitionResultId: "old-result" }));

  assert.deepEqual(transcripts, []);
  assert.deepEqual(decisions, []);
  assert.equal(microphone.stopCount, 0);
  assert.equal(socket.readyState, FakeWebSocket.OPEN);
  assert.equal(states.includes("paused"), false);
});
