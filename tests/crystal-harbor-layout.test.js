import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CRYSTAL_BOARD_TEMPLATE_V221 as BOARD_TEMPLATE,
  CRYSTAL_THEME_V221 as THEME_PACK,
} from "../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js";
import { PREVIOUS_BOARD_TEMPLATE_V21 } from "../public/prototypes/universal-board/cloud-harbor-published-snapshots.js";
import { cloudHarborGuideBoard } from "../scripts/export-cloud-harbor-layout-guides.mjs";
import { createRegionTopologySummary, renderWorldLayoutGuide } from "../scripts/export-world-layout-guides.mjs";
import {
  createCloudHarborImageGenProjection, cloudHarborImageGenProjectionDigest,
  renderCloudHarborImageGenControlGuide,
} from "../scripts/export-cloud-harbor-imagegen-control-guide.mjs";

const directory = new URL("../art-source/cloud-harbor/crystal-v2/", import.meta.url);
const read = (file) => readFileSync(new URL(file, directory));
const manifest = JSON.parse(read("manifest.json"));
const board = cloudHarborGuideBoard(BOARD_TEMPLATE, THEME_PACK);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const ruleProjection = (template) => ({
  entry: template.entry, exits: template.exits, startNodeId: template.startNodeId,
  nodes: template.nodes.map(({ x, y, zoneId, ...rule }) => rule),
  edges: template.edges.map(({ pathData, ...rule }) => rule),
});
const expectedLayoutRefs = {
  "zone-01": "board.ximitu-card-hunt.zone-01-layout.v6",
  "zone-02": "board.ximitu-card-hunt.zone-02-layout.v4",
  "zone-03": "board.ximitu-card-hunt.zone-03-layout.v2",
  "zone-04": "board.ximitu-card-hunt.zone-04-layout.v2",
};
const expectedRegionDigests = {
  "zone-01": "a1952a1aff35ce0b91fd6e0060dc892906ee5d29540cce31340235e72d02024c",
  "zone-02": "735a620eb949f4e9cc4bda69e519469183796700f1fe88225d664c53124c743d",
  "zone-03": "43d951c9b15651cea1c9d38db2bdceb6382c60e03c1468e06f0459cb42a70f01",
  "zone-04": "35902e4d3f6c485597a9838a17e60d4d702341c97a92f04839990e1f1f9a3bcb",
};

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += bytes.readUInt16BE(offset);
  }
  assert.fail("Missing JPEG dimensions");
}

