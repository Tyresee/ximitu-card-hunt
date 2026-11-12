import {
  baseZoneForNode,
  boardLayoutRef,
  boardLayoutSignature,
  clampNodeLayoutPosition,
  createBoardLayoutDraft,
  normalizeBoardLayoutDraft,
  updateBoardLayoutDraft,
} from "./board-layout-editor-core.js";
import {
  DEFAULT_NODE_REWARD_PACK,
  NODE_REWARD_CATALOG,
  NODE_REWARD_LIMITS,
  NODE_REWARD_TYPES,
  NODE_REWARD_WORLD_REFS,
  normalizeNodeRewardPack,
} from "./node-reward-pack-core.js";
import {
  WORLD_REGISTRIES,
  WORLD_REWARD_DEFINITIONS,
} from "./world-packs.js";
import { resolveWorldComposition } from "./world-runtime-core.js";

export const NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION = (
  "voice-board-node-authoring-exchange.v2"
);
export const NODE_AUTHORING_EXCHANGE_CONTRACT_REF = (
  "voice-board-node-authoring-exchange-contract.v2"
);
export const NODE_AUTHORING_DIFF_SCHEMA_VERSION = (
  "voice-board-node-authoring-diff.v2"
);

const EXCHANGE_KEYS = Object.freeze([
  "base",
  "contractRef",
  "nodes",
  "resourcePools",
  "schemaVersion",
]);
const BASE_KEYS = Object.freeze(["fingerprint", "revisions", "worlds"]);
const BASE_WORLD_KEYS = Object.freeze([
  "baseSignature",
  "boardRef",
  "levelRef",
]);
const REVISION_KEYS = Object.freeze([
  "boardLayouts",
  "nodeRewardPack",
]);
const NODE_KEYS = Object.freeze([
  "context",
  "placement",
  "reward",
]);
const PLACEMENT_KEYS = Object.freeze(["x", "y"]);
const REWARD_KEYS = Object.freeze([
  "amount",
  "baseReward",
  "editable",
  "lockReason",
  "type",
]);
const CHANGE_KEYS = Object.freeze([
  "after",
  "before",
  "field",
  "group",
  "nodeId",
  "worldRef",
]);

export const NODE_AUTHORING_WORLD_REFS = Object.freeze([
  ...NODE_REWARD_WORLD_REFS,
]);

export class NodeAuthoringExchangeValidationError extends Error {
  constructor(message, {
    code = "node_authoring_exchange_invalid",
    statusCode = 422,
  } = {}) {
    super(message);
    this.name = "NodeAuthoringExchangeValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fixedOutcomeSummary(definition, rewardRef) {
  const rewards = Array.isArray(definition?.rewards)
    ? definition.rewards
    : Array.isArray(definition?.resources)
      ? definition.resources
      : [];
  return {
    definitionRef: String(rewardRef || ""),
    semanticKind: String(definition?.kind || definition?.semanticType || "unknown"),
    declaredTrigger: String(definition?.trigger || ""),
    presentationRef: String(definition?.presentationRef || ""),
    eventRef: String(definition?.event || ""),
    mapEffectRef: String(definition?.mapEffectRef || ""),
    discoveryId: String(definition?.discoveryId || ""),
    collectionRef: String(definition?.collectionRef || ""),
    direction: String(definition?.direction || definition?.worldTransition || ""),
    settlementPolicy: String(definition?.settlementPolicy || ""),
    resourcePolicy: String(definition?.resourcePolicy || ""),
    rewards: rewards.map(({ resource, amount }) => ({
      resource: String(resource || ""),
      amount: Number(amount),
    })),
    copy: {
      first: typeof definition?.copy?.first === "string"
        ? definition.copy.first
        : null,
      repeat: typeof definition?.copy?.repeat === "string"
        ? definition.copy.repeat
        : null,
    },
    choiceCount: Number.isInteger(definition?.choiceCount)
      ? definition.choiceCount
      : 0,
    trackDiscovery: definition?.trackDiscovery === true,
    oncePerPlayer: definition?.oncePerPlayer === true,
  };
}

function invalid(message, options) {
  throw new NodeAuthoringExchangeValidationError(message, options);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function sameKeys(value, expectedKeys, message) {
  const actual = isPlainRecord(value) ? Object.keys(value).sort() : [];
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    invalid(message);
  }
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function fingerprintFor(value) {
  return `fnv1a64:${fnv1a64(stableJson(value))}`;
}

function worldCatalogEntry(worldRef) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  const worldPack = WORLD_REGISTRIES.worldPacks[worldRef];
  if (!worldPack) invalid(`未知世界：${worldRef}`);
  return {
    worldRef,
    board: composition.board,
    boardRef: boardLayoutRef(composition.board),
    levelRef: `${composition.level.id}@${composition.level.version}`,
    baseSignature: boardLayoutSignature(composition.board),
    nodeIds: composition.board.nodes.map(({ id }) => id),
  };
}

const WORLD_CATALOG = Object.freeze(Object.fromEntries(
  NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const entry = worldCatalogEntry(worldRef);
    const worldPack = WORLD_REGISTRIES.worldPacks[worldRef];
    if (
      entry.boardRef !== worldPack.boardTemplateRef
      || entry.levelRef !== worldPack.levelPackRef
    ) {
      throw new Error(`${worldRef} authoring refs disagree with WorldPack`);
    }
    return [worldRef, Object.freeze(entry)];
  }),
));

