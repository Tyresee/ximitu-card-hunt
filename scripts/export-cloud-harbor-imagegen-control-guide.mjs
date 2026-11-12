import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvedTransportPreviewPathData,
} from "../public/prototypes/universal-board/board-route-geometry.js";
import {
  cloudHarborGuideBoard,
} from "./export-cloud-harbor-layout-guides.mjs";
import {
  CRYSTAL_BOARD_TEMPLATE_V221,
  CRYSTAL_THEME_V221,
} from "../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = resolve(
  SCRIPT_DIRECTORY,
  "..",
  "art-source",
  "cloud-harbor",
  "crystal-v2",
  "world-01-imagegen-control-guide.svg",
);

const ZONE_COLORS = Object.freeze({
  "zone-01": Object.freeze({ shoulder: "#208f91", quiet: "#8fd9c8" }),
  "zone-02": Object.freeze({ shoulder: "#628d43", quiet: "#b8d98c" }),
  "zone-03": Object.freeze({ shoulder: "#744b91", quiet: "#c8a4d8" }),
  "zone-04": Object.freeze({ shoulder: "#424f95", quiet: "#969fda" }),
});

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableValue(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nodeClearanceRadius(node) {
  if (node.spaceRole === "transport") return 108;
  if (node.spaceRole === "map-effect" || node.spaceRole === "goal") return 86;
  if (node.spaceRole === "junction") return 78;
  return 58;
}

function baseEdgeAvailable(edge) {
  return !edge.availableWhen;
}

function edgeZoneId(edge, nodeById) {
  return nodeById.get(edge.from)?.zoneId || nodeById.get(edge.to)?.zoneId || "zone-01";
}

export function createCloudHarborImageGenProjection(
  board = cloudHarborGuideBoard(),
) {
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]));
  const roadEdges = board.edges.filter((edge) => (
    baseEdgeAvailable(edge) && edge.terrainType !== "cloud-stair"
  ));
  const cloudStairEdges = board.edges.filter(({ terrainType }) => (
    terrainType === "cloud-stair"
  ));
  const nodes = board.nodes.map((node) => Object.freeze({
    id: node.id,
    x: node.x,
    y: node.y,
    zoneId: node.zoneId,
    radius: nodeClearanceRadius(node),
  }));
  const transports = board.nodes
    .filter(({ transportTargetId }) => Boolean(transportTargetId))
    .map((node) => Object.freeze({
      nodeId: node.id,
      targetNodeId: node.transportTargetId,
      pathData: resolvedTransportPreviewPathData(node, nodeById),
    }));

  return Object.freeze({
    schemaVersion: "cloud-harbor-imagegen-control.v1",
    boardTemplateRef: `${board.id}@${board.version}`,
    worldSize: Object.freeze({ ...board.worldSize }),
    layoutContractRefs: Object.freeze(
      board.artRegions.map(({ zoneId, layoutContractRef }) => Object.freeze({
        zoneId,
        layoutContractRef,
      })),
    ),
    roadEdges: Object.freeze(roadEdges.map((edge) => Object.freeze({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      zoneId: edgeZoneId(edge, nodeById),
      pathData: edge.pathData,
    }))),
    cloudStairEdges: Object.freeze(cloudStairEdges.map((edge) => Object.freeze({
      id: edge.id,
      pathData: edge.pathData,
    }))),
    nodes: Object.freeze(nodes),
    transports: Object.freeze(transports),
  });
}

export function cloudHarborImageGenProjectionDigest(projection) {
  return sha256(stableValue(projection));
}

function edgePaths(edges, className, width, colorKey) {
  return edges.map((edge) => {
    const color = ZONE_COLORS[edge.zoneId]?.[colorKey] || ZONE_COLORS["zone-01"][colorKey];
    return (
      `<path class="${className}" data-edge-id="${edge.id}" `
      + `d="${escapeXml(edge.pathData)}" fill="none" stroke="${color}" `
      + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }).join("\n");
}

function nodeDiscs(nodes, className, radiusOffset, colorKey) {
  return nodes.map((node) => {
    const color = ZONE_COLORS[node.zoneId]?.[colorKey] || ZONE_COLORS["zone-01"][colorKey];
    return (
      `<circle class="${className}" data-node-id="${node.id}" `
      + `cx="${node.x}" cy="${node.y}" r="${node.radius + radiusOffset}" fill="${color}"/>`
    );
  }).join("\n");
}

export function renderCloudHarborImageGenControlGuide(
  board = cloudHarborGuideBoard(),
) {
  const projection = createCloudHarborImageGenProjection(board);
  const digest = cloudHarborImageGenProjectionDigest(projection);
  const metadata = escapeXml(JSON.stringify(projection));
  const { width, height } = projection.worldSize;
  const cloudStairs = projection.cloudStairEdges.map((edge) => (
    `<path class="cloud-stair-clearance" data-edge-id="${edge.id}" `
    + `d="${escapeXml(edge.pathData)}" fill="none" stroke="#d9f6ff" `
    + "stroke-width=\"120\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  )).join("\n");
  const transports = projection.transports.map((transport) => (
    `<path class="transport-flight-clearance" data-node-id="${transport.nodeId}" `
    + `d="${escapeXml(transport.pathData)}" fill="none" stroke="#84dff4" `
    + "stroke-width=\"140\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
  )).join("\n");

  return `<!-- Deterministic ImageGen spatial control from the live BoardTemplate. No hand-edited coordinates. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}" data-board-template-ref="${projection.boardTemplateRef}"
  data-geometry-sha256="${digest}">
  <metadata id="imagegen-geometry-projection">${metadata}</metadata>
  <rect id="off-route-sky-field" width="${width}" height="${height}" fill="#17496f"/>
  <g id="terrain-shoulder-envelope">
${edgePaths(projection.roadEdges, "terrain-shoulder", 270, "shoulder")}
${nodeDiscs(projection.nodes, "terrain-shoulder-node", 45, "shoulder")}
  </g>
  <g id="road-support-corridor">
${edgePaths(projection.roadEdges, "road-support", 180, "quiet")}
  </g>
  <g id="node-clearance">
${nodeDiscs(projection.nodes, "node-clearance-disc", 0, "quiet")}
  </g>
  <g id="cloud-stair-clearance">${cloudStairs}</g>
  <g id="transport-flight-clearance">${transports}</g>
</svg>
`;
}

export async function exportCloudHarborImageGenControlGuide({
  outputPath = DEFAULT_OUTPUT_PATH,
  boardTemplate = CRYSTAL_BOARD_TEMPLATE_V221,
  themePack = CRYSTAL_THEME_V221,
} = {}) {
  if (resolve(outputPath) === DEFAULT_OUTPUT_PATH
    && (boardTemplate !== CRYSTAL_BOARD_TEMPLATE_V221 || themePack !== CRYSTAL_THEME_V221)) {
    throw new Error("Historical crystal-v2 control requires its exact published snapshots");
  }
  const source = renderCloudHarborImageGenControlGuide(cloudHarborGuideBoard(boardTemplate, themePack));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, "utf8");
  return outputPath;
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const outputPath = await exportCloudHarborImageGenControlGuide();
  process.stdout.write(`${outputPath}\n`);
}
