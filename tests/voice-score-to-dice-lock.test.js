import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
  WRONG_KNOWLEDGE_SCORE,
  evaluateAssessmentEvidence,
} from "../public/js/lib/assessment-policy.js";
import {
  commitTriggeredTurn,
  createBoardSession,
} from "../public/js/lib/voice-board-session-core.js";
import {
  acceptAnswer,
  createRuntime,
} from "../public/prototypes/universal-board/engine-core.js";
import {
  turnRewardProfile,
} from "../public/prototypes/universal-board/experience-core.js";
import {
  DEFAULT_DICE_PACK,
  rollDicePackFamily,
  updateDicePackFace,
} from "../public/prototypes/universal-board/dice-pack-core.js";
import {
  ACTIVITY_TEMPLATES,
  BOARD_TEMPLATE,
  EVALUATOR_REGISTRY,
  INTERACTION_TEMPLATES,
  LEARNING_PACKS,
  THEME_PACKS,
} from "../public/prototypes/universal-board/packs.js";
import {
  createTurnFlowGuard,
} from "../public/prototypes/universal-board/turn-flow-guard.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);

const INTERACTION_RENDERERS = {
  "voice.mission-card.v1": () => {},
};

function providerResult(overrides = {}) {
  return {
    overall: 94,
    pron: 92,
    accuracy: 90,
    fluency: { overall: 88 },
    details: [{
      char: "has",
      score: 91,
      phone: [{ score: 90 }, { score: 92 }, { score: 91 }],
    }],
    ...overrides,
  };
}

function turnContext() {
  return {
    gameSessionId: "locked-session-01",
    turnId: "locked-turn-01",
    learningPackId: "family",
    learningPackVersion: "0.1.0",
    taskId: "family-03",
  };
}

function formalDecision(evaluation, overrides = {}) {
  return {
    ...turnContext(),
    attemptId: "locked-attempt-01",
    recognitionResultId: "locked-recognition-01",
    source: "aliyun-ssecp",
    resultContractVersion: "voice-board-assessment-result.v3",
    assessmentPolicy: {
      policyId: DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.id,
      displayName: DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.displayName,
    },
    result: evaluation.gameResult,
    action: evaluation.action,
    valid: true,
    primaryAccepted: evaluation.primaryAccepted,
    knowledgeStatus: evaluation.knowledgeStatus,
    score: evaluation.score,
    expectedForm: evaluation.expectedForm,
    transcript: evaluation.normalizedTranscript,
    ...overrides,
  };
}

function namedFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

test("the locked correct-answer score uses only the 60/25/10/5 evidence weights", () => {
  assert.deepEqual(DEFAULT_HAVE_HAS_ASSESSMENT_POLICY.weights, {
    knowledgeCorrectness: 60,
    targetPronunciation: 25,
    sentencePronunciation: 10,
    fluency: 5,
  });

  const evaluation = evaluateAssessmentEvidence({
    policy: DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
    subject: "she",
    evidence: {
      transcript: "She has two apples.",
      provider: { result: providerResult() },
    },
  });

  assert.equal(evaluation.knowledgeStatus, "correct");
  assert.equal(evaluation.gameResult, "accepted");
  assert.equal(evaluation.primaryAccepted, true);
  assert.equal(evaluation.score, 96.25);
  assert.deepEqual(evaluation.components, {
    knowledgeCorrectness: 100,
    targetPronunciation: 91,
    sentencePronunciation: 91,
    fluency: 88,
  });
});

test("an explicit knowledge mistake shows 45, bypasses teacher review, then rolls and moves without mastery", () => {
  const evaluation = evaluateAssessmentEvidence({
    policy: DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
    subject: "she",
    evidence: {
      transcript: "She have two apples.",
      provider: {
        result: providerResult({
          overall: 100,
          pron: 100,
          accuracy: 100,
          fluency: { overall: 100 },
          details: [{
            char: "has",
            score: 100,
            phone: [{ score: 100 }],
          }],
        }),
      },
    },
  });

  assert.equal(WRONG_KNOWLEDGE_SCORE, 45);
  assert.equal(evaluation.action, "score_low");
  assert.equal(evaluation.gameResult, "accepted");
  assert.equal(evaluation.knowledgeStatus, "wrong");
  assert.equal(evaluation.primaryAccepted, false);
  assert.equal(evaluation.score, 45);

  const guard = createTurnFlowGuard();
  const decision = formalDecision(evaluation);
  assert.throws(
    () => guard.issueTeacherTurnCommand({
      context: turnContext(),
      decision,
    }),
    /teacher_review/i,
    "an explicit wrong answer must never be routed through the teacher-review window",
  );
  const command = guard.issueScoredTurnCommand({
    context: turnContext(),
    decision,
  });
  const payload = guard.consumeTurnCommand(command, {
    context: turnContext(),
  });
  assert.equal(payload.kind, "scored");
  assert.equal(payload.resolution, "knowledge_wrong_low_score");

  const reward = turnRewardProfile({
    resolution: payload.resolution,
    result: decision.result,
    aiScore: decision.score,
  });
  assert.equal(reward.score, 45);
  assert.equal(reward.diceTier, "starter");
  assert.deepEqual(reward.diceFaces, [1, 1, 1, 2, 2, 2]);

  const learningPack = LEARNING_PACKS.positions;
  const runtime = createRuntime({
    board: BOARD_TEMPLATE,
    theme: THEME_PACKS["cloud-harbor"],
    learningPack,
    interactionTemplates: INTERACTION_TEMPLATES,
    evaluatorRegistry: EVALUATOR_REGISTRY,
    interactionRenderers: INTERACTION_RENDERERS,
  });
  const moved = acceptAnswer({
    attemptId: decision.attemptId,
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 2,
  });
  assert.equal(moved.runtime.lastDie, 2);
  assert.equal(moved.runtime.teams[0].nodeId, "n03");
  assert.deepEqual(
    moved.effects.map(({ type }) => type),
    ["answer_accepted", "dice_reveal", "pawn_step", "pawn_step"],
  );

  const session = createBoardSession({
    players: [{
      id: "seat-1",
      displayName: "Student 1",
      teamId: "team-1",
    }],
    teams: [{
      id: "team-1",
      label: "Team 1",
      members: ["Student 1"],
    }],
  });
  const committed = commitTriggeredTurn(session, {
    attemptId: decision.attemptId,
    resolution: payload.resolution,
    triggerReason: payload.triggerReason,
  });
  assert.equal(committed.completedTurns, 1);
  assert.equal(committed.seats[0].opportunityCount, 1);
  assert.equal(committed.seats[0].acceptedCount, 0);
  assert.equal(committed.sharedStars, 0);
});

