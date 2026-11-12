import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DICE_PACK,
  DICE_PACK_CONTRACT_REF,
  DICE_PACK_FAMILY_IDS,
  DICE_PACK_SCHEMA_VERSION,
  cloneDicePack,
  dicePacksEqual,
  generateLegendaryDiceFamilies,
  normalizeDicePack,
  rollDicePackFamily,
  runtimeDiceFaces,
  updateDicePackFace,
} from "../public/prototypes/universal-board/dice-pack-core.js";

test("the built-in DicePack preserves six explicit physical faces for every legal family", () => {
  assert.equal(DEFAULT_DICE_PACK.schemaVersion, DICE_PACK_SCHEMA_VERSION);
  assert.equal(DEFAULT_DICE_PACK.contractRef, DICE_PACK_CONTRACT_REF);
  assert.deepEqual(Object.keys(DEFAULT_DICE_PACK.families), DICE_PACK_FAMILY_IDS);
  DICE_PACK_FAMILY_IDS.forEach((familyId) => {
    assert.equal(DEFAULT_DICE_PACK.families[familyId].length, 6);
  });
  assert.deepEqual(Object.fromEntries(DICE_PACK_FAMILY_IDS.map((familyId) => [
    familyId,
    DEFAULT_DICE_PACK.families[familyId].map(({ steps }) => steps),
  ])), {
    starter: [1, 1, 1, 2, 2, 2],
    brave: [1, 1, 1, 1, 2, 3],
    support: [1, 2, 3, 3, 4, 4],
    steady: [2, 2, 3, 3, 3, 4],
    sprint: [3, 3, 3, 4, 4, 5],
    treasure: [3, 3, 3, 4, 4, 4],
  });
  assert.deepEqual(
    DEFAULT_DICE_PACK.families.treasure.map(({ reward }) => reward),
    [
      { type: "coin", amount: 1 },
      { type: "coin", amount: 2 },
      { type: "star", amount: 1 },
      { type: "coin", amount: 1 },
      { type: "coin", amount: 2 },
      { type: "star", amount: 1 },
    ],
  );
});

test("DicePack authoring changes a face without exposing score thresholds or a turn result", () => {
  const edited = updateDicePackFace(DEFAULT_DICE_PACK, "starter", 0, {
    steps: 6,
    rewardType: "star",
    rewardAmount: 1,
  });
  assert.deepEqual(edited.families.starter[0], {
    steps: 6,
    reward: { type: "star", amount: 1 },
  });
  assert.equal("score" in edited, false);
  assert.equal("thresholds" in edited, false);
  assert.equal("faceIndex" in edited, false);
  assert.equal("roll" in edited, false);
  assert.equal(DEFAULT_DICE_PACK.families.starter[0].steps, 1);
  assert.equal(dicePacksEqual(edited, DEFAULT_DICE_PACK), false);
  assert.equal(dicePacksEqual(cloneDicePack(DEFAULT_DICE_PACK), DEFAULT_DICE_PACK), true);
});

test("strict DicePack validation rejects silent repair, weights, penalties, and oversized rewards", () => {
  const cases = [
    { ...cloneDicePack(), scoreThresholds: { brave: 60 } },
    {
      ...cloneDicePack(),
      families: { ...cloneDicePack().families, starter: [{ steps: 1, reward: { type: "none", amount: 0 } }] },
    },
    updateRaw("starter", 0, { steps: 0, reward: { type: "none", amount: 0 } }),
    updateRaw("starter", 0, { steps: 2, weight: 10, reward: { type: "none", amount: 0 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "coin", amount: -1 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "coin", amount: 4 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "star", amount: 2 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "gem", amount: 1 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "key", amount: 1 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "fairy", amount: 1 } }),
    updateRaw("starter", 0, { steps: 2, reward: { type: "script", amount: 1 } }),
  ];
  cases.forEach((candidate) => {
    assert.throws(() => normalizeDicePack(candidate), /骰子|骰面|奖励|字段|配置|点数/);
  });
});

test("runtime faces expose only coins or stars and settle from the sampled physical face", () => {
  let edited = updateDicePackFace(DEFAULT_DICE_PACK, "brave", 0, {
    steps: 6,
    rewardType: "coin",
    rewardAmount: 3,
  });
  edited = updateDicePackFace(edited, "brave", 5, {
    steps: 3,
    rewardType: "star",
    rewardAmount: 1,
  });
  const faces = runtimeDiceFaces(edited, "brave");
  assert.equal(faces.length, 6);
  assert.deepEqual(faces[0].bonus, { coins: 3, stars: 0 });
  assert.deepEqual(faces[5].bonus, { coins: 0, stars: 1 });

  const first = rollDicePackFamily(edited, "brave", () => 0);
  assert.equal(first.faceIndex, 0);
  assert.equal(first.steps, 6);
  assert.equal(first.bonus.coins, 3);
  const last = rollDicePackFamily(edited, "brave", () => 0.999999);
  assert.equal(last.faceIndex, 5);
  assert.equal(last.steps, 3);
  assert.equal(last.bonus.stars, 1);
});

test("every treasure face grants exactly one approved random reward", () => {
  const rolls = Array.from({ length: 6 }, (_, index) => (
    rollDicePackFamily(DEFAULT_DICE_PACK, "treasure", () => (index + 0.1) / 6)
  ));
  assert.deepEqual(rolls.map(({ steps }) => steps), [3, 3, 3, 4, 4, 4]);
  assert.deepEqual(rolls.map(({ bonus }) => bonus), [
    { coins: 1, stars: 0 },
    { coins: 2, stars: 0 },
    { coins: 0, stars: 1 },
    { coins: 1, stars: 0 },
    { coins: 2, stars: 0 },
    { coins: 0, stars: 1 },
  ]);
});

test("legendary choice still samples two unique legal families without choosing a face", () => {
  const samples = [0.8, 0.1];
  const options = generateLegendaryDiceFamilies(DEFAULT_DICE_PACK, {
    random: () => samples.shift(),
  });
  assert.equal(options.length, 2);
  assert.equal(new Set(options).size, 2);
  assert.equal(options.every((id) => ["steady", "sprint", "treasure"].includes(id)), true);
  assert.equal(options.some((option) => typeof option === "object"), false);
});

function updateRaw(familyId, faceIndex, face) {
  const candidate = cloneDicePack();
  candidate.families[familyId][faceIndex] = face;
  return candidate;
}
