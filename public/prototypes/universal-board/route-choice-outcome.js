import { settleHarborTurn } from "./harbor-items-core.js";
import { isCloudHarborWorldRef } from "./world-packs.js";
import { landingNodePoints } from "./landing-points-game.js";
import { specialCellAt, SPECIAL_CELL_TYPE_BY_ID } from "./special-cells-core.js";

// Presentation policy only. A match selects an explicit legal edge; the server
// still plans the complete move and independently determines every reward.
export function routeChoiceOutcome({
  route, composition, mapState, rule, specialCells = null,
  seatId, activeSeatCount, effectiveTurn, fairyActive = false,
}) {
  if (!route || !composition || !isCloudHarborWorldRef(composition.worldRef)) return null;
  try {
    const harbor = settleHarborTurn({
      mapState, settlementId: "route-equivalence-preview", seatId,
      activeSeatCount, effectiveTurn, fairyActive,
      startNodeId: route.startNodeId || route.junctionNodeId,
      plannedRouteNodeIds: route.routeNodeIds,
      plannedRouteEdgeIds: route.edgeIds,
      boardNodes: composition.board.nodes,
      boardTemplateRef: `${composition.board.id}@${composition.board.version}`,
    });
    if (harbor.duplicate) return null;
    const shared = {
      worldRef: composition.worldRef,
      mapState: harbor.mapState,
      transport: harbor.transport,
      events: harbor.events.map(({ eventId, settlementId, routeIndex, ...effect }) => effect),
    };
    // Both routes reach the same exit with equal unused steps. The common
    // continuation is handled by the normal world/circuit planner afterward.
    if (route.boundary === "exit") return {
      ...shared, boundary: "exit", nodeId: route.destinationNodeId,
      remainingSteps: route.remainingSteps,
    };
    if (route.boundary !== "landing" || route.remainingSteps !== 0) return null;
    const nodeId = harbor.settledNodeId;
    const points = landingNodePoints(rule, composition.worldRef, nodeId);
    if (points === null) return null;
    const cell = specialCellAt(specialCells, composition.worldRef, nodeId);
    if (cell && !SPECIAL_CELL_TYPE_BY_ID[cell.type]) return null;
    return {
      ...shared, boundary: "landing", nodeId, points,
      specialType: cell?.type || null,
      completesLap: composition.board.exits.some((exit) => exit.nodeId === nodeId),
    };
  } catch {
    // Unknown snapshots/effects retain the existing explicit route choice.
    return null;
  }
}
