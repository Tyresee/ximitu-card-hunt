import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOARD_TEMPLATE,
  THEME_PACKS,
} from "../public/prototypes/universal-board/packs.js";
import {
  CRYSTAL_BOARD_TEMPLATE_V221,
  CRYSTAL_THEME_V221,
} from "../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js";
import {
  exportWorldLayoutGuides,
} from "./export-world-layout-guides.mjs";
import {
  resolvedEdgePathData,
} from "../public/prototypes/universal-board/board-route-geometry.js";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_OUTPUT_DIRECTORY = resolve(
  PROJECT_DIRECTORY,
  "art-source",
  "cloud-harbor",
  "crystal-v2",
  "layout-guides",
);

function zoneIdForPoint(node, boardTemplate) {
  const zone = boardTemplate.zones.find(({ bounds }) => (
    node.x >= bounds.x
    && node.x < bounds.x + bounds.width
    && node.y >= bounds.y
    && node.y < bounds.y + bounds.height
  ));
  if (!zone) {
    throw new Error(`Could not assign ${node.id} at ${node.x},${node.y} to a zone`);
  }
  return zone.id;
}

export function cloudHarborGuideBoard(
  boardTemplate = BOARD_TEMPLATE,
  themePack = THEME_PACKS["cloud-harbor"],
) {
  const zoneNames = themePack.zoneNames;
  const nodes = boardTemplate.nodes.map((node) => ({
    ...node,
    zoneId: node.zoneId || zoneIdForPoint(node, boardTemplate),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = boardTemplate.edges.map((edge) => ({
    ...edge,
    pathData: resolvedEdgePathData(edge, nodeById),
  }));
  const zones = boardTemplate.zones.map((zone) => ({
    ...zone,
    label: zoneNames[zone.id] || zone.id,
  }));

  return {
    ...boardTemplate,
    zones,
    nodes,
    edges,
  };
}

export async function exportCloudHarborLayoutGuides({
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  boardTemplate = CRYSTAL_BOARD_TEMPLATE_V221,
  themePack = CRYSTAL_THEME_V221,
} = {}) {
  if (resolve(outputDirectory) === DEFAULT_OUTPUT_DIRECTORY
    && (boardTemplate !== CRYSTAL_BOARD_TEMPLATE_V221 || themePack !== CRYSTAL_THEME_V221)) {
    throw new Error("Historical crystal-v2 guides require their exact published snapshots");
  }
  return exportWorldLayoutGuides({
    boardTemplate: cloudHarborGuideBoard(boardTemplate, themePack),
    outputDirectory,
  });
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const exported = await exportCloudHarborLayoutGuides();
  for (const guide of exported) {
    process.stdout.write(
      `${guide.zoneId} ${guide.layoutContractRef} → ${guide.outputPath}\n`,
    );
  }
}
