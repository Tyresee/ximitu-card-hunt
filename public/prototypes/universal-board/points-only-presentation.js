// Display adapters only. Wallet amounts come from server receipts, never local assets.
const MAP_MECHANICS = new Set([
  "route-choice", "transport", "map-effect", "region-transition", "world-transition",
]);

export function homePointsSummary(localSession, serverSession, studentId) {
  const registered = localSession?.landingPoints?.kind === "final-landing-v1"
    && Boolean(serverSession?.studentIds?.includes(studentId));
  const seat = localSession?.seats?.find((entry) => entry.id === studentId);
  const actions = Math.max(0, Number(seat?.opportunityCount) || 0);
  if (!registered) return { registered: false, earned: null, actions };
  const earned = Object.values(serverSession.turns || {}).reduce((sum, turn) => {
    const landing = turn?.receipt?.landing;
    return turn?.studentId === studentId && turn.status === "awarded"
      && landing?.studentId === studentId && landing.turnId === turn.attemptId
      && Number.isSafeInteger(landing.amount) && landing.amount >= 0
      && landing.amount === turn.points
      ? sum + landing.amount : sum;
  }, 0);
  // Special-cell bonuses and 全班小红包 count only once the platform receipt confirms them.
  const bonus = Object.values(serverSession.specialCells?.bonusAwards || {}).reduce((sum, award) => (
    award?.status === "awarded" && award.studentId === studentId
      && award.receipt?.bonus?.studentId === studentId
      && Number.isSafeInteger(award.amount) && award.amount > 0
      && award.receipt.bonus.amount === award.amount
      ? sum + award.amount : sum), 0);
  const seen = new Set(Object.values(serverSession.turns || {}).map((turn) => turn.attemptId));
  const group = Object.values(serverSession.specialCells?.groupMoves || {}).reduce((sum, move) => {
    if (move?.status !== "confirmed" || move.rewardPolicy !== "group-final-landing-v1") return sum;
    for (const award of move.awards || []) {
      const landing = award?.receipt?.landing;
      if (award?.status !== "awarded" || award.studentId !== studentId || seen.has(award.attemptId)
        || landing?.studentId !== studentId || landing.turnId !== award.attemptId
        || !Number.isSafeInteger(award.points) || award.points <= 0 || landing.amount !== award.points) continue;
      seen.add(award.attemptId);
      sum += award.points;
    }
    return sum;
  }, 0);
  return { registered: true, earned: earned + bonus + group, actions };
}

export function pointsOnlyNodeOutcome(outcome = {}) {
  if (MAP_MECHANICS.has(outcome?.category)) return Object.freeze({
    ...outcome,
    hasDirectReward: false,
    detail: String(outcome.detail || "").replace(/；不会增加资源[。；]?/g, "。"),
  });
  return Object.freeze({
    category: "ordinary", tone: "neutral", icon: "○", trigger: "final-landing",
    badgeLabel: "停靠格", shortLabel: "最终停格查看积分",
    detail: "经过不领取。完成本轮全部移动后，只按最终停格的已登记规则领取家园积分。",
    hasDirectReward: false,
  });
}

export function pointsOnlyNodeKind(outcome, fallback = "learning") {
  const kinds = {
    "route-choice": "junction", transport: "transport", "map-effect": "event",
    "region-transition": "transport", "world-transition": "portal",
  };
  if (!MAP_MECHANICS.has(outcome?.category)) return "learning";
  if (outcome.category === "map-effect" && ["foghorn", "cloud-gate"].includes(fallback)) return fallback;
  return kinds[outcome.category];
}

export function neutralMapLabel(label = "云路停靠点") {
  return String(label)
    .replace(/金币兑换站|星星工坊|兑换工坊/g, "云路观景台")
    .replace(/首枚云币/g, "航标")
    .replace(/金币|云币|纪念币|旗币|铆钉币|泡泡币|钥匙|卡匣|卡片|神秘卡/g, "光纹")
    .replace(/兑换/g, "观景");
}

export function pointsOnlyNodePresentation(presentation = {}, outcome = {}) {
  const label = neutralMapLabel(presentation.label);
  if (MAP_MECHANICS.has(outcome.category)) return { ...presentation, label };
  return {
    ...presentation, label, badge: "停靠格", visualKind: "neutral-landing-tile",
    teaser: "沿着云路前进；只领取本轮最终停格的家园积分。",
    firstCopy: "本轮已停稳；家园积分以服务器到账回执为准。",
    repeatCopy: "本轮已停稳；家园积分以服务器到账回执为准。",
  };
}
