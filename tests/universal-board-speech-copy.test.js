import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);

function functionSource(source, functionName) {
  const marker = `function ${functionName}(`;
  const functionStart = source.indexOf(marker);
  assert.notEqual(functionStart, -1, `missing named function ${functionName}`);

  const bodyStart = source.indexOf("{", functionStart);
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(functionStart, index + 1);
    }
  }

  assert.fail(`unterminated body for ${functionName}`);
}

function loadFunction(functionName, dependencies = {}) {
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return Function(
    ...names,
    `"use strict"; ${functionSource(appSource, functionName)}; return ${functionName};`,
  )(...values);
}

test("knowledge-point low-score copy uses the active assessment policy name", () => {
  const copy = loadFunction("speechDecisionCopy", {
    diceTierForScore: () => ({ diceLabel: "传奇骰" }),
  });

  assert.equal(copy({
    result: "accepted",
    knowledgeStatus: "wrong",
    score: 45,
    assessmentPolicy: { displayName: "第三人称单数" },
  }), "第三人称单数：这次用错了 · 本轮 45 分");
  assert.equal(copy({
    result: "accepted",
    knowledgeStatus: "wrong",
    score: 45,
    assessmentPolicy: { displayName: "  am / is / are  " },
  }), "am / is / are：这次用错了 · 本轮 45 分");
});

test("knowledge-point low-score copy safely falls back when policy metadata is absent", () => {
  const copy = loadFunction("speechDecisionCopy", {
    diceTierForScore: () => ({ diceLabel: "传奇骰" }),
  });

  for (const assessmentPolicy of [
    undefined,
    null,
    {},
    { displayName: "" },
    { displayName: "   " },
    { displayName: 42 },
  ]) {
    assert.equal(copy({
      result: "accepted",
      knowledgeStatus: "wrong",
      score: 45,
      assessmentPolicy,
    }), "主知识点：这次用错了 · 本轮 45 分");
  }
});

test("wrong-answer guidance needs only the expected form, not a subject", () => {
  const guidance = loadFunction("speechDecisionGuidance", {
    currentTask: () => ({ feedback: { modelContent: "She gets up at seven." } }),
    runtime: {},
    learningPack: {},
  });

  const message = guidance({
    result: "accepted",
    knowledgeStatus: "wrong",
    subject: "She",
    expectedForm: "gets up",
  }, {});
  assert.equal(
    message,
    "这题要用 gets up。本轮按低分完成，继续下一次挑战。",
  );
  assert.doesNotMatch(message, /She/);
});

test("accepted speech decisions must receive a guarded formal-turn command", () => {
  const handler = functionSource(appSource, "handleSentenceDecision");
  assert.match(handler, /turnFlowGuard\.issueScoredTurnCommand/);
  assert.match(handler, /void runAcceptedTurn\(turnCommand\)/);
  assert.doesNotMatch(handler, /resolution:/);
  assert.doesNotMatch(handler, /triggerReason:/);
});

test("speech UI announces listening and scoring only from the real recorder lifecycle", () => {
  const listenerFactory = functionSource(appSource, "ensureSentenceListener");
  const previewStart = listenerFactory.indexOf("onPreview:");
  assert.notEqual(previewStart, -1);
  const previewSource = listenerFactory.slice(previewStart);
  assert.doesNotMatch(previewSource, /speechStatus\s*=\s*["']listening["']/);

  const toggle = functionSource(appSource, "toggleSentenceListening");
  const stopCall = toggle.indexOf("sentenceListener?.stop()");
  assert.notEqual(stopCall, -1);
  const beforeStop = toggle.slice(0, stopCall);
  assert.doesNotMatch(beforeStop, /speechStatus\s*=\s*["']scoring["']/);
  assert.doesNotMatch(beforeStop, /renderSpeechControls\(\)/);
});

test("QA teacher review transcript uses the current canonical answer with a neutral fallback", () => {
  const canonicalTranscript = loadFunction("currentTaskCanonicalTranscript", {
    currentTask: () => ({ feedback: { modelContent: "  He walks to school.  " } }),
    runtime: {},
    learningPack: {},
  });
  const fallbackTranscript = loadFunction("currentTaskCanonicalTranscript", {
    currentTask: () => ({ feedback: { modelContent: "   " } }),
    runtime: {},
    learningPack: {},
  });

  assert.equal(canonicalTranscript(), "He walks to school.");
  assert.equal(fallbackTranscript(), "本题完整回答");
  assert.doesNotMatch(appSource, /She had two apples\./);
  assert.match(
    functionSource(appSource, "handleQaAssessmentEvent"),
    /transcript:\s*currentTaskCanonicalTranscript\(\)/,
  );
});
