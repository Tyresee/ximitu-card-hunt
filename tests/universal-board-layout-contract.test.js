import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  PREVIOUS_BOARD_TEMPLATE_V21 as BOARD_TEMPLATE,
  PREVIOUS_CLOUD_HARBOR_THEME_V21,
} from "../public/prototypes/universal-board/cloud-harbor-published-snapshots.js";
import {
  cloudHarborGuideBoard,
} from "../scripts/export-cloud-harbor-layout-guides.mjs";
import {
  createRegionTopologySummary,
  getRegionGuideFilename,
  renderWorldLayoutGuide,
} from "../scripts/export-world-layout-guides.mjs";

const GUIDE_DIRECTORY = new URL(
  "../art-source/cloud-harbor/regions-v2/layout-guides/",
  import.meta.url,
);

const EXPECTED_LAYOUT_CONTRACTS = Object.freeze({
  "zone-01": "board.ximitu-card-hunt.zone-01-layout.v4",
  "zone-02": "board.ximitu-card-hunt.zone-02-layout.v2",
  "zone-03": "board.ximitu-card-hunt.zone-03-layout.v1",
  "zone-04": "board.ximitu-card-hunt.zone-04-layout.v1",
});

const EXPECTED_TOPOLOGY_SHA256 = Object.freeze({
  "zone-01": "79578b6d06892fb94f418a5e4b443e41cbdb22fa1bc2f0be29c6650bdf31d101",
  "zone-02": "ca304dafea64e5002b1606cf6952402b19d7873d78e574dedd21d32dc5443f86",
  "zone-03": "8d5656cb077ed4e2a5ddef16b28316b43e81634ad331af6a86b4619878178c04",
  "zone-04": "278f91fbb4d599253e8533dfc48774d6fba1ea8d12fb6fa44110d48985a85cad",
});

const REQUIRED_GUIDE_GROUPS = Object.freeze([
  "guide-canvas",
  "route-safe-corridor",
  "no-tall-object-zones",
  "transport-clearance",
  "route-centerline",
  "conditional-route-centerline",
  "branch-annotations",
  "facility-anchors",
  "route-nodes",
  "legend",
  "art-box-boundary",
]);

// These exact published v2.1 geometry/art assertions remain unchanged when a
// new board is released. The crystal release has its own full layout gate.
const THEME_PACKS = { "cloud-harbor": PREVIOUS_CLOUD_HARBOR_THEME_V21 };
const guideBoard = cloudHarborGuideBoard(BOARD_TEMPLATE, PREVIOUS_CLOUD_HARBOR_THEME_V21);
const guideRegionByZoneId = new Map(
  guideBoard.artRegions.map((region) => [region.zoneId, region]),
);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function guideUrl(region) {
  return new URL(getRegionGuideFilename(region), GUIDE_DIRECTORY);
}

function guideSource(region) {
  const url = guideUrl(region);
  assert.equal(existsSync(url), true, `${url.pathname} must exist`);
  return readFileSync(url, "utf8");
}

