import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  BOARD_TEMPLATE,
  LEARNING_PACKS,
  THEME_PACKS,
} from "../public/prototypes/universal-board/packs.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);

function functionSource(source, functionName) {
  const marker = `function ${functionName}(`;
  const functionStart = source.indexOf(marker);
  assert.notEqual(functionStart, -1, `missing named function ${functionName}`);

  const bodyStart = source.indexOf("{", functionStart);
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(functionStart, index + 1);
    }
  }

  assert.fail(`unterminated body for ${functionName}`);
}

test("board owns four region geometries without owning theme image references", () => {
  assert.ok(Array.isArray(BOARD_TEMPLATE.artRegions), "BOARD_TEMPLATE.artRegions must be an array");
  assert.equal(BOARD_TEMPLATE.artRegions.length, 4);

  const expectedZoneIds = BOARD_TEMPLATE.zones.map((zone) => zone.id).sort();
  const actualZoneIds = BOARD_TEMPLATE.artRegions.map((region) => region.zoneId).sort();
  assert.deepEqual(actualZoneIds, expectedZoneIds);
  assert.equal(new Set(BOARD_TEMPLATE.artRegions.map((region) => region.id)).size, 4);

  for (const region of BOARD_TEMPLATE.artRegions) {
    const zone = BOARD_TEMPLATE.zones.find(({ id }) => id === region.zoneId);
    assert.ok(zone, `${region.id} must reference a real board zone`);
    assert.match(region.id, /^region-zone-\d{2}$/);
    assert.match(
      region.layoutContractRef,
      new RegExp(`^board\\.ximitu-card-hunt\\.${region.zoneId}-layout\\.v\\d+$`),
    );
    assert.equal(typeof region.clipPath, "string");
    assert.match(region.clipPath.trim(), /^M/i);
    assert.ok(region.clipPath.trim().length > 12);

    assert.deepEqual(
      Object.keys(region.artBox).sort(),
      ["height", "width", "x", "y"],
    );
    for (const value of Object.values(region.artBox)) {
      assert.equal(Number.isFinite(value), true);
    }
    assert.ok(region.artBox.width > 0);
    assert.ok(region.artBox.height > 0);
    assert.ok(region.artBox.x >= 0);
    assert.ok(region.artBox.y >= 0);
    assert.ok(region.artBox.x + region.artBox.width <= BOARD_TEMPLATE.worldSize.width);
    assert.ok(region.artBox.y + region.artBox.height <= BOARD_TEMPLATE.worldSize.height);
    assert.deepEqual(
      region.artBox,
      zone.bounds,
      `${region.id} artBox must remain the exact runtime crop for ${region.zoneId}`,
    );

    assert.doesNotMatch(
      JSON.stringify(region),
      /assetRef|(?:^|")(?:src|href|url)"/i,
      `${region.id} geometry must not contain a theme asset reference`,
    );
  }
});

test("cloud-harbor theme owns all four crystal region images without duplicating SVG geometry", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];
  assert.deepEqual(
    Object.keys(cloudTheme.regionArt).sort(),
    BOARD_TEMPLATE.artRegions.map(({ id }) => id).sort(),
    "cloud-harbor must provide one ThemePack entry for every board art region",
  );

  for (const region of BOARD_TEMPLATE.artRegions) {
    const art = cloudTheme.regionArt[region.id];
    assert.ok(art, `cloud-harbor must define ${region.id}`);
    assert.equal(
      art.assetRef,
      `/assets/board-themes/cloud-harbor/regions/${region.zoneId}-crystal-v1.jpg`,
    );
    assert.equal(art.layoutContractRef, region.layoutContractRef);
    assert.equal(typeof art.fallbackFill, "string");
    assert.ok(art.fallbackFill.trim().length > 0);

    const artUrl = new URL(`../public${art.assetRef}`, import.meta.url);
    assert.equal(existsSync(artUrl), true, `${art.assetRef} must exist`);
  }

  assert.doesNotMatch(
    JSON.stringify(cloudTheme.regionArt),
    /clipPath|artBox|(?:^|")(?:bounds|x|y|width|height)"/,
    "ThemePack.regionArt must reference art, not duplicate BoardTemplate geometry",
  );

  assert.equal(
    Object.values(LEARNING_PACKS).some((pack) => Object.hasOwn(pack, "regionArt")),
    false,
    "learning content must not select or position board scenery",
  );
});

test("SVG renderer creates clipped non-interactive region images below routes and spaces", () => {
  assert.match(appSource, /svgElement\(\s*["']defs["']/);
  assert.match(appSource, /class:\s*["']board-defs["']/);
  assert.match(appSource, /svgElement\(\s*["']clipPath["']/);
  assert.match(appSource, /clipPathUnits:\s*["']userSpaceOnUse["']/);
  assert.match(appSource, /region-clip-/);
  assert.match(appSource, /d:\s*region\.clipPath/);

  const regionImageClass = appSource.indexOf('class: "region-art-image"');
  assert.notEqual(regionImageClass, -1, "renderer must create an SVG region image element");
  const imageStart = appSource.lastIndexOf('svgElement("image"', regionImageClass);
  assert.notEqual(imageStart, -1, "renderer must create an SVG region image element");
  const imageConstruction = appSource.slice(imageStart, regionImageClass + 650);
  assert.match(imageConstruction, /class:\s*["']region-art-image["']/);
  assert.match(imageConstruction, /["']data-region-id["']:\s*region\.id/);
  assert.match(imageConstruction, /x:\s*region\.artBox\.x/);
  assert.match(imageConstruction, /y:\s*region\.artBox\.y/);
  assert.match(imageConstruction, /width:\s*region\.artBox\.width/);
  assert.match(imageConstruction, /height:\s*region\.artBox\.height/);
  assert.match(imageConstruction, /["']pointer-events["']:\s*["']none["']/);
  assert.match(imageConstruction, /clip-path/);

  const terrainAppend = appSource.indexOf("boardWorld.append(terrain)");
  const artLayerAppend = appSource.indexOf("boardWorld.append(regionArtLayer)");
  const routeLayerDeclaration = appSource.indexOf('class: "route-layer"');
  const spaceLayerDeclaration = appSource.indexOf('svgElement("g", { class: "space-layer"');
  assert.ok(terrainAppend > -1, "base terrain must be appended to the board world");
  assert.ok(artLayerAppend > terrainAppend, "region art must render above base terrain");
  assert.ok(artLayerAppend > -1, "region art layer must be appended to the board world");
  assert.ok(routeLayerDeclaration > artLayerAppend, "routes must render above region art");
  assert.ok(spaceLayerDeclaration > routeLayerDeclaration, "spaces must render above routes");
});

test("a failed region image reveals only its fallback and never rebuilds board topology", () => {
  const fallbackHandler = functionSource(appSource, "showRegionArtFallback");

  assert.match(fallbackHandler, /classList\.add\(\s*["']is-unavailable["']\s*\)/);
  assert.match(fallbackHandler, /removeAttribute\(\s*["']href["']\s*\)/);
  assert.doesNotMatch(
    fallbackHandler,
    /\brenderBoard\b|replaceChildren|BOARD_TEMPLATE\.(?:nodes|edges)|\b(?:routeLayer|spaceLayer)\b|\.remove\(/,
  );
  assert.match(
    appSource,
    /addEventListener\(\s*["']error["'][\s\S]{0,320}showRegionArtFallback\(/,
  );
  assert.match(appSource, /class:\s*["']region-art-fallback["']/);
});
