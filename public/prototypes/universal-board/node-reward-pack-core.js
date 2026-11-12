import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
  CRYSTAL_V120_WORLD_REF,
  CRYSTAL_V121_WORLD_REF,
  PREVIOUS_CLOUD_HARBOR_WORLD_REF,
  LEGACY_CLOUD_HARBOR_WORLD_REF,
  isCloudHarborWorldRef,
  WORLD_REGISTRIES,
  WORLD_REWARD_DEFINITIONS,
} from "./world-packs.js";
import { resolveWorldComposition } from "./world-runtime-core.js";

export const NODE_REWARD_PACK_SCHEMA_VERSION = "voice-board-node-reward-pack.v3";
export const NODE_REWARD_PACK_CONTRACT_REF = (
  "world-pack-progression-and-reward-contract.v1"
);

export const NODE_REWARD_WORLD_REFS = Object.freeze([
  CLOUD_HARBOR_WORLD_REF,
  BEYOND_CLOUD_WORLD_REF,
]);

export const NODE_REWARD_TYPES = Object.freeze([
  "none",
  "coin",
  "star",
]);

export const NODE_REWARD_LIMITS = Object.freeze({
  none: Object.freeze({ min: 0, max: 0 }),
  coin: Object.freeze({ min: 1, max: 3 }),
  star: Object.freeze({ min: 1, max: 1 }),
});

const PACK_KEYS = Object.freeze(["contractRef", "schemaVersion", "worlds"]);
const WORLD_KEYS = Object.freeze(["boardRef", "levelRef", "nodes"]);
const POLICY_KEYS = Object.freeze(["amount", "type"]);
const LOCKED_BOARD_ROLES = new Set([
  "activity",
  "goal",
  "junction",
  "map-effect",
  "portal",
  "transport",
]);

