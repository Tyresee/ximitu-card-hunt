import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  BOARD_TEMPLATE,
  LEARNING_PACKS,
  THEME_PACKS,
} from "../public/prototypes/universal-board/packs.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);
const nodeVisualSource = readFileSync(
  new URL("../public/prototypes/universal-board/node-visuals.js", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../public/prototypes/universal-board/styles.css", import.meta.url),
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

function collectObjectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nestedValue, keys);
  }
  return keys;
}

function pngInfo(buffer, label) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${label} must be a PNG`,
  );
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

test("cloud-harbor uses ImageGen skins except where SVG semantics must prevent an anchor-name collision", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];
  const expectedRoles = [
    "anchor",
    "cloud-gate",
    "coin",
    "event",
    "foghorn",
    "gem",
    "home",
    "item",
    "junction",
    "key",
    "learning",
    "mooring",
    "portal",
    "transport",
  ];

  assert.deepEqual(Object.keys(cloudTheme.nodeSkins || {}).sort(), expectedRoles);
  for (const role of expectedRoles) {
    const skin = cloudTheme.nodeSkins[role];
    assert.equal(typeof skin.assetRef, "string");
    if (role === "anchor") {
      assert.equal(skin.assetRef, "", "fairy traces must not reuse the mooring-anchor image");
      assert.equal(skin.fallbackGlyph, "踪");
    } else {
      assert.match(
        skin.assetRef,
        new RegExp(
          `^/assets/board-themes/cloud-harbor/nodes-v\\d+/${role}-v\\d+\\.png$`,
        ),
      );
    }
    assert.equal(skin.artMode, "complete");
    assert.equal(typeof skin.fallbackGlyph, "string");
    assert.ok(skin.fallbackGlyph.trim().length > 0);
    assert.equal(typeof skin.rimColor, "string");
    assert.ok(skin.rimColor.trim().length > 0);
  }

  const routeSkin = cloudTheme.routeSkin;
  assert.ok(routeSkin, "cloud-harbor must define a route skin");
  assert.match(
    routeSkin.textureAssetRef,
    /^\/assets\/board-themes\/cloud-harbor\/routes\/cloudway-texture-v\d+\.jpg$/,
  );
  assert.equal(routeSkin.presentation, "floating-cloudway");
  for (const colorKey of [
    "baseColor",
    "bankColor",
    "outlineColor",
    "highlightColor",
    "shadowColor",
    "activeColor",
  ]) {
    assert.equal(typeof routeSkin[colorKey], "string", `${colorKey} must be a string`);
    assert.ok(routeSkin[colorKey].trim().length > 0);
  }
  for (const metricKey of [
    "patternSize",
    "groundingWidth",
    "shadowWidth",
    "bankWidth",
    "outlineWidth",
    "baseWidth",
    "textureWidth",
    "shadowOffsetY",
    "groundingOpacity",
    "shadowOpacity",
    "bankOpacity",
    "outlineOpacity",
    "baseOpacity",
    "textureOpacity",
    "highlightOpacity",
  ]) {
    assert.equal(Number.isFinite(routeSkin[metricKey]), true);
    assert.ok(routeSkin[metricKey] > 0, `${metricKey} must be positive`);
  }

  assert.doesNotMatch(
    JSON.stringify(BOARD_TEMPLATE),
    /nodeSkins|routeSkin|textureAssetRef|assetRef/,
    "BoardTemplate topology and geometry must not own theme artwork",
  );
});

test("enabled semantic ImageGen assets are unique square runtime RGBA PNGs", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];
  const hashes = new Set();
  let enabledAssetCount = 0;

  for (const [kind, skin] of Object.entries(cloudTheme.nodeSkins || {})) {
    if (!skin.assetRef) continue;
    enabledAssetCount += 1;
    const buffer = readFileSync(
      new URL(`../public${skin.assetRef}`, import.meta.url),
    );
    const image = pngInfo(buffer, `${kind} node skin`);
    assert.deepEqual(
      { width: image.width, height: image.height },
      { width: 256, height: 256 },
      `${kind} must retain the optimized 256 px square runtime contract`,
    );
    assert.equal(image.colorType, 6, `${kind} must retain an RGBA alpha channel`);
    hashes.add(createHash("sha256").update(buffer).digest("hex"));
  }

  assert.equal(
    hashes.size,
    enabledAssetCount,
    "every enabled semantic ImageGen token must remain distinct",
  );
});

test("LearningPacks remain free of board and theme artwork fields", () => {
  const disallowedKeys = new Set([
    "assetRef",
    "artMode",
    "imageRef",
    "nodeSkins",
    "regionArt",
    "rimColor",
    "routeSkin",
    "textureAssetRef",
  ]);

  for (const learningPack of Object.values(LEARNING_PACKS)) {
    const keys = collectObjectKeys(learningPack);
    for (const key of disallowedKeys) {
      assert.equal(
        keys.has(key),
        false,
        `${learningPack.id} must not own visual field ${key}`,
      );
    }
  }
});

test("SVG node renderer composes complete ImageGen tokens over complete fallbacks", () => {
  const shapeSource = functionSource(appSource, "nodeShape");
  const activeKindSource = functionSource(appSource, "activeNodeKind");
  const outcomeKindSource = functionSource(appSource, "nodeVisualKindForOutcome");
  const compositionKindSource = functionSource(
    appSource,
    "nodeKindForComposition",
  );
  const activePresentationSource = functionSource(
    appSource,
    "activeNodePresentation",
  );
  const boardRendererSource = functionSource(appSource, "renderBoard");
  for (const kind of [
    "coin",
    "gem",
    "event",
    "mooring",
    "foghorn",
    "cloud-gate",
    "anchor",
    "key",
    "home",
    "portal",
    "learning",
    "junction",
    "item",
    "transport",
  ]) {
    assert.match(
      shapeSource,
      new RegExp(`kind\\s*===\\s*["']${kind}["']`),
      `${kind} needs an explicit semantic shape`,
    );
  }
  assert.match(shapeSource, /svgElement\(\s*["']circle["']/);
  assert.match(shapeSource, /svgElement\(\s*["']path["']/);
  assert.match(shapeSource, /svgElement\(\s*["']rect["']/);
  assert.match(
    activeKindSource,
    /const baseKind = nodeKindForComposition\(activeWorldComposition,\s*nodeId,\s*fallback\)/,
  );
  assert.match(
    activeKindSource,
    /return cloudHarborNodeVisualKind\(nodeVisualKindForOutcome\(activeNodeOutcome\(nodeId\),\s*baseKind\), \{ theme, worldRef: activeWorldComposition\.worldRef \}\)/,
  );
  assert.match(
    outcomeKindSource,
    /return pointsOnlyNodeKind\(outcome, fallback\)/,
    "retired resource and fairy tokens must pass through the neutral presentation adapter",
  );
  assert.match(
    compositionKindSource,
    /isCloudHarborWorldRef\(composition\.worldRef\)[\s\S]*?return levelOneNodeKind\(nodeId,\s*fallback\)/,
  );
  assert.match(
    compositionKindSource,
    /composition\.level\.landingProfiles\?\.\[[\s\S]*?composition\.level\.nodeBindings\?\.\[nodeId\]\?\.rewardRef\s*\|\|\s*node\?\.landingProfileRef[\s\S]*?\]/,
  );
  for (const resource of ["coin", "star", "key"]) {
    assert.match(
      compositionKindSource,
      new RegExp(
        `profile\\?\\.rewards\\?\\.some\\(\\(\\{ resource \\}\\) => resource === "${resource}"\\)`,
      ),
    );
  }
  assert.match(activePresentationSource, /presentationForLevelOneNode\(nodeId, fallback\)/);
  assert.match(activePresentationSource, /presentationForExpansionNode\(nodeId, fallback\)/);
  assert.match(activePresentationSource, /pointsOnlyNodePresentation\(raw, activeNodeOutcome\(nodeId\)\)/);
  assert.match(
    boardRendererSource,
    /const kind = activeNodeKind\(space\.id,\s*space\.spaceRole\);[\s\S]*?const presentation = activeNodePresentation\(space\.id,\s*kind\);/,
  );
  assert.match(boardRendererSource, /["']data-treasure-kind["']:\s*kind/);
  assert.match(
    boardRendererSource,
    /["']data-reward-ref["']:\s*presentation\.rewardRef\s*\|\|\s*["']{2}/,
  );
  assert.match(
    boardRendererSource,
    /["']data-node-label["']:\s*presentation\.label/,
  );
  assert.match(
    boardRendererSource,
    /const outcome = activeNodeOutcome\(space\.id\)/,
  );
  assert.match(boardRendererSource, /["']data-outcome-kind["']:\s*outcome\.category/);
  assert.match(boardRendererSource, /["']data-outcome-trigger["']:\s*outcome\.trigger/);
  assert.match(boardRendererSource, /["']data-outcome-label["']:\s*outcome\.shortLabel/);
  assert.match(
    boardRendererSource,
    /label:\s*\([\s\S]{0,180}\$\{outcome\.badgeLabel\}：\$\{outcome\.shortLabel\}[\s\S]{0,120}outcome\.detail/,
  );
  assert.match(appSource, /import\s*\{\s*appendNodeVisualLayers\s*\}/);
  assert.match(
    appSource,
    /const\s+nodeSkin\s*=\s*theme\.nodeSkins\?\.\[kind\]\s*\|\|\s*null/,
  );
  assert.match(
    appSource,
    /appendNodeVisualLayers\(\s*group,\s*\{[\s\S]{0,360}assetRef:\s*nodeSkin\?\.assetRef\s*\|\|\s*["']{2}/,
  );
  assert.match(
    appSource,
    /artMode:\s*nodeSkin\?\.artMode\s*\|\|\s*["']interior["']/,
  );
  assert.match(
    appSource,
    /clipId:\s*`\$\{theme\.id\}-\$\{space\.id\}`/,
  );
  for (const layer of [
    "node-visual-shadow",
    "node-visual-base",
    "node-visual-art",
    "node-visual-rim",
    "node-visual-inset",
    "node-visual-detail",
    "node-visual-glyph",
    "node-visual-gloss",
  ]) {
    assert.match(nodeVisualSource, new RegExp(layer));
  }
  assert.match(nodeVisualSource, /svgElement\(\s*documentRef,\s*["']image["']/);
  assert.match(nodeVisualSource, /clipPathUnits:\s*["']userSpaceOnUse["']/);
  assert.match(nodeVisualSource, /preserveAspectRatio:\s*normalizedArtMode/);
  assert.match(nodeVisualSource, /["']xMidYMid slice["']/);
  assert.match(nodeVisualSource, /["']xMidYMid meet["']/);
  assert.match(nodeVisualSource, /has-complete-node-art/);
  assert.match(nodeVisualSource, /["']pointer-events["']:\s*["']none["']/);
  assert.doesNotMatch(
    appSource,
    /space-art-image/,
    "semantic map nodes must not regress to one role-wide generic image",
  );
});

test("SVG route renderer layers a masked texture and active outgoing flow over stable paths", () => {
  assert.match(appSource, /svgElement\(\s*["']pattern["']/);
  assert.match(appSource, /id:\s*["']route-texture-pattern["']/);
  assert.match(appSource, /patternUnits:\s*["']userSpaceOnUse["']/);
  assert.match(appSource, /svgElement\(\s*["']mask["']/);
  assert.match(appSource, /id:\s*["']route-texture-mask["']/);
  assert.match(appSource, /maskUnits:\s*["']userSpaceOnUse["']/);

  const routeLayerStart = appSource.indexOf('class: "route-layer"');
  assert.notEqual(routeLayerStart, -1, "missing route layer");
  const routeRendering = appSource.slice(routeLayerStart, routeLayerStart + 4200);
  for (const className of [
    "route-grounding",
    "route-shadow",
    "route-cloud-bank",
    "route-outline",
    "route-line",
    "route-texture",
    "route-highlight",
    "route-active-flow",
  ]) {
    assert.match(routeRendering, new RegExp(`class:\\s*["']${className}["']`));
  }
  assert.match(routeRendering, /fill:\s*["']url\(#route-texture-pattern\)["']/);
  assert.match(routeRendering, /mask:\s*["']url\(#route-texture-mask\)["']/);
  assert.match(routeRendering, /["']data-route-presentation["']:\s*routePresentation/);
  assert.match(routeRendering, /transform:\s*`translate\(0 \$\{shadowOffsetY\}\)`/);

  const artSceneSource = functionSource(appSource, "buildRegionArtScene");
  assert.match(artSceneSource, /routePathData\(routeEdges\)/);
  assert.match(appSource, /regionArtScene\(roadEdges\)/);

  assert.match(
    appSource,
    /const\s+activeNodeId\s*=\s*activePawnNodeId\(\)/,
    "active flow must follow the active pawn's visual node, including during movement",
  );
  assert.match(
    appSource,
    /\.filter\(\s*\(\s*edge\s*\)\s*=>\s*edge\.from\s*===\s*activeNodeId\s*\)/,
    "all outgoing branch choices must remain visible at a junction",
  );
});

test("region-backed boards ground the cloudway without expensive blend filters", () => {
  const cloudTheme = THEME_PACKS["cloud-harbor"];
  const routeTexture = readFileSync(
    new URL(`../public${cloudTheme.routeSkin.textureAssetRef}`, import.meta.url),
  );
  assert.equal(routeTexture[0], 0xff, "route material must be a JPEG");
  assert.equal(routeTexture[1], 0xd8, "route material must start with a JPEG SOI marker");

  assert.match(appSource, /["']data-has-region-art["']:\s*String\(hasRegionArt\)/);
  assert.match(stylesSource, /\.board-world\[data-has-region-art="true"\] \.terrain-decor/);
  assert.match(stylesSource, /\.board-world\[data-has-region-art="true"\] \.zone-field/);
  assert.match(stylesSource, /\.route-layer\[data-route-presentation="floating-cloudway"\] \.route-grounding/);
  assert.match(stylesSource, /\.route-layer\[data-route-presentation="floating-cloudway"\] \.route-cloud-bank/);
  assert.match(stylesSource, /mix-blend-mode:\s*normal/);
  assert.doesNotMatch(
    stylesSource,
    /\.route-layer\[data-route-presentation="floating-cloudway"\][\s\S]{0,260}filter:\s*blur/,
  );
});

test("board panning keeps permanent node filters off the paint path and coalesces input", () => {
  assert.match(stylesSource, /(?:^|\n)\.node-visual-token\s*\{/);
  assert.doesNotMatch(
    stylesSource,
    /\.node-visual-token\s*\{[^}]*\bfilter\s*:/s,
  );
  assert.match(
    stylesSource,
    /\.board-viewport\.is-panning \.board-world \*\s*\{[^}]*animation-play-state:\s*paused/s,
  );

  const beginPan = functionSource(appSource, "beginBoardPan");
  const movePan = functionSource(appSource, "moveBoardPan");
  assert.match(beginPan, /getScreenCTM\(\)/);
  assert.match(beginPan, /getBoundingClientRect\(\)/);
  assert.match(movePan, /requestAnimationFrame\(/);
  assert.doesNotMatch(movePan, /getScreenCTM\(\)|getBoundingClientRect\(\)/);
  assert.doesNotMatch(movePan, /applyCameraTransform\(\)/);
});

test("missing region or route images reveal fallbacks without changing topology or blocking play", () => {
  const regionFallback = functionSource(appSource, "showRegionArtFallback");
  const routeFallback = functionSource(appSource, "showRouteTextureFallback");
  const forbiddenTopologyWork = (
    /\brenderBoard\b|replaceChildren|BOARD_TEMPLATE\.(?:nodes|edges)|\b(?:routeLayer|spaceLayer)\b|\.remove\(|\bbusy\s*=|throw\b/
  );

  for (const [label, fallbackHandler] of [
    ["region", regionFallback],
    ["route", routeFallback],
  ]) {
    assert.match(fallbackHandler, /classList\.add\(\s*["']is-unavailable["']\s*\)/);
    assert.match(fallbackHandler, /removeAttribute\(\s*["']href["']\s*\)/);
    assert.doesNotMatch(
      fallbackHandler,
      forbiddenTopologyWork,
      `${label} image failure must remain a visual-only state change`,
    );
  }

  assert.match(
    appSource,
    /addEventListener\(\s*["']error["'][\s\S]{0,420}showRegionArtFallback\(/,
  );
  assert.match(
    appSource,
    /addEventListener\(\s*["']error["'][\s\S]{0,420}showRouteTextureFallback\(/,
  );
  const nodeArtFailure = nodeVisualSource.slice(
    nodeVisualSource.indexOf('artImage.addEventListener?.("error"'),
    nodeVisualSource.indexOf('artImage.addEventListener?.("error"') + 420,
  );
  assert.match(nodeArtFailure, /classList\?\.add\(\s*["']is-art-unavailable["']/);
  assert.match(nodeArtFailure, /removeAttribute\?\.\(\s*["']href["']/);
  assert.doesNotMatch(
    nodeArtFailure,
    /\brenderBoard\b|replaceChildren|BOARD_TEMPLATE|throw\b/,
    "node image failure must remain a visual-only fallback",
  );
  assert.match(nodeVisualSource, /space-glyph node-visual-layer node-visual-glyph/);
  assert.match(appSource, /class:\s*["']route-line["']/);
});

test("both cannon transport presenters carry the assigned complete character art", () => {
  const longTransport = functionSource(appSource, "playLongTransportMove");
  const localTransport = functionSource(appSource, "playTransportMove");

  for (const presenterSource of [longTransport, localTransport]) {
    assert.match(
      presenterSource,
      /const character = characterProfileForSeatIndex\(/,
      "each transport branch must resolve the active seat character locally",
    );
    assert.match(
      presenterSource,
      /appendHtmlCharacterPawnArt\(flightPawn,\s*character,\s*["']flight-pawn-art["']\)/,
      "the in-flight pawn must use the selected character asset",
    );
    assert.doesNotMatch(presenterSource, /\bprofile\.glyph\b/);
  }
  assert.match(
    longTransport,
    /appendHtmlCharacterPawnArt\(landingPawn,\s*character,\s*["']flight-pawn-art["']\)/,
  );
  assert.match(longTransport, /visitedNodeIds\.add\(effect\.toNodeId\)/);
  assert.match(localTransport, /visitedNodeIds\.add\(effect\.toNodeId\)/);
});

test("board, minimap, step motion, and image fallback preserve one character identity", () => {
  const boardRenderer = functionSource(appSource, "renderBoard");
  const miniRenderer = functionSource(appSource, "renderMiniMap");
  const stepPresenter = appSource.slice(
    appSource.indexOf("async function playPawnStep"),
    appSource.indexOf("async function playEventArrival"),
  );
  const imageFallback = functionSource(appSource, "configureCharacterArtImage");

  for (const renderer of [boardRenderer, miniRenderer]) {
    assert.match(renderer, /const character = characterProfileForSeatIndex\(index\)/);
    assert.match(renderer, /["']data-character-id["']:\s*character\.id/);
    assert.match(renderer, /appendSvgCharacterPawnArt\(/);
  }
  assert.match(
    stepPresenter,
    /appendHtmlCharacterPawnArt\(pawn,\s*character,\s*["']step-pawn-art["']\)/,
  );
  assert.match(imageFallback, /host\.dataset\.artState = ["']ready["']/);
  assert.match(imageFallback, /host\.dataset\.artState = ["']fallback["']/);
  assert.match(imageFallback, /image\.removeAttribute\(["']href["']\)/);
  assert.doesNotMatch(
    imageFallback,
    /\brenderBoard\b|replaceChildren|BOARD_TEMPLATE|throw\b/,
    "a character image failure must remain visual-only",
  );
  assert.doesNotMatch(
    boardRenderer,
    /M 0 -23 C 15 -23/,
    "the premium pawn must not be wrapped in the old generic map-pin shell",
  );
  assert.match(stylesSource, /\.pawn-turn-pedestal/);
  assert.match(stylesSource, /@keyframes pawn-character-stance/);
  assert.doesNotMatch(stylesSource, /pawn-beacon-turn/);
});

test("selection cards, player tabs, and score HUD resolve identity-specific art variants", () => {
  const assetResolver = functionSource(appSource, "characterAssetRefForVariant");
  const htmlAvatarStart = appSource.indexOf("function renderHtmlCharacterAvatar");
  const htmlAvatarEnd = appSource.indexOf(
    "\nfunction resetSpeechAttemptTracking",
    htmlAvatarStart,
  );
  assert.notEqual(htmlAvatarStart, -1);
  assert.notEqual(htmlAvatarEnd, -1);
  const htmlAvatarRenderer = appSource.slice(htmlAvatarStart, htmlAvatarEnd);
  const selectionRenderer = functionSource(appSource, "renderCharacterSelection");
  const hudRenderer = functionSource(appSource, "createPlayerHud");

  assert.match(assetResolver, /profile\.selectionAssetRef/);
  assert.match(assetResolver, /profile\.hudAssetRef/);
  assert.match(assetResolver, /profile\.pawnAssetRef/);
  assert.match(
    htmlAvatarRenderer,
    /host\.dataset\.characterId = profile\.id/,
  );
  assert.match(
    htmlAvatarRenderer,
    /host\.dataset\.characterVariant = variant/,
  );
  assert.match(
    htmlAvatarRenderer,
    /image\.src = characterAssetRefForVariant\(profile, variant\)/,
  );
  assert.match(selectionRenderer, /className: "character-option-avatar"/);
  assert.match(selectionRenderer, /variant: "selection"/);
  assert.match(selectionRenderer, /className: "player-tab-avatar"/);
  assert.match(selectionRenderer, /variant: "hud"/);
  assert.match(
    hudRenderer,
    /className: `team-token-preview team-token-preview-\$\{index % PLAYER_PROFILES\.length\}`/,
  );
  assert.match(hudRenderer, /variant: "hud"/);
  assert.doesNotMatch(selectionRenderer, /\.textContent\s*=\s*profile\.emoji/);
  assert.doesNotMatch(hudRenderer, /\.textContent\s*=\s*character\.emoji/);
  assert.match(stylesSource, /\.character-option-avatar \.character-avatar-art/);
  assert.match(stylesSource, /\.team-token-preview \.character-avatar-art/);
});

test("persistent harbor state is revealed with its matching facility presentation", () => {
  const acceptedTurn = functionSource(appSource, "runBoardTurn");

  assert.match(
    acceptedTurn,
    /persistStableSession\([\s\S]+?const revealHarborMapFields = \(\.\.\.fieldNames\) =>/,
    "the committed result must persist before presentation-only state staging",
  );
  for (const [presenter, stateField] of [
    ["playTransportMove", "cloudReefCleared"],
  ]) {
    assert.match(
      acceptedTurn,
      new RegExp(`await ${presenter}\\([\\s\\S]+?revealHarborMapFields\\([^\\n]+${stateField}`),
      `${stateField} must become visible only after ${presenter}`,
    );
  }
  assert.match(
    acceptedTurn,
    /revealHarborMapFields\("departureBeaconLit"\);[\s\S]+?await playDepartureBeacon\(/,
  );
  assert.match(
    acceptedTurn,
    /revealHarborMapFields\("cloudRouteOpen"\);[\s\S]+?const presenter = MAP_EFFECT_PRESENTERS/,
  );
});
