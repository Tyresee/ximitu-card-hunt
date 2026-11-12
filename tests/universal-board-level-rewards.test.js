import test from "node:test";
import assert from "node:assert/strict";

import {
  BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/packs.js";
import {
  LEVEL_ONE,
  REWARD_DEFINITIONS,
  levelOneLandingBonus,
  levelOneNodeBinding,
  levelOneNodeKind,
  resolveLevelOneReward,
} from "../public/prototypes/universal-board/level-one.js";

const EXPECTED_REWARD_REFS = Object.freeze({
  n01: "reward.ordinary.none.v1",
  n02: "reward.collect.coin-1.v1",
  n03: "item.harbor.mooring-anchor.v1",
  n04: "reward.choice.route.v1",
  n05a: "reward.ordinary.none.v1",
  n06a: "transport.harbor.signal-cannon.v1",
  n07a: "reward.ordinary.none.v1",
  n05b: "map.harbor.foghorn.v1",
  n06b: "reward.ordinary.none.v1",
  n07b: "reward.ordinary.none.v1",
  n08: "reward.collect.fairy-anchor.v1",
  n09: "reward.ordinary.none.v1",
  n10: "reward.choice.route.v1",
  n11a: "reward.ordinary.none.v1",
  n12a: "reward.collect.star-1.v1",
  n13a: "reward.ordinary.none.v1",
  n11b: "reward.ordinary.none.v1",
  n12b: "map.harbor.cloudfall-gate.v1",
  n13b: "reward.ordinary.none.v1",
  n14: "reward.collect.fairy-anchor.v1",
  n15: "reward.collect.coin-1.v1",
  n16: "reward.ordinary.none.v1",
  n17: "reward.ordinary.none.v1",
  n18: "region.harbor.departure-beacon.v1",

  n19: "reward.collect.coin-1.v1",
  n20: "reward.collect.fairy-anchor.v1",
  n21: "reward.choice.route.v1",
  n22a: "reward.ordinary.none.v1",
  n23a: "reward.collect.star-1.v1",
  n24a: "reward.collect.card-case-1.v1",
  n22b: "reward.ordinary.none.v1",
  n23b: "reward.ordinary.none.v1",
  n24b: "reward.collect.progress-unit.v1",
  n25: "reward.ordinary.none.v1",
  n26: "reward.collect.coin-1.v1",
  n27: "reward.ordinary.none.v1",
  n28: "reward.collect.fairy-anchor.v1",
  n29: "reward.choice.route.v1",

  n30a: "reward.ordinary.none.v1",
  n31a: "reward.event.coin-rain.v1",
  n32a: "reward.ordinary.none.v1",
  n30b: "reward.ordinary.none.v1",
  n31b: "reward.ordinary.none.v1",
  n32b: "reward.collect.star-1.v1",
  n33: "reward.ordinary.none.v1",
  n34: "transport.rainbow-launcher.v1",
  n35: "reward.collect.fairy-anchor.v1",
  n36: "reward.ordinary.none.v1",
  n37: "reward.exchange.coin-card-case.v1",
  n38: "reward.ordinary.none.v1",
  n39: "reward.ordinary.none.v1",
  n40: "reward.collect.star-1.v1",

  n41: "reward.ordinary.none.v1",
  n42: "reward.ordinary.none.v1",
  n43: "reward.display.album-spotlight.v1",
  n44: "reward.ordinary.none.v1",
  n45: "reward.ordinary.none.v1",
  n46: "reward.display.retired-fairy-signal.v1",
  n47: "reward.collect.fairy-anchor.v1",
  n48: "reward.ordinary.none.v1",
  n49: "world.portal.forward.v1",
});

const resolverInput = (overrides = {}) => ({
  nodeId: "n02",
  discoveredNodeIds: [],
  playerAssets: { coins: 0, stars: 0, keys: 0 },
  stableSeed: "classroom-seed-01",
  settlementId: "turn-01:landing",
  ...overrides,
});

test("level one explicitly binds every one of the 61 board nodes", () => {
  const boardNodeIds = BOARD_TEMPLATE.nodes.map(({ id }) => id).sort();
  const bindingNodeIds = Object.keys(LEVEL_ONE.nodeBindings).sort();

  assert.equal(BOARD_TEMPLATE.nodes.length, 61);
  assert.equal(bindingNodeIds.length, 61);
  assert.deepEqual(bindingNodeIds, boardNodeIds);
  assert.deepEqual(
    Object.fromEntries(Object.entries(LEVEL_ONE.nodeBindings).map(
      ([nodeId, binding]) => [nodeId, binding.rewardRef],
    )),
    EXPECTED_REWARD_REFS,
  );
});

test("every node binding resolves to a frozen reward definition, including explicit ordinary nodes", () => {
  const semanticTypes = new Set([
    "ordinary",
    "unknown",
    "choice",
    "collect",
    "combine",
    "display",
  ]);
  for (const [nodeId, binding] of Object.entries(LEVEL_ONE.nodeBindings)) {
    const definition = REWARD_DEFINITIONS[binding.rewardRef];
    assert.ok(definition, `${nodeId} must reference a reward definition`);
    assert.equal(definition.semanticType, binding.semanticType);
    assert.equal(semanticTypes.has(binding.semanticType), true);
    if (binding.semanticType === "ordinary") {
      assert.equal(definition.copy.first, null);
      assert.equal(definition.copy.repeat, null);
      assert.equal(definition.trackDiscovery, false);
    } else {
      assert.equal(typeof definition.copy.first, "string");
      assert.equal(definition.copy.first.length > 0, true);
      assert.equal(typeof definition.copy.repeat, "string");
      assert.equal(definition.copy.repeat.length > 0, true);
      assert.equal(definition.trackDiscovery, true);
    }
    assert.equal(Object.isFrozen(binding), true);
    assert.equal(Object.isFrozen(definition), true);
    definition.resources.forEach(({ resource, amount }) => {
      assert.equal(["coin", "star", "key", "card"].includes(resource), true);
      assert.equal(Number.isInteger(amount) && amount > 0, true);
    });
  }
});

test("n43 is an album display and n49 is a forward portal instead of home", () => {
  assert.equal(LEVEL_ONE.homeNodeId, null);
  assert.deepEqual(levelOneNodeBinding("n43"), {
    semanticType: "display",
    rewardRef: "reward.display.album-spotlight.v1",
  });
  assert.deepEqual(levelOneNodeBinding("n49"), {
    semanticType: "display",
    rewardRef: "world.portal.forward.v1",
  });

  const portal = resolveLevelOneReward(resolverInput({
    nodeId: "n49",
    settlementId: "turn-49:portal",
  }));
  assert.equal(portal.worldTransition, "forward");
  assert.equal(portal.event, "world_portal");
  assert.deepEqual(portal.rewards, []);
});

test("reward resolution is deterministic and exposes first and repeat copy", () => {
  const firstInput = resolverInput();
  const first = resolveLevelOneReward(firstInput);
  const replay = resolveLevelOneReward(structuredClone(firstInput));

  assert.deepEqual(replay, first);
  assert.equal(first.firstVisit, true);
  assert.equal(first.activeCopy, first.copy.first);
  assert.equal(first.idempotencyKey, "level-one.reward:turn-01:landing:n02");
  assert.match(first.stableToken, /^[0-9a-f]{8}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rewards), true);

  const repeat = resolveLevelOneReward(resolverInput({
    discoveredNodeIds: ["n02"],
  }));
  assert.equal(repeat.firstVisit, false);
  assert.equal(repeat.activeCopy, repeat.copy.repeat);
  assert.equal(repeat.copy.first, first.copy.first);
  assert.equal(repeat.copy.repeat, first.copy.repeat);
});

