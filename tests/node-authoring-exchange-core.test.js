import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoardLayoutDraft,
  normalizeBoardLayoutDraft,
  updateBoardLayoutDraft,
} from "../public/prototypes/universal-board/board-layout-editor-core.js";
import {
  DEFAULT_NODE_REWARD_PACK,
  normalizeNodeRewardPack,
  updateNodeRewardPolicy,
} from "../public/prototypes/universal-board/node-reward-pack-core.js";
import {
  NODE_AUTHORING_DIFF_SCHEMA_VERSION,
  NODE_AUTHORING_EXCHANGE_CONTRACT_REF,
  NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION,
  NODE_AUTHORING_RESOURCE_POOLS,
  NODE_AUTHORING_WORLD_REFS,
  NodeAuthoringExchangeValidationError,
  createNodeAuthoringExchange,
  createNodeAuthoringExchangeBase,
  diffNodeAuthoringExchanges,
  normalizeNodeAuthoringExchange,
  projectNodeAuthoringExchange,
} from "../public/prototypes/universal-board/node-authoring-exchange-core.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
  WORLD_REGISTRIES,
} from "../public/prototypes/universal-board/world-packs.js";
import {
  resolveWorldComposition,
} from "../public/prototypes/universal-board/world-runtime-core.js";

function blankLayoutDrafts() {
  return Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const { board } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    return [worldRef, createBoardLayoutDraft(board, { worldRef })];
  }));
}

function revisions(suffix = "1") {
  return {
    boardLayouts: Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
      worldRef,
      `layout-${worldRef === CLOUD_HARBOR_WORLD_REF ? "one" : "two"}-${suffix}`,
    ])),
    nodeRewardPack: `rewards-${suffix}`,
  };
}

function defaultSource(overrides = {}) {
  return {
    boardLayoutDrafts: blankLayoutDrafts(),
    nodeRewardPack: DEFAULT_NODE_REWARD_PACK,
    revisions: revisions(),
    ...overrides,
  };
}

function expectInvalid(candidate, {
  code = "node_authoring_exchange_invalid",
  statusCode = 422,
} = {}) {
  assert.throws(
    () => normalizeNodeAuthoringExchange(candidate),
    (error) => (
      error instanceof NodeAuthoringExchangeValidationError
      && error.code === code
      && error.statusCode === statusCode
    ),
  );
}

test("exchange generation transposes layout and reward sources into complete nodes", () => {
  const boardLayoutDrafts = blankLayoutDrafts();
  const worldOneBoard = resolveWorldComposition(
    CLOUD_HARBOR_WORLD_REF,
    WORLD_REGISTRIES,
  ).board;
  boardLayoutDrafts[CLOUD_HARBOR_WORLD_REF] = updateBoardLayoutDraft(
    worldOneBoard,
    boardLayoutDrafts[CLOUD_HARBOR_WORLD_REF],
    "n03",
    { x: 251, y: 497 },
    { worldRef: CLOUD_HARBOR_WORLD_REF },
  );
  const nodeRewardPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    CLOUD_HARBOR_WORLD_REF,
    "n02",
    { type: "coin", amount: 3 },
  );
  const source = defaultSource({
    boardLayoutDrafts,
    nodeRewardPack,
  });
  const exchange = createNodeAuthoringExchange(source);

  assert.equal(exchange.schemaVersion, NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION);
  assert.equal(exchange.contractRef, NODE_AUTHORING_EXCHANGE_CONTRACT_REF);
  assert.match(exchange.base.fingerprint, /^fnv1a64:[a-f0-9]{16}$/);
  assert.deepEqual(exchange.base.revisions, revisions());
  assert.deepEqual(Object.keys(exchange.nodes), NODE_AUTHORING_WORLD_REFS);
  assert.equal(Object.keys(exchange.nodes[CLOUD_HARBOR_WORLD_REF]).length, 61);
  assert.equal(Object.keys(exchange.nodes[BEYOND_CLOUD_WORLD_REF]).length, 62);
  assert.deepEqual(
    Object.keys(exchange.nodes[CLOUD_HARBOR_WORLD_REF].n03).sort(),
    ["context", "placement", "reward"],
  );
  assert.deepEqual(
    exchange.nodes[CLOUD_HARBOR_WORLD_REF].n03.placement,
    { x: 251, y: 497 },
  );
  assert.deepEqual(
    exchange.nodes[CLOUD_HARBOR_WORLD_REF].n02.reward,
    {
      editable: true,
      lockReason: "",
      baseReward: { type: "coin", amount: 1 },
      type: "coin",
      amount: 3,
    },
  );
  assert.deepEqual(exchange.resourcePools, NODE_AUTHORING_RESOURCE_POOLS);
});