test("the UI presents the accepted score before starting the dice-and-move transaction", () => {
  const handler = namedFunctionSource(appSource, "handleSentenceDecision");
  const feedbackIndex = handler.indexOf("showSpeechDecisionFeedback(decision)");
  const acceptedTurnIndex = handler.indexOf("void runAcceptedTurn(turnCommand)");

  assert.notEqual(feedbackIndex, -1);
  assert.notEqual(acceptedTurnIndex, -1);
  assert.ok(
    feedbackIndex < acceptedTurnIndex,
    "the real score must render before the dice-and-move transaction starts",
  );
});

test("final landing cannot append a second classroom task or voice-score chain", () => {
  const learningPack = LEARNING_PACKS.positions;
  const runtime = createRuntime({
    board: BOARD_TEMPLATE,
    theme: THEME_PACKS["cloud-harbor"],
    learningPack,
    interactionTemplates: INTERACTION_TEMPLATES,
    evaluatorRegistry: EVALUATOR_REGISTRY,
    interactionRenderers: INTERACTION_RENDERERS,
  });
  const result = acceptAnswer({
    attemptId: "no-second-voice-after-landing",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    landingActivityPolicy: {
      mode: "event",
      nodeId: "n02",
      event: {
        eventId: "legacy.event.v1",
        sourceTaskRef: "positions@0.1.0#position-01",
        templateRef: "draw-and-explain.v1",
        content: {
          title: "旧落点题目",
          instruction: "这条历史配置不得再打开。",
          target: "The ball is under the chair.",
        },
      },
    },
    dieValue: 1,
  });

  assert.equal(result.runtime.currentActivity, null);
  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.effects.some(({ type }) => type === "activity_open"), false);
});

test("the mission result never coerces a no-score teacher review into zero", () => {
  const renderer = namedFunctionSource(appSource, "renderMissionScore");

  assert.match(renderer, /typeof decision\?\.score === ["']number["']/);
  assert.match(renderer, /Number\.isFinite\(decision\.score\)/);
  assert.doesNotMatch(renderer, /Number\(decision\?\.score\)/);
});

test("uncertain evidence has no score, no dice tier, and cannot enter the scored-turn path", () => {
  const evaluation = evaluateAssessmentEvidence({
    policy: DEFAULT_HAVE_HAS_ASSESSMENT_POLICY,
    subject: "she",
    evidence: {
      provider: { result: providerResult({ overall: 100 }) },
    },
  });
  assert.equal(evaluation.knowledgeStatus, "uncertain");
  assert.equal(evaluation.gameResult, "teacher_review");
  assert.equal(evaluation.score, null);

  const reward = turnRewardProfile({
    result: evaluation.gameResult,
    aiScore: evaluation.score,
  });
  assert.equal(reward.diceTier, null);
  assert.equal(reward.diceFaces, null);

  assert.throws(
    () => createTurnFlowGuard().issueScoredTurnCommand({
      context: turnContext(),
      decision: formalDecision(evaluation),
    }),
    /accepted assessment result/i,
  );
});

test("owner-authored DicePack faces cannot alter score tiers or create a roll for no-score evidence", () => {
  const authored = updateDicePackFace(DEFAULT_DICE_PACK, "starter", 0, {
    steps: 6,
    rewardType: "card",
    rewardAmount: 1,
  });
  assert.equal(turnRewardProfile({ result: "accepted", aiScore: 45 }).diceTier, "starter");
  assert.equal(turnRewardProfile({ result: "accepted", aiScore: 60 }).diceTier, "brave");
  assert.equal(turnRewardProfile({ result: "accepted", aiScore: 80 }).diceTier, "legendary");
  assert.equal(turnRewardProfile({ result: "retry", aiScore: null }).diceTier, null);
  assert.equal(turnRewardProfile({ result: "teacher_review", aiScore: null }).diceTier, null);

  const sampled = rollDicePackFamily(authored, "starter", () => 0);
  assert.equal(sampled.faceIndex, 0);
  assert.equal(sampled.steps, 6);
  assert.equal(sampled.bonus.stars, 1);
  assert.equal("score" in sampled, false);
});
