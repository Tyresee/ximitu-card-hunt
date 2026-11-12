import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settlePointsOnlyAssetsForMove } from "../public/prototypes/universal-board/points-only-economy.js";
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";

import { BOARD_TEMPLATE } from "../public/prototypes/universal-board/packs.js";
import {
  LEVEL_ONE,
  resolveLevelOneReward,
} from "../public/prototypes/universal-board/level-one.js";
import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
} from "../public/prototypes/universal-board/expansion-world.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);

const EXPECTED_WORLD_ONE_ORDINARY = Object.freeze([
  "n01", "n03", "n05a", "n07a", "n06b", "n07b", "n09", "n11a", "n13a",
  "n11b", "n13b", "n16", "n17", "n22a", "n22b", "n23b", "n25",
  "n27", "n30a", "n32a", "n30b", "n31b", "n33", "n36", "n38",
  "n39", "n41", "n42", "n44", "n45", "n48",
]);

const EXPECTED_WORLD_TWO_ORDINARY = Object.freeze([
  "w2n01", "w2n02", "w2n05a", "w2n06b", "w2n07", "w2n09",
  "w2n11", "w2n13", "w2n14", "w2n16", "w2n19a", "w2n21a",
  "w2n21b", "w2n22", "w2n24", "w2n26", "w2n27", "w2n29",
  "w2n30", "w2n34a", "w2n35a", "w2n33b", "w2n34b", "w2n37",
  "w2n38", "w2n41", "w2n43", "w2n47a", "w2n46b", "w2n48",
  "w2n50",
]);

function ordinaryIdsForWorldOne() {
  return Object.entries(LEVEL_ONE.nodeBindings)
    .filter(([, binding]) => binding.semanticType === "ordinary")
    .map(([nodeId]) => nodeId);
}

function ordinaryIdsForWorldTwo() {
  return EXPANSION_WORLD_BOARD_TEMPLATE.nodes
    .filter(({ id }) => (
      EXPANSION_WORLD_LANDING_PROFILES[
        EXPANSION_WORLD_LEVEL_PACK.nodeBindings[id]?.rewardRef
      ]?.kind === "ordinary"
    ))
    .map(({ id }) => id);
}

function maximumOrdinaryStreak(board, ordinaryNodeIds) {
  const ordinary = new Set(ordinaryNodeIds);
  const outgoing = new Map(board.nodes.map(({ id }) => [id, []]));
  board.edges.forEach(({ from, to }) => outgoing.get(from)?.push(to));
  let maximum = 0;
  const walk = (nodeId, streak, path) => {
    assert.equal(path.has(nodeId), false, `board path must not loop at ${nodeId}`);
    const nextStreak = ordinary.has(nodeId) ? streak + 1 : 0;
    maximum = Math.max(maximum, nextStreak);
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    (outgoing.get(nodeId) || []).forEach((nextNodeId) => {
      walk(nextNodeId, nextStreak, nextPath);
    });
  };
  walk(board.entry.nodeId, 0, new Set());
  return maximum;
}

function structuralNodeIds(board) {
  return board.nodes
    .filter((node) => (
      ["junction", "transport", "map-effect", "activity", "goal", "portal"]
        .includes(node.spaceRole)
      || Boolean(node.transportProfileRef)
      || Boolean(node.mapEffectRef)
      || Boolean(node.worldExitRef)
    ))
    .map(({ id }) => id);
}

test("World 01 uses 31 ordinary and 30 special nodes after retiring the anchor, with no long empty run", () => {
  const ordinary = ordinaryIdsForWorldOne();
  assert.deepEqual(ordinary, EXPECTED_WORLD_ONE_ORDINARY);
  assert.deepEqual(LEVEL_ONE.ordinaryNodeIds, EXPECTED_WORLD_ONE_ORDINARY);
  assert.equal(ordinary.length, 31);
  assert.equal(BOARD_TEMPLATE.nodes.length - ordinary.length, 30);
  assert.equal(maximumOrdinaryStreak(BOARD_TEMPLATE, ordinary), 2);

  const ordinarySet = new Set(ordinary);
  for (const nodeId of [
    ...structuralNodeIds(BOARD_TEMPLATE),
    ...LEVEL_ONE.anchorNodeIds,
    "n18",
    "n49",
  ]) {
    assert.equal(ordinarySet.has(nodeId), false, `${nodeId} must remain special`);
  }
});