test("readonly node context and reward pools make opaque node refs self-describing", () => {
  const exchange = createNodeAuthoringExchange(defaultSource());
  const anchor = exchange.nodes[CLOUD_HARBOR_WORLD_REF].n03;
  const junction = exchange.nodes[CLOUD_HARBOR_WORLD_REF].n04;
  const retired = exchange.nodes[CLOUD_HARBOR_WORLD_REF].n06a;

  assert.equal(anchor.context.zoneId, "zone-01");
  assert.equal(anchor.context.placementZoneId, "zone-01");
  assert.equal(anchor.context.spaceRole, "item");
  assert.equal(
    anchor.context.levelBinding.rewardRef,
    "item.harbor.mooring-anchor.v1",
  );
  assert.equal(
    anchor.context.fixedMechanisms.itemRef,
    "harbor.mooring-anchor.v1",
  );
  assert.equal(anchor.context.levelBinding.semanticType, "ordinary");
  assert.equal(anchor.context.fixedOutcome.semanticKind, "ordinary");
  assert.equal(anchor.context.fixedOutcome.eventRef, "");
  assert.equal(anchor.context.fixedOutcome.trackDiscovery, false);
  assert.deepEqual(anchor.context.fixedOutcome.copy, { first: null, repeat: null });
  assert.doesNotMatch(JSON.stringify(anchor.context.fixedOutcome), /停靠锚|改选沿途落点|下个回合/);
  assert.equal(anchor.reward.editable, false);
  assert.match(anchor.reward.lockReason, /普通道路/);
  assert.deepEqual(anchor.reward.baseReward, { type: "none", amount: 0 });
  assert.deepEqual(junction.context.topology.previousNodeIds, ["n03"]);
  assert.deepEqual(junction.context.topology.nextNodeIds, ["n05a", "n05b"]);
  assert.deepEqual(
    junction.context.topology.outgoingEdges.map(({ order }) => order),
    [0, 1],
  );
  // The old cloud trampoline cell is a plain landing on the current board.
  assert.equal(retired.context.spaceRole, "learning");
  assert.equal(retired.context.fixedMechanisms.transportTargetId || "", "");
  assert.equal(junction.reward.editable, false);
  assert.match(junction.reward.lockReason, /岔路/);
  assert.deepEqual(exchange.resourcePools.rewards.types, [
    "none",
    "coin",
    "star",
  ]);
  assert.deepEqual(exchange.resourcePools.rewards.limits.coin, {
    min: 1,
    max: 3,
  });
  assert.equal(Object.hasOwn(exchange.resourcePools, "classroomEvents"), false);

  const overlappingExit = exchange.nodes[BEYOND_CLOUD_WORLD_REF].w2n52.context;
  assert.equal(overlappingExit.zoneId, "zone-08");
  assert.equal(overlappingExit.placementZoneId, "zone-05");
  assert.equal(overlappingExit.fixedOutcome.declaredTrigger, "after-enter");
  assert.equal(overlappingExit.fixedMechanisms.exitDirection, "forward");
  assert.equal(JSON.stringify(exchange).includes('"dice"'), false);
});