function unescapeXmlText(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function metadataSummary(source) {
  const match = source.match(
    /<metadata id="topology-summary">([^<]+)<\/metadata>/,
  );
  assert.ok(match, "guide must embed a machine-readable topology summary");
  return JSON.parse(unescapeXmlText(match[1]));
}

function jpegDimensions(buffer) {
  assert.equal(buffer[0], 0xff, "region art must be a JPEG");
  assert.equal(buffer[1], 0xd8, "region art must start with a JPEG SOI marker");

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    const isStartOfFrame = (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    );
    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }

  assert.fail("could not read region art JPEG dimensions");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("SVG fit preserves rule topology, zone ownership, and exact edge endpoints", () => {
  const ruleProjection = {
    entry: BOARD_TEMPLATE.entry,
    exits: BOARD_TEMPLATE.exits,
    startNodeId: BOARD_TEMPLATE.startNodeId,
    nodes: BOARD_TEMPLATE.nodes.map(({ x, y, zoneId, ...rule }) => rule),
    edges: BOARD_TEMPLATE.edges.map(({ pathData, ...rule }) => rule),
  };
  assert.equal(
    sha256Json(ruleProjection),
    "70618a57564a95f69ea350409f11439eafdbd1048d3b6b8eb1b5fedd0231e282",
    "spatial fitting must not change IDs, order, roles, branches, rewards, or conditions",
  );

  const derivedZoneMap = Object.fromEntries(
    BOARD_TEMPLATE.nodes.map((node) => {
      const zone = BOARD_TEMPLATE.zones.find(({ bounds }) => (
        node.x >= bounds.x
        && node.x < bounds.x + bounds.width
        && node.y >= bounds.y
        && node.y < bounds.y + bounds.height
      ));
      return [node.id, zone?.id ?? null];
    }),
  );
  assert.equal(
    sha256Json(derivedZoneMap),
    "2b3a25825ce6859c844669deab712f30b2984cb0bf67ad822f8f032f128fe08c",
    "no fitted node may cross its authored region boundary",
  );

  const nodeById = new Map(guideBoard.nodes.map((node) => [node.id, node]));
  for (const edge of guideBoard.edges) {
    const coordinates = edge.pathData.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    assert.deepEqual(coordinates.slice(0, 2), [from.x, from.y], `${edge.id} start drifted`);
    assert.deepEqual(coordinates.slice(-2), [to.x, to.y], `${edge.id} end drifted`);
  }
});

test("World 01 board, four deterministic guides, and ThemePack share exact layout contracts", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];
  assert.equal(guideBoard.id, BOARD_TEMPLATE.id);
  assert.deepEqual(
    Object.fromEntries(
      BOARD_TEMPLATE.artRegions.map((region) => [
        region.zoneId,
        region.layoutContractRef,
      ]),
    ),
    EXPECTED_LAYOUT_CONTRACTS,
  );

  for (const boardRegion of BOARD_TEMPLATE.artRegions) {
    const region = guideRegionByZoneId.get(boardRegion.zoneId);
    const themeArt = cloudTheme.regionArt[boardRegion.id];
    assert.ok(region, `${boardRegion.zoneId} guide region must exist`);
    assert.ok(themeArt, `${boardRegion.id} ThemePack art must exist`);
    assert.equal(region.layoutContractRef, boardRegion.layoutContractRef);
    assert.equal(themeArt.layoutContractRef, boardRegion.layoutContractRef);

    const source = guideSource(region);
    assert.equal(
      source,
      renderWorldLayoutGuide(guideBoard, region),
      `${region.zoneId} guide is stale; regenerate it from the BoardTemplate`,
    );
    assert.match(
      source,
      new RegExp(
        `data-layout-contract-ref="${escapeRegExp(region.layoutContractRef)}"`,
      ),
    );
    assert.deepEqual(
      metadataSummary(source),
      createRegionTopologySummary(guideBoard, region),
      `${region.zoneId} embedded topology metadata must match the guide source`,
    );
  }
});

test("all four guide canvases and v3 runtime JPEGs exactly match their artBox", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];

  for (const region of guideBoard.artRegions) {
    const source = guideSource(region);
    const { x, y, width, height } = region.artBox;
    const zone = guideBoard.zones.find(({ id }) => id === region.zoneId);
    const themeArt = cloudTheme.regionArt[region.id];

    assert.ok(zone);
    assert.deepEqual(region.artBox, zone.bounds);
    assert.match(source, new RegExp(`width="${width}"`));
    assert.match(source, new RegExp(`height="${height}"`));
    assert.match(
      source,
      new RegExp(`viewBox="${x} ${y} ${width} ${height}"`),
    );
    assert.match(
      source,
      new RegExp(`data-art-box="${x} ${y} ${width} ${height}"`),
    );
    assert.equal(
      themeArt.assetRef,
      `/assets/board-themes/cloud-harbor/regions/${region.zoneId}-v3.jpg`,
    );

    const artUrl = new URL(`../public${themeArt.assetRef}`, import.meta.url);
    assert.equal(existsSync(artUrl), true, `${themeArt.assetRef} must exist`);
    assert.deepEqual(
      jpegDimensions(readFileSync(artUrl)),
      { width, height },
      `${themeArt.assetRef} must be an exact artBox crop without runtime slicing`,
    );
  }
});

