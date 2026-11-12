import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NODE_REWARD_PACK,
  NODE_REWARD_CATALOG,
  NODE_REWARD_WORLD_REFS,
  NodeRewardPackValidationError,
  effectiveNodeRewards,
  nodeRewardChangedCount,
  nodeRewardPolicy,
  normalizeNodeRewardPack,
  updateNodeRewardPolicy,
} from "../public/prototypes/universal-board/node-reward-pack-core.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
} from "../public/prototypes/universal-board/world-packs.js";

test("the built-in NodeRewardPack covers every node with only approved explicit rewards", () => {
  const normalized = normalizeNodeRewardPack(DEFAULT_NODE_REWARD_PACK);
  assert.deepEqual(Object.keys(normalized.worlds), NODE_REWARD_WORLD_REFS);
  assert.equal(NODE_REWARD_CATALOG[CLOUD_HARBOR_WORLD_REF].nodes.length, 61);
  assert.equal(NODE_REWARD_CATALOG[BEYOND_CLOUD_WORLD_REF].nodes.length, 62);
  assert.equal(
    NODE_REWARD_CATALOG[CLOUD_HARBOR_WORLD_REF].nodes.filter(({ editable }) => editable).length,
    11,
  );
  assert.equal(
    NODE_REWARD_CATALOG[BEYOND_CLOUD_WORLD_REF].nodes.filter(({ editable }) => editable).length,
    7,
  );
  for (const worldRef of NODE_REWARD_WORLD_REFS) {
    const catalog = NODE_REWARD_CATALOG[worldRef];
    assert.deepEqual(
      Object.keys(normalized.worlds[worldRef].nodes).sort(),
      catalog.nodes.map(({ nodeId }) => nodeId).sort(),
    );
    for (const node of catalog.nodes) {
      assert.match(node.zoneId, /^zone-\d{2}$/);
      assert.deepEqual(
        normalized.worlds[worldRef].nodes[node.nodeId],
        node.editable ? node.baseReward : { type: "none", amount: 0 },
      );
      assert.equal(
        ["none", "coin", "star"].includes(
          normalized.worlds[worldRef].nodes[node.nodeId].type,
        ),
        true,
      );
    }
  }
});

test("one editable resource node can replace its final-landing payout within bounded limits", () => {
  const edited = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    CLOUD_HARBOR_WORLD_REF,
    "n02",
    { type: "coin", amount: 3 },
  );
  assert.deepEqual(
    nodeRewardPolicy(edited, CLOUD_HARBOR_WORLD_REF, "n02"),
    { type: "coin", amount: 3 },
  );
  assert.deepEqual(
    effectiveNodeRewards(
      edited,
      CLOUD_HARBOR_WORLD_REF,
      "n02",
      [{ resource: "coin", amount: 1 }],
    ),
    [{ resource: "coin", amount: 3 }],
  );
  assert.equal(nodeRewardChangedCount(edited), 1);

  const cardCase = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    CLOUD_HARBOR_WORLD_REF,
    "n02",
    { type: "star", amount: 1 },
  );
  assert.deepEqual(
    effectiveNodeRewards(cardCase, CLOUD_HARBOR_WORLD_REF, "n02"),
    [{ resource: "star", amount: 1 }],
  );

  const removed = updateNodeRewardPolicy(
    edited,
    CLOUD_HARBOR_WORLD_REF,
    "n02",
    { type: "none", amount: 0 },
  );
  assert.deepEqual(
    effectiveNodeRewards(
      removed,
      CLOUD_HARBOR_WORLD_REF,
      "n02",
      [{ resource: "coin", amount: 1 }],
    ),
    [],
  );
});

test("locked ordinary, route, transport, event, discovery, and portal nodes reject reward edits", () => {
  const lockedNodes = [
    [CLOUD_HARBOR_WORLD_REF, "n01"],
    [CLOUD_HARBOR_WORLD_REF, "n04"],
    [CLOUD_HARBOR_WORLD_REF, "n06a"],
    [CLOUD_HARBOR_WORLD_REF, "n37"],
    [CLOUD_HARBOR_WORLD_REF, "n49"],
    [BEYOND_CLOUD_WORLD_REF, "w2n03"],
    [BEYOND_CLOUD_WORLD_REF, "w2n52"],
  ];
  lockedNodes.forEach(([worldRef, nodeId]) => {
    assert.throws(
      () => updateNodeRewardPolicy(
        DEFAULT_NODE_REWARD_PACK,
        worldRef,
        nodeId,
        { type: "star", amount: 1 },
      ),
      (error) => (
        error instanceof NodeRewardPackValidationError
        && error.code === "node_reward_pack_invalid"
        && error.statusCode === 422
      ),
      `${worldRef}#${nodeId} must stay locked`,
    );
  });
});

test("strict validation rejects omitted nodes, unknown fields, score inputs, and unsafe amounts", () => {
  const invalidCases = [];

  const omitted = structuredClone(DEFAULT_NODE_REWARD_PACK);
  delete omitted.worlds[CLOUD_HARBOR_WORLD_REF].nodes.n02;
  invalidCases.push(omitted);

  const unknownNode = structuredClone(DEFAULT_NODE_REWARD_PACK);
  unknownNode.worlds[CLOUD_HARBOR_WORLD_REF].nodes.madeUp = {
    type: "none",
    amount: 0,
  };
  invalidCases.push(unknownNode);

  const scoreField = structuredClone(DEFAULT_NODE_REWARD_PACK);
  scoreField.scoreThreshold = 60;
  invalidCases.push(scoreField);

  const amount = structuredClone(DEFAULT_NODE_REWARD_PACK);
  amount.worlds[CLOUD_HARBOR_WORLD_REF].nodes.n02 = {
    type: "coin",
    amount: 99,
  };
  invalidCases.push(amount);

  const movement = structuredClone(DEFAULT_NODE_REWARD_PACK);
  movement.worlds[CLOUD_HARBOR_WORLD_REF].nodes.n02 = {
    type: "coin",
    amount: 1,
    steps: 6,
  };
  invalidCases.push(movement);

  for (const type of ["inherit", "gem", "key"]) {
    const removedType = structuredClone(DEFAULT_NODE_REWARD_PACK);
    removedType.worlds[CLOUD_HARBOR_WORLD_REF].nodes.n02 = {
      type,
      amount: type === "inherit" ? 0 : 1,
    };
    invalidCases.push(removedType);
  }

  const oversizedCardCase = structuredClone(DEFAULT_NODE_REWARD_PACK);
  oversizedCardCase.worlds[CLOUD_HARBOR_WORLD_REF].nodes.n02 = {
    type: "star",
    amount: 2,
  };
  invalidCases.push(oversizedCardCase);

  invalidCases.forEach((candidate) => {
    assert.throws(
      () => normalizeNodeRewardPack(candidate),
      (error) => error.code === "node_reward_pack_invalid" && error.statusCode === 422,
    );
  });
});
