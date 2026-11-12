import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  createRegionTopologySummary,
  exportWorldLayoutGuides,
  getRegionGuideFilename,
  renderWorldLayoutGuide,
} from "../scripts/export-world-layout-guides.mjs";

const GUIDE_DIRECTORY = new URL(
  "../art-source/world-02-layout-guides/",
  import.meta.url,
);

const EXPECTED_LAYOUT_CONTRACTS = Object.freeze({
  "zone-05": "board.ximitu-card-hunt.world-02.zone-05-layout.v1",
  "zone-06": "board.ximitu-card-hunt.world-02.zone-06-layout.v1",
  "zone-07": "board.ximitu-card-hunt.world-02.zone-07-layout.v1",
  "zone-08": "board.ximitu-card-hunt.world-02.zone-08-layout.v1",
});

const EXPECTED_TOPOLOGY = Object.freeze({
  "zone-05": Object.freeze({
    nodeCount: 16,
    guideEdgeCount: 17,
    internalEdgeCount: 16,
    boundaryEdgeCount: 1,
    branchNodeIds: ["w2n04"],
    conditionalEdgeIds: [],
    transportNodeIds: ["w2n06a"],
    facilityNodeIds: ["w2n05b", "w2n10"],
    topologySha256: "d98bdd6ff4225e52744c2e8414cb831ab5b5be17cd9251db5a2e622a12decede",
  }),
  "zone-06": Object.freeze({
    nodeCount: 17,
    guideEdgeCount: 19,
    internalEdgeCount: 17,
    boundaryEdgeCount: 2,
    branchNodeIds: ["w2n18"],
    conditionalEdgeIds: [],
    transportNodeIds: ["w2n20a"],
    facilityNodeIds: ["w2n19b", "w2n25"],
    topologySha256: "a912a634d91f6216c38574383cf4ba061aac4166d041540148f6e9a3fe82d2d2",
  }),
  "zone-07": Object.freeze({
    nodeCount: 16,
    guideEdgeCount: 19,
    internalEdgeCount: 17,
    boundaryEdgeCount: 2,
    branchNodeIds: ["w2n32", "w2n36"],
    conditionalEdgeIds: ["w2e36c"],
    transportNodeIds: [],
    facilityNodeIds: ["w2n33a", "w2n35b", "w2n39"],
    topologySha256: "89ad1a8e5f5003b449f937a77ea2871111c7e628eb6bc98f28de8f24d006f66b",
  }),
  "zone-08": Object.freeze({
    nodeCount: 13,
    guideEdgeCount: 14,
    internalEdgeCount: 13,
    boundaryEdgeCount: 1,
    branchNodeIds: ["w2n45"],
    conditionalEdgeIds: [],
    transportNodeIds: [],
    facilityNodeIds: ["w2n47b", "w2n52"],
    topologySha256: "fe14dcd3c7dd7fa8dba8b9722282adfb3a9a751549ec291eacbf9aed28ed6848",
  }),
});

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

function expectedSummarySlice(summary) {
  return {
    nodeCount: summary.nodeCount,
    guideEdgeCount: summary.guideEdgeCount,
    internalEdgeCount: summary.internalEdgeCount,
    boundaryEdgeCount: summary.boundaryEdgeCount,
    branchNodeIds: [...summary.branchNodeIds],
    conditionalEdgeIds: [...summary.conditionalEdgeIds],
    transportNodeIds: [...summary.transportNodeIds],
    facilityNodeIds: [...summary.facilityNodeIds],
    topologySha256: summary.topologySha256,
  };
}

test("World 02 layout contracts and topology summaries are frozen per region", () => {
  assert.deepEqual(
    Object.fromEntries(
      EXPANSION_WORLD_BOARD_TEMPLATE.artRegions.map((region) => [
        region.zoneId,
        region.layoutContractRef,
      ]),
    ),
    EXPECTED_LAYOUT_CONTRACTS,
  );

  for (const region of EXPANSION_WORLD_BOARD_TEMPLATE.artRegions) {
    const summary = createRegionTopologySummary(
      EXPANSION_WORLD_BOARD_TEMPLATE,
      region,
    );
    assert.equal(
      summary.layoutContractRef,
      EXPECTED_LAYOUT_CONTRACTS[region.zoneId],
    );
    assert.deepEqual(
      expectedSummarySlice(summary),
      EXPECTED_TOPOLOGY[region.zoneId],
      `${region.zoneId} topology changed; regenerate and review its art guide`,
    );
  }
});

test("checked-in guides are exact deterministic exports of the BoardTemplate", async () => {
  const expectedFilenames = EXPANSION_WORLD_BOARD_TEMPLATE.artRegions.map(
    getRegionGuideFilename,
  ).sort();
  const checkedInRegionGuides = (await readdir(GUIDE_DIRECTORY))
    .filter((filename) => /^zone-\d+-layout-guide\.svg$/.test(filename))
    .sort();
  assert.deepEqual(
    checkedInRegionGuides,
    expectedFilenames,
  );

  for (const region of EXPANSION_WORLD_BOARD_TEMPLATE.artRegions) {
    const source = await readFile(
      new URL(getRegionGuideFilename(region), GUIDE_DIRECTORY),
      "utf8",
    );
    assert.equal(
      source,
      renderWorldLayoutGuide(EXPANSION_WORLD_BOARD_TEMPLATE, region),
      `${region.zoneId} guide is stale; run node scripts/export-world-layout-guides.mjs`,
    );
    assert.deepEqual(
      metadataSummary(source),
      createRegionTopologySummary(EXPANSION_WORLD_BOARD_TEMPLATE, region),
    );
  }
});

