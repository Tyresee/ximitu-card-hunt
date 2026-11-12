import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_FALLBACK_THEME,
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  LEVEL_ONE,
  forwardAnchorCandidates,
} from "../public/prototypes/universal-board/level-one.js";
import { BOARD_TEMPLATE } from "../public/prototypes/universal-board/packs.js";

function graphFor(board, { includeConditional = true } = {}) {
  const graph = new Map(board.nodes.map((node) => [node.id, []]));
  board.edges
    .filter((edge) => includeConditional || !edge.availableWhen)
    .forEach((edge) => graph.get(edge.from)?.push(edge.to));
  return graph;
}

function reachableNodeIds(board, options) {
  const graph = graphFor(board, options);
  const reachable = new Set([board.entryNodeId]);
  const queue = [board.entryNodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of graph.get(current) || []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  return reachable;
}

function assertAcyclic(board) {
  const graph = graphFor(board);
  const visiting = new Set();
  const visited = new Set();

  function visit(nodeId) {
    if (visiting.has(nodeId)) {
      assert.fail(`cycle reaches ${nodeId}`);
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of graph.get(nodeId) || []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  visit(board.entryNodeId);
  assert.equal(visited.size, board.nodes.length);
}

function findPath(board, from, to, firstEdgeId) {
  const edgesByFrom = new Map();
  board.edges
    .filter((edge) => !edge.availableWhen)
    .forEach((edge) => {
      if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
      edgesByFrom.get(edge.from).push(edge);
    });
  const firstEdge = (edgesByFrom.get(from) || [])
    .find((edge) => edge.id === firstEdgeId);
  if (!firstEdge) return null;
  const queue = [{ nodeId: firstEdge.to, edgeIds: [firstEdge.id] }];
  const visited = new Set();
  while (queue.length) {
    const candidate = queue.shift();
    if (candidate.nodeId === to) return candidate.edgeIds;
    if (visited.has(candidate.nodeId)) continue;
    visited.add(candidate.nodeId);
    for (const edge of edgesByFrom.get(candidate.nodeId) || []) {
      queue.push({
        nodeId: edge.to,
        edgeIds: [...candidate.edgeIds, edge.id],
      });
    }
  }
  return null;
}

function collectObjectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

test("World 02 is a bounded four-zone forward BoardTemplate", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  assert.equal(board.kind, "BoardTemplate");
  assert.deepEqual(board.viewBox, [0, 0, 1200, 620]);
  assert.deepEqual(board.worldSize, { width: 2400, height: 1120 });
  assert.equal(board.zones.length, 4);
  assert.equal(board.artRegions.length, 4);
  assert.equal(board.nodes.length, 62);
  assert.equal(board.edges.length, 66);
  assert.equal(board.entryNodeId, "w2n01");
  assert.equal(board.startNodeId, "w2n01");
  assert.equal(board.forwardExitNodeId, "w2n52");
  assert.equal(board.forwardExit.nodeId, "w2n52");
  assert.equal(board.forwardExit.direction, "forward");
  assert.equal(board.forwardExit.stepCost, 0);
  assert.equal(board.forwardExit.continueRemainingSteps, true);
  assert.deepEqual(board.renderBudget, {
    maxMountedBoards: 1,
    maxRegionImages: 4,
    maxNodes: 72,
    maxEdges: 80,
  });
});

test("World 02 ids, endpoints, geometry and zone ownership are valid", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  const edgeIds = new Set(board.edges.map((edge) => edge.id));
  const zoneById = new Map(board.zones.map((zone) => [zone.id, zone]));

  assert.equal(nodeIds.size, board.nodes.length);
  assert.equal(edgeIds.size, board.edges.length);
  for (const node of board.nodes) {
    const zone = zoneById.get(node.zoneId);
    assert.ok(zone, `${node.id} references an unknown zone`);
    assert.ok(node.x >= zone.bounds.x && node.x <= zone.bounds.x + zone.bounds.width);
    assert.ok(node.y >= zone.bounds.y && node.y <= zone.bounds.y + zone.bounds.height);
  }
  for (const edge of board.edges) {
    assert.ok(nodeIds.has(edge.from), `${edge.id} has an unknown source`);
    assert.ok(nodeIds.has(edge.to), `${edge.id} has an unknown target`);
    assert.match(edge.pathData, /^M\s/);
    assert.equal(typeof edge.terrainType, "string");
    assert.ok(edge.terrainType.length > 0);
  }

  const zoneCounts = Object.fromEntries(
    board.zones.map((zone) => [
      zone.id,
      board.nodes.filter((node) => node.zoneId === zone.id).length,
    ]),
  );
  assert.deepEqual(zoneCounts, {
    "zone-05": 16,
    "zone-06": 17,
    "zone-07": 16,
    "zone-08": 13,
  });
});

test("four authored branches reconnect and the aurora bridge is the only conditional edge", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  const branches = [
    { junction: "w2n04", rejoin: "w2n07", edges: ["w2e04a", "w2e04b"] },
    { junction: "w2n18", rejoin: "w2n22", edges: ["w2e18a", "w2e18b"] },
    { junction: "w2n32", rejoin: "w2n36", edges: ["w2e32a", "w2e32b"] },
    { junction: "w2n45", rejoin: "w2n48", edges: ["w2e45a", "w2e45b"] },
  ];
  const junctionIds = board.nodes
    .filter((node) => node.spaceRole === "junction")
    .map((node) => node.id);
  assert.deepEqual(junctionIds, branches.map((branch) => branch.junction));

  for (const branch of branches) {
    const outgoing = board.edges
      .filter((edge) => edge.from === branch.junction && !edge.availableWhen)
      .sort((left, right) => left.order - right.order);
    assert.deepEqual(outgoing.map((edge) => edge.id), branch.edges);
    for (const edge of branch.edges) {
      assert.ok(
        findPath(board, branch.junction, branch.rejoin, edge),
        `${edge} must reconnect at ${branch.rejoin}`,
      );
    }
  }

  const conditional = board.edges.filter((edge) => edge.availableWhen);
  assert.equal(conditional.length, 1);
  assert.deepEqual(conditional[0], {
    id: "w2e36c",
    from: "w2n36",
    to: "w2n39",
    order: 1,
    terrainType: "aurora-bridge",
    availableWhen: { stateKey: "auroraBridgeOpen", equals: true },
    pathData: "M 1870 960 C 1760 850 1575 850 1470 930",
  });
});

