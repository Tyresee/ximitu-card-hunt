const REWARD_SEMANTIC_TYPES = new Set([
  "ordinary",
  "unknown",
  "choice",
  "collect",
  "combine",
  "display",
]);

const REWARD_RESOURCES = new Set(["coin", "star", "key", "card"]);

function frozenRewardDefinition({
  id,
  semanticType,
  first,
  repeat,
  resources = [],
  resourcePolicy = "fixed",
  event = null,
  choiceCount = 0,
  worldTransition = null,
  trackDiscovery = true,
}) {
  if (!REWARD_SEMANTIC_TYPES.has(semanticType)) {
    throw new Error(`unsupported reward semantic type: ${semanticType}`);
  }
  const frozenResources = Object.freeze(resources.map((reward, index) => {
    const resource = String(reward?.resource || "");
    const amount = Number(reward?.amount);
    if (!REWARD_RESOURCES.has(resource)) {
      throw new Error(`${id}.resources[${index}] has unsupported resource: ${resource}`);
    }
    if (!Number.isInteger(amount) || amount < 1) {
      throw new Error(`${id}.resources[${index}].amount must be a positive integer`);
    }
    return Object.freeze({ resource, amount });
  }));
  return Object.freeze({
    id,
    semanticType,
    copy: Object.freeze({
      first: first == null ? null : String(first),
      repeat: repeat == null ? null : String(repeat),
    }),
    resources: frozenResources,
    resourcePolicy,
    event,
    choiceCount,
    worldTransition,
    trackDiscovery,
  });
}

