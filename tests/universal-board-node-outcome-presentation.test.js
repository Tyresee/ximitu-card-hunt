import test from "node:test";
import assert from "node:assert/strict";

import {
  LEVEL_ONE,
  REWARD_DEFINITIONS,
  resolveLevelOneReward,
} from "../public/prototypes/universal-board/level-one.js";
import {
  presentationForLevelOneNode,
} from "../public/prototypes/universal-board/level-one-presentations.js";
import {
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  formatNodeOutcomeResources,
  nodeOutcomePresentation,
} from "../public/prototypes/universal-board/node-outcome-presentation.js";

const REQUIRED_FIELDS = Object.freeze([
  "category",
  "tone",
  "icon",
  "trigger",
  "badgeLabel",
  "shortLabel",
  "detail",
  "hasDirectReward",
]);

function worldOneOutcome(nodeId, overrides = {}) {
  const binding = LEVEL_ONE.nodeBindings[nodeId];
  return nodeOutcomePresentation({
    nodeId,
    rewardRef: binding.rewardRef,
    definition: REWARD_DEFINITIONS[binding.rewardRef],
    ...overrides,
  });
}

function worldTwoOutcome(rewardRef) {
  return nodeOutcomePresentation({
    rewardRef,
    profile: EXPANSION_WORLD_LANDING_PROFILES[rewardRef],
  });
}

test("resource formatter only uses the registered shared economy", () => {
  assert.equal(formatNodeOutcomeResources(), "");
  assert.equal(formatNodeOutcomeResources([
    { resource: "star", amount: 2 },
    { resource: "coin", amount: 1 },
    { resource: "coin", amount: 2 },
    { resource: "fuel", amount: 99 },
  ]), "金币×3 · 星星×2");
});

test("ordinary nodes explicitly promise no extra effect", () => {
  for (const outcome of [
    worldOneOutcome("n01"),
    worldTwoOutcome("world2.ordinary.v1"),
  ]) {
    assert.equal(Object.isFrozen(outcome), true);
    assert.deepEqual(outcome, {
      category: "ordinary",
      tone: "neutral",
      icon: "○",
      trigger: "none",
      badgeLabel: "普通格",
      shortLabel: "无额外效果",
      detail: "停在这里不会获得资源，也不会触发奖励或惩罚。",
      hasDirectReward: false,
    });
  }
});

test("n03 retains its historical identity but presents and settles as a silent ordinary node", () => {
  const outcome = worldOneOutcome("n03");
  assert.deepEqual(outcome, worldOneOutcome("n01"));
  assert.equal(LEVEL_ONE.nodeBindings.n03.rewardRef, "item.harbor.mooring-anchor.v1");
  const reward = resolveLevelOneReward({ nodeId: "n03", settlementId: "retired-anchor" });
  assert.equal(reward.semanticType, "ordinary");
  assert.deepEqual(reward.rewards, []);
  assert.equal(reward.event, null);
  assert.equal(reward.selection, null);
  assert.equal(reward.activeCopy, null);
  assert.equal(reward.trackDiscovery, false);
  assert.equal(reward.firstVisit, false);
  assert.doesNotMatch(JSON.stringify(presentationForLevelOneNode("n03")), /停靠锚|精准停靠|改选沿途落点|下个回合/);
});

test("retired fairy trace nodes are passive route markers in every state", () => {
  const empty = worldOneOutcome("n08");
  assert.equal(empty.badgeLabel, "航标线索");
  assert.equal(empty.shortLabel, "只显示线索");
  assert.equal(empty.hasDirectReward, false);
  assert.doesNotMatch(`${empty.badgeLabel} ${empty.shortLabel} ${empty.detail}`, /精灵|卡盒|答题/);

  const occupied = worldOneOutcome("n08", { fairyHere: true });
  assert.equal(occupied.badgeLabel, "航标线索");
  assert.equal(occupied.trigger, "route-pass");
  assert.equal(occupied.shortLabel, "只显示线索");
  assert.equal(occupied.hasDirectReward, false);
});