test("each guide retains its global 1:1 artBox and source geometry", async () => {
  const nodeById = new Map(
    EXPANSION_WORLD_BOARD_TEMPLATE.nodes.map((node) => [node.id, node]),
  );

  for (const region of EXPANSION_WORLD_BOARD_TEMPLATE.artRegions) {
    const source = await readFile(
      new URL(getRegionGuideFilename(region), GUIDE_DIRECTORY),
      "utf8",
    );
    const { x, y, width, height } = region.artBox;
    const regionNodes = EXPANSION_WORLD_BOARD_TEMPLATE.nodes.filter(
      ({ zoneId }) => zoneId === region.zoneId,
    );
    const regionNodeIds = new Set(regionNodes.map(({ id }) => id));
    const visibleEdges = EXPANSION_WORLD_BOARD_TEMPLATE.edges.filter(
      ({ from, to }) => regionNodeIds.has(from) || regionNodeIds.has(to),
    );

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
    assert.match(
      source,
      new RegExp(`data-layout-contract-ref="${region.layoutContractRef}"`),
    );
    assert.ok(
      source.includes(
        `data-source-clip-path="true" d="${region.clipPath}"`,
      ),
      `${region.id} must retain its source clipPath`,
    );

    for (const node of regionNodes) {
      assert.ok(
        source.includes(`data-node-id="${node.id}"`),
        `${node.id} is missing from ${region.zoneId}`,
      );
      assert.ok(
        source.includes(`cx="${node.x}" cy="${node.y}"`),
        `${node.id} source coordinate drifted in ${region.zoneId}`,
      );
      assert.ok(
        source.includes(
          `data-landing-profile-ref="${node.landingProfileRef}"`,
        ),
        `${node.id} lost its landing profile annotation`,
      );
    }

    for (const edge of visibleEdges) {
      assert.ok(nodeById.has(edge.from) && nodeById.has(edge.to));
      assert.ok(
        source.includes(
          `data-edge-id="${edge.id}" data-from="${edge.from}" data-to="${edge.to}" data-terrain-type="${edge.terrainType}" d="${edge.pathData}"`,
        ),
        `${edge.id} source pathData drifted in ${region.zoneId}`,
      );
    }
  }
});

test("branches, transports, facilities and production clearances stay readable", async () => {
  const requiredGroups = [
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
  ];
  const boardNodeById = new Map(
    EXPANSION_WORLD_BOARD_TEMPLATE.nodes.map((node) => [node.id, node]),
  );

  for (const region of EXPANSION_WORLD_BOARD_TEMPLATE.artRegions) {
    const source = await readFile(
      new URL(getRegionGuideFilename(region), GUIDE_DIRECTORY),
      "utf8",
    );
    const summary = createRegionTopologySummary(
      EXPANSION_WORLD_BOARD_TEMPLATE,
      region,
    );

    for (const groupId of requiredGroups) {
      assert.match(source, new RegExp(`id="${groupId}"`));
    }
    for (const nodeId of summary.branchNodeIds) {
      assert.match(
        source,
        new RegExp(`data-branch-node-id="${nodeId}"`),
      );
    }
    for (const nodeId of summary.transportNodeIds) {
      const transport = boardNodeById.get(nodeId);
      assert.match(
        source,
        new RegExp(`data-transport-node-id="${nodeId}"`),
      );
      for (const captureNodeId of transport.transportCaptureNodeIds || []) {
        assert.match(source, new RegExp(`PASS · ${captureNodeId} ·`));
      }
      assert.match(
        source,
        new RegExp(`LAND · ${transport.transportTargetId} ·`),
      );
    }
    for (const nodeId of summary.facilityNodeIds) {
      assert.match(
        source,
        new RegExp(`data-facility-node-id="${nodeId}"`),
      );
    }
    for (const nodeId of summary.nodeIds) {
      assert.match(
        source,
        new RegExp(`data-clearance-node-id="${nodeId}"`),
      );
    }
    for (const edgeId of summary.conditionalEdgeIds) {
      assert.match(
        source,
        new RegExp(`data-conditional-edge-label="${edgeId}"`),
      );
    }
    assert.match(
      source,
      /DO NOT GENERATE: 棋格、路线、角色、文字、HUD/,
    );
  }
});

test("guides remain bitmap-free and the exporter writes only the four SVGs", async (t) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "world-02-layout-guides-"),
  );
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  const exported = await exportWorldLayoutGuides({
    outputDirectory: temporaryDirectory,
  });
  assert.equal(exported.length, 4);
  assert.deepEqual(
    (await readdir(temporaryDirectory)).sort(),
    EXPANSION_WORLD_BOARD_TEMPLATE.artRegions.map(
      getRegionGuideFilename,
    ).sort(),
  );

  for (const guide of exported) {
    const source = await readFile(guide.outputPath, "utf8");
    assert.doesNotMatch(
      source,
      /<image\b|data:image|(?:\.png|\.jpe?g|\.webp|\.avif)\b/i,
    );
    assert.equal(
      guide.topologySummary.layoutContractRef,
      EXPECTED_LAYOUT_CONTRACTS[guide.zoneId],
    );
  }
});
