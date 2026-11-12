import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL(
  "../public/prototypes/universal-board/app.js",
  import.meta.url,
), "utf8");

const editorCoreSource = readFileSync(new URL(
  "../public/prototypes/universal-board/board-layout-editor-core.js",
  import.meta.url,
), "utf8");

const editorHtmlSource = readFileSync(new URL(
  "../public/prototypes/universal-board/index.html",
  import.meta.url,
), "utf8");

const editorStylesSource = readFileSync(new URL(
  "../public/prototypes/universal-board/styles.css",
  import.meta.url,
), "utf8");

function topLevelFunctionSource(name) {
  const declaration = new RegExp(
    `^(?:async\\s+)?function\\s+${name}\\s*\\(`,
    "m",
  );
  const match = declaration.exec(appSource);
  assert.ok(match, `expected app.js to declare ${name}()`);
  const remainder = appSource.slice(match.index);
  const nextLine = remainder.indexOf("\n") + 1;
  const nextDeclaration = remainder.slice(nextLine).search(
    /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m,
  );
  return nextDeclaration < 0
    ? remainder
    : remainder.slice(0, nextLine + nextDeclaration);
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

function stringConstant(name) {
  const match = new RegExp(`const ${name} = "([^"]+)";`).exec(appSource);
  assert.ok(match, `expected app.js to declare ${name}`);
  return match[1];
}

test("editor preview is separate from the formal board used by game rules", () => {
  assert.match(
    appSource,
    /let activeBoardTemplate = activeWorldComposition\.board;\s*let activeLevelPack = activeWorldComposition\.level;\s*let visualBoardTemplate = activeBoardTemplate;/,
  );

  const activateWorld = topLevelFunctionSource("activateWorldComposition");
  assert.match(activateWorld, /activeBoardTemplate = composition\.board;/);
  assert.match(activateWorld, /applyConfirmedVisualBoard\(composition\.worldRef\);/);

  const applyConfirmed = topLevelFunctionSource("applyConfirmedVisualBoard");
  assert.match(
    applyConfirmed,
    /visualBoardTemplate = applyBoardLayoutDraft\(\s*activeBoardTemplate,/,
  );
  assert.doesNotMatch(applyConfirmed, /activeBoardTemplate\s*=/);

  const confirmedVisual = topLevelFunctionSource("confirmedVisualLayout");
  assert.match(confirmedVisual, /published\?\.status === "active"/);
  assert.match(confirmedVisual, /layoutEditorAppliedStorageKey\(worldRef\)/);
  assert.doesNotMatch(confirmedVisual, /layoutEditorDraftStorageKey/);

  const applyPreview = topLevelFunctionSource("applyLayoutEditorPreview");
  assert.match(
    applyPreview,
    /if \(!layoutEditor\.active \|\| !layoutEditor\.baseBoard \|\| !layoutEditor\.draft\) return;/,
  );
  assert.match(
    applyPreview,
    /visualBoardTemplate = applyBoardLayoutDraft\(\s*layoutEditor\.baseBoard,/,
  );
  assert.match(
    applyPreview,
    /nodeById = new Map\(visualBoardTemplate\.nodes\.map/,
  );
  assert.doesNotMatch(applyPreview, /activeBoardTemplate\s*=/);

  const createRuntime = topLevelFunctionSource("createPrototypeRuntime");
  assert.match(createRuntime, /board: activeBoardTemplate,/);
  assert.doesNotMatch(createRuntime, /board: visualBoardTemplate/);

  const acceptedTurn = topLevelFunctionSource("runBoardTurn");
  assert.match(acceptedTurn, /walkBoardPlan\(\s*activeBoardTemplate,/);
  assert.match(acceptedTurn, /boardNodes: activeBoardTemplate\.nodes/);
  assert.match(acceptedTurn, /rollTeacherMove : acceptAnswer\)\(\{/);
  assert.match(acceptedTurn, /board: activeBoardTemplate,/);
  assert.doesNotMatch(acceptedTurn, /visualBoardTemplate/);
});

test("pawn presentation follows published visual anchors without changing rule topology", () => {
  const geometry = topLevelFunctionSource("visualPawnMovementGeometry");
  assert.match(geometry, /const fromNode = nodeById\.get\(fromNodeId\);/);
  assert.match(geometry, /const toNode = nodeById\.get\(toNodeId\);/);
  assert.match(geometry, /visualMovementEdge\(fromNodeId, toNodeId, edgeId\)/);
  assert.match(geometry, /pointsAlongSvgPath\(measurementPath, edge, fractions\)/);
  assert.match(geometry, /boardPointToFxPoint/);
  assert.doesNotMatch(geometry, /activeBoardTemplate\.nodes/);

  const step = topLevelFunctionSource("playPawnStep");
  assert.match(step, /const sourceNodeId = visualNodeId \|\| movingTeam\.nodeId;/);
  assert.match(step, /visualPawnMovementGeometry\(\{/);
  assert.match(step, /fromNodeId: sourceNodeId,/);
  assert.match(step, /toNodeId: effect\.nodeId,/);
  assert.match(step, /coordinateSource = "published-visual-board"/);
  assert.doesNotMatch(step, /targetSpace\.getBoundingClientRect/);
  assert.doesNotMatch(step, /activeBoardTemplate\.nodes/);
});

test("full-motion pawn steps settle in place without rebuilding and flashing the board", () => {
  const settle = topLevelFunctionSource("settlePawnStepPresentation");
  const step = topLevelFunctionSource("playPawnStep");

  assert.match(settle, /pawn\.setAttribute\("transform", transform\)/);
  assert.match(settle, /pawn\.style\.transition = "none"/);
  assert.match(settle, /requestAnimationFrame\(\(\) => \{/);
  assert.doesNotMatch(settle, /getBoundingClientRect/);
  assert.match(settle, /miniPawn\.setAttribute\("transform", transform\)/);
  assert.match(settle, /targetSpace\.classList\.add\("is-current", "is-visited"\)/);
  assert.match(settle, /routeLayer\.querySelectorAll\("\.route-active-flow"\)/);
  assert.doesNotMatch(settle, /renderBoard|replaceChildren/);
  assert.match(
    step,
    /if \(!settlePawnStepPresentation\(movingTeam, effect\.nodeId, teamIndex\)\) \{\s*renderBoard\(\);\s*\}/,
  );
  assert.doesNotMatch(editorStylesSource, /@keyframes\s+current-space-pulse/);
  assert.match(
    editorStylesSource,
    /\.board-space\.is-current \.space-state-halo\s*\{\s*opacity:\s*\.82;\s*\}/,
  );
  assert.doesNotMatch(editorStylesSource, /animation:\s*premium-node-pulse 1\.8s/);
});

test("layout editor authorization is fail-closed and limited to QA or owner", () => {
  const initialize = topLevelFunctionSource("initializeSpeechAvailability");
  assert.match(initialize, /fetch\("\/api\/config", \{ cache: "no-store" \}\)/);
  assert.match(initialize, /fetch\("\/api\/auth\/me", \{ cache: "no-store" \}\)/);
  assert.match(initialize, /qaControlsEnabled = configuration\.qaEnabled === true;/);
  assert.match(initialize, /\(qaControlsEnabled && QA_PAGE_REQUESTED\)/);
  assert.match(initialize, /auth\.authenticated === true/);
  assert.match(initialize, /auth\.user\?\.role === "owner"/);
  assert.match(initialize, /catch \{[\s\S]*layoutEditorAuthorized = false;/);
  assert.match(
    initialize,
    /if \(LAYOUT_EDITOR_REQUESTED && layoutEditorAuthorized && !layoutEditor\.active\) \{\s*requestAnimationFrame\(openLayoutEditor\);/,
  );

  const renderControls = topLevelFunctionSource("renderSpeechControls");
  assert.match(
    renderControls,
    /nodes\.layoutEditorOpen\.hidden = !\(\s*layoutEditorAuthorized\s*&& !gameSession\s*&& !layoutEditor\.active\s*\);/,
  );

  const openEditor = topLevelFunctionSource("openLayoutEditor");
  for (const guard of [
    "!layoutEditorAuthorized",
    "layoutEditor.active",
    "gameSession",
    "busy",
    "sentenceListener",
    "pendingSpeechDecision",
    "pendingDiceChoice",
    "pendingRouteChoice",
  ]) {
    assert.ok(openEditor.includes(guard), `openLayoutEditor must guard ${guard}`);
  }
});

test("layout drafts and formal session snapshots use isolated localStorage keys", () => {
  const sessionKey = stringConstant("LOCAL_SESSION_KEY");
  const draftPrefix = stringConstant("LOCAL_LAYOUT_DRAFT_PREFIX");
  const appliedPrefix = stringConstant("LOCAL_LAYOUT_APPLIED_PREFIX");
  assert.notEqual(sessionKey, draftPrefix);
  assert.notEqual(draftPrefix, appliedPrefix);
  assert.equal(sessionKey, "tim.voice-board.local-session.v1");
  assert.equal(draftPrefix, "tim.voice-board.board-layout-draft.v1:");

  const storageKey = topLevelFunctionSource("layoutEditorDraftStorageKey");
  assert.match(storageKey, /split\("@"\)\[0\]/);
  assert.match(storageKey, /LOCAL_LAYOUT_DRAFT_PREFIX/);
  assert.doesNotMatch(storageKey, /LOCAL_SESSION_KEY/);

  const loadDraft = topLevelFunctionSource("loadLayoutEditorDraft");
  assert.match(loadDraft, /loadLocalAuthoringDraft\(\{/);
  assert.match(loadDraft, /storageKey: layoutEditorDraftStorageKey\(layoutEditor\.worldRef\)/);
  assert.match(loadDraft, /sourceRevision: layoutEditor\.publishedRevision/);
  assert.match(loadDraft, /sourceValue: blank/);
  assert.doesNotMatch(loadDraft, /LOCAL_SESSION_KEY/);

  const persistDraft = topLevelFunctionSource("persistLayoutEditorDraft");
  assert.match(persistDraft, /persistLocalAuthoringDraft\(\{/);
  assert.match(
    persistDraft,
    /storageKey: layoutEditorDraftStorageKey\(layoutEditor\.worldRef\)/,
  );
  assert.match(persistDraft, /sourceRevision: layoutEditor\.publishedRevision/);
  assert.match(persistDraft, /sourceValue: layoutEditor\.publishedDraft/);
  assert.doesNotMatch(
    persistDraft,
    /LOCAL_SESSION_KEY|persistStableSession|gameSession|\bruntime\b/,
  );

  const sessionPayload = topLevelFunctionSource("savedSessionPayload");
  assert.match(sessionPayload, /runtime: runtimeValue,/);
  assert.match(sessionPayload, /gameSession: sessionValue,/);
  assert.doesNotMatch(sessionPayload, /layoutEditor|nodePositions|layoutDraft/);

  const persistSession = topLevelFunctionSource("persistStableSession");
  assert.match(
    persistSession,
    /window\.localStorage\.setItem\(LOCAL_SESSION_KEY, JSON\.stringify\(payload\)\)/,
  );
  assert.doesNotMatch(
    persistSession,
    /LOCAL_LAYOUT_DRAFT_PREFIX|layoutEditorDraftStorageKey|persistLayoutEditorDraft/,
  );
});

test("layout editor has a prominent explicit publish action", () => {
  assert.match(
    editorHtmlSource,
    /id="layout-editor-save"[\s\S]*保存并应用到棋盘/,
  );
  assert.match(
    editorHtmlSource,
    /id="layout-editor-save-state"[\s\S]*role="status"[\s\S]*aria-live="polite"/,
  );
  assert.match(
    editorStylesSource,
    /\.layout-editor-save-bar\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*0;/,
  );

  const explicitSave = topLevelFunctionSource("saveLayoutEditorDraft");
  assert.match(explicitSave, /persistLayoutEditorDraft\(\)/);
  assert.match(explicitSave, /await publishLayoutEditorDraft\(\)/);
  assert.match(explicitSave, /layoutEditor\.savedRevision = layoutEditor\.revision;/);
  assert.match(explicitSave, /已保存并应用到正式棋盘/);
  assert.doesNotMatch(
    explicitSave,
    /activeBoardTemplate\s*=|LOCAL_SESSION_KEY|persistStableSession|gameSession\s*=/,
  );
  assert.ok(
    appSource.includes(
      'nodes.layoutEditorSave.addEventListener("click", saveLayoutEditorDraft);',
    ),
  );

  const keyboard = topLevelFunctionSource("handleLayoutEditorGlobalKeydown");
  assert.match(keyboard, /event\.key\.toLowerCase\(\) === "s"/);
  assert.match(keyboard, /saveLayoutEditorDraft\(\);/);
});

test("pointermove is rAF-throttled and pointerup commits one persisted change", () => {
  const moveDrag = topLevelFunctionSource("moveLayoutNodeDrag");
  assert.match(moveDrag, /gesture\.pendingClientX = event\.clientX;/);
  assert.match(moveDrag, /gesture\.pendingClientY = event\.clientY;/);
  assert.equal(occurrenceCount(moveDrag, "requestAnimationFrame("), 1);
  assert.match(moveDrag, /applyLayoutNodeDragSample\(gesture\);/);
  assert.doesNotMatch(
    moveDrag,
    /persistLayoutEditorDraft|localStorage|renderBoard|replaceChildren/,
  );

  const sampleDrag = topLevelFunctionSource("applyLayoutNodeDragSample");
  assert.match(sampleDrag, /updateBoardLayoutDraft\(/);
  assert.match(sampleDrag, /applyLayoutEditorPreview\(\);/);
  assert.match(sampleDrag, /updateLayoutEditorPreviewDom\(gesture\.nodeId\);/);
  assert.doesNotMatch(sampleDrag, /persistLayoutEditorDraft|localStorage|renderBoard/);

  const endDrag = topLevelFunctionSource("endLayoutNodeDrag");
  assert.match(endDrag, /flushLayoutNodeDragSample\(gesture\);/);
  assert.equal(occurrenceCount(endDrag, "recordLayoutEditorChange("), 1);
  assert.doesNotMatch(endDrag, /persistLayoutEditorDraft|localStorage/);

  const recordChange = topLevelFunctionSource("recordLayoutEditorChange");
  assert.equal(occurrenceCount(recordChange, "persistLayoutEditorDraft("), 1);
  assert.match(recordChange, /applyLayoutEditorPreview\(\{ fullRender: true \}\);/);

  const movePan = topLevelFunctionSource("moveBoardPan");
  assert.match(
    movePan,
    /if \(layoutEditor\.gesture && moveLayoutNodeDrag\(event\)\) return;/,
  );
  const endPan = topLevelFunctionSource("endBoardPan");
  assert.match(endPan, /cancel: event\.type !== "pointerup"/);

  for (const registration of [
    "nodes.boardViewport.addEventListener(\"pointermove\", moveBoardPan);",
    "nodes.boardViewport.addEventListener(\"pointerup\", endBoardPan);",
    "nodes.boardViewport.addEventListener(\"pointercancel\", endBoardPan);",
    "nodes.boardViewport.addEventListener(\"lostpointercapture\", endBoardPan);",
  ]) {
    assert.ok(appSource.includes(registration), `missing gesture registration: ${registration}`);
  }
});

test("node edits synchronize authored paths, route masks, minimap, and node fixtures", () => {
  assert.match(
    appSource,
    /import \{[\s\S]*applyBoardLayoutDraft,[\s\S]*\} from "\.\/board-layout-editor-core\.js";/,
  );
  assert.match(editorCoreSource, /if \(!edge\.pathData\) return edge;/);
  assert.match(
    editorCoreSource,
    /const pathData = rebaseAbsoluteBoardPath\(edge\.pathData, fromDelta, toDelta\);/,
  );

  const visibleEdges = topLevelFunctionSource("visibleBoardEdges");
  assert.match(visibleEdges, /return visualBoardTemplate\.edges\.filter/);

  const miniMap = topLevelFunctionSource("renderMiniMap");
  assert.match(miniMap, /viewportSize\(cameraBoardTemplate\(\)\)/);
  const cameraBoard = topLevelFunctionSource("cameraBoardTemplate");
  assert.match(cameraBoard, /if \(layoutEditor\.active\) return visualBoardTemplate;/);
  assert.match(cameraBoard, /fitCameraViewport\(visualBoardTemplate, cameraCanvasSize\.width, cameraCanvasSize\.height\)/);
  assert.match(miniMap, /\(visualBoardTemplate\.zones \|\| \[\]\)\.forEach/);
  assert.match(miniMap, /visibleBoardEdges\(\)\.forEach/);
  assert.match(miniMap, /d: edgePath\(edge\),/);
  assert.match(miniMap, /"data-edge-id": edge\.id/);
  assert.match(miniMap, /visualBoardTemplate\.nodes\.forEach/);
  assert.match(miniMap, /"data-node-id": space\.id/);

  const buildArt = topLevelFunctionSource("buildRegionArtScene");
  assert.match(buildArt, /id: "route-texture-mask"/);
  assert.match(buildArt, /d: routePathData\(routeEdges\),/);
  assert.match(buildArt, /class: "route-texture-mask-shape"/);
  assert.match(buildArt, /\(visualBoardTemplate\.artRegions \|\| \[\]\)\.forEach/);

  const artScene = topLevelFunctionSource("regionArtScene");
  assert.match(
    artScene,
    /layoutEditor\.active \? `layout-\$\{layoutEditor\.revision\}:/,
  );

  const updateRoutes = topLevelFunctionSource("updateLayoutEditorRouteDom");
  for (const routeClass of [
    ".route-grounding",
    ".route-shadow",
    ".route-cloud-bank",
    ".route-outline",
    ".route-line",
    ".route-highlight",
    ".route-texture-mask-shape",
  ]) {
    assert.ok(updateRoutes.includes(routeClass), `route sync must update ${routeClass}`);
  }
  assert.match(updateRoutes, /new Map\(visualBoardTemplate\.edges\.map/);
  assert.match(updateRoutes, /element\.setAttribute\("d", edgePath\(edge\)\)/);
  assert.match(
    updateRoutes,
    /nodes\.board\.querySelectorAll\("\[data-edge-id\]"\)\.forEach\(updateEdgeElement\);/,
  );
  assert.match(
    updateRoutes,
    /nodes\.miniMap\.querySelectorAll\("\[data-edge-id\]"\)\.forEach\(updateEdgeElement\);/,
  );

  const updateFixtures = topLevelFunctionSource("updateLayoutEditorFacilityDom");
  assert.match(updateFixtures, /data-item-node-id/);
  assert.match(updateFixtures, /data-transport-node-id/);
  assert.match(updateFixtures, /data-map-effect-node-id/);

  const updatePreview = topLevelFunctionSource("updateLayoutEditorPreviewDom");
  assert.match(updatePreview, /nodes\.board\.querySelector\(`\.board-space\[data-node-id=/);
  assert.match(updatePreview, /nodes\.miniMap\.querySelector\(`\.mini-space\[data-node-id=/);
  assert.match(updatePreview, /updateLayoutEditorFacilityDom\(nodeId\);/);
  assert.match(updatePreview, /updateLayoutEditorRouteDom\(\);/);
});

test("normal game applies only confirmed visual layouts while rules stay authoritative", () => {
  assert.equal(occurrenceCount(appSource, "LAYOUT_EDITOR_REQUESTED"), 3);
  const autoResume = topLevelFunctionSource("restoreLocalSessionOnStartup");
  assert.equal(occurrenceCount(autoResume, "LAYOUT_EDITOR_REQUESTED"), 1);
  assert.match(autoResume, /if \(gameSession \|\| sessionConfigurationLoading \|\| LAYOUT_EDITOR_REQUESTED/);

  const switchWorld = topLevelFunctionSource("switchLayoutEditorWorld");
  assert.match(
    switchWorld,
    /if \(!layoutEditor\.active \|\| !LAYOUT_EDITOR_WORLD_REFS\.includes\(worldRef\)\) return;/,
  );
  assert.match(switchWorld, /layoutEditor\.draft = loadLayoutEditorDraft\(\);/);
  assert.match(switchWorld, /applyLayoutEditorPreview\(\);/);

  const applyPreview = topLevelFunctionSource("applyLayoutEditorPreview");
  assert.match(applyPreview, /^function applyLayoutEditorPreview[\s\S]*if \(!layoutEditor\.active/);

  const activateWorld = topLevelFunctionSource("activateWorldComposition");
  assert.match(activateWorld, /applyConfirmedVisualBoard\(composition\.worldRef\);/);

  const loadPublished = topLevelFunctionSource("loadPublishedBoardLayouts");
  assert.match(loadPublished, /fetch\("\/api\/board-layouts\/v1"/);
  assert.match(loadPublished, /catch \{[\s\S]*?boardLayoutRegistryError =[\s\S]*?return false;/);
  assert.match(loadPublished, /finally \{\s*renderLayoutRegistryStatus\(\);/);

  const publish = topLevelFunctionSource("publishLayoutEditorDraft");
  assert.match(publish, /fetch\(boardLayoutEndpointForWorld\(layoutEditor\.worldRef, \{ admin: true \}\)/);
  assert.match(publish, /method: "PUT"/);
  assert.match(publish, /expectedUserId: layoutEditorOwnerUserId/);
  assert.match(publish, /expectedRevision: layoutEditor\.publishedRevision/);
  assert.match(publish, /draft: orderedLayoutEditorDraft\(layoutEditor\.draft\)/);
  assert.match(publish, /if \(!response\.ok\)/);
  assert.match(publish, /publishedBoardLayouts\.set\(publication\.worldRef, publication\)/);

  const promoteLegacy = topLevelFunctionSource("promoteLegacyWorkingLayouts");
  assert.match(promoteLegacy, /!layoutEditorOwnerUserId \|\| !boardLayoutRegistryLoaded/);
  assert.match(promoteLegacy, /\?\.status !== "empty"/);
  assert.match(promoteLegacy, /layoutEditorAppliedStorageKey\(worldRef\)/);
  assert.match(promoteLegacy, /layoutEditorDraftStorageKey\(worldRef\)/);

  const closeEditor = topLevelFunctionSource("closeLayoutEditor");
  assert.match(closeEditor, /applyConfirmedVisualBoard\(activeWorldComposition\.worldRef\);/);
  assert.match(closeEditor, /searchParams\.delete\("layoutEditor"\)/);

  const initialize = topLevelFunctionSource("initializeSpeechAvailability");
  assert.match(
    initialize,
    /if \(auth\.authenticated === true\) \{\s*\[\s*layoutsLoaded,\s*dicePackLoaded,\s*nodeRewardPackLoaded,\s*cardCatalogLoaded,\s*\] = await Promise\.all\(\[\s*loadPublishedBoardLayouts\(\),\s*loadPublishedDicePack\(\),\s*loadPublishedNodeRewardPack\(\),\s*Promise\.resolve\(false\),\s*\]\);\s*void loadPublishedClassroomEventProgram\(\);\s*\}/,
  );
  assert.match(
    initialize,
    /if \(LAYOUT_EDITOR_REQUESTED && layoutEditorAuthorized && !layoutEditor\.active\)/,
  );

  const startupOffset = appSource.lastIndexOf("\nsyncResponsiveBoardControls();");
  assert.ok(startupOffset >= 0, "expected explicit application startup block");
  const startup = appSource.slice(startupOffset);
  assert.match(startup, /populateSelects\(\);\s*render\(\);\s*void initializeSpeechAvailability\(\);/);
  assert.doesNotMatch(startup, /loadLayoutEditorDraft|applyLayoutEditorPreview/);
});