const rewardDefinitions = [
  frozenRewardDefinition({
    id: "reward.ordinary.none.v1",
    semanticType: "ordinary",
    first: null,
    repeat: null,
    trackDiscovery: false,
  }),
  frozenRewardDefinition({
    id: "reward.curiosity.card-peek.v1",
    semanticType: "unknown",
    first: "神秘卡露出了一条新线索。",
    repeat: "这条线索再次指向尚未发现的星星。",
  }),
  frozenRewardDefinition({
    id: "reward.curiosity.route-scout.v1",
    semanticType: "unknown",
    first: "前方两条路线的秘密已经显现。",
    repeat: "航线图再次标出了前方的机会。",
  }),
  frozenRewardDefinition({
    id: "reward.curiosity.world-peek.v1",
    semanticType: "unknown",
    first: "云层裂开，下一片世界露出了一角。",
    repeat: "远方世界仍在发出新的邀请。",
  }),
  frozenRewardDefinition({
    id: "reward.choice.route.v1",
    semanticType: "choice",
    first: "选择一条最想探索的路线。",
    repeat: "再次选择这一次的探索方向。",
  }),
  frozenRewardDefinition({
    id: "reward.choice.next-card.v1",
    semanticType: "choice",
    first: "两条探险线索已经显现；只记录发现，不增加星星。",
    repeat: "两条探险线索再次亮起；只记录发现，不增加星星。",
    choiceCount: 2,
  }),
  frozenRewardDefinition({
    id: "reward.collect.coin-1.v1",
    semanticType: "collect",
    first: "找到一枚云港金币。",
    repeat: "再次找到一枚云港金币。",
    resources: [{ resource: "coin", amount: 1 }],
  }),
  frozenRewardDefinition({
    id: "reward.collect.card-case-1.v1",
    semanticType: "collect",
    first: "找到一颗游戏星星，星星立即到账。",
    repeat: "再次找到一颗游戏星星，星星立即到账。",
    resources: [{ resource: "star", amount: 1 }],
  }),
  frozenRewardDefinition({
    id: "reward.collect.star-1.v1",
    semanticType: "collect",
    first: "旧星标节点已按当前发布的金币或星星奖励结算。",
    repeat: "旧星标节点再次按当前发布奖励结算。",
    resources: [{ resource: "star", amount: 1 }],
  }),
  frozenRewardDefinition({
    id: "reward.collect.key-1.v1",
    semanticType: "collect",
    first: "旧钥匙节点已按当前发布的星星奖励结算。",
    repeat: "旧钥匙节点再次按当前发布奖励结算。",
    resources: [{ resource: "key", amount: 1 }],
  }),
  frozenRewardDefinition({
    id: "reward.exchange.coin-card-case.v1",
    semanticType: "combine",
    first: "金币兑换站已开启：可以选择用五枚金币换一颗星星。",
    repeat: "金币兑换站再次亮起：是否兑换仍由当前玩家决定。",
    event: "coin_card_exchange",
  }),
  frozenRewardDefinition({
    id: "reward.collect.progress-unit.v1",
    semanticType: "collect",
    first: "补给节点已按当前发布的金币或星星奖励结算。",
    repeat: "补给节点再次按当前发布奖励结算。",
    resourcePolicy: "progress-unit",
  }),
  frozenRewardDefinition({
    id: "reward.collect.fairy-anchor.v1",
    semanticType: "collect",
    first: "发现一处固定航标线索；经过或停下都不直接发资源。",
    repeat: "航标线索再次亮起；不发放星星或生成额外任务。",
  }),
  frozenRewardDefinition({
    id: "reward.combine.workshop.v1",
    semanticType: "combine",
    first: "旧工坊节点已按当前发布的金币或星星奖励结算。",
    repeat: "旧材料合成保持退役；再次按当前发布奖励结算。",
    resourcePolicy: "progress-unit",
    event: "workshop_progress",
  }),
  frozenRewardDefinition({
    id: "reward.display.album-spotlight.v1",
    semanticType: "display",
    first: "收藏展舱记录了这次到访；本格不增加个人资源。",
    repeat: "收藏展舱再次亮起；本格不增加个人资源。",
    event: "album_spotlight",
  }),
  frozenRewardDefinition({
    id: "reward.display.region-change.v1",
    semanticType: "display",
    first: "刚刚完成的地图变化留在了世界里。",
    repeat: "这处共同完成的地图变化再次亮起。",
    event: "region_change",
  }),
  frozenRewardDefinition({
    id: "reward.display.retired-fairy-signal.v1",
    semanticType: "display",
    first: "星门前的旧信号塔留下一条历史线索；本格不发资源。",
    repeat: "旧信号塔再次亮起；不召唤精灵，也不打开答题。",
  }),
  frozenRewardDefinition({
    id: "reward.event.coin-rain.v1",
    semanticType: "collect",
    first: "彩虹金币雨带来两枚金币。",
    repeat: "彩虹金币雨再次带来两枚金币。",
    resources: [{ resource: "coin", amount: 2 }],
  }),
  frozenRewardDefinition({
    id: "reward.event.fairy-signal.v1",
    semanticType: "unknown",
    first: "星门信号显示了一条历史航道线索；本格不发资源。",
    repeat: "历史航道线索再次亮起；不生成精灵或额外任务。",
  }),
  frozenRewardDefinition({
    // Preserve the historical ref for saved snapshots; the item is retired.
    id: "item.harbor.mooring-anchor.v1",
    semanticType: "ordinary",
    first: null,
    repeat: null,
    trackDiscovery: false,
  }),
  frozenRewardDefinition({
    id: "map.harbor.foghorn.v1",
    semanticType: "unknown",
    first: "港口雾笛锁定了航道目标。",
    repeat: "港口雾笛再次确认目标位置。",
    event: "harbor_foghorn",
  }),
  frozenRewardDefinition({
    id: "map.harbor.cloudfall-gate.v1",
    semanticType: "display",
    first: "云瀑水门为全班打开了发光云阶。",
    repeat: "已经开启的云阶再次点亮。",
    event: "cloudfall_gate",
  }),
  frozenRewardDefinition({
    id: "transport.harbor.signal-cannon.v1",
    semanticType: "display",
    first: "信号炮清开云礁并完成一次飞行。",
    repeat: "信号炮沿已开启航线再次发射。",
    event: "signal_cannon",
  }),
  frozenRewardDefinition({
    id: "transport.rainbow-launcher.v1",
    semanticType: "display",
    first: "彩虹滑翔器穿过峡谷抵达前方。",
    repeat: "彩虹滑翔器再次完成穿越。",
    event: "rainbow_launcher",
  }),
  frozenRewardDefinition({
    id: "region.harbor.departure-beacon.v1",
    semanticType: "display",
    first: "已到远航灯塔门；继续走过下一格时才会点灯离港。",
    repeat: "已到远航灯塔门；继续走过下一格时才会跨过区域边界。",
    event: "departure_beacon",
  }),
  frozenRewardDefinition({
    id: "world.portal.forward.v1",
    semanticType: "display",
    first: "前进星门打开，旅程通向下一片世界。",
    repeat: "前进星门再次连接到更远的世界。",
    event: "world_portal",
    worldTransition: "forward",
  }),
];