function nodeContextEntry(worldRef, nodeId) {
  const catalog = WORLD_CATALOG[worldRef];
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  const node = catalog.board.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) invalid(`未知地图节点：${worldRef}#${nodeId}`);
  const placementZone = baseZoneForNode(catalog.board, nodeId);
  const zoneId = String(node.zoneId || placementZone?.id || "");
  const zone = catalog.board.zones.find(({ id }) => id === zoneId)
    || placementZone;
  const levelBinding = composition.level.nodeBindings?.[nodeId] || null;
  const rewardRef = String(
    levelBinding?.rewardRef || node.landingProfileRef || "",
  );
  const fixedOutcome = composition.level.landingProfiles?.[rewardRef]
    || WORLD_REWARD_DEFINITIONS[rewardRef]
    || null;
  const matchingExit = (catalog.board.exits || []).find(({ nodeId: exitNodeId }) => (
    exitNodeId === nodeId
  ));
  const incomingEdges = catalog.board.edges.filter(({ to }) => to === nodeId);
  const outgoingEdges = catalog.board.edges.filter(({ from }) => from === nodeId);
  const edgeContext = (edge, adjacentKey, adjacentNodeId) => ({
    edgeId: String(edge.id || ""),
    [adjacentKey]: String(adjacentNodeId || ""),
    order: Number.isInteger(edge.order) ? edge.order : null,
    terrainType: String(edge.terrainType || ""),
    availableWhen: edge.availableWhen ? clone(edge.availableWhen) : null,
  });

  return {
    zoneId,
    placementZoneId: String(placementZone?.id || ""),
    zoneLabel: String(
      composition.theme?.zoneNames?.[zoneId]
      || zone?.label
      || zoneId
      || "",
    ),
    spaceRole: String(node.spaceRole || "learning"),
    topology: {
      previousNodeIds: incomingEdges.map(({ from }) => String(from)),
      nextNodeIds: outgoingEdges.map(({ to }) => String(to)),
      incomingEdges: incomingEdges.map((edge) => (
        edgeContext(edge, "fromNodeId", edge.from)
      )),
      outgoingEdges: outgoingEdges.map((edge) => (
        edgeContext(edge, "toNodeId", edge.to)
      )),
    },
    levelBinding: {
      rewardRef,
      semanticType: String(levelBinding?.semanticType || ""),
    },
    fixedMechanisms: {
      boardLandingProfileRef: String(node.landingProfileRef || ""),
      itemRef: String(node.itemRef || ""),
      mapEffectRef: String(node.mapEffectRef || ""),
      transportProfileRef: String(node.transportProfileRef || ""),
      transportTargetId: String(node.transportTargetId || ""),
      transportCaptureNodeIds: Array.isArray(node.transportCaptureNodeIds)
        ? node.transportCaptureNodeIds.map(String)
        : [],
      transportUnlockAfterCompletedTurns: Number.isInteger(
        node.transportUnlockAfterCompletedTurns,
      )
        ? node.transportUnlockAfterCompletedTurns
        : null,
      worldExitRef: String(node.worldExitRef || ""),
      exitDirection: String(node.exitDirection || matchingExit?.id || ""),
      transitionProfileRef: String(matchingExit?.transitionProfileRef || ""),
    },
    fixedOutcome: fixedOutcomeSummary(fixedOutcome, rewardRef),
  };
}