test("every World 02 node is reachable without the optional bridge and the graph never loops", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  assert.equal(
    reachableNodeIds(board, { includeConditional: false }).size,
    board.nodes.length,
  );
  assert.equal(reachableNodeIds(board).size, board.nodes.length);
  assertAcyclic(board);

  const exit = board.nodes.find((node) => node.id === board.forwardExitNodeId);
  assert.ok(exit);
  assert.equal(exit.spaceRole, "goal");
  assert.equal(exit.exitDirection, "forward");
  assert.equal(exit.worldExitRef, board.forwardExit.linkSlotRef);
  assert.equal(board.edges.some((edge) => edge.from === exit.id), false);
  assert.equal(
    board.edges.some((edge) => edge.to === board.entryNodeId),
    false,
    "no internal edge may return to the entry",
  );

  const sinks = board.nodes
    .filter((node) => !board.edges.some((edge) => edge.from === node.id))
    .map((node) => node.id);
  assert.deepEqual(sinks, ["w2n52"]);
});

test("World 02 exposes valid fairy anchors across all four zones", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  const anchorNodeIds = EXPANSION_WORLD_LEVEL_PACK.fairyAnchorNodeIds;
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]));

  assert.deepEqual(anchorNodeIds, [
    "w2n08",
    "w2n17",
    "w2n23",
    "w2n31",
    "w2n40",
    "w2n50",
  ]);
  assert.equal(Object.isFrozen(anchorNodeIds), true);
  assert.equal(new Set(anchorNodeIds).size, anchorNodeIds.length);
  assert.deepEqual(
    new Set(anchorNodeIds.map((nodeId) => nodeById.get(nodeId)?.zoneId)),
    new Set(["zone-05", "zone-06", "zone-07", "zone-08"]),
  );

  for (const anchorNodeId of anchorNodeIds) {
    const node = nodeById.get(anchorNodeId);
    assert.ok(node, `${anchorNodeId} must be a World 02 board node`);
    assert.notEqual(node.id, board.entryNodeId);
    assert.notEqual(node.id, board.forwardExitNodeId);
    assert.notEqual(node.spaceRole, "junction");
    assert.notEqual(node.spaceRole, "transport");
  }
});

