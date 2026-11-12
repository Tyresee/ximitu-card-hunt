const RESOURCE_LABELS = Object.freeze({
  coin: "金币",
  star: "星星",
  key: "钥匙",
  card: "星星",
});

const RESOURCE_ICONS = Object.freeze({
  coin: "🪙",
  star: "⭐",
  key: "🔑",
  card: "⭐",
});

function normalizedResources(resources) {
  if (!Array.isArray(resources)) return [];
  const totals = new Map();
  resources.forEach((reward) => {
    const rawResource = String(reward?.resource || "").trim();
    const resource = ["card_case", "card"].includes(rawResource) ? "star" : rawResource;
    const amount = Number(reward?.amount);
    if (!RESOURCE_LABELS[resource] || !Number.isInteger(amount) || amount < 1) {
      return;
    }
    totals.set(resource, (totals.get(resource) || 0) + amount);
  });
  return Object.keys(RESOURCE_LABELS)
    .filter((resource) => totals.has(resource))
    .map((resource) => Object.freeze({
      resource,
      amount: totals.get(resource),
    }));
}

/**
 * Formats existing map resources without inventing a parallel currency.
 */
export function formatNodeOutcomeResources(resources = []) {
  return normalizedResources(resources)
    .map(({ resource, amount }) => `${RESOURCE_LABELS[resource]}×${amount}`)
    .join(" · ");
}

function frozenOutcome({
  category,
  tone,
  icon,
  trigger,
  badgeLabel,
  shortLabel,
  detail,
  hasDirectReward = false,
}) {
  return Object.freeze({
    category,
    tone,
    icon,
    trigger,
    badgeLabel,
    shortLabel,
    detail,
    hasDirectReward: Boolean(hasDirectReward),
  });
}

function ordinaryOutcome() {
  return frozenOutcome({
    category: "ordinary",
    tone: "neutral",
    icon: "○",
    trigger: "none",
    badgeLabel: "普通格",
    shortLabel: "无额外效果",
    detail: "停在这里不会获得资源，也不会触发奖励或惩罚。",
  });
}

function resourceOutcome(resources) {
  const normalized = normalizedResources(resources);
  const resourceText = formatNodeOutcomeResources(normalized);
  const icon = normalized.length === 1
    ? RESOURCE_ICONS[normalized[0].resource]
    : "🎁";
  return frozenOutcome({
    category: "reward",
    tone: "reward",
    icon,
    trigger: "final-landing",
    badgeLabel: "落点奖励",
    shortLabel: resourceText || "资源奖励",
    detail: `最终停在这里时获得${resourceText || "资源"}；路过不结算。`,
    hasDirectReward: normalized.length > 0,
  });
}

function routeChoiceOutcome(conditional = false) {
  return frozenOutcome({
    category: "route-choice",
    tone: "choice",
    icon: "↗",
    trigger: "route-arrival",
    badgeLabel: conditional ? "条件岔路" : "到达岔路",
    shortLabel: conditional ? "桥开启且有步数时可选" : "有剩余步数时选方向",
    detail: conditional
      ? "共享光桥已开启、且到达岔路时本次仍有剩余骰点，棋子才会暂停并让当前玩家选择桥路线；正好停在路口时本回合不弹窗。"
      : "到达岔路时本次仍有剩余骰点，棋子才会暂停并弹出路线选择；正好停在路口时本回合不弹窗。",
  });
}

function passiveClueOutcome({
  badgeLabel = "世界线索",
  shortLabel = "不加资源",
  detail = "最终停在这里时显示一条世界线索；不会增加资源或改变路线。",
  icon = "🔎",
  trigger = "final-landing",
} = {}) {
  return frozenOutcome({
    category: "clue",
    tone: "clue",
    icon,
    trigger,
    badgeLabel,
    shortLabel,
    detail,
  });
}

function mapEffectOutcome({ shortLabel, detail, icon = "✦" }) {
  return frozenOutcome({
    category: "map-effect",
    tone: "map",
    icon,
    trigger: "final-landing",
    badgeLabel: "地图机关",
    shortLabel,
    detail,
  });
}

function transportOutcome({ shortLabel = "自动前往前方", detail }) {
  return frozenOutcome({
    category: "transport",
    tone: "transport",
    icon: "➜",
    trigger: "final-landing",
    badgeLabel: "自动传送",
    shortLabel,
    detail: detail || "最终停在装置格时自动前往指定落点；路过不触发。",
  });
}

