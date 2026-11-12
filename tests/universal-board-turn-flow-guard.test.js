import test from "node:test";
import assert from "node:assert/strict";

import {
  createTurnFlowGuard,
} from "../public/prototypes/universal-board/turn-flow-guard.js";

function turnContext(overrides = {}) {
  return {
    gameSessionId: "session-01",
    turnId: "turn-3",
    learningPackId: "family",
    learningPackVersion: "0.1.0",
    taskId: "family-03",
    ...overrides,
  };
}

function scoredDecision(overrides = {}) {
  return {
    ...turnContext(),
    attemptId: "attempt-01",
    recognitionResultId: "recognition-01",
    source: "aliyun-ssecp",
    result: "accepted",
    valid: true,
    primaryAccepted: true,
    knowledgeStatus: "correct",
    score: 87,
    transcript: "She has two apples.",
    missing: [],
    ...overrides,
  };
}

function teacherDecision(overrides = {}) {
  return {
    ...turnContext(),
    attemptId: "attempt-review-01",
    recognitionResultId: "recognition-review-01",
    source: "browser-speech-teacher-review",
    result: "teacher_review",
    valid: false,
    primaryAccepted: false,
    score: null,
    transcript: "She has two apples.",
    ...overrides,
  };
}

test("an official scored decision issues one opaque command and returns a frozen payload", () => {
  const guard = createTurnFlowGuard();
  const context = turnContext();
  const originalDecision = scoredDecision();
  const command = guard.issueScoredTurnCommand({
    context,
    decision: originalDecision,
  });

  assert.equal(Object.isFrozen(command), true);
  assert.deepEqual(Object.keys(command), []);

  originalDecision.score = 12;
  originalDecision.missing.push("has");
  const payload = guard.consumeTurnCommand(command, { context });

  assert.equal(Object.isFrozen(payload), true);
  assert.equal(Object.isFrozen(payload.context), true);
  assert.equal(Object.isFrozen(payload.speechDecision), true);
  assert.equal(Object.isFrozen(payload.speechDecision.missing), true);
  assert.deepEqual(payload, {
    kind: "scored",
    context,
    attemptId: "attempt-01",
    resolution: "primary_accepted",
    triggerReason: "aliyun_sentence_score",
    speechDecision: scoredDecision(),
  });
  assert.throws(
    () => guard.consumeTurnCommand(command, { context }),
    /forged|foreign|already consumed/i,
  );
});

test("knowledge failure requires both protected signals to agree", () => {
  const guard = createTurnFlowGuard();
  const context = turnContext();
  const payload = guard.consumeTurnCommand(
    guard.issueScoredTurnCommand({
      context,
      decision: scoredDecision({
        primaryAccepted: false,
        knowledgeStatus: "wrong",
        score: 45,
      }),
    }),
    { context },
  );

  assert.equal(payload.resolution, "knowledge_wrong_low_score");
  assert.equal(payload.triggerReason, "knowledge_wrong_low_score");
});

test("scored commands reject incomplete, invalid, untrusted, and out-of-range decisions", () => {
  const invalidDecisions = [
    [{ result: "retry" }, /accepted/i],
    [{ valid: false }, /valid assessment/i],
    [{ attemptId: "" }, /attemptId/i],
    [{ score: Number.NaN }, /finite score/i],
    [{ score: -1 }, /0 to 100/i],
    [{ score: 101 }, /0 to 100/i],
    [{ primaryAccepted: false }, /consistent protected knowledge/i],
    [{ knowledgeStatus: "wrong", score: 45 }, /consistent protected knowledge/i],
    [{
      primaryAccepted: false,
      knowledgeStatus: "wrong",
      score: 92,
    }, /fixed score of 45/i],
    [{
      assessmentPolicy: { policyId: "grammar.have_has" },
      resultContractVersion: "voice-board-assessment-result.v2",
    }, /current result contract/i],
    [{ source: "browser-speech-teacher-review" }, /source is not allowed/i],
    [{ source: "qa-harness" }, /QA source is not enabled/i],
  ];

  for (const [override, expectation] of invalidDecisions) {
    const guard = createTurnFlowGuard();
    assert.throws(
      () => guard.issueScoredTurnCommand({
        context: turnContext(),
        decision: scoredDecision(override),
      }),
      expectation,
    );
  }
});

test("QA scoring is accepted only through an explicitly enabled QA source", () => {
  const guard = createTurnFlowGuard();
  const context = turnContext();
  const decision = scoredDecision({ source: "qa-harness" });
  const command = guard.issueScoredTurnCommand({
    context,
    decision,
    allowQa: true,
  });

  assert.equal(
    guard.consumeTurnCommand(command, { context }).speechDecision.source,
    "qa-harness",
  );
});

test("commands bind every assessment field and reject stale or forged consumers", () => {
  const guard = createTurnFlowGuard();
  const context = turnContext();

  assert.throws(
    () => guard.issueScoredTurnCommand({
      context,
      decision: scoredDecision({ learningPackVersion: "0.2.0" }),
    }),
    /learningPackVersion does not match/i,
  );
  assert.throws(
    () => guard.issueScoredTurnCommand({
      context: turnContext({ taskId: "" }),
      decision: scoredDecision(),
    }),
    /taskId/i,
  );
  assert.throws(
    () => guard.consumeTurnCommand(Object.freeze({}), { context }),
    /forged|foreign/i,
  );

  const command = guard.issueScoredTurnCommand({
    context,
    decision: scoredDecision(),
  });
  assert.throws(
    () => guard.consumeTurnCommand(command, {
      context: turnContext({ turnId: "turn-4" }),
    }),
    /stale/i,
  );
  assert.throws(
    () => guard.consumeTurnCommand(command, { context }),
    /already consumed/i,
  );
});

test("teacher confirmation yields only a support turn and never carries a score", () => {
  for (const score of [null, undefined]) {
    const guard = createTurnFlowGuard();
    const context = turnContext();
    const command = guard.issueTeacherTurnCommand({
      context,
      decision: teacherDecision({ score }),
    });
    const payload = guard.consumeTurnCommand(command, { context });

    assert.equal(payload.kind, "teacher");
    assert.equal(payload.attemptId, "attempt-review-01");
    assert.equal(payload.resolution, "teacher_pass");
    assert.equal(payload.triggerReason, "teacher_pass");
    assert.equal(payload.speechDecision.score, score);
    assert.equal(Object.isFrozen(payload), true);
  }

  const guard = createTurnFlowGuard();
  assert.throws(
    () => guard.issueTeacherTurnCommand({
      context: turnContext(),
      decision: teacherDecision({ score: 80 }),
    }),
    /cannot contain.*score/i,
  );
  assert.throws(
    () => guard.issueTeacherTurnCommand({
      context: turnContext(),
      decision: teacherDecision({ result: "accepted" }),
    }),
    /teacher_review/i,
  );
  assert.throws(
    () => guard.issueTeacherTurnCommand({
      context: turnContext(),
      decision: teacherDecision({ source: "untrusted-review" }),
    }),
    /source is not allowed/i,
  );
});

test("teacher QA commands require the same explicit QA opt-in", () => {
  const context = turnContext();
  const decision = teacherDecision({ source: "qa-harness" });

  assert.throws(
    () => createTurnFlowGuard().issueTeacherTurnCommand({
      context,
      decision,
    }),
    /QA source is not enabled/i,
  );

  const guard = createTurnFlowGuard();
  const command = guard.issueTeacherTurnCommand({
    context,
    decision,
    allowQa: true,
  });
  assert.equal(
    guard.consumeTurnCommand(command, { context }).resolution,
    "teacher_pass",
  );
});
