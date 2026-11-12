export const BOARD_LAYOUT_DRAFT_SCHEMA_VERSION = "board-layout-draft.v1";
export const BOARD_LAYOUT_EXPORT_SCHEMA_VERSION = "board-layout-export.v1";

const SVG_PATH_ARITY = Object.freeze({ M: 2, L: 2, Q: 4, C: 6 });
const NUMBER_TOKEN = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?$/i;

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function canonicalBoardLayoutPayload(board) {
  return {
    id: board?.id,
    version: board?.version,
    viewBox: board?.viewBox,
    worldSize: board?.worldSize,
    zones: (board?.zones || []).map(({ id, bounds }) => ({ id, bounds })),
    artRegions: (board?.artRegions || []).map((region) => ({
      id: region.id,
      zoneId: region.zoneId,
      layoutContractRef: region.layoutContractRef,
      artBox: region.artBox,
      clipPath: region.clipPath,
    })),
    nodes: (board?.nodes || []).map(({ id, x, y, spaceRole }) => ({
      id,
      x,
      y,
      spaceRole,
    })),
    edges: (board?.edges || []).map(({ id, from, to, pathData }) => ({
      id,
      from,
      to,
      pathData: pathData || null,
    })),
  };
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function boardLayoutRef(board) {
  return `${String(board?.id || "")}@${String(board?.version || "")}`;
}

export function boardLayoutSignature(board) {
  return fnv1a64(JSON.stringify(canonicalBoardLayoutPayload(board)));
}

export function baseZoneForNode(board, nodeId) {
  const node = (board?.nodes || []).find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  return (board?.zones || []).find(({ bounds }) => (
    node.x >= bounds.x
    && node.x < bounds.x + bounds.width
    && node.y >= bounds.y
    && node.y < bounds.y + bounds.height
  )) || null;
}

export function clampNodeLayoutPosition(board, nodeId, position, { grid = 1 } = {}) {
  const node = (board?.nodes || []).find((candidate) => candidate.id === nodeId);
  const zone = baseZoneForNode(board, nodeId);
  const rawX = finiteCoordinate(position?.x);
  const rawY = finiteCoordinate(position?.y);
  if (!node || !zone || rawX === null || rawY === null) return null;

  const step = Math.max(1, Math.round(Number(grid) || 1));
  const snappedX = Math.round(rawX / step) * step;
  const snappedY = Math.round(rawY / step) * step;
  const maxX = zone.bounds.x + zone.bounds.width - 1;
  const maxY = zone.bounds.y + zone.bounds.height - 1;
  return Object.freeze({
    x: Math.max(zone.bounds.x, Math.min(maxX, snappedX)),
    y: Math.max(zone.bounds.y, Math.min(maxY, snappedY)),
    zoneId: zone.id,
  });
}

export function createBoardLayoutDraft(board, { worldRef = "" } = {}) {
  return {
    schemaVersion: BOARD_LAYOUT_DRAFT_SCHEMA_VERSION,
    worldRef: String(worldRef),
    boardRef: boardLayoutRef(board),
    baseSignature: boardLayoutSignature(board),
    nodePositions: {},
  };
}

export function normalizeBoardLayoutDraft(board, input, { worldRef = "" } = {}) {
  if (
    !input
    || input.schemaVersion !== BOARD_LAYOUT_DRAFT_SCHEMA_VERSION
    || input.boardRef !== boardLayoutRef(board)
    || input.baseSignature !== boardLayoutSignature(board)
    || String(input.worldRef || "") !== String(worldRef)
    || !input.nodePositions
    || typeof input.nodePositions !== "object"
    || Array.isArray(input.nodePositions)
  ) {
    return null;
  }

  const baseNodes = new Map((board?.nodes || []).map((node) => [node.id, node]));
  const nodePositions = {};
  for (const [nodeId, value] of Object.entries(input.nodePositions)) {
    const base = baseNodes.get(nodeId);
    const clamped = clampNodeLayoutPosition(board, nodeId, value);
    if (
      !base
      || !clamped
      || finiteCoordinate(value?.x) !== clamped.x
      || finiteCoordinate(value?.y) !== clamped.y
    ) {
      return null;
    }
    if (clamped.x !== base.x || clamped.y !== base.y) {
      nodePositions[nodeId] = { x: clamped.x, y: clamped.y };
    }
  }

  return {
    schemaVersion: BOARD_LAYOUT_DRAFT_SCHEMA_VERSION,
    worldRef: String(worldRef),
    boardRef: boardLayoutRef(board),
    baseSignature: boardLayoutSignature(board),
    nodePositions,
  };
}

export function updateBoardLayoutDraft(
  board,
  draft,
  nodeId,
  position,
  { worldRef = draft?.worldRef || "", grid = 1 } = {},
) {
  const normalized = normalizeBoardLayoutDraft(board, draft, { worldRef })
    || createBoardLayoutDraft(board, { worldRef });
  const base = (board?.nodes || []).find((node) => node.id === nodeId);
  const clamped = clampNodeLayoutPosition(board, nodeId, position, { grid });
  if (!base || !clamped) return normalized;

  const nodePositions = { ...normalized.nodePositions };
  if (clamped.x === base.x && clamped.y === base.y) {
    delete nodePositions[nodeId];
  } else {
    nodePositions[nodeId] = { x: clamped.x, y: clamped.y };
  }
  return { ...normalized, nodePositions };
}

function interpolateDelta(fromDelta, toDelta, progress) {
  return {
    x: fromDelta.x + ((toDelta.x - fromDelta.x) * progress),
    y: fromDelta.y + ((toDelta.y - fromDelta.y) * progress),
  };
}

function shiftedPair(values, offset, delta) {
  values[offset] = roundCoordinate(values[offset] + delta.x);
  values[offset + 1] = roundCoordinate(values[offset + 1] + delta.y);
}

function formatPathNumber(value) {
  const rounded = roundCoordinate(value);
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Reanchors the absolute M/L/Q/C paths used by the checked-in boards.
 * Endpoint movement is blended through intermediate controls so a curve keeps
 * its authored character instead of snapping to a new generic route.
 */
export function rebaseAbsoluteBoardPath(pathData, fromDelta, toDelta) {
  const source = String(pathData || "").trim();
  if (!source) return source;
  if (
    fromDelta.x === 0
    && fromDelta.y === 0
    && toDelta.x === 0
    && toDelta.y === 0
  ) {
    return source;
  }

  const tokens = source.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  const segments = [];
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index];
    const arity = SVG_PATH_ARITY[command];
    if (!arity || command !== command.toUpperCase()) return source;
    const values = tokens.slice(index + 1, index + 1 + arity);
    if (values.length !== arity || values.some((token) => !NUMBER_TOKEN.test(token))) {
      return source;
    }
    segments.push({ command, values: values.map(Number) });
    index += arity + 1;
  }
  if (!segments.length || segments[0].command !== "M") return source;

  const drawSegments = segments.slice(1);
  if (!drawSegments.length) return source;
  shiftedPair(segments[0].values, 0, fromDelta);
  drawSegments.forEach((segment, index) => {
    const startProgress = index / drawSegments.length;
    const endProgress = (index + 1) / drawSegments.length;
    if (segment.command === "L") {
      shiftedPair(
        segment.values,
        0,
        interpolateDelta(fromDelta, toDelta, endProgress),
      );
      return;
    }
    if (segment.command === "Q") {
      shiftedPair(
        segment.values,
        0,
        interpolateDelta(fromDelta, toDelta, (startProgress + endProgress) / 2),
      );
      shiftedPair(
        segment.values,
        2,
        interpolateDelta(fromDelta, toDelta, endProgress),
      );
      return;
    }
    if (segment.command === "C") {
      const span = endProgress - startProgress;
      shiftedPair(
        segment.values,
        0,
        interpolateDelta(fromDelta, toDelta, startProgress + (span / 3)),
      );
      shiftedPair(
        segment.values,
        2,
        interpolateDelta(fromDelta, toDelta, startProgress + ((span * 2) / 3)),
      );
      shiftedPair(
        segment.values,
        4,
        interpolateDelta(fromDelta, toDelta, endProgress),
      );
    }
  });

  return segments
    .map(({ command, values }) => `${command} ${values.map(formatPathNumber).join(" ")}`)
    .join(" ");
}