test("n18 explains that the next edge, not landing, triggers departure", () => {
  const departure = worldOneOutcome("n18");
  assert.equal(departure.trigger, "next-edge-pass");
  assert.equal(departure.badgeLabel, "下一步通过时离港");
  assert.equal(departure.shortLabel, "停在本格不触发");
  assert.match(departure.detail, /从本格继续走到下一格/);
  assert.doesNotMatch(departure.detail, /停靠锚|归还/);
});

test("card and album nodes state their actual resource behavior", () => {
  const cardCase = worldOneOutcome("n24a");
  assert.equal(cardCase.category, "reward");
  assert.equal(cardCase.badgeLabel, "落点奖励");
  assert.equal(cardCase.shortLabel, "星星×1");
  assert.match(cardCase.detail, /最终停在这里时获得/);
  assert.doesNotMatch(cardCase.detail, /挑战|答题|录音|评分/);
  assert.equal(cardCase.hasDirectReward, true);

  const album = worldOneOutcome("n43");
  assert.equal(album.category, "collection-display");
  assert.equal(album.badgeLabel, "收藏展示");
  assert.equal(album.shortLabel, "不加资源");
  assert.match(album.detail, /不会新增星星/);
  assert.equal(album.hasDirectReward, false);
});

test("World 01 resource, route, map, and transport nodes state real triggers", () => {
  assert.deepEqual({
    badgeLabel: worldOneOutcome("n02").badgeLabel,
    shortLabel: worldOneOutcome("n02").shortLabel,
    trigger: worldOneOutcome("n02").trigger,
  }, {
    badgeLabel: "落点奖励",
    shortLabel: "金币×1",
    trigger: "final-landing",
  });
  assert.equal(worldOneOutcome("n31a").shortLabel, "金币×2");
  assert.equal(worldOneOutcome("n24b").shortLabel, "按发布奖励结算");
  assert.equal(worldOneOutcome("n04").trigger, "route-arrival");
  assert.equal(worldOneOutcome("n04").shortLabel, "有剩余步数时选方向");
  assert.match(worldOneOutcome("n04").detail, /正好停在路口时本回合不弹窗/);
  assert.equal(worldOneOutcome("n05b").shortLabel, "吹散航道云雾");
  assert.equal(worldOneOutcome("n12b").shortLabel, "永久开启云阶");
  assert.equal(worldOneOutcome("n06a").category, "transport");
  assert.equal(worldOneOutcome("n49").trigger, "after-enter");
});

test("World 01 former activity nodes expose only their actual landing result", () => {
  const coinRain = worldOneOutcome("n31a");
  assert.equal(coinRain.category, "reward");
  assert.equal(coinRain.shortLabel, "金币×2");
  assert.equal(coinRain.hasDirectReward, true);
  assert.doesNotMatch(coinRain.detail, /挑战|答题|录音|评分/);

  const exchange = worldOneOutcome("n37");
  assert.equal(exchange.category, "exchange");
  assert.equal(exchange.shortLabel, "5金币 → 1颗星星");
  assert.equal(exchange.hasDirectReward, false);
  assert.match(exchange.detail, /选择是否/);

  const fairySignal = worldOneOutcome("n46");
  assert.equal(fairySignal.category, "clue");
  assert.equal(fairySignal.shortLabel, "不加资源");
  assert.equal(fairySignal.hasDirectReward, false);
  assert.match(fairySignal.detail, /不召唤精灵/);
});