function worldOneOutcome({ nodeId, rewardRef, definition, fairyHere }) {
  if (rewardRef === "reward.ordinary.none.v1") return ordinaryOutcome();

  if (rewardRef === "item.harbor.mooring-anchor.v1" || nodeId === "n03") {
    // Keep the historical reward identity readable without offering a retired item.
    return ordinaryOutcome();
  }

  if (rewardRef === "reward.collect.fairy-anchor.v1") {
    return passiveClueOutcome({
      badgeLabel: "航标线索",
      shortLabel: "只显示线索",
      detail: "这是保留在航线上的固定航标；经过或停下只显示地图线索，不会发资源或打开第二个任务。",
      trigger: "route-pass",
    });
  }

  if (rewardRef === "region.harbor.departure-beacon.v1" || nodeId === "n18") {
    return frozenOutcome({
      category: "region-transition",
      tone: "map",
      icon: "🗼",
      trigger: "next-edge-pass",
      badgeLabel: "下一步通过时离港",
      shortLabel: "停在本格不触发",
      detail: "停在这里不会触发离港；实际从本格继续走到下一格时，才点亮灯塔并进入风帆高地。",
    });
  }

  if (rewardRef === "reward.choice.next-card.v1") {
    return passiveClueOutcome({
      badgeLabel: "历史星星线索",
      shortLabel: "不加资源",
      detail: "这是旧版星星线索；最终落点不会再打开答题、录音或评分。",
      icon: "🔎",
    });
  }

  if (rewardRef === "reward.event.coin-rain.v1") {
    return resourceOutcome(definition?.resources || []);
  }

  if (rewardRef === "reward.exchange.coin-card-case.v1") {
    return frozenOutcome({
      category: "exchange",
      tone: "choice",
      icon: "🪙→⭐",
      trigger: "final-landing",
      badgeLabel: "金币兑换站",
      shortLabel: "5金币 → 1颗星星",
      detail: "最终停在这里时，由当前玩家选择是否用5枚金币换1颗星星；星星会立即到账，路过不触发。",
    });
  }

  if (rewardRef === "reward.collect.key-1.v1") {
    return resourceOutcome(definition?.resources || []);
  }

  if (rewardRef === "reward.display.album-spotlight.v1") {
    return frozenOutcome({
      category: "collection-display",
      tone: "display",
      icon: "🖼",
      trigger: "final-landing",
      badgeLabel: "收藏展示",
      shortLabel: "不加资源",
      detail: "最终停在这里时点亮一次收藏展示反馈；不会新增星星或其他资源。",
    });
  }

  if (rewardRef === "reward.choice.route.v1") return routeChoiceOutcome();

  if (rewardRef === "reward.collect.progress-unit.v1") {
    return passiveClueOutcome({
      badgeLabel: "旧补给标记",
      shortLabel: "按发布奖励结算",
      detail: "这是兼容保留的旧补给节点；实际到账只以当前发布的金币或星星配置为准。",
    });
  }

  if (rewardRef === "reward.combine.workshop.v1") {
    return passiveClueOutcome({
      badgeLabel: "旧工坊标记",
      shortLabel: "按发布奖励结算",
      detail: "旧材料合成已经退役；本格实际结果只以当前发布的金币或星星配置为准。",
    });
  }

  if (rewardRef === "map.harbor.foghorn.v1") {
    return frozenOutcome({
      category: "map-effect",
      tone: "ability",
      icon: "📯",
      trigger: "final-landing",
      badgeLabel: "地图能力",
      shortLabel: "吹散航道云雾",
      detail: "最终停在这里时吹散局部云雾并标亮前方设施；不会追加题目或评分。",
    });
  }

  if (rewardRef === "map.harbor.cloudfall-gate.v1") {
    return mapEffectOutcome({
      shortLabel: "永久开启云阶",
      detail: "首次最终停在这里时，为全班永久开启通往区域前方的云阶捷径；不会额外移动棋子。",
      icon: "🌊",
    });
  }

  if (rewardRef === "transport.harbor.signal-cannon.v1") {
    return transportOutcome({
      shortLabel: "飞到前方落点",
      detail: "最终停在信号炮格时自动飞到前方云垫；路过炮台不触发，只结算飞行后的真实最终落点。",
    });
  }

  if (rewardRef === "transport.rainbow-launcher.v1") {
    return transportOutcome({
      shortLabel: "飞到前方落点",
      detail: "最终停在彩虹滑翔器格时自动飞到指定前方落点；路过不触发。",
    });
  }

  if (rewardRef === "world.portal.forward.v1") {
    return frozenOutcome({
      category: "world-transition",
      tone: "transport",
      icon: "✦",
      trigger: "after-enter",
      badgeLabel: "进入新世界",
      shortLabel: "继续向前",
      detail: "进入本格后向前穿越到下一世界，不回到起点；不会增加资源。",
    });
  }

  if (rewardRef === "reward.event.fairy-signal.v1") {
    return passiveClueOutcome({
      badgeLabel: "历史精灵信号",
      shortLabel: "不加资源",
      detail: "这是旧版精灵信号；当前落点不召唤精灵，也不打开答题、录音或评分。",
      icon: "🔎",
    });
  }

  if (rewardRef === "reward.display.retired-fairy-signal.v1") {
    return passiveClueOutcome({
      badgeLabel: "历史航道线索",
      shortLabel: "不加资源",
      detail: "最终停在这里只显示历史航道线索；不召唤精灵，不打开答题、录音或评分。",
      icon: "🔎",
    });
  }

  if (rewardRef === "reward.display.region-change.v1") {
    return frozenOutcome({
      category: "collection-display",
      tone: "display",
      icon: "✦",
      trigger: "final-landing",
      badgeLabel: "地图回顾",
      shortLabel: "不加资源",
      detail: "最终停在这里时再次展示已经发生的地图变化；不会增加资源或改变路线。",
    });
  }

  if (String(rewardRef).startsWith("reward.curiosity.")) {
    return passiveClueOutcome();
  }

  const resources = Array.isArray(definition?.resources)
    ? definition.resources
    : [];
  if (resources.length > 0) return resourceOutcome(resources);
  return null;
}

