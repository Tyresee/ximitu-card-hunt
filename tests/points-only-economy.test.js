import test from "node:test";
import assert from "node:assert/strict";
import {
  settlePointsOnlyAssetsForMove,
  pointsOnlyDiceFace,
  pointsOnlyDiceRoll,
  pointsOnlyDicePresentation,
} from "../public/prototypes/universal-board/points-only-economy.js";
import {
  WORLD_PACKS, WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF,
} from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { createHarborMapState } from "../public/prototypes/universal-board/harbor-items-core.js";
import { createPlayerAssetsLedger } from "../public/prototypes/universal-board/session-star-assets.js";
import { createFairyState } from "../public/prototypes/universal-board/treasure-core.js";
import { teacherDiceFaces, teacherDiceRoll, sampleTeacherDice } from "../public/prototypes/universal-board/teacher-dice.js";
import { DEFAULT_DICE_PACK, DICE_PACK_FAMILY_IDS, runtimeDiceFaces, rollDicePackFamily } from "../public/prototypes/universal-board/dice-pack-core.js";
import { turnRewardProfile } from "../public/prototypes/universal-board/experience-core.js";
import { createPointsWorld, planPointsMove } from "../standalone/points-movement.mjs";

const teacher = { mode: "teacher-led", teacherDiceRef: "teacher-dice.v1" };
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function fixture(nodeId, worldRef = CLOUD_HARBOR_WORLD_REF) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  const ledger = createPlayerAssetsLedger({ playerIds: ["a", "b"] });
  ledger.playerAssetsById.a.coins = 17;
  ledger.playerAssetsById.a.stars = 6;
  ledger.playerAssetsById.a.acceptedTurns = 12;
  ledger.acceptedTurnsTotal = 12;
  return {
    ledger, composition, ownerId: "a", movingTeamId: "player-a", settlementId: "next-turn",
    effects: [],
    movedRuntime: {
      teams: [{ id: "player-a", nodeId }, { id: "player-b", nodeId: composition.board.startNodeId }],
      world: { active: { instanceId: "world-instance", worldPackRef: worldRef,
        mapState: structuredClone(composition.level.initialMapState || {}),
        levelState: structuredClone(composition.level.initialLevelState || {}) } },
    },
  };
}
function assertNeutral(result, ledger) {
  assert.strictEqual(result.ledger, ledger, "historical balances and counters are not rewritten");
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.fairy, createFairyState());
  assert.deepEqual(result.landingBonus, { kind: "ordinary", coins: 0, stars: 0, event: null });
  assert.equal(result.landingReward.semanticType, "ordinary");
  assert.equal(result.landingReward.event, null);
  assert.equal(result.landingReward.activeCopy, null);
  assert.equal(result.landingReward.presentationRef, null);
  assert.deepEqual(result.landingReward.rewards, []);
  assert.deepEqual(result.landingReward.events, []);
  assert.equal(result.fairyCaptureNodeId, null);
  assert.equal(result.summary, "");
}

test("every registered current and historical node stops local economy without changing saved balances", () => {
  for (const worldRef of Object.keys(WORLD_PACKS)) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    for (const { id } of composition.board.nodes) {
      const input = freeze(fixture(id, worldRef));
      const before = JSON.stringify(input);
      const result = settlePointsOnlyAssetsForMove(input);
      assertNeutral(result, input.ledger);
      assert.equal(result.landingNodeId, id);
      assert.equal(JSON.stringify(input), before, `${worldRef}#${id} must not mutate its inputs`);
    }
  }
});