test("World 02 resources, choices, discoveries, transports, and forward exit stay exact", () => {
  assert.equal(worldTwoOutcome("world2.coin-cache.v1").shortLabel, "金币×1");
  assert.equal(worldTwoOutcome("world2.star-bloom.v1").shortLabel, "星星×1");
  assert.equal(worldTwoOutcome("world2.key-forge.v1").shortLabel, "钥匙×1");

  const choice = worldTwoOutcome("world2.junction-choice.v1");
  assert.equal(choice.badgeLabel, "到达岔路");
  assert.equal(choice.trigger, "route-arrival");
  assert.match(choice.detail, /仍有剩余骰点/);
  const conditional = worldTwoOutcome("world2.aurora-bridge-choice.v1");
  assert.equal(conditional.badgeLabel, "条件岔路");
  assert.match(conditional.detail, /光桥已开启/);

  const discovery = worldTwoOutcome("world2.discovery.star-gate.v1");
  assert.equal(discovery.badgeLabel, "图鉴发现");
  assert.equal(discovery.hasDirectReward, true);
  assert.match(discovery.detail, /首次最终停/);

  const transport = worldTwoOutcome("world2.transport.comet-lift.v1");
  assert.equal(transport.badgeLabel, "自动传送");
  assert.equal(transport.trigger, "final-landing");

  const portal = worldTwoOutcome("world2.forward-portal.v1");
  assert.equal(portal.badgeLabel, "进入新世界");
  assert.equal(portal.trigger, "after-enter");
  assert.match(portal.detail, /剩余骰点继续逐格走完/);
  assert.match(portal.detail, /不回到旧世界起点/);
});

test("only prism tree claims a permanent World 02 route change", () => {
  const prismTree = worldTwoOutcome("world2.map.prism-tree.v1");
  assert.equal(prismTree.shortLabel, "永久开启极光桥");
  assert.match(prismTree.detail, /永久开启极光桥/);

  for (const [rewardRef, profile] of Object.entries(
    EXPANSION_WORLD_LANDING_PROFILES,
  )) {
    if (profile.kind !== "map-effect" || rewardRef === "world2.map.prism-tree.v1") {
      continue;
    }
    const outcome = worldTwoOutcome(rewardRef);
    assert.doesNotMatch(
      `${outcome.shortLabel} ${outcome.detail}`,
      /永久开启|开桥|已经改变路线|路线已经改变/,
      `${rewardRef} must not claim a route mutation`,
    );
  }
});

test("World 02 gallery summarizes existing discoveries without granting resources", () => {
  const gallery = worldTwoOutcome("world2.world-gallery.v1");
  assert.equal(gallery.category, "collection-display");
  assert.equal(gallery.badgeLabel, "图鉴展廊");
  assert.equal(gallery.shortLabel, "汇总已有发现");
  assert.match(gallery.detail, /不会新增资源或改变路线/);
  assert.equal(gallery.hasDirectReward, false);
});

test("every registered current reward resolves to a frozen non-punishment presentation", () => {
  for (const [nodeId, binding] of Object.entries(LEVEL_ONE.nodeBindings)) {
    const outcome = worldOneOutcome(nodeId);
    assert.equal(Object.isFrozen(outcome), true, `${nodeId} must be frozen`);
    assert.deepEqual(Object.keys(outcome), REQUIRED_FIELDS, `${nodeId} fields`);
    assert.equal(outcome.category.includes("punish"), false);
    assert.doesNotMatch(`${outcome.badgeLabel} ${outcome.shortLabel}`, /惩罚|扣除/);
    assert.equal(binding.rewardRef.length > 0, true);
  }

  const boundWorldTwoRewardRefs = new Set(
    Object.values(EXPANSION_WORLD_LEVEL_PACK.nodeBindings)
      .map(({ rewardRef }) => rewardRef),
  );
  for (const rewardRef of boundWorldTwoRewardRefs) {
    const outcome = worldTwoOutcome(rewardRef);
    assert.equal(Object.isFrozen(outcome), true, `${rewardRef} must be frozen`);
    assert.deepEqual(Object.keys(outcome), REQUIRED_FIELDS, `${rewardRef} fields`);
    assert.equal(outcome.category.includes("punish"), false);
    assert.doesNotMatch(`${outcome.badgeLabel} ${outcome.shortLabel}`, /惩罚|扣除/);
  }
});