const WORLD_TWO_MAP_EFFECT_COPY = Object.freeze({
  "world2.map.echo-observatory.v1": Object.freeze({
    shortLabel: "记录回声线索",
    detail: "最终停在这里时记录一段远方回声线索；不会增加资源或改变路线。",
  }),
  "world2.map.constellation-lens.v1": Object.freeze({
    shortLabel: "照亮星路线索",
    detail: "最终停在这里时显示前方星路线索；不会增加资源或改变路线。",
  }),
  "world2.map.cloud-whale-beacon.v1": Object.freeze({
    shortLabel: "记录云鲸印记",
    detail: "最终停在这里时记录云鲸航道印记；不会增加资源或改变路线。",
  }),
  "world2.map.cloud-whale-pool.v1": Object.freeze({
    shortLabel: "显示发光航迹",
    detail: "最终停在这里时显示一条发光航迹；不会增加资源或改变路线。",
  }),
  "world2.map.prism-telescope.v1": Object.freeze({
    shortLabel: "显示极光远景",
    detail: "最终停在这里时显示极光晶林远景；不会增加资源或改变路线。",
  }),
  "world2.map.aurora-projector.v1": Object.freeze({
    shortLabel: "标记遗迹入口",
    detail: "最终停在这里时标记月轮遗迹入口；不会增加资源或改变路线。",
  }),
  "world2.map.moon-dial.v1": Object.freeze({
    shortLabel: "记录月轮坐标",
    detail: "最终停在这里时记录月轮坐标；不会增加资源或改变路线。",
  }),
});