test("transport settles its committed destination while pass-through nodes stay inert", () => {
  for (const [fromNodeId, toNodeId] of [["n06a", "n09"], ["n34", "n37"]]) {
    const input = fixture(toNodeId);
    input.effects = [
      { type: "pawn_step", nodeId: fromNodeId },
      { type: "transport_move", actorTeamId: "player-a", fromNodeId, toNodeId,
        worldRef: CLOUD_HARBOR_WORLD_REF, worldInstanceId: "world-instance" },
    ];
    const result = settlePointsOnlyAssetsForMove(freeze(input));
    assert.equal(result.landingNodeId, toNodeId);
    assertNeutral(result, input.ledger);
  }
  const input = fixture("n07a");
  input.effects = ["n06a", "n07a"].map(nodeId => ({ type: "pawn_step", nodeId }));
  assert.equal(settlePointsOnlyAssetsForMove(input).landingNodeId, "n07a");
});

test("old exchange, coin rain, star and card-case cells cannot create resources or choices", () => {
  for (const nodeId of ["n02", "n12a", "n24a", "n24b", "n31a", "n37", "n46"]) {
    const input = fixture(nodeId);
    const first = settlePointsOnlyAssetsForMove(input);
    const repeated = settlePointsOnlyAssetsForMove({ ...input, ledger: first.ledger });
    assertNeutral(first, input.ledger);
    assert.deepEqual(repeated, first, "replaying cannot add local wealth or accepted-answer counts");
  }
});

test("harbor state belongs to upstream movement and is preserved without any old discovery mutation", () => {
  const input = fixture("n12b");
  input.movedRuntime.world.active.mapState = createHarborMapState({ cloudRouteOpen: true });
  input.movedRuntime.world.active.levelState.discoveredNodeIds = ["n02"];
  const result = settlePointsOnlyAssetsForMove(freeze(input));
  assert.deepEqual(result.mapState, input.movedRuntime.world.active.mapState);
  assert.deepEqual(result.levelState, input.movedRuntime.world.active.levelState);
  assert.notStrictEqual(result.mapState, input.movedRuntime.world.active.mapState);
});

test("World02 opens its shared bridge on the final first visit, without awarding per-player collections", () => {
  const input = fixture("w2n35b", BEYOND_CLOUD_WORLD_REF);
  const oldLevel = input.movedRuntime.world.active.levelState;
  oldLevel.discoveredNodeIdsByPlayerId = { a: ["w2n03"] };
  oldLevel.discoveriesByPlayerId = { a: ["old-discovery"] };
  input.effects = [{ type: "pawn_step", nodeId: "w2n35b" }];
  const result = settlePointsOnlyAssetsForMove(freeze(input));
  assert.equal(result.mapState.auroraBridgeOpen, true);
  assert.deepEqual(result.levelState.discoveredNodeIds, ["w2n35b"]);
  assert.deepEqual(result.levelState.discoveredNodeIdsByPlayerId, oldLevel.discoveredNodeIdsByPlayerId);
  assert.deepEqual(result.levelState.discoveriesByPlayerId, oldLevel.discoveriesByPlayerId);
  assertNeutral(result, input.ledger);

  const replay = fixture("w2n35b", BEYOND_CLOUD_WORLD_REF);
  replay.movedRuntime.world.active.levelState = structuredClone(result.levelState);
  replay.movedRuntime.world.active.mapState.auroraBridgeOpen = false;
  assert.equal(settlePointsOnlyAssetsForMove(replay).mapState.auroraBridgeOpen, false,
    "an already discovered shared trigger must not replay its first-state change");
  const passing = fixture("w2n36", BEYOND_CLOUD_WORLD_REF);
  passing.effects = ["w2n35b", "w2n36"].map(nodeId => ({ type: "pawn_step", nodeId }));
  assert.equal(settlePointsOnlyAssetsForMove(passing).mapState.auroraBridgeOpen, false);
});

