import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PREVIOUS_BOARD_TEMPLATE_V21 as BOARD_TEMPLATE, BOARD_TEMPLATE as CRYSTAL_BOARD_TEMPLATE } from "../public/prototypes/universal-board/packs.js";
import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  BOARD_LAYOUT_DRAFT_SCHEMA_VERSION,
  BOARD_LAYOUT_EXPORT_SCHEMA_VERSION,
  applyBoardLayoutDraft,
  baseZoneForNode,
  boardLayoutExport,
  boardLayoutRef,
  boardLayoutSignature,
  clampNodeLayoutPosition,
  createBoardLayoutDraft,
  normalizeBoardLayoutDraft,
  rebaseAbsoluteBoardPath,
  updateBoardLayoutDraft,
} from "../public/prototypes/universal-board/board-layout-editor-core.js";

const WORLD_ONE_REF = "world.ximitu.cloud-harbor@1.1.0";
const WORLD_TWO_REF = "world.ximitu.beyond-cloud@1.0.0";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function pathEndpoint(pathData, atStart = false) {
  const numbers = [...String(pathData).matchAll(/[-+]?(?:\d*\.\d+|\d+\.?)/g)]
    .map((match) => Number(match[0]));
  return atStart
    ? { x: numbers[0], y: numbers[1] }
    : { x: numbers.at(-2), y: numbers.at(-1) };
}

test("layout drafts are version-bound visual overrides with no initial changes", () => {
  const draft = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  assert.deepEqual(draft, {
    schemaVersion: BOARD_LAYOUT_DRAFT_SCHEMA_VERSION,
    worldRef: WORLD_ONE_REF,
    boardRef: boardLayoutRef(BOARD_TEMPLATE),
    baseSignature: boardLayoutSignature(BOARD_TEMPLATE),
    nodePositions: {},
  });
  assert.equal(normalizeBoardLayoutDraft(
    BOARD_TEMPLATE,
    draft,
    { worldRef: WORLD_ONE_REF },
  )?.boardRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.equal(normalizeBoardLayoutDraft(
    BOARD_TEMPLATE,
    { ...draft, baseSignature: "stale" },
    { worldRef: WORLD_ONE_REF },
  ), null);
  assert.equal(normalizeBoardLayoutDraft(
    BOARD_TEMPLATE,
    draft,
    { worldRef: WORLD_TWO_REF },
  ), null);
});

test("node movement stays inside the node's original art zone and supports grid snapping", () => {
  assert.equal(baseZoneForNode(BOARD_TEMPLATE, "n18")?.id, "zone-01");
  assert.deepEqual(
    clampNodeLayoutPosition(BOARD_TEMPLATE, "n18", { x: 9999, y: -4 }),
    { x: 1199, y: 0, zoneId: "zone-01" },
  );
  assert.deepEqual(
    clampNodeLayoutPosition(BOARD_TEMPLATE, "n18", { x: 1142, y: 233 }, { grid: 10 }),
    { x: 1140, y: 230, zoneId: "zone-01" },
  );
  assert.equal(baseZoneForNode(BOARD_TEMPLATE, "n49")?.id, "zone-04");
  assert.deepEqual(
    clampNodeLayoutPosition(BOARD_TEMPLATE, "n49", { x: -30, y: 3000 }),
    { x: 0, y: 1119, zoneId: "zone-04" },
  );
});

test("updating a draft removes an override when a node returns to its base position", () => {
  const base = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  const moved = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    base,
    "n03",
    { x: 251, y: 497 },
    { worldRef: WORLD_ONE_REF },
  );
  assert.deepEqual(moved.nodePositions.n03, { x: 251, y: 497 });
  const restored = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    moved,
    "n03",
    { x: 240, y: 490 },
    { worldRef: WORLD_ONE_REF },
  );
  assert.deepEqual(restored.nodePositions, {});
});

test("absolute board paths keep their curve while start and end anchors move", () => {
  const source = "M 10 20 C 20 10 30 10 40 20 C 50 30 60 30 70 20";
  const rebased = rebaseAbsoluteBoardPath(
    source,
    { x: 12, y: -4 },
    { x: -7, y: 9 },
  );
  assert.deepEqual(pathEndpoint(rebased, true), { x: 22, y: 16 });
  assert.deepEqual(pathEndpoint(rebased), { x: 63, y: 29 });
  assert.match(rebased, /^M 22 16 C /);
  assert.notEqual(rebased, source);
  assert.equal(rebaseAbsoluteBoardPath(
    source,
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ), source);

  const quadratic = rebaseAbsoluteBoardPath(
    "M 10 20 Q 40 0 70 20",
    { x: 6, y: -3 },
    { x: -4, y: 8 },
  );
  assert.deepEqual(pathEndpoint(quadratic, true), { x: 16, y: 17 });
  assert.deepEqual(pathEndpoint(quadratic), { x: 66, y: 28 });
  assert.match(quadratic, /^M 16 17 Q /);
});

