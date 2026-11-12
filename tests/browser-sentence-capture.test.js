import test from "node:test";
import assert from "node:assert/strict";

import {
  BROWSER_SENTENCE_AUTO_FINISH_MS,
  BROWSER_SENTENCE_SOURCE,
  BrowserSentenceCapture,
  browserSentenceCaptureSupported,
} from "../public/js/browser-sentence-capture.js";

const CONTEXT = Object.freeze({
  gameSessionId: "game-001",
  turnId: "turn-001",
  learningPackId: "family-have-has",
  learningPackVersion: "0.1.0",
  taskId: "family-01",
});

function speechResults(transcript, isFinal = true) {
  const result = [{ transcript }];
  result.isFinal = isFinal;
  const results = [result];
  results.item = (index) => results[index];
  return results;
}

function fakeScope(Recognition, overrides = {}) {
  return {
    webkitSpeechRecognition: Recognition,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    ...overrides,
  };
}

test("browser sentence capture keeps an idempotent manual-stop fallback", async () => {
  const states = [];
  const lifecycle = [];
  const previews = [];
  let recognition;
  let stopCalls = 0;
  let settled = false;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      stopCalls += 1;
      lifecycle.push("stop-recording");
      queueMicrotask(() => this.onend?.());
    }

    abort() {}
  }

  const scope = fakeScope(FakeRecognition);
  assert.equal(browserSentenceCaptureSupported(scope), true);
  const capture = new BrowserSentenceCapture({
    scope,
    onState: (state) => {
      states.push(state);
      if (state === "scoring") lifecycle.push("state:scoring");
    },
    onPreview: (transcript) => previews.push(transcript),
  });

  const attempt = capture.assess(CONTEXT);
  attempt.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(recognition.continuous, true);

  recognition.onresult?.({
    results: speechResults("She has two apples."),
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(stopCalls, 0);
  assert.equal(capture.active, true);

  capture.stop();
  capture.stop();
  const result = await attempt;

  assert.equal(result.source, BROWSER_SENTENCE_SOURCE);
  assert.equal(result.transcript, "She has two apples.");
  assert.equal(result.result, "teacher_review");
  assert.equal(result.score, null);
  assert.equal(result.valid, false);
  assert.deepEqual(states, ["requesting_permission", "listening", "scoring"]);
  assert.deepEqual(previews, ["She has two apples."]);
  assert.equal(stopCalls, 1);
  assert.deepEqual(lifecycle, ["stop-recording", "state:scoring"]);
});

test("browser sentence capture automatically stops after a final transcript", async () => {
  const states = [];
  let recognition;
  let stopCalls = 0;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      stopCalls += 1;
      queueMicrotask(() => this.onend?.());
    }

    abort() {}
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition),
    autoFinishMs: 5,
    onState: (state) => states.push(state),
  });
  assert.equal(BROWSER_SENTENCE_AUTO_FINISH_MS, 1_800);
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  recognition.onresult?.({
    results: speechResults("She has two apples."),
  });

  const result = await attempt;
  assert.equal(result.result, "teacher_review");
  assert.equal(result.transcript, "She has two apples.");
  assert.equal(stopCalls, 1);
  assert.deepEqual(states, ["requesting_permission", "listening", "scoring"]);
});

test("browser sentence capture restarts after an unexpected recognition end", async () => {
  let recognition;
  let starts = 0;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      starts += 1;
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      queueMicrotask(() => this.onend?.());
    }

    abort() {}
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition),
  });
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  assert.equal(starts, 1);

  recognition.onresult?.({
    results: speechResults("She has", true),
  });
  recognition.onerror?.({ error: "no-speech" });
  recognition.onend?.();
  await Promise.resolve();
  assert.equal(starts, 2);
  assert.equal(capture.active, true);

  recognition.onresult?.({
    results: speechResults("two apples."),
  });
  capture.stop();
  const result = await attempt;

  assert.equal(result.result, "teacher_review");
  assert.equal(result.transcript, "She has two apples.");
});

test("manual finish without speech returns a retry instead of a score", async () => {
  let recognition;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      queueMicrotask(() => this.onend?.());
    }

    abort() {}
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition),
  });
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  assert.ok(recognition);
  capture.stop();
  const result = await attempt;

  assert.equal(result.result, "retry");
  assert.equal(result.transcript, "");
  assert.equal(result.score, null);
  assert.equal(result.reason, "browser_no_speech");
});

test("manual finish has a short flush fallback when the browser omits onend", async () => {
  let recognition;
  let stopCalls = 0;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      stopCalls += 1;
    }

    abort() {}
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition),
    stopTimeoutMs: 10,
  });
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  recognition.onresult?.({
    results: speechResults("She has two apples."),
  });
  capture.stop();
  const result = await attempt;

  assert.equal(stopCalls, 1);
  assert.equal(result.result, "teacher_review");
  assert.equal(result.transcript, "She has two apples.");
  assert.equal(result.reason, "browser_transcript_teacher_review");
});

test("browser sentence timeout discards a partial transcript and cannot award review", async () => {
  let recognition;
  let timeoutCallback;
  let timeoutDelay;
  let stopCalls = 0;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {
      stopCalls += 1;
    }

    abort() {}
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition, {
      setTimeout: (callback, delay) => {
        timeoutCallback = callback;
        timeoutDelay = delay;
        return 1;
      },
      clearTimeout: () => {},
    }),
  });
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  recognition.onresult?.({
    results: speechResults("She has", false),
  });

  assert.equal(timeoutDelay, 60_000);
  timeoutCallback();
  const result = await attempt;

  assert.equal(result.result, "retry");
  assert.equal(result.transcript, "");
  assert.equal(result.score, null);
  assert.equal(result.completeUtterance, false);
  assert.equal(result.reason, "browser_timeout");
  assert.equal(stopCalls, 1);
});

test("destroying browser sentence capture aborts the active attempt", async () => {
  let recognition;
  let abortCalls = 0;
  class FakeRecognition {
    constructor() {
      recognition = this;
    }

    start() {
      queueMicrotask(() => this.onstart?.());
    }

    stop() {}
    abort() {
      abortCalls += 1;
      this.onerror?.({ error: "aborted" });
      this.onend?.();
    }
  }

  const capture = new BrowserSentenceCapture({
    scope: fakeScope(FakeRecognition),
  });
  const attempt = capture.assess(CONTEXT);
  await Promise.resolve();
  capture.destroy();
  capture.destroy();

  await assert.rejects(attempt, (error) => error?.name === "AbortError");
  assert.ok(recognition);
  assert.equal(abortCalls, 1);
  assert.equal(capture.active, false);
});