const NODE_CONTEXT_CATALOG = deepFreeze(Object.fromEntries(
  NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
    worldRef,
    Object.fromEntries(WORLD_CATALOG[worldRef].nodeIds.map((nodeId) => [
      nodeId,
      nodeContextEntry(worldRef, nodeId),
    ])),
  ]),
));

function createResourcePools() {
  return {
    rewards: {
      types: [...NODE_REWARD_TYPES],
      limits: Object.fromEntries(NODE_REWARD_TYPES.map((type) => [
        type,
        {
          min: NODE_REWARD_LIMITS[type].min,
          max: NODE_REWARD_LIMITS[type].max,
        },
      ])),
    },
  };
}

export const NODE_AUTHORING_RESOURCE_POOLS = deepFreeze(createResourcePools());

function canonicalReadonly(input, expected, label) {
  let matches = false;
  try {
    matches = stableJson(input) === stableJson(expected);
  } catch {
    matches = false;
  }
  if (!matches) invalid(`${label} 属于只读契约，必须与当前目录精确一致`);
  return clone(expected);
}

function canonicalResourcePools(input) {
  return canonicalReadonly(
    input,
    NODE_AUTHORING_RESOURCE_POOLS,
    "resourcePools",
  );
}

function canonicalRevision(value, label) {
  if (value === null) return null;
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || !/^[a-zA-Z0-9._:-]+$/.test(value)
  ) {
    invalid(`${label} 必须是有效 revision 或 null`);
  }
  return value;
}

function defaultRevisions() {
  return {
    boardLayouts: Object.fromEntries(
      NODE_AUTHORING_WORLD_REFS.map((worldRef) => [worldRef, null]),
    ),
    nodeRewardPack: null,
  };
}

function canonicalRevisions(input = undefined) {
  const candidate = input === undefined ? defaultRevisions() : input;
  if (!hasExactKeys(candidate, REVISION_KEYS)) {
    invalid("base revisions 必须只包含布局与节点奖励配置");
  }
  sameKeys(
    candidate.boardLayouts,
    NODE_AUTHORING_WORLD_REFS,
    "base revisions 必须完整覆盖全部世界布局",
  );
  return {
    boardLayouts: Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
      worldRef,
      canonicalRevision(
        candidate.boardLayouts[worldRef],
        `revisions.boardLayouts.${worldRef}`,
      ),
    ])),
    nodeRewardPack: canonicalRevision(
      candidate.nodeRewardPack,
      "revisions.nodeRewardPack",
    ),
  };
}

function canonicalLayoutDrafts(input) {
  sameKeys(
    input,
    NODE_AUTHORING_WORLD_REFS,
    "BoardLayoutDraft 必须完整覆盖全部世界",
  );
  return Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const catalog = WORLD_CATALOG[worldRef];
    const candidate = input[worldRef] === null
      ? createBoardLayoutDraft(catalog.board, { worldRef })
      : normalizeBoardLayoutDraft(catalog.board, input[worldRef], { worldRef });
    if (!candidate) invalid(`${worldRef} 的 BoardLayoutDraft 无效或版本不匹配`);
    return [worldRef, candidate];
  }));
}

function canonicalSourceInputs({
  boardLayoutDrafts,
  nodeRewardPack = DEFAULT_NODE_REWARD_PACK,
  revisions = undefined,
} = {}) {
  let normalizedRewardPack;
  try {
    normalizedRewardPack = normalizeNodeRewardPack(nodeRewardPack);
  } catch (error) {
    invalid(error?.message || "NodeRewardPack 无效");
  }
  return {
    boardLayoutDrafts: canonicalLayoutDrafts(boardLayoutDrafts),
    nodeRewardPack: normalizedRewardPack,
    revisions: canonicalRevisions(revisions),
  };
}

