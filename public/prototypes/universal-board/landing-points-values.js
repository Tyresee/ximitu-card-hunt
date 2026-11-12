// Versioned base tile values. Existing session/receipt snapshots remain exact.
export const FIVEFOLD_POINTS_RULE_VERSION = "monopoly-final-landing-v3";
const LEGACY_RULES = new Set(["monopoly-final-landing-v1", "monopoly-final-landing-v2"]);
const BASE_VALUES = Object.freeze([100, 200, 300, 500, 1000]);

export function landingPointsValueScale(revision) {
  return revision === FIVEFOLD_POINTS_RULE_VERSION ? 5 : 1;
}

export function validLandingPointsValue(revision, amount) {
  if (revision !== FIVEFOLD_POINTS_RULE_VERSION && !LEGACY_RULES.has(revision)) return false;
  return Number.isSafeInteger(amount) && BASE_VALUES.includes(amount / landingPointsValueScale(revision));
}


// A value upgrade preserves every original board/level/node and scales exactly once.
export function isFivefoldRuleUpgrade(previous, next) {
  return previous && next && next.revision === FIVEFOLD_POINTS_RULE_VERSION
    && LEGACY_RULES.has(previous.revision) && next.baseRevision === previous.revision
    && next.kind === previous.kind && next.enabled === previous.enabled && next.currency === previous.currency
    && Array.isArray(previous.worlds) && next.worlds?.length === previous.worlds.length
    && previous.worlds.every((world, index) => {
      const upgraded = next.worlds[index];
      return upgraded?.worldRef === world.worldRef && upgraded.boardRef === world.boardRef && upgraded.levelRef === world.levelRef
        && upgraded.nodes?.length === world.nodes.length && world.nodes.every((node, i) =>
          upgraded.nodes[i]?.nodeId === node.nodeId && upgraded.nodes[i].points === node.points * 5);
    });
}