test("the legacy resolver keeps resources separate from the explicit coin exchange event", () => {
  const cases = [
    ["n02", [{ resource: "coin", amount: 1 }]],
    ["n24a", [{ resource: "star", amount: 1 }]],
    ["n12a", [{ resource: "star", amount: 1 }]],
    ["n31a", [{ resource: "coin", amount: 2 }]],
    ["n37", []],
    ["n43", []],
  ];
  for (const [nodeId, expectedRewards] of cases) {
    const result = resolveLevelOneReward(resolverInput({
      nodeId,
      settlementId: `settlement:${nodeId}`,
    }));
    assert.deepEqual(result.rewards, expectedRewards);
  }

  for (const nodeId of Object.keys(LEVEL_ONE.nodeBindings)) {
    const result = resolveLevelOneReward(resolverInput({
      nodeId,
      settlementId: `all-nodes:${nodeId}`,
    }));
    result.rewards.forEach(({ resource }) => {
      assert.equal(["coin", "star", "key", "card"].includes(resource), true);
    });
  }
  const exchange = resolveLevelOneReward(resolverInput({
    nodeId: "n37",
    settlementId: "settlement:n37:exchange",
  }));
  assert.equal(exchange.event, "coin_card_exchange");
  assert.deepEqual(exchange.rewards, []);
});