function canonicalWorldBase(input, worldRef) {
  if (!hasExactKeys(input, BASE_WORLD_KEYS)) {
    invalid(`${worldRef} 的 base world 字段无效`);
  }
  const catalog = WORLD_CATALOG[worldRef];
  if (
    input.boardRef !== catalog.boardRef
    || input.levelRef !== catalog.levelRef
    || input.baseSignature !== catalog.baseSignature
  ) {
    invalid(`${worldRef} 的 Board/Level/layout 版本不匹配`);
  }
  return {
    boardRef: catalog.boardRef,
    levelRef: catalog.levelRef,
    baseSignature: catalog.baseSignature,
  };
}

function canonicalBase(input) {
  if (!hasExactKeys(input, BASE_KEYS)) {
    invalid("exchange base 必须只包含规定字段");
  }
  if (!/^fnv1a64:[a-f0-9]{16}$/.test(String(input.fingerprint || ""))) {
    invalid("exchange base fingerprint 无效");
  }
  sameKeys(
    input.worlds,
    NODE_AUTHORING_WORLD_REFS,
    "exchange base worlds 必须完整覆盖当前世界",
  );
  return {
    fingerprint: input.fingerprint,
    revisions: canonicalRevisions(input.revisions),
    worlds: Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => [
      worldRef,
      canonicalWorldBase(input.worlds[worldRef], worldRef),
    ])),
  };
}

function baseWorlds() {
  return Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const catalog = WORLD_CATALOG[worldRef];
    return [worldRef, {
      boardRef: catalog.boardRef,
      levelRef: catalog.levelRef,
      baseSignature: catalog.baseSignature,
    }];
  }));
}

export function createNodeAuthoringExchangeBase(options = {}) {
  const sources = canonicalSourceInputs(options);
  const worlds = baseWorlds();
  const revisions = sources.revisions;
  return {
    fingerprint: fingerprintFor({
      worlds,
      revisions,
      boardLayoutDrafts: sources.boardLayoutDrafts,
      nodeRewardPack: sources.nodeRewardPack,
      nodeContexts: NODE_CONTEXT_CATALOG,
      resourcePools: NODE_AUTHORING_RESOURCE_POOLS,
    }),
    revisions,
    worlds,
  };
}

function canonicalPlacement(input, worldRef, nodeId) {
  if (!hasExactKeys(input, PLACEMENT_KEYS)) {
    invalid(`${worldRef}#${nodeId}.placement 字段无效`);
  }
  if (!Number.isInteger(input.x) || !Number.isInteger(input.y)) {
    invalid(`${worldRef}#${nodeId}.placement 必须使用整数坐标`);
  }
  const catalog = WORLD_CATALOG[worldRef];
  const clamped = clampNodeLayoutPosition(
    catalog.board,
    nodeId,
    input,
  );
  if (!clamped || clamped.x !== input.x || clamped.y !== input.y) {
    invalid(`${worldRef}#${nodeId}.placement 越出节点原始区域`);
  }
  if (!baseZoneForNode(catalog.board, nodeId)) {
    invalid(`${worldRef}#${nodeId} 不属于可编辑区域`);
  }
  return { x: input.x, y: input.y };
}

function canonicalRewardShape(input, worldRef, nodeId) {
  if (!hasExactKeys(input, REWARD_KEYS)) {
    invalid(`${worldRef}#${nodeId}.reward 字段无效`);
  }
  const catalogNode = NODE_REWARD_CATALOG[worldRef]?.nodeById?.[nodeId];
  if (
    !catalogNode
    || input.editable !== catalogNode.editable
    || input.lockReason !== catalogNode.lockReason
  ) {
    invalid(`${worldRef}#${nodeId}.reward 的编辑权限属于只读契约`);
  }
  const baseReward = canonicalReadonly(
    input.baseReward,
    catalogNode.baseReward,
    `${worldRef}#${nodeId}.reward.baseReward`,
  );
  if (typeof input.type !== "string" || !Number.isInteger(input.amount)) {
    invalid(`${worldRef}#${nodeId}.reward 必须使用字符串类型和整数数量`);
  }
  return {
    editable: catalogNode.editable,
    lockReason: catalogNode.lockReason,
    baseReward,
    type: input.type,
    amount: input.amount,
  };
}