function worldTwoOutcome({ rewardRef, profile }) {
  const kind = String(profile?.kind || "");
  if (kind === "ordinary" || rewardRef === "world2.ordinary.v1") {
    return ordinaryOutcome();
  }

  const resources = Array.isArray(profile?.rewards) ? profile.rewards : [];
  if (kind === "resource" || resources.length > 0) {
    return resourceOutcome(resources);
  }

  if (kind === "route-choice") return routeChoiceOutcome();
  if (kind === "conditional-route-choice") return routeChoiceOutcome(true);

  if (kind === "discovery") {
    return frozenOutcome({
      category: "collection",
      tone: "reward",
      icon: "🔎",
      trigger: "final-landing",
      badgeLabel: "图鉴发现",
      shortLabel: "首次收录1条线索",
      detail: "首次最终停在这里时，把1条世界发现收录进个人图鉴；重复停留不会新增资源。",
      hasDirectReward: true,
    });
  }

  if (kind === "transport") {
    const isBubbleGeyser = rewardRef === "world2.transport.bubble-geyser.v1";
    return transportOutcome({
      shortLabel: isBubbleGeyser ? "泡泡升空到前方" : "彗星舱飞到前方",
      detail: isBubbleGeyser
        ? "最终停在泡泡喷泉格时自动升空到指定前方落点；路过不触发。"
        : "最终停在彗星升降舱格时自动飞到指定前方落点；路过不触发。",
    });
  }

  if (kind === "map-effect") {
    if (
      rewardRef === "world2.map.prism-tree.v1"
      && profile?.firstStateChanges?.auroraBridgeOpen === true
    ) {
      return mapEffectOutcome({
        shortLabel: "永久开启极光桥",
        detail: "首次最终停在这里时，为全班永久开启极光桥；之后的条件岔路才可选择走桥。",
        icon: "🌈",
      });
    }
    const copy = WORLD_TWO_MAP_EFFECT_COPY[rewardRef];
    return mapEffectOutcome({
      shortLabel: copy?.shortLabel || "显示世界线索",
      detail: copy?.detail
        || "最终停在这里时显示一次世界机关反馈；不会增加资源，也不会宣称改变路线。",
    });
  }

  if (kind === "collection-gallery") {
    return frozenOutcome({
      category: "collection-display",
      tone: "display",
      icon: "🖼",
      trigger: "final-landing",
      badgeLabel: "图鉴展廊",
      shortLabel: "汇总已有发现",
      detail: "最终停在这里时汇总已经收录的世界发现；不会新增资源或改变路线。",
    });
  }

  if (kind === "world-transition") {
    return frozenOutcome({
      category: "world-transition",
      tone: "transport",
      icon: "✦",
      trigger: "after-enter",
      badgeLabel: "进入新世界",
      shortLabel: "继续向前",
      detail: "进入本格后向前穿越到下一世界，不回到旧世界起点；剩余骰点继续逐格走完。",
    });
  }

  if (kind === "world-vista") {
    return passiveClueOutcome({
      badgeLabel: "世界景观",
      shortLabel: "只展示 · 无资源",
      detail: "最终停在这里时展示当前区域景观；不会增加资源或改变路线。",
      icon: "◈",
    });
  }

  if (kind === "quiet") {
    return frozenOutcome({
      category: "quiet",
      tone: "neutral",
      icon: "○",
      trigger: "final-landing",
      badgeLabel: "落点反馈",
      shortLabel: "无额外资源",
      detail: "最终停在这里时显示简短世界反馈；不会增加资源或改变路线。",
    });
  }

  return null;
}

function genericOutcome({ definition, profile }) {
  const kind = String(profile?.kind || definition?.semanticType || "");
  const resources = Array.isArray(profile?.rewards)
    ? profile.rewards
    : Array.isArray(definition?.resources)
      ? definition.resources
      : [];
  if (kind === "ordinary") return ordinaryOutcome();
  if (resources.length > 0) return resourceOutcome(resources);
  if (kind === "choice" || kind.includes("choice")) return routeChoiceOutcome();
  if (kind === "display" || kind.includes("gallery")) {
    return frozenOutcome({
      category: "collection-display",
      tone: "display",
      icon: "🖼",
      trigger: "final-landing",
      badgeLabel: "展示反馈",
      shortLabel: "不加资源",
      detail: "最终停在这里时显示一次反馈；不会增加资源或改变路线。",
    });
  }
  return passiveClueOutcome();
}

/**
 * Derives truthful, player-facing node semantics from registered reward data.
 * This is presentation-only: it never mutates rules, topology, or runtime state.
 */
export function nodeOutcomePresentation({
  nodeId = "",
  rewardRef = "",
  definition = null,
  profile = null,
  fairyHere = false,
} = {}) {
  const normalizedNodeId = String(nodeId || "").trim();
  const normalizedRewardRef = String(
    rewardRef || definition?.id || "",
  ).trim();
  const worldOne = worldOneOutcome({
    nodeId: normalizedNodeId,
    rewardRef: normalizedRewardRef,
    definition,
    fairyHere: fairyHere === true,
  });
  if (worldOne) return worldOne;

  const worldTwo = worldTwoOutcome({
    rewardRef: normalizedRewardRef,
    profile,
  });
  if (worldTwo) return worldTwo;

  return genericOutcome({ definition, profile });
}