export class NodeRewardPackValidationError extends Error {
  constructor(message, {
    code = "node_reward_pack_invalid",
    statusCode = 422,
  } = {}) {
    super(message);
    this.name = "NodeRewardPackValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function invalid(message, options) {
  throw new NodeRewardPackValidationError(message, options);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function exactRef(value, label) {
  const normalized = String(value || "");
  if (!/^[a-z0-9][a-z0-9._-]*@[0-9]+\.[0-9]+\.[0-9]+$/i.test(normalized)) {
    invalid(`${label} 无效`);
  }
  return normalized;
}

function definitionResources(definition) {
  return Array.isArray(definition?.rewards)
    ? definition.rewards
    : Array.isArray(definition?.resources)
      ? definition.resources
      : [];
}

function canonicalResource(resource) {
  return ["card_case", "card"].includes(resource) ? "star" : resource;
}

function lockReasonFor({ node, definition, editable }) {
  if (editable) return "";
  if (["coin_card_exchange", "coin_card_case_exchange"].includes(definition?.event)) {
    return "该节点是固定金币兑换站：5金币换1颗星星，不能在普通奖励编辑器中改成直接发奖。";
  }
  if (node.spaceRole === "junction" || String(definition?.kind || "").includes("choice")) {
    return "岔路方向和弹窗时机属于路线规则，不能在奖励编辑器中更换。";
  }
  if (node.spaceRole === "transport" || definition?.kind === "transport") {
    return "传送目标和经过节点属于移动规则，当前保持锁定。";
  }
  if (node.spaceRole === "map-effect" || definition?.kind === "map-effect") {
    return "地图机关会改变共享地图状态，当前保持锁定。";
  }
  if (node.spaceRole === "activity") {
    return "全班活动与其结算文案是一体规则，当前保持锁定。";
  }
  if (
    node.spaceRole === "portal"
    || node.spaceRole === "goal"
    || definition?.kind === "world-transition"
    || definition?.worldTransition
  ) {
    return "世界门负责跨世界移动，不属于可替换的资源奖励。";
  }
  if (definition?.id === "reward.collect.fairy-anchor.v1") {
    return "该节点是固定航标线索，只显示地图信息，不属于可替换的资源奖励。";
  }
  if (
    definition?.kind === "discovery"
    || definition?.kind === "collection-gallery"
    || definition?.kind === "world-vista"
  ) {
    return "图鉴、展廊与世界景观属于发现记录，当前保持锁定。";
  }
  if (definition?.event || definition?.firstStateChanges) {
    return "该节点带有固定事件或地图状态变化，当前保持锁定。";
  }
  return "普通道路保持无额外效果，避免奖励密度失控。";
}

function catalogEntry(worldRef, composition, node) {
  const rewardRef = composition.level.nodeBindings?.[node.id]?.rewardRef
    || node.landingProfileRef
    || "";
  const definition = composition.level.landingProfiles?.[rewardRef]
    || WORLD_REWARD_DEFINITIONS[rewardRef]
    || null;
  const resources = definitionResources(definition);
  const hasFixedResource = resources.length === 1
    && ["coin", "star", "key", "card_case", "card"].includes(resources[0]?.resource)
    && Number.isInteger(resources[0]?.amount)
    && resources[0].amount > 0;
  const hasProgressResource = definition?.resourcePolicy === "progress-unit";
  const migratedActivityResourceSlot = (
    node.spaceRole === "activity"
    && [
      "reward.collect.card-case-1.v1",
      "reward.event.coin-rain.v1",
    ].includes(definition?.id)
  );
  const editable = (
    (hasFixedResource || hasProgressResource)
    && (
      !LOCKED_BOARD_ROLES.has(node.spaceRole)
      || migratedActivityResourceSlot
    )
    && !definition?.event
    && !definition?.worldTransition
    && !definition?.firstStateChanges
    && !definition?.mapEffectRef
    && !definition?.discoveryId
  );
  const sourceResource = hasFixedResource
    ? canonicalResource(resources[0].resource)
    : "none";
  const baseReward = hasProgressResource || sourceResource === "coin"
    ? { type: "coin", amount: hasProgressResource ? 1 : resources[0].amount }
    : ["star", "key", "card"].includes(sourceResource)
      ? { type: "star", amount: 1 }
      : { type: "none", amount: 0 };
  const authoredZone = composition.board.zones.find(({ bounds }) => (
    node.x >= bounds.x
    && node.x < bounds.x + bounds.width
    && node.y >= bounds.y
    && node.y < bounds.y + bounds.height
  ));
  return deepFreeze({
    worldRef,
    nodeId: node.id,
    zoneId: node.zoneId || authoredZone?.id || "",
    spaceRole: node.spaceRole || "learning",
    rewardRef,
    editable,
    lockReason: lockReasonFor({ node, definition, editable }),
    baseReward,
  });
}

function createCatalog(worldRefs = NODE_REWARD_WORLD_REFS) {
  return Object.fromEntries(worldRefs.map((worldRef) => {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const worldPack = WORLD_REGISTRIES.worldPacks[worldRef];
    const entries = composition.board.nodes.map((node) => (
      catalogEntry(worldRef, composition, node)
    ));
    return [worldRef, deepFreeze({
      worldRef,
      boardRef: exactRef(worldPack.boardTemplateRef, `${worldRef}.boardRef`),
      levelRef: exactRef(worldPack.levelPackRef, `${worldRef}.levelRef`),
      nodes: Object.freeze(entries),
      nodeById: Object.freeze(Object.fromEntries(
        entries.map((entry) => [entry.nodeId, entry]),
      )),
    })];
  }));
}

export const NODE_REWARD_CATALOG = deepFreeze(createCatalog());
const RESTORABLE_NODE_REWARD_CATALOG = deepFreeze(createCatalog([
  ...NODE_REWARD_WORLD_REFS,
  CRYSTAL_V120_WORLD_REF,
  CRYSTAL_V121_WORLD_REF,
  PREVIOUS_CLOUD_HARBOR_WORLD_REF,
  LEGACY_CLOUD_HARBOR_WORLD_REF,
]));

function canonicalPolicy(input, catalogNode) {
  if (!hasExactKeys(input, POLICY_KEYS)) {
    invalid(`${catalogNode.nodeId} 的奖励字段无效`);
  }
  const rawType = String(input.type || "");
  const type = ["card_case", "card"].includes(rawType) ? "star" : rawType;
  const amount = Number(input.amount);
  const limits = NODE_REWARD_LIMITS[type];
  if (!NODE_REWARD_TYPES.includes(type) || !limits) {
    invalid(`${catalogNode.nodeId} 使用了不支持的节点奖励`);
  }
  if (!Number.isInteger(amount) || amount < limits.min || amount > limits.max) {
    invalid(`${catalogNode.nodeId} 的奖励数量超出允许范围`);
  }
  if (!catalogNode.editable && type !== "none") {
    invalid(`${catalogNode.nodeId} 的固定节点机制不能改成资源奖励`);
  }
  return { type, amount };
}

export function normalizeNodeRewardPack(input) {
  if (!hasExactKeys(input, PACK_KEYS)) {
    invalid("节点奖励配置必须只包含规定字段");
  }
  if (
    ![NODE_REWARD_PACK_SCHEMA_VERSION, "voice-board-node-reward-pack.v2"].includes(input.schemaVersion)
    || input.contractRef !== NODE_REWARD_PACK_CONTRACT_REF
    || !isPlainRecord(input.worlds)
  ) {
    invalid("节点奖励配置与当前世界奖励契约不匹配");
  }
  const worldRefs = Object.keys(input.worlds).sort();
  const harborWorldRef = worldRefs.find(isCloudHarborWorldRef);
  const expectedWorldRefs = [harborWorldRef, BEYOND_CLOUD_WORLD_REF].sort();
  if (
    !harborWorldRef
    || worldRefs.length !== expectedWorldRefs.length
    || worldRefs.some((worldRef, index) => worldRef !== expectedWorldRefs[index])
  ) {
    invalid("节点奖励配置必须完整保留当前发布的两个世界");
  }

  const worlds = {};
  [harborWorldRef, BEYOND_CLOUD_WORLD_REF].forEach((worldRef) => {
    const inputWorld = input.worlds[worldRef];
    const catalogWorld = RESTORABLE_NODE_REWARD_CATALOG[worldRef];
    if (!hasExactKeys(inputWorld, WORLD_KEYS)) {
      invalid(`${worldRef} 的节点奖励结构无效`);
    }
    if (
      inputWorld.boardRef !== catalogWorld.boardRef
      || inputWorld.levelRef !== catalogWorld.levelRef
      || !isPlainRecord(inputWorld.nodes)
    ) {
      invalid(`${worldRef} 与当前地图或关卡版本不匹配`);
    }
    const nodeIds = Object.keys(inputWorld.nodes).sort();
    const expectedNodeIds = catalogWorld.nodes.map(({ nodeId }) => nodeId).sort();
    if (
      nodeIds.length !== expectedNodeIds.length
      || nodeIds.some((nodeId, index) => nodeId !== expectedNodeIds[index])
    ) {
      invalid(`${worldRef} 必须为每个地图节点提供且只提供一项奖励策略`);
    }
    worlds[worldRef] = {
      boardRef: catalogWorld.boardRef,
      levelRef: catalogWorld.levelRef,
      nodes: Object.fromEntries(catalogWorld.nodes.map((catalogNode) => [
        catalogNode.nodeId,
        canonicalPolicy(inputWorld.nodes[catalogNode.nodeId], catalogNode),
      ])),
    };
  });

  return {
    schemaVersion: NODE_REWARD_PACK_SCHEMA_VERSION,
    contractRef: NODE_REWARD_PACK_CONTRACT_REF,
    worlds,
  };
}

function defaultPolicy(catalogNode) {
  if (!catalogNode.editable) return { type: "none", amount: 0 };
  return { ...catalogNode.baseReward };
}

export const DEFAULT_NODE_REWARD_PACK = deepFreeze(normalizeNodeRewardPack({
  schemaVersion: NODE_REWARD_PACK_SCHEMA_VERSION,
  contractRef: NODE_REWARD_PACK_CONTRACT_REF,
  worlds: Object.fromEntries(NODE_REWARD_WORLD_REFS.map((worldRef) => {
    const catalogWorld = NODE_REWARD_CATALOG[worldRef];
    return [worldRef, {
      boardRef: catalogWorld.boardRef,
      levelRef: catalogWorld.levelRef,
      nodes: Object.fromEntries(
        catalogWorld.nodes.map((catalogNode) => [
          catalogNode.nodeId,
          defaultPolicy(catalogNode),
        ]),
      ),
    }];
  })),
}));

// Retired resource snapshots keep their authored values and precise refs. The
// new facilities retain the same resource-slot permissions; retargeting is only
// used by compatibility/authoring callers, never to rewrite an active session.
export function retargetNodeRewardPack(pack, targetWorldRef = CLOUD_HARBOR_WORLD_REF) {
  const normalized = normalizeNodeRewardPack(pack);
  if (!isCloudHarborWorldRef(targetWorldRef)) invalid("未知云港奖励版本");
  const sourceWorldRef = Object.keys(normalized.worlds).find(isCloudHarborWorldRef);
  if (sourceWorldRef === targetWorldRef) return normalized;
  const target = RESTORABLE_NODE_REWARD_CATALOG[targetWorldRef];
  const source = normalized.worlds[sourceWorldRef];
  return normalizeNodeRewardPack({
    ...normalized,
    worlds: {
      [targetWorldRef]: {
        boardRef: target.boardRef,
        levelRef: target.levelRef,
        nodes: structuredClone(source.nodes),
      },
      [BEYOND_CLOUD_WORLD_REF]: normalized.worlds[BEYOND_CLOUD_WORLD_REF],
    },
  });
}

export function cloneNodeRewardPack(pack = DEFAULT_NODE_REWARD_PACK) {
  return normalizeNodeRewardPack(structuredClone(pack));
}

export function nodeRewardPacksEqual(left, right) {
  try {
    return JSON.stringify(normalizeNodeRewardPack(left))
      === JSON.stringify(normalizeNodeRewardPack(right));
  } catch {
    return false;
  }
}

export function nodeRewardCatalogEntry(worldRef, nodeId) {
  return RESTORABLE_NODE_REWARD_CATALOG[worldRef]?.nodeById?.[nodeId] || null;
}

export function nodeRewardPolicy(pack, worldRef, nodeId) {
  const catalogNode = nodeRewardCatalogEntry(worldRef, nodeId);
  if (!catalogNode) invalid(`未知地图节点：${worldRef}#${nodeId}`);
  const candidate = pack?.worlds?.[worldRef]?.nodes?.[nodeId];
  return canonicalPolicy(candidate, catalogNode);
}

export function updateNodeRewardPolicy(pack, worldRef, nodeId, update = {}) {
  const normalized = normalizeNodeRewardPack(pack);
  const catalogNode = nodeRewardCatalogEntry(worldRef, nodeId);
  if (!catalogNode) invalid(`未知地图节点：${worldRef}#${nodeId}`);
  const current = normalized.worlds[worldRef].nodes[nodeId];
  const type = update.type ?? current.type;
  const limits = NODE_REWARD_LIMITS[type];
  const amount = type === "none"
    ? 0
    : ["star", "card", "card_case"].includes(type)
      ? 1
      : ((update.amount ?? current.amount) || limits?.min);
  normalized.worlds[worldRef].nodes[nodeId] = canonicalPolicy(
    { type, amount },
    catalogNode,
  );
  return normalizeNodeRewardPack(normalized);
}

export function nodeRewardChangedCount(pack) {
  const normalized = normalizeNodeRewardPack(pack);
  return Object.keys(normalized.worlds).reduce((total, worldRef) => (
    total + RESTORABLE_NODE_REWARD_CATALOG[worldRef].nodes.filter((catalogNode) => (
      JSON.stringify(normalized.worlds[worldRef].nodes[catalogNode.nodeId])
      !== JSON.stringify(defaultPolicy(catalogNode))
    )).length
  ), 0);
}

export function effectiveNodeRewards(pack, worldRef, nodeId, baseRewards = []) {
  const policy = nodeRewardPolicy(pack, worldRef, nodeId);
  void baseRewards;
  if (policy.type === "none") return [];
  return [{ resource: policy.type, amount: policy.amount }];
}

export function nodeRewardLabel(policy, baseReward = null) {
  void baseReward;
  const normalizedType = policy?.type || "none";
  if (normalizedType === "none") return "无资源奖励";
  const names = { coin: "金币", star: "星星" };
  return `${names[normalizedType] || normalizedType}×${policy.amount}`;
}