test("crystal geometry is a new exact board revision with unchanged rules and zone ownership", () => {
  assert.equal(BOARD_TEMPLATE.version, "2.2.1");
  assert.equal(manifest.boardTemplateRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.equal(hash(JSON.stringify(canonical(BOARD_TEMPLATE))), "dcd96a4c526c1a9e130182b7acb6e00c67ca1f1bc2834915d19ac5d6327ef21f");
  assert.equal(manifest.artContract.boardTemplateDigest, hash(JSON.stringify(canonical(BOARD_TEMPLATE))));
  assert.deepEqual(ruleProjection(BOARD_TEMPLATE), ruleProjection(PREVIOUS_BOARD_TEMPLATE_V21));
  assert.equal(hash(JSON.stringify(ruleProjection(BOARD_TEMPLATE))), "70618a57564a95f69ea350409f11439eafdbd1048d3b6b8eb1b5fedd0231e282");
  assert.equal(manifest.artContract.ruleTopologyDigest, hash(JSON.stringify(ruleProjection(BOARD_TEMPLATE))));
  assert.equal(hash(JSON.stringify(Object.fromEntries(board.nodes.map((node) => [node.id, node.zoneId])))), "2b3a25825ce6859c844669deab712f30b2984cb0bf67ad822f8f032f128fe08c");
  assert.equal(board.nodes.length, 61);
  assert.equal(board.edges.length, 65);
  const byId = new Map(board.nodes.map((node) => [node.id, node]));
  for (const edge of board.edges) {
    const coordinates = edge.pathData.match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.deepEqual(coordinates.slice(0, 2), [byId.get(edge.from).x, byId.get(edge.from).y], `${edge.id} start`);
    assert.deepEqual(coordinates.slice(-2), [byId.get(edge.to).x, byId.get(edge.to).y], `${edge.id} end`);
  }
});

test("all four crystal guides, runtime crops and theme bind to the same reviewed geometry", () => {
  assert.deepEqual(manifest.artContract.layoutContractRefs, expectedLayoutRefs);
  const coveredNodes = new Set();
  for (const region of board.artRegions) {
    const record = manifest.guides.find((guide) => guide.zoneId === region.zoneId);
    const summary = createRegionTopologySummary(board, region);
    const guide = read(record.file);
    const art = THEME_PACK.regionArt[region.id];
    const crop = manifest.crops.find((entry) => entry.regionId === region.id);
    assert.equal(region.layoutContractRef, expectedLayoutRefs[region.zoneId]);
    assert.equal(record.layoutContractRef, region.layoutContractRef);
    assert.equal(art.layoutContractRef, region.layoutContractRef);
    assert.equal(crop.layoutContractRef, region.layoutContractRef);
    assert.equal(guide.toString(), renderWorldLayoutGuide(board, region), `${region.zoneId} guide is stale`);
    assert.equal(hash(guide), record.sha256);
    assert.equal(summary.topologySha256, expectedRegionDigests[region.zoneId]);
    assert.equal(record.topologySha256, summary.topologySha256);
    summary.nodeIds.forEach((id) => coveredNodes.add(id));
    assert.equal(art.assetRef, `/assets/board-themes/cloud-harbor/regions/${region.zoneId}-crystal-v1.jpg`);
    assert.equal(crop.assetRef, art.assetRef);
    assert.deepEqual(crop.artBox, region.artBox);
    const jpeg = readFileSync(new URL(`../public${crop.assetRef}`, import.meta.url));
    assert.equal(hash(jpeg), crop.sha256);
    assert.deepEqual(jpegDimensions(jpeg), { width: region.artBox.width, height: region.artBox.height });
  }
  assert.equal(coveredNodes.size, board.nodes.length);
  assert.equal(coveredNodes.has("n49"), true);
  assert.ok(manifest.crops.reduce((total, crop) => total + crop.bytes, 0) < 1024 * 1024, "four runtime backgrounds must stay under 1 MiB");
});

test("selected source is retained exactly and control/overlay are regenerated from current geometry", () => {
  assert.equal(manifest.source.sha256, "e75e6f1ed251d2a4956513a423b6eac471e27fd9028d61aba581a7312b0d1fb2");
  assert.equal(hash(read(manifest.source.file)), manifest.source.sha256);
  assert.deepEqual(pngDimensions(read(manifest.source.file)), { width: 1836, height: 857 });
  assert.equal(hash(read(manifest.master.file)), manifest.master.sha256);
  assert.deepEqual(pngDimensions(read(manifest.master.file)), { width: 2400, height: 1120 });
  assert.equal(manifest.processing.creativeChanges, false);
  const projection = createCloudHarborImageGenProjection(board);
  assert.equal(cloudHarborImageGenProjectionDigest(projection), "5a2d5f1aa77494228067d5e72d48daf369d428fbfd5030c9c72b840855b8c8bf");
  assert.equal(manifest.artContract.imagegenProjectionDigest, cloudHarborImageGenProjectionDigest(projection));
  assert.equal(read(manifest.authoritativeControl.svgFile).toString(), renderCloudHarborImageGenControlGuide(board));
  for (const record of [manifest.authoritativeControl, manifest.alignmentOverlay]) {
    assert.equal(hash(read(record.svgFile)), record.svgSha256);
    assert.equal(hash(read(record.rasterFile)), record.rasterSha256);
    assert.deepEqual(pngDimensions(read(record.rasterFile)), { width: 2400, height: 1120 });
  }
  const overlay = read(manifest.alignmentOverlay.svgFile).toString();
  for (const edge of board.edges) assert.ok(overlay.includes(`data-edge-id="${edge.id}" d="${edge.pathData}"`));
  for (const node of board.nodes) assert.ok(overlay.includes(`data-node-id="${node.id}"><ellipse cx="${node.x}" cy="${node.y}"`));
});