export const REWARD_DEFINITIONS = Object.freeze(Object.fromEntries(
  rewardDefinitions.map((definition) => [definition.id, definition]),
));

function frozenNodeBinding(semanticType, rewardRef) {
  const definition = REWARD_DEFINITIONS[rewardRef];
  if (!definition) throw new Error(`unknown reward definition: ${rewardRef}`);
  if (definition.semanticType !== semanticType) {
    throw new Error(`${rewardRef} must use semantic type ${definition.semanticType}`);
  }
  return Object.freeze({ semanticType, rewardRef });
}

const LEVEL_ONE_NODE_BINDINGS = Object.freeze({
  n01: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n02: frozenNodeBinding("collect", "reward.collect.coin-1.v1"),
  n03: frozenNodeBinding("ordinary", "item.harbor.mooring-anchor.v1"),
  n04: frozenNodeBinding("choice", "reward.choice.route.v1"),
  n05a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n06a: frozenNodeBinding("display", "transport.harbor.signal-cannon.v1"),
  n07a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n05b: frozenNodeBinding("unknown", "map.harbor.foghorn.v1"),
  n06b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n07b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n08: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n09: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n10: frozenNodeBinding("choice", "reward.choice.route.v1"),
  n11a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n12a: frozenNodeBinding("collect", "reward.collect.star-1.v1"),
  n13a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n11b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n12b: frozenNodeBinding("display", "map.harbor.cloudfall-gate.v1"),
  n13b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n14: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n15: frozenNodeBinding("collect", "reward.collect.coin-1.v1"),
  n16: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n17: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n18: frozenNodeBinding("display", "region.harbor.departure-beacon.v1"),

  n19: frozenNodeBinding("collect", "reward.collect.coin-1.v1"),
  n20: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n21: frozenNodeBinding("choice", "reward.choice.route.v1"),
  n22a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n23a: frozenNodeBinding("collect", "reward.collect.star-1.v1"),
  n24a: frozenNodeBinding("collect", "reward.collect.card-case-1.v1"),
  n22b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n23b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n24b: frozenNodeBinding("collect", "reward.collect.progress-unit.v1"),
  n25: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n26: frozenNodeBinding("collect", "reward.collect.coin-1.v1"),
  n27: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n28: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n29: frozenNodeBinding("choice", "reward.choice.route.v1"),

  n30a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n31a: frozenNodeBinding("collect", "reward.event.coin-rain.v1"),
  n32a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n30b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n31b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n32b: frozenNodeBinding("collect", "reward.collect.star-1.v1"),
  n33: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n34: frozenNodeBinding("display", "transport.rainbow-launcher.v1"),
  n35: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n36: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n37: frozenNodeBinding("combine", "reward.exchange.coin-card-case.v1"),
  n38: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n39: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n40: frozenNodeBinding("collect", "reward.collect.star-1.v1"),

  n41: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n42: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n43: frozenNodeBinding("display", "reward.display.album-spotlight.v1"),
  n44: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n45: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n46: frozenNodeBinding("display", "reward.display.retired-fairy-signal.v1"),
  n47: frozenNodeBinding("collect", "reward.collect.fairy-anchor.v1"),
  n48: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  n49: frozenNodeBinding("display", "world.portal.forward.v1"),
});