test("non-economic shared state exactly matches the authoritative points planner", () => {
  for (const steps of [1, 2]) {
    const session = { ...createPointsWorld(["a", "b"]), studentIds: ["a", "b"], completedTurns: 0 };
    const composition = resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES);
    session.world.active = { ...session.world.active, ordinal: 2, worldPackRef: BEYOND_CLOUD_WORLD_REF,
      levelState: structuredClone(composition.level.initialLevelState),
      mapState: structuredClone(composition.level.initialMapState) };
    session.teams = [{ id: "a", nodeId: "w2n34b" }, { id: "b", nodeId: "w2n01" }];
    session.rule = { worlds: [{ worldRef: BEYOND_CLOUD_WORLD_REF,
      boardRef: `${composition.board.id}@${composition.board.version}`,
      levelRef: `${composition.level.id}@${composition.level.version}`,
      nodes: composition.board.nodes.map(({ id }) => ({ nodeId: id, points: 100 })) }] };
    const planned = planPointsMove(session, { studentId: "a", steps, attemptId: "parity-turn",
      nextWorldInstanceId: "next-instance", startLocation: { nodeId: "w2n34b", worldInstanceId: session.world.active.instanceId } });
    const input = fixture(planned.finalLocation.nodeId, BEYOND_CLOUD_WORLD_REF);
    const result = settlePointsOnlyAssetsForMove(input);
    assert.deepEqual(result.mapState, planned.world.active.mapState);
    assert.deepEqual(result.levelState, planned.world.active.levelState);
  }
});

test("mismatched actor, world, final position and unknown map rules fail closed", () => {
  const input = fixture("n09");
  assert.throws(() => settlePointsOnlyAssetsForMove({ ...input, movingTeamId: "missing" }), /actor/);
  assert.throws(() => settlePointsOnlyAssetsForMove({ ...input,
    composition: resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES) }), /composition/);
  assert.throws(() => settlePointsOnlyAssetsForMove({ ...input,
    effects: [{ type: "transport_move", fromNodeId: "n06a", toNodeId: "n37" }] }), /transport target/);
  assert.throws(() => settlePointsOnlyAssetsForMove(fixture("unknown")), /final landing/);
  const missing = fixture("w2n35b", BEYOND_CLOUD_WORLD_REF);
  missing.composition = { ...missing.composition, level: { ...missing.composition.level, landingProfiles: {} } };
  assert.throws(() => settlePointsOnlyAssetsForMove(missing), /registered map profile/);
});

test("dice adaptation retains every locked face and its original sampling frequency", () => {
  const counts = Array(6).fill(0);
  for (let i = 0; i < 600; i++) {
    const source = sampleTeacherDice(teacher, DEFAULT_DICE_PACK, () => (i + 0.5) / 600);
    const before = structuredClone(source);
    const adapted = pointsOnlyDiceRoll(freeze(source));
    counts[adapted.faceIndex]++;
    assert.equal(adapted.faceIndex, source.faceIndex);
    assert.equal(adapted.steps, source.steps);
    assert.equal(adapted.face.id, source.face.id);
    assert.deepEqual(adapted.bonus, { coins: 0, stars: 0 });
    assert.deepEqual(adapted.face.bonus, { coins: 0, stars: 0 });
    assert.equal(adapted.face.label, `${source.steps} 步`);
    assert.equal(adapted.rewardSource, undefined);
    assert.deepEqual(source, before);
  }
  assert.deepEqual(counts, Array(6).fill(100));
  assert.equal(teacherDiceFaces(teacher, DEFAULT_DICE_PACK)[0].bonus.stars, 1,
    "the published historical snapshot is not rewritten");
  for (const family of DICE_PACK_FAMILY_IDS) {
    const source = runtimeDiceFaces(DEFAULT_DICE_PACK, family);
    const adapted = source.map(pointsOnlyDiceFace);
    assert.deepEqual(adapted.map(face => [face.id, face.steps]), source.map(face => [face.id, face.steps]));
    assert.ok(adapted.every(face => face.bonus.coins === 0 && face.bonus.stars === 0));
  }
});

