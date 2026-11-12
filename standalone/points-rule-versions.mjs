// Versions are a protocol boundary, not a request-controlled map selector.
// Existing sessions keep their complete rule/world snapshots across deployment.
import { FIVEFOLD_POINTS_RULE_VERSION } from '../public/prototypes/universal-board/landing-points-values.js';
export const CURRENT_POINTS_RULE_VERSION = FIVEFOLD_POINTS_RULE_VERSION;
const routes = new Map([
  ['monopoly-final-landing-v1', 'route.ximitu-main@1.2.1'],
  ['monopoly-final-landing-v2', 'route.ximitu-main@1.3.0'],
  [CURRENT_POINTS_RULE_VERSION, 'route.ximitu-main@1.3.0'],
]);

export function pointsRuleRouteRef(revision) {
  return routes.get(revision) || null;
}