export const LEVEL_ONE = Object.freeze({
  kind: "LevelPack",
  id: "ximitu-card-hunt.level-01",
  version: "2.0.0",
  title: "云港星星大冒险",
  subtitle: "说出目标句，探索云港，为本局赢得更多星星",
  initialMapState: Object.freeze({}),
  initialLevelState: Object.freeze({
    discoveredNodeIds: Object.freeze([]),
    displayedCardIdsByOwner: Object.freeze({}),
    seenCardHintIds: Object.freeze([]),
  }),
  nodeBindings: LEVEL_ONE_NODE_BINDINGS,
  ordinaryNodeIds: Object.freeze([
    "n01",
    "n03",
    "n05a",
    "n07a",
    "n06b",
    "n07b",
    "n09",
    "n11a",
    "n13a",
    "n11b",
    "n13b",
    "n16",
    "n17",
    "n22a",
    "n22b",
    "n23b",
    "n25",
    "n27",
    "n30a",
    "n32a",
    "n30b",
    "n31b",
    "n33",
    "n36",
    "n38",
    "n39",
    "n41",
    "n42",
    "n44",
    "n45",
    "n48",
  ]),
  anchorNodeIds: Object.freeze(["n08", "n14", "n20", "n28", "n35", "n47"]),
  coinNodeIds: Object.freeze([
    "n02",
    "n15",
    "n19",
    "n24b",
    "n26",
    "n31a",
  ]),
  cardCaseNodeIds: Object.freeze(["n24a"]),
  gemNodeIds: Object.freeze(["n12a", "n23a", "n32b", "n40"]),
  eventNodeIds: Object.freeze([]),
  mooringAnchorNodeId: "n03",
  foghornNodeId: "n05b",
  cloudfallGateNodeId: "n12b",
  exchangeNodeId: "n37",
  retiredSignalNodeId: "n46",
  homeNodeId: null,
  displayNodeId: "n43",
  portalNodeId: "n49",
});

// LevelPack 2.1.0 is the current cloud-harbor level: n05b, n06a, n12b and n34 are
// plain final-landing cells (no transport, no map effect). 2.0.0 above stays a
// precise historical snapshot for existing sessions and their watergate topology.
export const CURRENT_LEVEL_ONE = Object.freeze({
  ...LEVEL_ONE,
  version: "2.1.0",
  subtitle: "掷骰前进，在最终停稳的格子领取家园积分",
  nodeBindings: Object.freeze({
    ...LEVEL_ONE.nodeBindings,
    n05b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
    n06a: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
    n12b: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
    n34: frozenNodeBinding("ordinary", "reward.ordinary.none.v1"),
  }),
  ordinaryNodeIds: Object.freeze([...LEVEL_ONE.ordinaryNodeIds, "n05b", "n06a", "n12b", "n34"]),
  foghornNodeId: null,
  cloudfallGateNodeId: null,
});

export function levelOneNodeBinding(nodeId, fallback = null) {
  return LEVEL_ONE.nodeBindings[String(nodeId || "")] || fallback;
}

const REWARD_RESOLVER_INPUT_FIELDS = new Set([
  "nodeId",
  "discoveredNodeIds",
  "playerAssets",
  "stableSeed",
  "settlementId",
]);

const PLAYER_ASSET_FIELDS = new Set(["coins", "stars", "keys"]);

function normalizedNonNegativeAsset(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function normalizedPlayerAssets(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("playerAssets must be an object");
  }
  for (const field of Object.keys(value)) {
    if (!PLAYER_ASSET_FIELDS.has(field)) {
      throw new Error(`unsupported player asset field: ${field}`);
    }
  }
  return {
    coins: normalizedNonNegativeAsset(value.coins, "playerAssets.coins"),
    stars: normalizedNonNegativeAsset(value.stars, "playerAssets.stars"),
    keys: normalizedNonNegativeAsset(value.keys, "playerAssets.keys"),
  };
}

