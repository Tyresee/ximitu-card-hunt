export const HARBOR_MAP_STATE_SCHEMA_VERSION = "harbor-map-state.v1";
export const MAX_PROCESSED_HARBOR_SETTLEMENTS = 64;
export const CURRENT_HARBOR_BOARD_REF = "ximitu-card-hunt-board.v1@2.3.0";

const HARBOR_BOARD_REFS = new Set([
  "ximitu-card-hunt-board.v1@2.0.0",
  "ximitu-card-hunt-board.v1@2.1.0",
  "ximitu-card-hunt-board.v1@2.2.0",
  "ximitu-card-hunt-board.v1@2.2.1",
  CURRENT_HARBOR_BOARD_REF,
]);

export function isCurrentHarborBoardRef(boardTemplateRef) {
  return boardTemplateRef === CURRENT_HARBOR_BOARD_REF;
}

const HARBOR_NODE_IDS = Object.freeze({
  foghorn: "n05b",
  signalCannon: "n06a",
  signalCannonTarget: "n09",
  cloudfallGate: "n12b",
  departureFrom: "n18",
  departureTo: "n19",
});

const HARBOR_EFFECT_REFS = Object.freeze({
  foghorn: "harbor.foghorn.v1",
  signalCannon: "harbor.signal-cannon.v1",
  cloudfallGate: "harbor.cloudfall-gate.v1",
  departureBeacon: "harbor.departure-beacon.v1",
});

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return Object.freeze(value);
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${label} must be a non-empty string`);
  return normalized;
}

function normalizedBooleanMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, enabled]) => [String(key).trim(), enabled === true])
      .filter(([key, enabled]) => key && enabled),
  );
}

function normalizedProcessedIds(value) {
  if (!Array.isArray(value)) return [];
  const uniqueNewestFirst = [];
  const seen = new Set();
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const id = String(value[index] ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueNewestFirst.push(id);
    if (uniqueNewestFirst.length >= MAX_PROCESSED_HARBOR_SETTLEMENTS) break;
  }
  return uniqueNewestFirst.reverse();
}

function normalizedTurn(value) {
  const turn = Number(value ?? 0);
  if (!Number.isSafeInteger(turn) || turn < 0) {
    throw new TypeError("effectiveTurn must be a non-negative safe integer");
  }
  return turn;
}

function normalizedSeatCount(value) {
  const count = Number(value ?? 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) {
    throw new RangeError("activeSeatCount must be an integer from 1 to 8");
  }
  return count;
}

function normalizedRoute(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("plannedRouteNodeIds must be an array");
  }
  return value.map((nodeId, routeIndex) => (
    nonEmptyString(nodeId, `plannedRouteNodeIds[${routeIndex}]`)
  ));
}

function normalizedEdgeRoute(value, expectedLength) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new TypeError("plannedRouteEdgeIds must be an array");
  }
  if (value.length !== expectedLength) {
    throw new RangeError("plannedRouteEdgeIds must align 1:1 with plannedRouteNodeIds");
  }
  return value.map((edgeId, routeIndex) => (
    nonEmptyString(edgeId, `plannedRouteEdgeIds[${routeIndex}]`)
  ));
}

/**
 * Creates a canonical, JSON-safe Zone 01 map state.
 *
 * Boolean seat maps are sparse: an absent key means false. Contradictory
 * legacy snapshots are repaired conservatively: holding an anchor implies it
 * was granted. Retired anchor fields remain readable historical data, including
 * after a seat exits; they no longer grant, consume, or change movement.
 */
export function createHarborMapState(initial = {}) {
  const anchorGrantedBySeat = normalizedBooleanMap(initial.anchorGrantedBySeat);
  const anchorHeldBySeat = normalizedBooleanMap(initial.anchorHeldBySeat);
  const regionExitSeenBySeat = normalizedBooleanMap(initial.regionExitSeenBySeat);

  for (const seatId of Object.keys(anchorHeldBySeat)) {
    anchorGrantedBySeat[seatId] = true;
  }
  const foghornHoldThroughTurn = Number(initial.foghornHoldThroughTurn ?? 0);
  if (
    !Number.isSafeInteger(foghornHoldThroughTurn)
    || foghornHoldThroughTurn < 0
  ) {
    throw new TypeError(
      "foghornHoldThroughTurn must be a non-negative safe integer",
    );
  }

  const state = {
    schemaVersion: HARBOR_MAP_STATE_SCHEMA_VERSION,
    anchorGrantedBySeat,
    anchorHeldBySeat,
    cloudReefCleared: initial.cloudReefCleared === true,
    cloudRouteOpen: initial.cloudRouteOpen === true,
    departureBeaconLit: (
      initial.departureBeaconLit === true
      || Object.keys(regionExitSeenBySeat).length > 0
    ),
    regionExitSeenBySeat,
    foghornTriggered: (
      initial.foghornTriggered === true
      || foghornHoldThroughTurn > 0
    ),
    foghornHoldThroughTurn,
    processedSettlementIds: normalizedProcessedIds(
      initial.processedSettlementIds,
    ),
  };
  return deepFreeze(state);
}

/**
 * Compatibility export for callers and saved plans from before 2026-09-22.
 * Mooring was retired by the user: no route offers an early stopping choice.
 */
export function legalMooringStops() {
  return deepFreeze([]);
}

function boundaryRouteIndex(startNodeId, routeNodeIds) {
  let previousNodeId = startNodeId;
  for (let routeIndex = 0; routeIndex < routeNodeIds.length; routeIndex += 1) {
    const nodeId = routeNodeIds[routeIndex];
    if (
      previousNodeId === HARBOR_NODE_IDS.departureFrom
      && nodeId === HARBOR_NODE_IDS.departureTo
    ) {
      return routeIndex;
    }
    previousNodeId = nodeId;
  }
  return -1;
}

/**
 * Deterministically settles Zone 01 map items for one already-scored turn.
 *
 * Unknown fields (including LearningPack, task, transcript, and score data)
 * are deliberately ignored. Legacy mooring selections are also ignored, so the
 * complete planned walking route is preserved. Signal-cannon transport is described separately so
 * presenters can animate n06a -> n08 -> n09 without pretending those are
 * additional dice steps.
 */
export function settleHarborTurn({
  mapState,
  settlementId,
  seatId,
  activeSeatCount = 1,
  effectiveTurn = 0,
  startNodeId,
  plannedRouteNodeIds,
  plannedRouteEdgeIds,
  boardNodes = [],
  boardTemplateRef = null,
  fairyActive = false,
} = {}) {
  if (boardTemplateRef !== null && !HARBOR_BOARD_REFS.has(boardTemplateRef)) {
    throw new TypeError("unsupported harbor boardTemplateRef");
  }
  const currentBoard = isCurrentHarborBoardRef(boardTemplateRef);
  const current = createHarborMapState(mapState);
  const stableSettlementId = nonEmptyString(settlementId, "settlementId");
  const actorSeatId = nonEmptyString(seatId, "seatId");
  const start = nonEmptyString(startNodeId, "startNodeId");
  const plannedRoute = normalizedRoute(plannedRouteNodeIds);
  const plannedEdges = normalizedEdgeRoute(
    plannedRouteEdgeIds,
    plannedRoute.length,
  );
  const seatCount = normalizedSeatCount(activeSeatCount);
  const turn = normalizedTurn(effectiveTurn);

  if (current.processedSettlementIds.includes(stableSettlementId)) {
    return deepFreeze({
      mapState: current,
      duplicate: true,
      plannedRouteNodeIds: [...plannedRoute],
      plannedRouteEdgeIds: plannedEdges ? [...plannedEdges] : null,
      committedRouteNodeIds: null,
      committedRouteEdgeIds: null,
      landingNodeId: null,
      settledNodeId: null,
      transport: null,
      legalMooringStops: [],
      mooringOutcome: "duplicate",
      events: [],
    });
  }

  const next = {
    ...current,
    anchorGrantedBySeat: { ...current.anchorGrantedBySeat },
    anchorHeldBySeat: { ...current.anchorHeldBySeat },
    regionExitSeenBySeat: { ...current.regionExitSeenBySeat },
    processedSettlementIds: [...current.processedSettlementIds],
  };
  const events = [];
  const emit = (type, detail = {}) => {
    events.push({
      type,
      eventId: `${stableSettlementId}:${type}`,
      settlementId: stableSettlementId,
      seatId: actorSeatId,
      ...detail,
    });
  };

  const committedRouteNodeIds = [...plannedRoute];
  const committedRouteEdgeIds = plannedEdges ? [...plannedEdges] : null;

  const landingRouteIndex = committedRouteNodeIds.length - 1;
  const landingNodeId = committedRouteNodeIds.at(-1) || start;
  let settledNodeId = landingNodeId;
  let transport = null;

  // Board 2.3.0 has no map machinery: n05b, n06a and n12b are plain landings.
  if (!currentBoard && landingNodeId === HARBOR_NODE_IDS.foghorn) {
    const firstTime = next.foghornTriggered !== true;
    const previousHoldThroughTurn = next.foghornHoldThroughTurn;
    next.foghornTriggered = true;
    if (fairyActive === true) {
      next.foghornHoldThroughTurn = Math.max(
        previousHoldThroughTurn,
        turn + seatCount,
      );
    }
    emit("harbor_foghorn", {
      effectRef: HARBOR_EFFECT_REFS.foghorn,
      firstTime,
      routeIndex: landingRouteIndex,
      nodeId: landingNodeId,
      targetMode: fairyActive === true ? "fairy_hold" : "reveal",
      activeSeatCount: seatCount,
      previousHoldThroughTurn,
      holdThroughTurn: next.foghornHoldThroughTurn,
      animationVariant: firstTime ? "full" : "short",
    });
  } else if (!currentBoard && landingNodeId === HARBOR_NODE_IDS.signalCannon) {
    const firstTime = next.cloudReefCleared !== true;
    const authoredCannon = boardNodes.find(
      (node) => node?.id === HARBOR_NODE_IDS.signalCannon,
    );
    const authoredTargetId = String(
      authoredCannon?.transportTargetId || HARBOR_NODE_IDS.signalCannonTarget,
    ).trim();
    const authoredCaptureNodeIds = Array.isArray(
      authoredCannon?.transportCaptureNodeIds,
    )
      ? authoredCannon.transportCaptureNodeIds
        .map((nodeId) => String(nodeId ?? "").trim())
        .filter(Boolean)
      : ["n08"];
    next.cloudReefCleared = true;
    transport = {
      effectRef: HARBOR_EFFECT_REFS.signalCannon,
      fromNodeId: HARBOR_NODE_IDS.signalCannon,
      throughNodeIds: authoredCaptureNodeIds,
      toNodeId: authoredTargetId,
      extraSpaces: 3,
      coldLanding: true,
    };
    settledNodeId = authoredTargetId;
    emit("signal_cannon", {
      ...transport,
      firstTime,
      routeIndex: landingRouteIndex,
      nodeId: landingNodeId,
      animationVariant: firstTime ? "full" : "short",
    });
  } else if (!currentBoard && landingNodeId === HARBOR_NODE_IDS.cloudfallGate) {
    const firstTime = next.cloudRouteOpen !== true;
    next.cloudRouteOpen = true;
    emit("cloudfall_gate", {
      effectRef: HARBOR_EFFECT_REFS.cloudfallGate,
      firstTime,
      routeIndex: landingRouteIndex,
      nodeId: landingNodeId,
      shortcutEdgeId: "e14c",
      shortcutFromNodeId: "n14",
      shortcutToNodeId: "n17",
      animationVariant: firstTime ? "full" : "short",
    });
  }

  const exitRouteIndex = committedRouteEdgeIds
    ? committedRouteEdgeIds.indexOf("e18")
    : boundaryRouteIndex(start, committedRouteNodeIds);
  if (exitRouteIndex >= 0) {
    if (next.regionExitSeenBySeat[actorSeatId] !== true) {
      const firstTime = next.departureBeaconLit !== true;
      next.departureBeaconLit = true;
      next.regionExitSeenBySeat[actorSeatId] = true;
      emit("departure_beacon", {
        effectRef: HARBOR_EFFECT_REFS.departureBeacon,
        firstTime,
        seatFirstTime: true,
        routeIndex: exitRouteIndex,
        fromNodeId: HARBOR_NODE_IDS.departureFrom,
        toNodeId: HARBOR_NODE_IDS.departureTo,
        animationVariant: firstTime ? "full" : "short",
      });
    }
  }

  next.processedSettlementIds.push(stableSettlementId);
  const normalizedNext = createHarborMapState(next);
  return deepFreeze({
    mapState: normalizedNext,
    duplicate: false,
    plannedRouteNodeIds: [...plannedRoute],
    plannedRouteEdgeIds: plannedEdges ? [...plannedEdges] : null,
    committedRouteNodeIds,
    committedRouteEdgeIds,
    landingNodeId,
    settledNodeId,
    transport,
    legalMooringStops: [],
    mooringOutcome: "retired",
    events,
  });
}