test("a normalized exchange projects losslessly back to drafts without publication metadata", () => {
  const boardLayoutDrafts = blankLayoutDrafts();
  const worldTwoBoard = resolveWorldComposition(
    BEYOND_CLOUD_WORLD_REF,
    WORLD_REGISTRIES,
  ).board;
  const movedNode = worldTwoBoard.nodes.find(({ id }) => id === "w2n02");
  boardLayoutDrafts[BEYOND_CLOUD_WORLD_REF] = updateBoardLayoutDraft(
    worldTwoBoard,
    boardLayoutDrafts[BEYOND_CLOUD_WORLD_REF],
    movedNode.id,
    { x: movedNode.x + 7, y: movedNode.y + 4 },
    { worldRef: BEYOND_CLOUD_WORLD_REF },
  );
  const nodeRewardPack = updateNodeRewardPolicy(
    DEFAULT_NODE_REWARD_PACK,
    BEYOND_CLOUD_WORLD_REF,
    "w2n08",
    { type: "star", amount: 1 },
  );
  const source = defaultSource({
    boardLayoutDrafts,
    nodeRewardPack,
  });
  const exchange = createNodeAuthoringExchange(source);
  const original = structuredClone(exchange);
  const projected = projectNodeAuthoringExchange(exchange, {
    expectedBase: exchange.base,
  });

  assert.deepEqual(Object.keys(projected).sort(), [
    "boardLayoutDrafts",
    "nodeRewardPack",
  ]);
  for (const worldRef of NODE_AUTHORING_WORLD_REFS) {
    const board = resolveWorldComposition(worldRef, WORLD_REGISTRIES).board;
    assert.deepEqual(
      projected.boardLayoutDrafts[worldRef],
      normalizeBoardLayoutDraft(board, boardLayoutDrafts[worldRef], { worldRef }),
    );
  }
  assert.deepEqual(
    projected.nodeRewardPack,
    normalizeNodeRewardPack(nodeRewardPack),
  );
  assert.deepEqual(exchange, original);
  assert.equal(JSON.stringify(projected).includes("revision"), false);
  assert.equal(JSON.stringify(projected).includes("publish"), false);
  assert.equal(Object.hasOwn(projected, "resourcePools"), false);
  assert.equal(Object.hasOwn(projected, "nodes"), false);
});

test("field diff is deterministic across placement and reward", () => {
  const baseline = createNodeAuthoringExchange(defaultSource());
  const candidate = structuredClone(baseline);
  candidate.nodes[CLOUD_HARBOR_WORLD_REF].n03.placement.x += 1;
  candidate.nodes[CLOUD_HARBOR_WORLD_REF].n02.reward = {
    ...candidate.nodes[CLOUD_HARBOR_WORLD_REF].n02.reward,
    type: "none",
    amount: 0,
  };

  const diff = diffNodeAuthoringExchanges(baseline, candidate, {
    expectedBase: baseline.base,
  });
  assert.equal(diff.schemaVersion, NODE_AUTHORING_DIFF_SCHEMA_VERSION);
  assert.equal(diff.baseFingerprint, baseline.base.fingerprint);
  assert.match(diff.candidateFingerprint, /^fnv1a64:[a-f0-9]{16}$/);
  assert.deepEqual(diff.changes.map(({ nodeId, group, field }) => (
    `${nodeId}:${group}.${field}`
  )), [
    "n02:reward.type",
    "n02:reward.amount",
    "n03:placement.x",
  ]);
  diff.changes.forEach((change) => {
    assert.deepEqual(Object.keys(change).sort(), [
      "after",
      "before",
      "field",
      "group",
      "nodeId",
      "worldRef",
    ]);
  });
});