function normalizedDiscoveredNodeIds(value = []) {
  const entries = value instanceof Set ? [...value] : value;
  if (!Array.isArray(entries)) {
    throw new Error("discoveredNodeIds must be an array or Set");
  }
  return new Set(entries.map((nodeId, index) => {
    const normalized = String(nodeId || "").trim();
    if (!normalized) {
      throw new Error(`discoveredNodeIds[${index}] must be a non-empty string`);
    }
    return normalized;
  }));
}

function stableRewardHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function progressUnitReward(playerAssets) {
  const coinsUntilStar = 3 - (playerAssets.coins % 3);
  const starsUntilKey = 3 - (playerAssets.stars % 3);
  if (starsUntilKey < coinsUntilStar) {
    return Object.freeze({ resource: "star", amount: 1 });
  }
  return Object.freeze({ resource: "coin", amount: 1 });
}

/**
 * Resolves the declarative reward slice without reading learning or assessment
 * data. The caller remains responsible for committing `idempotencyKey` once
 * and for running the existing player-assets conversion transaction.
 */
export function resolveLevelOneReward(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("reward resolver input must be an object");
  }
  for (const field of Object.keys(input)) {
    if (!REWARD_RESOLVER_INPUT_FIELDS.has(field)) {
      throw new Error(`unsupported reward resolver input: ${field}`);
    }
  }

  const nodeId = String(input.nodeId || "").trim();
  if (!nodeId) throw new Error("nodeId must be a non-empty string");
  const binding = levelOneNodeBinding(nodeId);
  if (!binding) throw new Error(`unknown level-one reward node: ${nodeId}`);

  const settlementId = String(input.settlementId || "").trim();
  if (!settlementId) throw new Error("settlementId must be a non-empty string");
  const stableSeed = String(input.stableSeed ?? "level-one.reward.v1");
  if (!stableSeed) throw new Error("stableSeed must not be empty");

  const discoveredNodeIds = normalizedDiscoveredNodeIds(input.discoveredNodeIds);
  const playerAssets = normalizedPlayerAssets(input.playerAssets);
  const definition = REWARD_DEFINITIONS[binding.rewardRef];
  const firstVisit = definition.trackDiscovery && !discoveredNodeIds.has(nodeId);
  const stableKey = [
    "level-one.reward.v1",
    stableSeed,
    settlementId,
    nodeId,
    definition.trackDiscovery
      ? firstVisit ? "first" : "repeat"
      : "none",
  ].join(":");
  const stableIndex = stableRewardHash(stableKey);
  const rewards = definition.resourcePolicy === "progress-unit"
    ? [progressUnitReward(playerAssets)]
    : definition.resources.map((reward) => Object.freeze({ ...reward }));
  const selection = definition.choiceCount > 0
    ? Object.freeze({
        count: definition.choiceCount,
        stableIndex: stableIndex % definition.choiceCount,
      })
    : null;

  return Object.freeze({
    schemaVersion: "level-one.reward-resolution.v1",
    nodeId,
    semanticType: binding.semanticType,
    rewardRef: binding.rewardRef,
    firstVisit,
    copy: definition.copy,
    activeCopy: definition.trackDiscovery
      ? firstVisit ? definition.copy.first : definition.copy.repeat
      : null,
    rewards: Object.freeze(rewards),
    event: definition.event,
    selection,
    worldTransition: definition.worldTransition,
    trackDiscovery: definition.trackDiscovery,
    settlementId,
    idempotencyKey: `level-one.reward:${settlementId}:${nodeId}`,
    stableToken: stableIndex.toString(16).padStart(8, "0"),
  });
}