test("forwardAnchorCandidates keeps the World 01 API and selects World 02 anchors ahead", () => {
  assert.deepEqual(
    forwardAnchorCandidates(BOARD_TEMPLATE, "n02", "sun"),
    [{
      anchorId: LEVEL_ONE.anchorNodeIds[0],
      distance: 6,
      targetTeamId: "sun",
    }],
  );

  const checks = [
    { startNodeId: "w2n02", anchorId: "w2n08", distance: 6 },
    { startNodeId: "w2n13", anchorId: "w2n17", distance: 4 },
    { startNodeId: "w2n18", anchorId: "w2n23", distance: 5 },
    { startNodeId: "w2n28", anchorId: "w2n31", distance: 3 },
    { startNodeId: "w2n36", anchorId: "w2n40", distance: 2 },
    { startNodeId: "w2n44", anchorId: "w2n50", distance: 6 },
  ];

  for (const expected of checks) {
    const candidates = forwardAnchorCandidates(
      EXPANSION_WORLD_BOARD_TEMPLATE,
      expected.startNodeId,
      "moon",
      EXPANSION_WORLD_LEVEL_PACK.fairyAnchorNodeIds,
    );
    assert.deepEqual(candidates, [{
      anchorId: expected.anchorId,
      distance: expected.distance,
      targetTeamId: "moon",
    }]);
  }
});

test("every node has a resolvable landing profile isolated from learning evidence", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  const profiles = EXPANSION_WORLD_LANDING_PROFILES;
  const allowedRewardResources = new Set(["coin", "star", "key", "card"]);
  const forbiddenKeys = new Set([
    "learningPackId",
    "taskId",
    "objectiveId",
    "prompt",
    "answer",
    "transcript",
    "score",
    "scoreTier",
    "knowledgeStatus",
  ]);

  for (const node of board.nodes) {
    assert.equal(typeof node.landingProfileRef, "string");
    assert.ok(node.landingProfileRef.length > 0);
    const profile = profiles[node.landingProfileRef];
    assert.ok(profile, `${node.id} has an unknown landing profile`);
    assert.deepEqual(profile.allowedInputs, [
      "boardTemplateRef",
      "nodeId",
      "routeNodeIds",
      "routeEdgeIds",
      "mapState",
      "stableRandomSeed",
      "playerId",
    ]);
    for (const reward of profile.rewards) {
      assert.ok(allowedRewardResources.has(reward.resource));
      assert.ok(Number.isInteger(reward.amount) && reward.amount > 0);
    }
  }

  const keys = collectObjectKeys({ board, profiles });
  for (const forbidden of forbiddenKeys) {
    assert.equal(keys.has(forbidden), false, `${forbidden} leaked into map data`);
  }
  assert.deepEqual(profiles["world2.forward-portal.v1"].rewards, []);
  assert.equal(
    profiles["world2.forward-portal.v1"].settlementPolicy,
    "movement-only-no-reward",
  );
});

test("all four art regions own layout contracts and the fallback theme has no bitmap reference", () => {
  const board = EXPANSION_WORLD_BOARD_TEMPLATE;
  const artRegionByZone = new Map(
    board.artRegions.map((region) => [region.zoneId, region]),
  );
  assert.equal(artRegionByZone.size, 4);

  for (const zone of board.zones) {
    const region = artRegionByZone.get(zone.id);
    assert.ok(region, `${zone.id} is missing an art region`);
    assert.match(
      region.layoutContractRef,
      new RegExp(`^board\\.ximitu-card-hunt\\.world-02\\.${zone.id}-layout\\.v1$`),
    );
    assert.deepEqual(region.artBox, zone.bounds);
    assert.match(region.clipPath, /^M\s/);
  }

  const fallbackSource = JSON.stringify(EXPANSION_WORLD_FALLBACK_THEME);
  assert.doesNotMatch(fallbackSource, /assetRef|\.png|\.jpe?g|\.webp|\.avif/i);
  assert.deepEqual(
    Object.keys(EXPANSION_WORLD_FALLBACK_THEME.regionFallbacks).sort(),
    board.artRegions.map((region) => region.id).sort(),
  );
});