test("historical sampled dice strip card/fairy bonuses without changing the recorded result", () => {
  const pack = structuredClone(DEFAULT_DICE_PACK);
  pack.families.treasure[4] = { steps: 5, reward: { type: "coin", amount: 3 } };
  const source = teacherDiceRoll({ mode: "teacher-led" }, pack, 4);
  source.bonus.cards = 1;
  source.fairyAction = "summon";
  source.face.fairyAction = "summon";
  source.face.reward = { type: "card_case", amount: 1 };
  source.face.weight = 7;
  source.faceLabel = "5 步 · 金币 +3";
  source.faceLabels = ["3 + 金币", "3 + 卡片", "4 + 星星"];
  const result = pointsOnlyDiceRoll(freeze(source));
  assert.equal(result.faceIndex, 4);
  assert.equal(result.steps, 5);
  assert.equal(result.face.weight, 7);
  assert.equal(result.bonus.cards, undefined);
  assert.equal(result.fairyAction, undefined);
  assert.equal(result.face.fairyAction, undefined);
  assert.equal(result.face.reward, undefined);
  assert.equal(result.faceLabel, "5 步");
  assert.equal(result.faceLabels, undefined);
  assert.equal(source.bonus.coins, 3);
  assert.equal(source.bonus.cards, 1);
  assert.throws(() => pointsOnlyDiceRoll({ ...source, steps: 2 }), /disagree/);
  assert.throws(() => pointsOnlyDiceRoll({ ...source, faceIndex: 6 }), /face index/);
  assert.throws(() => pointsOnlyDiceFace({ steps: 0 }), /1–6/);
});

test("old display snapshots without a physical face restore without guessing or exposing old reward labels", () => {
  for (const extra of [{}, { faceIndex: 4, faceId: "treasure-4-card-case" }]) {
    const snapshot = freeze({ label: "寻宝骰", poolId: "treasure", steps: 4,
      bonus: { coins: 2, stars: 1, cards: 1 }, fairyAction: "summon",
      faceLabel: "4 + 两枚金币", faceLabels: ["3 + 卡片", "4 + 两枚金币"],
      dicePackRevision: "historical-revision", ...extra });
    const before = JSON.stringify(snapshot);
    const result = pointsOnlyDicePresentation(snapshot);
    assert.equal(result.steps, 4);
    assert.equal(result.faceLabel, "4 步");
    assert.equal(result.faceLabels, undefined);
    assert.deepEqual(result.bonus, { coins: 0, stars: 0 });
    assert.equal(result.fairyAction, undefined);
    assert.equal(Object.hasOwn(result, "faceIndex"), Object.hasOwn(snapshot, "faceIndex"));
    assert.equal(result.faceIndex, snapshot.faceIndex);
    assert.equal(result.faceId, snapshot.faceId);
    assert.equal(result.poolId, snapshot.poolId);
    assert.equal(result.dicePackRevision, snapshot.dicePackRevision);
    assert.equal(JSON.stringify(snapshot), before);
  }
  assert.throws(() => pointsOnlyDicePresentation({ steps: 0 }), /1–6/);
  assert.throws(() => pointsOnlyDicePresentation({ steps: "4" }), /1–6/);
  assert.throws(() => pointsOnlyDicePresentation(null), /presentation/);
  assert.throws(() => pointsOnlyDiceRoll({ steps: 4 }), /face index/,
    "presentation compatibility must not weaken a real sampled roll");
});

test("a real 45-point voice result keeps the starter die and receives no local extra reward", () => {
  const profile = turnRewardProfile({ resolution: "accepted", aiScore: 45 });
  assert.equal(profile.score, 45);
  assert.equal(profile.diceTier, "starter");
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const source = rollDicePackFamily(DEFAULT_DICE_PACK, profile.diceTier, () => (faceIndex + 0.5) / 6);
    const result = pointsOnlyDiceRoll(source);
    assert.equal(result.faceIndex, faceIndex);
    assert.equal(result.steps, [1, 1, 1, 2, 2, 2][faceIndex]);
    assert.deepEqual(result.bonus, { coins: 0, stars: 0 });
  }
});
