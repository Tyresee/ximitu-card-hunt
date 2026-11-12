import { landingPointsValueScale } from "./landing-points-values.js";
import { landingNodePoints } from "./landing-points-game.js";

// A transport source is not a payable final landing. Display the exact locked
// destination's amount without changing either the rule or the accepted move.
export function nodeLandingPointsPresentation({ rule, worldRef, node, board, label = "停靠格", targetLabel = "前方落点" }) {
  if (!node?.id) return null;
  const transported = node.spaceRole === "transport";
  const destinationId = transported ? node.transportTargetId : node.id;
  if (!destinationId || !board?.nodes?.some(({ id }) => id === destinationId)) return null;
  const amount = landingNodePoints(rule, worldRef, destinationId);
  if (amount === null) return null;
  return {
    amount, destinationId, transported, valueScale: landingPointsValueScale(rule.revision),
    badgeText: transported ? `到站 +${amount}` : `+${amount} 分`,
    ariaLabel: transported
      ? `${label}。自动前往${targetLabel}，到站停稳后可得 ${amount} 家园积分。入口格不单独领取积分，经过不触发。`
      : `${label}。最终停格可得 ${amount} 家园积分。经过不领取。`,
  };
}