test("progress rewards deterministically fill the nearest existing recipe unit", () => {
  const coin = resolveLevelOneReward(resolverInput({
    nodeId: "n24b",
    playerAssets: { coins: 2, stars: 0, keys: 0 },
    settlementId: "progress:coin",
  }));
  assert.deepEqual(coin.rewards, [{ resource: "coin", amount: 1 }]);

  const star = resolveLevelOneReward(resolverInput({
    nodeId: "n24b",
    playerAssets: { coins: 0, stars: 2, keys: 0 },
    settlementId: "progress:star",
  }));
  assert.deepEqual(star.rewards, [{ resource: "star", amount: 1 }]);
  assert.equal(star.event, null);
});

test("ordinary nodes are stable no-op settlements with no discovery copy or selection", () => {
  const ordinary = resolveLevelOneReward(resolverInput({
    nodeId: "n01",
    discoveredNodeIds: [],
    settlementId: "ordinary:n01",
  }));
  assert.equal(ordinary.semanticType, "ordinary");
  assert.equal(ordinary.trackDiscovery, false);
  assert.equal(ordinary.firstVisit, false);
  assert.equal(ordinary.activeCopy, null);
  assert.deepEqual(ordinary.copy, { first: null, repeat: null });
  assert.deepEqual(ordinary.rewards, []);
  assert.equal(ordinary.event, null);
  assert.equal(ordinary.selection, null);
  assert.equal(ordinary.worldTransition, null);
});

test("the former card-choice node is now one explicit card-case reward", () => {
  const cardCaseInput = resolverInput({
    nodeId: "n24a",
    settlementId: "reward:card-case",
  });
  const cardCase = resolveLevelOneReward(cardCaseInput);
  assert.deepEqual(resolveLevelOneReward(cardCaseInput), cardCase);
  assert.equal(cardCase.selection, null);
  assert.deepEqual(cardCase.rewards, [{ resource: "star", amount: 1 }]);
});

test("the resolver rejects learning, speech and score fields at its boundary", () => {
  for (const forbiddenField of [
    "task",
    "taskId",
    "learningPackId",
    "transcript",
    "score",
    "diceTier",
  ]) {
    assert.throws(
      () => resolveLevelOneReward({
        ...resolverInput(),
        [forbiddenField]: "forbidden",
      }),
      new RegExp(`unsupported reward resolver input: ${forbiddenField}`),
    );
  }
  assert.throws(
    () => resolveLevelOneReward(resolverInput({
      playerAssets: { coins: 0, stars: 0, keys: 0, score: 99 },
    })),
    /unsupported player asset field: score/,
  );
});

test("legacy node-kind and landing APIs remain compatible while new bindings stay opt-in", () => {
  assert.equal(levelOneNodeKind("n02"), "coin");
  assert.deepEqual(levelOneLandingBonus("n02", 0), {
    kind: "coin",
    coins: 1,
    stars: 0,
    keys: 0,
    event: null,
  });
  assert.equal(levelOneNodeKind("n05b"), "foghorn");
  assert.deepEqual(levelOneLandingBonus("n05b", 0), {
    kind: "foghorn",
    coins: 0,
    stars: 0,
    keys: 0,
    event: "harbor_foghorn",
  });
  assert.equal(levelOneNodeKind("n43"), "learning");
  assert.equal(levelOneNodeBinding("missing-node"), null);
});