function canonicalNodes(input) {
  sameKeys(
    input,
    NODE_AUTHORING_WORLD_REFS,
    "exchange nodes 必须完整覆盖当前世界",
  );

  const rewardCandidate = clone(DEFAULT_NODE_REWARD_PACK);
  const placements = {};
  const rawNodes = {};

  for (const worldRef of NODE_AUTHORING_WORLD_REFS) {
    const catalog = WORLD_CATALOG[worldRef];
    sameKeys(
      input[worldRef],
      catalog.nodeIds,
      `${worldRef} 必须为每个节点且只提供一个 exchange 对象`,
    );
    placements[worldRef] = {};
    rawNodes[worldRef] = {};
    for (const nodeId of catalog.nodeIds) {
      const node = input[worldRef][nodeId];
      if (!hasExactKeys(node, NODE_KEYS)) {
        invalid(`${worldRef}#${nodeId} 只能包含 context/placement/reward`);
      }
      const context = canonicalReadonly(
        node.context,
        NODE_CONTEXT_CATALOG[worldRef][nodeId],
        `${worldRef}#${nodeId}.context`,
      );
      const placement = canonicalPlacement(node.placement, worldRef, nodeId);
      const reward = canonicalRewardShape(node.reward, worldRef, nodeId);
      placements[worldRef][nodeId] = placement;
      rewardCandidate.worlds[worldRef].nodes[nodeId] = {
        type: reward.type,
        amount: reward.amount,
      };
      rawNodes[worldRef][nodeId] = {
        context,
        placement,
        reward,
      };
    }
  }

  let rewards;
  try {
    rewards = normalizeNodeRewardPack(rewardCandidate);
  } catch (error) {
    invalid(error?.message || "exchange 节点奖励无效");
  }

  return Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const catalog = WORLD_CATALOG[worldRef];
    return [worldRef, Object.fromEntries(catalog.nodeIds.map((nodeId) => [
      nodeId,
      {
        context: clone(rawNodes[worldRef][nodeId].context),
        placement: placements[worldRef][nodeId],
        reward: {
          editable: rawNodes[worldRef][nodeId].reward.editable,
          lockReason: rawNodes[worldRef][nodeId].reward.lockReason,
          baseReward: clone(rawNodes[worldRef][nodeId].reward.baseReward),
          ...clone(rewards.worlds[worldRef].nodes[nodeId]),
        },
      },
    ]))];
  }));
}

export function normalizeNodeAuthoringExchange(input, {
  expectedBase = null,
} = {}) {
  if (!hasExactKeys(input, EXCHANGE_KEYS)) {
    invalid("节点 exchange 必须只包含规定字段");
  }
  if (
    input.schemaVersion !== NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION
    || input.contractRef !== NODE_AUTHORING_EXCHANGE_CONTRACT_REF
  ) {
    invalid("节点 exchange schema 或 contract 版本不匹配");
  }
  const base = canonicalBase(input.base);
  if (expectedBase !== null) {
    const expected = canonicalBase(expectedBase);
    if (stableJson(base) !== stableJson(expected)) {
      invalid("节点 exchange 的 base revision 或 fingerprint 已过期", {
        code: "node_authoring_exchange_base_conflict",
        statusCode: 409,
      });
    }
  }
  return {
    schemaVersion: NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION,
    contractRef: NODE_AUTHORING_EXCHANGE_CONTRACT_REF,
    base,
    resourcePools: canonicalResourcePools(input.resourcePools),
    nodes: canonicalNodes(input.nodes),
  };
}

export function createNodeAuthoringExchange(options = {}) {
  const sources = canonicalSourceInputs(options);
  const base = createNodeAuthoringExchangeBase(options);
  const nodes = Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const catalog = WORLD_CATALOG[worldRef];
    const layout = sources.boardLayoutDrafts[worldRef];
    return [worldRef, Object.fromEntries(catalog.board.nodes.map((node) => {
      const placement = layout.nodePositions[node.id] || { x: node.x, y: node.y };
      const rewardCatalogNode = NODE_REWARD_CATALOG[worldRef].nodeById[node.id];
      return [node.id, {
        context: clone(NODE_CONTEXT_CATALOG[worldRef][node.id]),
        placement: { x: placement.x, y: placement.y },
        reward: {
          editable: rewardCatalogNode.editable,
          lockReason: rewardCatalogNode.lockReason,
          baseReward: clone(rewardCatalogNode.baseReward),
          ...clone(sources.nodeRewardPack.worlds[worldRef].nodes[node.id]),
        },
      }];
    }))];
  }));
  return normalizeNodeAuthoringExchange({
    schemaVersion: NODE_AUTHORING_EXCHANGE_SCHEMA_VERSION,
    contractRef: NODE_AUTHORING_EXCHANGE_CONTRACT_REF,
    base,
    resourcePools: clone(NODE_AUTHORING_RESOURCE_POOLS),
    nodes,
  }, { expectedBase: base });
}