test("four guides cover every regional node, boundary edge, and authoritative route path", () => {
  const nodeById = new Map(guideBoard.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(guideBoard.edges.map((edge) => [edge.id, edge]));

  for (const region of guideBoard.artRegions) {
    const source = guideSource(region);
    const summary = createRegionTopologySummary(guideBoard, region);
    assert.equal(
      summary.topologySha256,
      EXPECTED_TOPOLOGY_SHA256[region.zoneId],
      `${region.zoneId} topology changed; review and regenerate its art`,
    );
    assert.equal(
      summary.internalEdgeCount + summary.boundaryEdgeCount,
      summary.guideEdgeCount,
    );

    for (const groupId of REQUIRED_GUIDE_GROUPS) {
      assert.match(source, new RegExp(`id="${groupId}"`));
    }
    for (const nodeId of summary.nodeIds) {
      const node = nodeById.get(nodeId);
      assert.ok(node);
      assert.ok(
        source.includes(`data-node-id="${nodeId}"`),
        `${nodeId} is missing from ${region.zoneId}`,
      );
      assert.ok(
        source.includes(
          `data-clearance-node-id="${nodeId}" cx="${node.x}" cy="${node.y}"`,
        ),
        `${nodeId} clearance drifted in ${region.zoneId}`,
      );
    }
    for (const edgeId of summary.guideEdgeIds) {
      const edge = edgeById.get(edgeId);
      assert.ok(edge);
      assert.ok(
        source.includes(
          `data-edge-id="${edge.id}" data-from="${edge.from}" data-to="${edge.to}" `
          + `data-terrain-type="${String(edge.terrainType)}" d="${edge.pathData}"`,
        ),
        `${edge.id} source pathData drifted in ${region.zoneId}`,
      );
    }
    for (const edgeId of summary.conditionalEdgeIds) {
      assert.ok(
        source.includes(`data-conditional-edge-label="${edgeId}"`),
        `${edgeId} conditional annotation is missing from ${region.zoneId}`,
      );
    }
    for (const nodeId of summary.facilityNodeIds) {
      assert.ok(
        source.includes(`data-facility-node-id="${nodeId}"`),
        `${nodeId} facility clearance is missing from ${region.zoneId}`,
      );
    }
    assert.match(
      source,
      /DO NOT GENERATE: 棋格、路线、角色、文字、HUD/,
    );
  }

  const coveredNodeIds = new Set(
    guideBoard.artRegions.flatMap((region) => (
      createRegionTopologySummary(guideBoard, region).nodeIds
    )),
  );
  assert.equal(coveredNodeIds.size, guideBoard.nodes.length);
  assert.equal(coveredNodeIds.has("n49"), true, "forward exit n49 must remain in Zone 04 art");
});

test("both World 01 transports retain their complete capture and landing clearance", () => {
  const transportNodes = guideBoard.nodes.filter(({ transportTargetId }) => (
    Boolean(transportTargetId)
  ));
  const nodeById = new Map(guideBoard.nodes.map((node) => [node.id, node]));
  assert.deepEqual(transportNodes.map(({ id }) => id), ["n06a", "n34"]);

  for (const transport of transportNodes) {
    const region = guideRegionByZoneId.get(transport.zoneId);
    const source = guideSource(region);
    const occurrences = source.match(
      new RegExp(`data-transport-node-id="${transport.id}"`, "g"),
    ) || [];
    assert.equal(
      occurrences.length,
      2,
      `${transport.id} needs both wide clearance and visible trajectory paths`,
    );

    for (const captureNodeId of transport.transportCaptureNodeIds || []) {
      const capture = nodeById.get(captureNodeId);
      assert.ok(capture);
      assert.ok(
        source.includes(`PASS · ${capture.id} · ${capture.x},${capture.y}`),
        `${transport.id} must expose capture node ${capture.id}`,
      );
    }

    const target = nodeById.get(transport.transportTargetId);
    assert.ok(target);
    assert.ok(
      source.includes(`LAND · ${target.id} · ${target.x},${target.y}`),
      `${transport.id} must expose its authoritative landing target`,
    );
  }
});
