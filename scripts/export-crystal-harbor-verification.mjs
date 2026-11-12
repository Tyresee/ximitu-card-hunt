import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CRYSTAL_BOARD_TEMPLATE_V221 as BOARD_TEMPLATE,
  CRYSTAL_THEME_V221 as THEME_PACK,
} from "../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js";
import { cloudHarborGuideBoard, exportCloudHarborLayoutGuides } from "./export-cloud-harbor-layout-guides.mjs";
import { createRegionTopologySummary } from "./export-world-layout-guides.mjs";
import {
  createCloudHarborImageGenProjection, cloudHarborImageGenProjectionDigest,
  exportCloudHarborImageGenControlGuide,
} from "./export-cloud-harbor-imagegen-control-guide.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.GAME_ART_SHARP_MODULE || "sharp");
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../art-source/cloud-harbor/crystal-v2");
await mkdir(directory, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const board = cloudHarborGuideBoard(BOARD_TEMPLATE, THEME_PACK);
if (board.version !== "2.2.1") throw new Error("Crystal verification requires BoardTemplate 2.2.1");
const guides = await exportCloudHarborLayoutGuides({ boardTemplate: BOARD_TEMPLATE, themePack: THEME_PACK });
const controlPath = await exportCloudHarborImageGenControlGuide({ boardTemplate: BOARD_TEMPLATE, themePack: THEME_PACK });
const control = await readFile(controlPath);
const controlPng = await sharp(control).png().toBuffer();
await writeFile(resolve(directory, "world-01-imagegen-control-guide.png"), controlPng);
const master = await readFile(resolve(directory, "../crystal-v1/world-01-master-crystal-v1.png"));
const pathLayer = board.edges.map((edge) => {
  const conditional = Boolean(edge.availableWhen);
  if (THEME_PACK.scenePresentation.airCrossingEdgeIds.includes(edge.id)) {
    return `<path data-edge-id="${edge.id}" d="${escapeXml(edge.pathData)}" fill="none" stroke="#fff1bd" stroke-width="4" stroke-dasharray="2 12"/>`;
  }
  return `<path data-edge-id="${edge.id}" d="${escapeXml(edge.pathData)}" fill="none" stroke="${conditional ? "#e4fdff" : "#154341"}" stroke-width="${conditional ? 9 : 12}" ${conditional ? 'stroke-dasharray="12 8"' : ''}/>`
    + (conditional ? "" : `<path d="${escapeXml(edge.pathData)}" fill="none" stroke="#fff1bd" stroke-width="5"/>`);
}).join("\n");
const nodeLayer = board.nodes.map((node) => `<g data-node-id="${node.id}"><ellipse cx="${node.x}" cy="${node.y}" rx="21" ry="13" fill="#fffbe9" stroke="#174341" stroke-width="3"/><text x="${node.x}" y="${node.y + 4}" fill="#102f34" font-family="Arial,sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${node.id.replace(/^n/, "")}</text></g>`).join("\n");
const projection = createCloudHarborImageGenProjection(board);
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1120" viewBox="0 0 2400 1120" data-board-template-ref="${board.id}@${board.version}"><metadata>${escapeXml(JSON.stringify(projection))}</metadata><image href="../crystal-v1/world-01-master-crystal-v1.png" width="2400" height="1120"/><g id="route-alignment" stroke-linecap="round" stroke-linejoin="round">${pathLayer}</g><g id="node-alignment">${nodeLayer}</g></svg>\n`;
await writeFile(resolve(directory, "world-01-route-alignment.svg"), overlay);
const rasterOverlay = overlay.replace('href="../crystal-v1/world-01-master-crystal-v1.png"', `href="data:image/png;base64,${master.toString("base64")}"`);
const overlayPng = await sharp(Buffer.from(rasterOverlay)).png().toBuffer();
await writeFile(resolve(directory, "world-01-route-alignment.png"), overlayPng);
const assets = JSON.parse(await readFile(resolve(directory, "../crystal-v1/asset-preparation.json"), "utf8"));
let previous = {};
try { previous = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const ruleProjection = {
  entry: BOARD_TEMPLATE.entry, exits: BOARD_TEMPLATE.exits, startNodeId: BOARD_TEMPLATE.startNodeId,
  nodes: BOARD_TEMPLATE.nodes.map(({ x, y, zoneId, ...rule }) => rule),
  edges: BOARD_TEMPLATE.edges.map(({ pathData, ...rule }) => rule),
};
const manifest = {
  schemaVersion: "cloud-harbor-selected-art.v1", selectedAt: "2026-09-23", selectedCandidate: "03",
  userDecision: "Use the attached dream-crystal map; fit nodes and paths naturally to the terrain.",
  boardTemplateRef: `${board.id}@${board.version}`, themePackRef: "cloud-harbor@2.2.1",
  supersedes: "../crystal-v1/manifest.json",
  correction: "Replace the northern rock arch with an automatic airborne crossing over cloudfall; pull the exit approach onto grass; retain the selected bitmap and all game rules.",
  source: { ...assets.source, file: `../crystal-v1/${assets.source.file}` },
  master: { ...assets.master, file: `../crystal-v1/${assets.master.file}` },
  processing: assets.processing,
  crops: assets.crops.map((crop) => ({ ...crop,
    layoutContractRef: board.artRegions.find((region) => region.id === crop.regionId).layoutContractRef,
  })),
  artContract: {
    boardTemplateDigest: hash(JSON.stringify(canonical(BOARD_TEMPLATE))),
    ruleTopologyDigest: hash(JSON.stringify(ruleProjection)),
    imagegenProjectionDigest: cloudHarborImageGenProjectionDigest(projection),
    derivedZoneDigest: hash(JSON.stringify(Object.fromEntries(board.nodes.map((node) => [node.id, node.zoneId])))),
    nodeCount: board.nodes.length, edgeCount: board.edges.length,
    layoutContractRefs: Object.fromEntries(board.artRegions.map((region) => [region.zoneId, region.layoutContractRef])),
  },
  authoritativeControl: {
    svgFile: "world-01-imagegen-control-guide.svg", svgSha256: hash(control),
    rasterFile: "world-01-imagegen-control-guide.png", rasterSha256: hash(controlPng),
  },
  guides: await Promise.all(guides.map(async (guide) => ({
    zoneId: guide.zoneId, layoutContractRef: guide.layoutContractRef,
    file: `layout-guides/${guide.zoneId}-layout-guide.svg`,
    sha256: hash(await readFile(guide.outputPath)),
    topologySha256: createRegionTopologySummary(board, board.artRegions.find((region) => region.zoneId === guide.zoneId)).topologySha256,
  }))),
  alignmentOverlay: { svgFile: "world-01-route-alignment.svg", svgSha256: hash(overlay), rasterFile: "world-01-route-alignment.png", rasterSha256: hash(overlayPng) },
  qa: previous.qa || {
    status: "browser-verification-pending", bitmapRegenerated: false,
    ruleTopologyChanged: false, geometryChanged: true,
    sourceSelection: "User attachment pixels exactly match candidate 03; PNG encoding differs, so attachment bytes are retained.",
    required: ["normal", "no-art", "404-fallback", "movement", "transport", "branches", "mobile", "reduced-motion"],
  },
};
await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Exported crystal verification: ${manifest.artContract.boardTemplateDigest}\n`);
