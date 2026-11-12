import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  PREVIOUS_BOARD_TEMPLATE_V21 as BOARD_TEMPLATE,
  PREVIOUS_CLOUD_HARBOR_THEME_V21,
} from "../public/prototypes/universal-board/cloud-harbor-published-snapshots.js";
import {
  resolvedEdgePathData,
  resolvedTransportPreviewPathData,
} from "../public/prototypes/universal-board/board-route-geometry.js";
import {
  cloudHarborGuideBoard as createGuideBoard,
} from "../scripts/export-cloud-harbor-layout-guides.mjs";
import {
  cloudHarborImageGenProjectionDigest,
  createCloudHarborImageGenProjection,
  renderCloudHarborImageGenControlGuide,
} from "../scripts/export-cloud-harbor-imagegen-control-guide.mjs";

const GUIDE_URL = new URL(
  "../art-source/cloud-harbor/regions-v3/world-01-imagegen-control-guide.svg",
  import.meta.url,
);
const MANIFEST_URL = new URL(
  "../art-source/cloud-harbor/regions-v3/manifest.json",
  import.meta.url,
);
const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);
const cloudHarborGuideBoard = () => createGuideBoard(BOARD_TEMPLATE, PREVIOUS_CLOUD_HARBOR_THEME_V21);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("ImageGen control projection reuses the live route and transport geometry", () => {
  const guideBoard = cloudHarborGuideBoard();
  const nodeById = new Map(guideBoard.nodes.map((node) => [node.id, node]));
  const projection = createCloudHarborImageGenProjection(guideBoard);

  assert.equal(projection.roadEdges.length, 64);
  assert.equal(projection.cloudStairEdges.length, 1);
  assert.equal(projection.nodes.length, 61);
  assert.equal(projection.transports.length, 2);
  assert.equal(
    cloudHarborImageGenProjectionDigest(projection),
    "0304b30548e025f842f8ca349ce8a256efd0c89ebe79bbc9cd101c871cb69687",
  );

  const projectedRoadIds = new Set(projection.roadEdges.map(({ id }) => id));
  for (const edge of guideBoard.edges) {
    if (edge.terrainType === "cloud-stair") {
      assert.equal(projectedRoadIds.has(edge.id), false);
      assert.deepEqual(
        projection.cloudStairEdges.find(({ id }) => id === edge.id),
        { id: edge.id, pathData: resolvedEdgePathData(edge, nodeById) },
      );
      continue;
    }
    if (edge.availableWhen) {
      assert.equal(projectedRoadIds.has(edge.id), false);
      continue;
    }
    assert.deepEqual(
      projection.roadEdges.find(({ id }) => id === edge.id),
      {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        zoneId: nodeById.get(edge.from).zoneId,
        pathData: resolvedEdgePathData(edge, nodeById),
      },
    );
  }

  for (const transport of projection.transports) {
    const node = nodeById.get(transport.nodeId);
    assert.equal(
      transport.pathData,
      resolvedTransportPreviewPathData(node, nodeById),
    );
  }

  assert.match(appSource, /import\s*\{[\s\S]*?resolvedEdgePathData[\s\S]*?\}\s*from\s*["']\.\/board-route-geometry\.js["']/);
  assert.match(appSource, /return resolvedEdgePathData\(edge, nodeById\)/);
  assert.match(appSource, /return resolvedTransportPreviewPathData\(space, nodeById\)/);
});

test("checked-in ImageGen control guide is deterministic, silent, and machine-verifiable", () => {
  const source = readFileSync(GUIDE_URL, "utf8");
  const expected = renderCloudHarborImageGenControlGuide(cloudHarborGuideBoard());
  assert.equal(source, expected);
  assert.match(source, /width="2400" height="1120"/);
  assert.match(source, /viewBox="0 0 2400 1120"/);
  assert.match(source, /id="road-support-corridor"/);
  assert.match(source, /id="node-clearance"/);
  assert.match(source, /id="cloud-stair-clearance"/);
  assert.match(source, /id="transport-flight-clearance"/);
  assert.equal((source.match(/class="road-support"/g) || []).length, 64);
  assert.equal((source.match(/class="node-clearance-disc"/g) || []).length, 61);
  assert.equal((source.match(/class="cloud-stair-clearance"/g) || []).length, 1);
  assert.equal((source.match(/class="transport-flight-clearance"/g) || []).length, 2);
  assert.doesNotMatch(source, /<text\b|<pattern\b|stroke-dasharray|id="legend"|<title\b/);
  assert.match(
    source,
    new RegExp(`data-board-template-ref="${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}"`),
  );
});

test("v7 manifest pins the fitted SVG, raster control, and unchanged rule contract", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_URL, "utf8"));
  const svg = readFileSync(GUIDE_URL);
  const pngUrl = new URL(
    manifest.authoritativeControl.rasterFile,
    MANIFEST_URL,
  );
  const png = readFileSync(pngUrl);
  const [revision] = manifest.svgFitRevisions;

  assert.equal(manifest.boardTemplateRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.equal(
    manifest.artContract.boardTemplateDigest,
    "a848499f0c3c90a8d6b155115ea6a496b96b7e914351fca0bfce824732a76352",
  );
  assert.equal(
    manifest.artContract.topologyDigest,
    "4ff4531a3cdf1936f9da9f0f6c199722ac804421655557a3f0919b8d2fac06c2",
  );
  assert.equal(
    manifest.artContract.ruleTopologyDigest,
    "70618a57564a95f69ea350409f11439eafdbd1048d3b6b8eb1b5fedd0231e282",
  );
  assert.equal(
    manifest.artContract.derivedZoneDigest,
    "2b3a25825ce6859c844669deab712f30b2984cb0bf67ad822f8f032f128fe08c",
  );
  assert.equal(
    manifest.artContract.imagegenProjectionDigest,
    "0304b30548e025f842f8ca349ce8a256efd0c89ebe79bbc9cd101c871cb69687",
  );
  assert.equal(sha256(svg), manifest.authoritativeControl.svgSha256);
  assert.equal(sha256(png), manifest.authoritativeControl.rasterSha256);
  assert.equal(revision.bitmapRegenerated, false);
  assert.equal(revision.runtimeCropBytesChanged, false);
  assert.equal(revision.gameRuleTopologyChanged, false);
  assert.equal(
    sha256(readFileSync(new URL(revision.alignmentOverlaySvg, MANIFEST_URL))),
    revision.alignmentOverlaySvgSha256,
  );
  assert.equal(
    sha256(readFileSync(new URL(revision.alignmentOverlay, MANIFEST_URL))),
    revision.alignmentOverlaySha256,
  );
});