export function applyBoardLayoutDraft(board, input, { worldRef = "" } = {}) {
  const draft = normalizeBoardLayoutDraft(board, input, { worldRef })
    || createBoardLayoutDraft(board, { worldRef });
  const baseNodeById = new Map((board?.nodes || []).map((node) => [node.id, node]));
  const nodes = (board?.nodes || []).map((node) => {
    const override = draft.nodePositions[node.id];
    return override ? { ...node, x: override.x, y: override.y } : node;
  });
  const previewNodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = (board?.edges || []).map((edge) => {
    if (!edge.pathData) return edge;
    const baseFrom = baseNodeById.get(edge.from);
    const baseTo = baseNodeById.get(edge.to);
    const previewFrom = previewNodeById.get(edge.from);
    const previewTo = previewNodeById.get(edge.to);
    if (!baseFrom || !baseTo || !previewFrom || !previewTo) return edge;
    const fromDelta = {
      x: previewFrom.x - baseFrom.x,
      y: previewFrom.y - baseFrom.y,
    };
    const toDelta = {
      x: previewTo.x - baseTo.x,
      y: previewTo.y - baseTo.y,
    };
    const pathData = rebaseAbsoluteBoardPath(edge.pathData, fromDelta, toDelta);
    return pathData === edge.pathData ? edge : { ...edge, pathData };
  });
  return { ...board, nodes, edges };
}

export function boardLayoutExport(board, input, { worldRef = "" } = {}) {
  const draft = normalizeBoardLayoutDraft(board, input, { worldRef });
  if (!draft) return null;
  const preview = applyBoardLayoutDraft(board, draft, { worldRef });
  const previewEdgeById = new Map(preview.edges.map((edge) => [edge.id, edge]));
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]));
  const changedNodeIds = Object.keys(draft.nodePositions).sort();
  const changedNodeIdSet = new Set(changedNodeIds);
  const edgePatches = board.edges
    .filter((edge) => (
      edge.pathData
      && (changedNodeIdSet.has(edge.from) || changedNodeIdSet.has(edge.to))
    ))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromPathData: edge.pathData,
      toPathData: previewEdgeById.get(edge.id)?.pathData || edge.pathData,
    }));
  return {
    schemaVersion: BOARD_LAYOUT_EXPORT_SCHEMA_VERSION,
    worldRef: String(worldRef),
    boardRef: boardLayoutRef(board),
    baseSignature: boardLayoutSignature(board),
    coordinateSystem: "BoardTemplate world coordinates",
    layoutContractRefs: (board.artRegions || [])
      .map((region) => region.layoutContractRef)
      .filter(Boolean),
    nodePatches: changedNodeIds.map((nodeId) => {
      const base = nodeById.get(nodeId);
      const target = draft.nodePositions[nodeId];
      return {
        id: nodeId,
        zoneId: baseZoneForNode(board, nodeId)?.id || null,
        from: { x: base.x, y: base.y },
        to: { x: target.x, y: target.y },
      };
    }),
    edgePatches,
  };
}
