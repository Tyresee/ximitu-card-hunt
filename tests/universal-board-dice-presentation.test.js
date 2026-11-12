import test from "node:test";
import assert from "node:assert/strict";
import {
  DICE_DOCK_STRENGTH_ORDER,
  HIGH_SCORE_DICE_THRESHOLD,
  diceProbabilitySummary,
  diceSelectionMood,
} from "../public/prototypes/universal-board/dice-presentation.js";
import {
  AI_SCORE_DICE_TIERS,
  turnRewardProfile,
} from "../public/prototypes/universal-board/experience-core.js";
import {
  TREASURE_DICE_POOLS,
} from "../public/prototypes/universal-board/treasure-core.js";

test("dice dock is ordered from strongest presentation to gentlest", () => {
  assert.deepEqual(DICE_DOCK_STRENGTH_ORDER, [
    "treasure",
    "sprint",
    "steady",
    "support",
    "brave",
    "starter",
  ]);
});

test("dice selection mood celebrates only the high-score tier", () => {
  assert.equal(HIGH_SCORE_DICE_THRESHOLD, 80);
  assert.deepEqual(diceSelectionMood({ score: 92 }), {
    id: "celebrate",
    readyCue: "dice-ready-bright",
    lockCue: "dice-lock-bright",
    label: "高分闪耀候场",
  });
  assert.equal(diceSelectionMood({ score: 79 }).id, "steady");
  assert.equal(diceSelectionMood({ score: 45 }).lockCue, "dice-lock-steady");
  assert.equal(diceSelectionMood({ score: null }).id, "steady");
  assert.equal(diceSelectionMood(turnRewardProfile({
    resolution: "primary_wrong",
    aiScore: 45,
  })).lockCue, "dice-lock-steady");
});

test("six honest d6 tiers preserve the confirmed physical faces and probability copy", () => {
  const tiers = [
    AI_SCORE_DICE_TIERS.starter.diceFaces,
    AI_SCORE_DICE_TIERS.brave.diceFaces,
    AI_SCORE_DICE_TIERS.support.diceFaces,
    TREASURE_DICE_POOLS.steady.faces.map((face) => face.steps),
    TREASURE_DICE_POOLS.sprint.faces.map((face) => face.steps),
    TREASURE_DICE_POOLS.treasure.faces.map((face) => face.steps),
  ];
  assert.deepEqual(tiers, [
    [1, 1, 1, 2, 2, 2],
    [1, 1, 1, 1, 2, 3],
    [1, 2, 3, 3, 4, 4],
    [2, 2, 3, 3, 3, 4],
    [3, 3, 3, 4, 4, 5],
    [3, 3, 3, 4, 4, 4],
  ]);
  const expectations = tiers.map((faces) => (
    faces.reduce((total, face) => total + face, 0) / faces.length
  ));
  assert.deepEqual(expectations, [1.5, 1.5, 17 / 6, 17 / 6, 22 / 6, 21 / 6]);
  assert.ok(expectations[4] > expectations[5]);
  assert.deepEqual(tiers.map(diceProbabilitySummary), [
    "6 面低点数 · 0 面高点数",
    "5 面低点数 · 0 面高点数",
    "2 面低点数 · 2 面高点数",
    "2 面低点数 · 1 面高点数",
    "0 面低点数 · 3 面高点数",
    "0 面低点数 · 3 面高点数",
  ]);
});