const nodeKinds = new Map([
  ...LEVEL_ONE.coinNodeIds.map((nodeId) => [nodeId, "coin"]),
  ...LEVEL_ONE.cardCaseNodeIds.map((nodeId) => [nodeId, "item"]),
  ...LEVEL_ONE.gemNodeIds.map((nodeId) => [nodeId, "gem"]),
  ...LEVEL_ONE.eventNodeIds.map((nodeId) => [nodeId, "event"]),
  ...LEVEL_ONE.anchorNodeIds.map((nodeId) => [nodeId, "anchor"]),
  [LEVEL_ONE.mooringAnchorNodeId, "learning"],
  [LEVEL_ONE.foghornNodeId, "foghorn"],
  [LEVEL_ONE.cloudfallGateNodeId, "cloud-gate"],
  [LEVEL_ONE.exchangeNodeId, "item"],
  [LEVEL_ONE.retiredSignalNodeId, "item"],
  ...(LEVEL_ONE.homeNodeId ? [[LEVEL_ONE.homeNodeId, "home"]] : []),
  [LEVEL_ONE.portalNodeId, "portal"],
]);

export function levelOneNodeKind(nodeId, fallback = "learning") {
  return nodeKinds.get(nodeId) || fallback;
}

export function levelOneLandingBonus(nodeId) {
  const kind = levelOneNodeKind(nodeId, null);
  if (kind === "coin") return { kind, coins: 1, stars: 0, keys: 0, event: null };
  if (kind === "gem") return { kind, coins: 0, stars: 1, keys: 0, event: null };
  if (kind === "item" && nodeId === LEVEL_ONE.exchangeNodeId) {
    return {
      kind: "exchange",
      coins: 0,
      stars: 0,
      keys: 0,
      event: "coin_card_exchange",
    };
  }
  if (kind === "foghorn") {
    return {
      kind,
      coins: 0,
      stars: 0,
      keys: 0,
      event: "harbor_foghorn",
    };
  }
  if (kind === "mooring" || kind === "cloud-gate") {
    return { kind, coins: 0, stars: 0, keys: 0, event: null };
  }
  return { kind, coins: 0, stars: 0, keys: 0, event: null };
}

export function forwardAnchorCandidates(
  board,
  startNodeId,
  targetTeamId = null,
  anchorNodeIds = LEVEL_ONE.anchorNodeIds,
) {
  if (!Array.isArray(anchorNodeIds)) {
    throw new TypeError("anchorNodeIds must be an array");
  }
  const edgesByNode = new Map();
  for (const edge of board?.edges || []) {
    if (!edgesByNode.has(edge.from)) edgesByNode.set(edge.from, []);
    edgesByNode.get(edge.from).push(edge.to);
  }
  const distances = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  while (queue.length) {
    const current = queue.shift();
    const distance = distances.get(current);
    if (distance >= 6) continue;
    for (const next of edgesByNode.get(current) || []) {
      const nextDistance = distance + 1;
      if (distances.has(next) && distances.get(next) <= nextDistance) continue;
      distances.set(next, nextDistance);
      queue.push(next);
    }
  }
  return anchorNodeIds
    .map((anchorId) => ({
      anchorId,
      distance: distances.get(anchorId),
      targetTeamId,
    }))
    .filter(({ distance }) => Number.isInteger(distance) && distance >= 2 && distance <= 6);
}

export function routeCapturesFairy(routeNodeIds, landingNodeId, fairyAnchorId) {
  if (!fairyAnchorId) return false;
  return [...(routeNodeIds || []), landingNodeId].includes(fairyAnchorId);
}

export function levelOnePhase(completedTurns = 0, minTotalTurns = 12) {
  const denominator = Math.max(1, Number(minTotalTurns) || 12);
  const progress = Math.max(0, Number(completedTurns) || 0) / denominator;
  if (progress < 1 / 3) {
    return { id: "forge", label: "第一幕 · 云港启航", cue: "探索航道，收集金币与星星" };
  }
  if (progress < 2 / 3) {
    return { id: "chase", label: "第二幕 · 彩虹寻宝", cue: "前往兑换站，发现更多星星" };
  }
  return {
    id: "frontier",
    label: "第三幕 · 星门远征",
    cue: "点亮星门，发现下一片世界",
  };
}