test("strict import rejects unknown or forbidden fields, incomplete nodes, and version drift", () => {
  const baseline = createNodeAuthoringExchange(defaultSource());
  const cases = [];

  const unknownRoot = structuredClone(baseline);
  unknownRoot.extra = true;
  cases.push(unknownRoot);

  const forbiddenScore = structuredClone(baseline);
  forbiddenScore.nodes[CLOUD_HARBOR_WORLD_REF].n02.score = 100;
  cases.push(forbiddenScore);

  const forbiddenTrigger = structuredClone(baseline);
  forbiddenTrigger.nodes[CLOUD_HARBOR_WORLD_REF].n02.trigger = "replace-map";
  cases.push(forbiddenTrigger);

  const unknownNode = structuredClone(baseline);
  unknownNode.nodes[CLOUD_HARBOR_WORLD_REF].madeUp = structuredClone(
    unknownNode.nodes[CLOUD_HARBOR_WORLD_REF].n01,
  );
  cases.push(unknownNode);

  const omittedNode = structuredClone(baseline);
  delete omittedNode.nodes[CLOUD_HARBOR_WORLD_REF].n01;
  cases.push(omittedNode);

  const wrongSchema = structuredClone(baseline);
  wrongSchema.schemaVersion = "voice-board-node-authoring-exchange.v0";
  cases.push(wrongSchema);

  const wrongBoard = structuredClone(baseline);
  wrongBoard.base.worlds[CLOUD_HARBOR_WORLD_REF].boardRef = "board@0.0.0";
  cases.push(wrongBoard);

  const crossZone = structuredClone(baseline);
  crossZone.nodes[CLOUD_HARBOR_WORLD_REF].n18.placement.x = 1200;
  cases.push(crossZone);

  const coercedReward = structuredClone(baseline);
  coercedReward.nodes[CLOUD_HARBOR_WORLD_REF].n02.reward.amount = "1";
  cases.push(coercedReward);

  cases.forEach((candidate) => expectInvalid(candidate));
});

test("strict import delegates reward locks to the canonical pack validator", () => {
  const baseline = createNodeAuthoringExchange(defaultSource());

  const lockedReward = structuredClone(baseline);
  lockedReward.nodes[CLOUD_HARBOR_WORLD_REF].n01.reward = {
    ...lockedReward.nodes[CLOUD_HARBOR_WORLD_REF].n01.reward,
    type: "coin",
    amount: 1,
  };
  expectInvalid(lockedReward);

});

test("strict import rejects every readonly context, permission, and resource-pool mutation", () => {
  const baseline = createNodeAuthoringExchange(defaultSource());
  const cases = [];

  const zoneMutation = structuredClone(baseline);
  zoneMutation.nodes[CLOUD_HARBOR_WORLD_REF].n03.context.zoneId = "zone-02";
  cases.push(zoneMutation);

  const topologyMutation = structuredClone(baseline);
  topologyMutation.nodes[CLOUD_HARBOR_WORLD_REF].n04
    .context.topology.nextNodeIds.reverse();
  cases.push(topologyMutation);

  const rewardPermissionMutation = structuredClone(baseline);
  rewardPermissionMutation.nodes[CLOUD_HARBOR_WORLD_REF].n04.reward.editable = true;
  cases.push(rewardPermissionMutation);

  const rewardReasonMutation = structuredClone(baseline);
  rewardReasonMutation.nodes[CLOUD_HARBOR_WORLD_REF].n04.reward.lockReason = "";
  cases.push(rewardReasonMutation);

  const rewardLimitMutation = structuredClone(baseline);
  rewardLimitMutation.resourcePools.rewards.limits.coin.max = 99;
  cases.push(rewardLimitMutation);

  cases.forEach((candidate) => expectInvalid(candidate));
});

test("base revisions and source fingerprints detect stale imports", () => {
  const sourceOne = defaultSource({ revisions: revisions("one") });
  const sourceTwo = defaultSource({ revisions: revisions("two") });
  const first = createNodeAuthoringExchange(sourceOne);
  const second = createNodeAuthoringExchange(sourceTwo);

  assert.notEqual(first.base.fingerprint, second.base.fingerprint);
  assert.deepEqual(
    createNodeAuthoringExchangeBase(sourceOne),
    first.base,
  );
  assert.throws(
    () => normalizeNodeAuthoringExchange(second, {
      expectedBase: first.base,
    }),
    (error) => (
      error instanceof NodeAuthoringExchangeValidationError
      && error.code === "node_authoring_exchange_base_conflict"
      && error.statusCode === 409
    ),
  );
});