function projectedDrafts(normalized) {
  return Object.fromEntries(NODE_AUTHORING_WORLD_REFS.map((worldRef) => {
    const catalog = WORLD_CATALOG[worldRef];
    let draft = createBoardLayoutDraft(catalog.board, { worldRef });
    for (const nodeId of catalog.nodeIds) {
      draft = updateBoardLayoutDraft(
        catalog.board,
        draft,
        nodeId,
        normalized.nodes[worldRef][nodeId].placement,
        { worldRef },
      );
    }
    const verified = normalizeBoardLayoutDraft(catalog.board, draft, { worldRef });
    if (!verified) invalid(`${worldRef} 无法投影为 BoardLayoutDraft`);
    return [worldRef, verified];
  }));
}

function projectedRewardPack(normalized) {
  const pack = clone(DEFAULT_NODE_REWARD_PACK);
  for (const worldRef of NODE_AUTHORING_WORLD_REFS) {
    for (const nodeId of WORLD_CATALOG[worldRef].nodeIds) {
      const { type, amount } = normalized.nodes[worldRef][nodeId].reward;
      pack.worlds[worldRef].nodes[nodeId] = { type, amount };
    }
  }
  return normalizeNodeRewardPack(pack);
}

export function projectNodeAuthoringExchange(input, options = {}) {
  const normalized = normalizeNodeAuthoringExchange(input, options);
  return {
    boardLayoutDrafts: projectedDrafts(normalized),
    nodeRewardPack: projectedRewardPack(normalized),
  };
}

function fieldChange({
  worldRef,
  nodeId,
  group,
  field,
  before,
  after,
}) {
  const change = {
    worldRef,
    nodeId,
    group,
    field,
    before,
    after,
  };
  if (!hasExactKeys(change, CHANGE_KEYS)) {
    throw new Error("internal node authoring diff shape is invalid");
  }
  return change;
}

export function diffNodeAuthoringExchanges(baseline, candidate, {
  expectedBase = null,
} = {}) {
  const left = normalizeNodeAuthoringExchange(baseline, { expectedBase });
  const right = normalizeNodeAuthoringExchange(candidate, {
    expectedBase: left.base,
  });
  const changes = [];
  for (const worldRef of NODE_AUTHORING_WORLD_REFS) {
    for (const nodeId of WORLD_CATALOG[worldRef].nodeIds) {
      const beforeNode = left.nodes[worldRef][nodeId];
      const afterNode = right.nodes[worldRef][nodeId];
      for (const field of ["x", "y"]) {
        if (beforeNode.placement[field] !== afterNode.placement[field]) {
          changes.push(fieldChange({
            worldRef,
            nodeId,
            group: "placement",
            field,
            before: beforeNode.placement[field],
            after: afterNode.placement[field],
          }));
        }
      }
      for (const field of ["type", "amount"]) {
        if (beforeNode.reward[field] !== afterNode.reward[field]) {
          changes.push(fieldChange({
            worldRef,
            nodeId,
            group: "reward",
            field,
            before: beforeNode.reward[field],
            after: afterNode.reward[field],
          }));
        }
      }
    }
  }
  return {
    schemaVersion: NODE_AUTHORING_DIFF_SCHEMA_VERSION,
    baseFingerprint: left.base.fingerprint,
    candidateFingerprint: fingerprintFor({
      baseFingerprint: left.base.fingerprint,
      nodes: right.nodes,
    }),
    changes,
  };
}

export const diffNodeAuthoringExchange = diffNodeAuthoringExchanges;