test("World 02 uses an exact 31/31 ordinary-special split with protected structures", () => {
  const ordinary = ordinaryIdsForWorldTwo();
  assert.deepEqual(ordinary, EXPECTED_WORLD_TWO_ORDINARY);
  assert.deepEqual(EXPANSION_WORLD_LEVEL_PACK.ordinaryNodeIds, EXPECTED_WORLD_TWO_ORDINARY);
  assert.equal(ordinary.length, 31);
  assert.equal(EXPANSION_WORLD_BOARD_TEMPLATE.nodes.length - ordinary.length, 31);
  assert.equal(maximumOrdinaryStreak(EXPANSION_WORLD_BOARD_TEMPLATE, ordinary), 2);

  const ordinarySet = new Set(ordinary);
  for (const nodeId of [
    ...structuralNodeIds(EXPANSION_WORLD_BOARD_TEMPLATE),
    "w2n36",
    "w2n51",
    "w2n52",
  ]) {
    assert.equal(ordinarySet.has(nodeId), false, `${nodeId} must remain special`);
  }
});

test("ordinary reward definitions are explicit, silent, and resource-free", () => {
  const cloudHarbor = resolveLevelOneReward({
    nodeId: "n01",
    discoveredNodeIds: [],
    playerAssets: { coins: 2, stars: 2, keys: 1 },
    stableSeed: "ordinary-contract",
    settlementId: "ordinary-contract:n01",
  });
  assert.deepEqual({
    semanticType: cloudHarbor.semanticType,
    firstVisit: cloudHarbor.firstVisit,
    activeCopy: cloudHarbor.activeCopy,
    rewards: cloudHarbor.rewards,
    event: cloudHarbor.event,
    selection: cloudHarbor.selection,
    worldTransition: cloudHarbor.worldTransition,
    trackDiscovery: cloudHarbor.trackDiscovery,
  }, {
    semanticType: "ordinary",
    firstVisit: false,
    activeCopy: null,
    rewards: [],
    event: null,
    selection: null,
    worldTransition: null,
    trackDiscovery: false,
  });

  assert.deepEqual(EXPANSION_WORLD_LANDING_PROFILES["world2.ordinary.v1"], {
    trigger: "final-landing",
    allowedInputs: [
      "boardTemplateRef",
      "nodeId",
      "routeNodeIds",
      "routeEdgeIds",
      "mapState",
      "stableRandomSeed",
      "playerId",
    ],
    kind: "ordinary",
    presentationRef: null,
    settlementPolicy: "no-op",
    trackDiscovery: false,
    rewards: [],
  });
});

test("ordinary landing settlement stays resource-free and silent while home points use the separate final landing service", () => {
  for (const [worldRef, nodeIds] of [
    [CLOUD_HARBOR_WORLD_REF, EXPECTED_WORLD_ONE_ORDINARY],
    [BEYOND_CLOUD_WORLD_REF, EXPECTED_WORLD_TWO_ORDINARY],
  ]) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    for (const nodeId of nodeIds) {
      const ledger = { playerAssetsById: { a: { coins: 5, stars: 2, acceptedTurns: 7 } } };
      const levelState = structuredClone(composition.level.initialLevelState);
      const mapState = structuredClone(composition.level.initialMapState);
      const result = settlePointsOnlyAssetsForMove({ ledger, composition, ownerId: "a",
        movingTeamId: "a", settlementId: "ordinary-final", effects: [],
        movedRuntime: { teams: [{ id: "a", nodeId }], world: { active: {
          worldPackRef: worldRef, levelState, mapState,
        } } },
      });
      assert.strictEqual(result.ledger, ledger);
      assert.deepEqual(result.events, []);
      assert.deepEqual(result.levelState, levelState);
      assert.deepEqual(result.mapState, mapState);
      assert.equal(result.landingReward.semanticType, "ordinary");
      assert.equal(result.landingReward.trackDiscovery, false);
      assert.equal(result.landingReward.activeCopy, null);
      assert.equal(result.landingReward.presentationRef, null);
    }
  }
  assert.match(appSource, /return settlePointsOnlyAssetsForMove\(\{/);
  assert.doesNotMatch(appSource, /function resolveLandingRewardForMove\(/);
  assert.match(
    appSource,
    /landingReward\.semanticType === ["']ordinary["']/,
  );
  assert.match(
    appSource,
    /landingReward\?\.semanticType === ["']ordinary["']\s*\?\s*null/,
  );
  assert.match(appSource, /data-node-settlement/);
  assert.match(appSource, /await playLandingConfirmation\(movingTeam\.id, settledTeam\.nodeId\);[\s\S]{0,150}await landingPoints\.claim/);
  assert.doesNotMatch(
    appSource,
    /发言奖励：个人金币 \+1|settlePlayerAssetTurn\(|coin_card_exchange/,
    "neither an ordinary nor a former resource node may restart the retired economy",
  );
});