test("a visual draft moves nodes and every adjacent explicit route endpoint without mutating source", () => {
  const sourceHash = sha256(BOARD_TEMPLATE);
  const base = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  const draft = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    base,
    "n14",
    { x: 1060, y: 300 },
    { worldRef: WORLD_ONE_REF },
  );
  const preview = applyBoardLayoutDraft(
    BOARD_TEMPLATE,
    draft,
    { worldRef: WORLD_ONE_REF },
  );
  const node = preview.nodes.find(({ id }) => id === "n14");
  const outgoing = preview.edges.find(({ id }) => id === "e14c");
  assert.deepEqual({ x: node.x, y: node.y }, { x: 1060, y: 300 });
  assert.deepEqual(pathEndpoint(outgoing.pathData, true), { x: 1060, y: 300 });
  assert.deepEqual(pathEndpoint(outgoing.pathData), { x: 1070, y: 145 });
  assert.equal(sha256(BOARD_TEMPLATE), sourceHash);
  assert.equal(BOARD_TEMPLATE.nodes.find(({ id }) => id === "n14").x, 1045);
});

test("World 02 straight authored paths are reanchored from the same node override", () => {
  const firstEdge = EXPANSION_WORLD_BOARD_TEMPLATE.edges[0];
  const movedNodeId = firstEdge.to;
  const baseNode = EXPANSION_WORLD_BOARD_TEMPLATE.nodes
    .find(({ id }) => id === movedNodeId);
  const base = createBoardLayoutDraft(
    EXPANSION_WORLD_BOARD_TEMPLATE,
    { worldRef: WORLD_TWO_REF },
  );
  const draft = updateBoardLayoutDraft(
    EXPANSION_WORLD_BOARD_TEMPLATE,
    base,
    movedNodeId,
    { x: baseNode.x + 9, y: baseNode.y + 6 },
    { worldRef: WORLD_TWO_REF },
  );
  const preview = applyBoardLayoutDraft(
    EXPANSION_WORLD_BOARD_TEMPLATE,
    draft,
    { worldRef: WORLD_TWO_REF },
  );
  const previewEdge = preview.edges.find(({ id }) => id === firstEdge.id);
  assert.deepEqual(pathEndpoint(previewEdge.pathData), {
    x: baseNode.x + 9,
    y: baseNode.y + 6,
  });
});

test("export contains exact node patches and derived authored edge patches", () => {
  let draft = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  draft = updateBoardLayoutDraft(
    BOARD_TEMPLATE,
    draft,
    "n17",
    { x: 1080, y: 150 },
    { worldRef: WORLD_ONE_REF },
  );
  const exported = boardLayoutExport(
    BOARD_TEMPLATE,
    draft,
    { worldRef: WORLD_ONE_REF },
  );
  assert.equal(exported.schemaVersion, BOARD_LAYOUT_EXPORT_SCHEMA_VERSION);
  assert.equal(exported.boardRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.deepEqual(exported.nodePatches, [{
    id: "n17",
    zoneId: "zone-01",
    from: { x: 1070, y: 145 },
    to: { x: 1080, y: 150 },
  }]);
  assert.deepEqual(
    exported.edgePatches.map(({ id }) => id).sort(),
    ["e14c", "e17"],
  );
  exported.edgePatches.forEach((edge) => {
    assert.notEqual(edge.toPathData, edge.fromPathData);
  });
  assert.deepEqual(exported.layoutContractRefs, [
    "board.ximitu-card-hunt.zone-01-layout.v4",
    "board.ximitu-card-hunt.zone-02-layout.v2",
    "board.ximitu-card-hunt.zone-03-layout.v1",
    "board.ximitu-card-hunt.zone-04-layout.v1",
  ]);
});

test("normalization rejects unknown, non-finite, fractional, or cross-zone coordinates", () => {
  const base = createBoardLayoutDraft(BOARD_TEMPLATE, { worldRef: WORLD_ONE_REF });
  for (const nodePositions of [
    { unknown: { x: 1, y: 1 } },
    { n03: { x: Number.NaN, y: 490 } },
    { n03: { x: 240.5, y: 490 } },
    { n18: { x: 1200, y: 170 } },
  ]) {
    assert.equal(normalizeBoardLayoutDraft(
      BOARD_TEMPLATE,
      { ...base, nodePositions },
      { worldRef: WORLD_ONE_REF },
    ), null);
  }
});


test("crystal node overrides reanchor every adjacent explicit edge and revert to the new base", () => {
  const board = CRYSTAL_BOARD_TEMPLATE;
  const worldRef = "world.ximitu.cloud-harbor@1.2.1";
  const sourceHash = sha256(board);
  for (const baseNode of board.nodes) {
    const base = createBoardLayoutDraft(board, { worldRef });
    const moved = { x: baseNode.x + 1, y: baseNode.y + 1 };
    const draft = updateBoardLayoutDraft(board, base, baseNode.id, moved, { worldRef });
    const preview = applyBoardLayoutDraft(board, draft, { worldRef });
    for (const edge of preview.edges) {
      if (edge.from === baseNode.id) assert.deepEqual(pathEndpoint(edge.pathData, true), moved);
      if (edge.to === baseNode.id) assert.deepEqual(pathEndpoint(edge.pathData), moved);
    }
    const exported = boardLayoutExport(board, draft, { worldRef });
    assert.deepEqual(exported.edgePatches.map(({ id }) => id).sort(), board.edges
      .filter(({ from, to }) => from === baseNode.id || to === baseNode.id)
      .map(({ id }) => id).sort());
    assert.deepEqual(updateBoardLayoutDraft(board, draft, baseNode.id, baseNode, { worldRef }).nodePositions, {});
  }
  assert.equal(sha256(board), sourceHash);
});
