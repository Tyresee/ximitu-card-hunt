import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HARBOR_MAP_STATE_SCHEMA_VERSION,
  MAX_PROCESSED_HARBOR_SETTLEMENTS,
  createHarborMapState,
  legalMooringStops,
  settleHarborTurn,
} from "../public/prototypes/universal-board/harbor-items-core.js";

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

const HARBOR_BOARD_NODES = Object.freeze([
  { id: "n01", spaceRole: "learning" },
  { id: "n02", spaceRole: "reward" },
  { id: "n03", spaceRole: "item" },
  { id: "n04", spaceRole: "junction" },
  { id: "n05a", spaceRole: "learning" },
  { id: "n05b", spaceRole: "map-effect" },
  { id: "n06a", spaceRole: "transport" },
  { id: "n06b", spaceRole: "learning" },
  { id: "n07a", spaceRole: "reward" },
  { id: "n07b", spaceRole: "treasure" },
  { id: "n08", spaceRole: "learning" },
  { id: "n09", spaceRole: "reward" },
  { id: "n10", spaceRole: "junction" },
  { id: "n11b", spaceRole: "reward" },
  { id: "n12b", spaceRole: "map-effect" },
  { id: "n13b", spaceRole: "learning" },
  { id: "n14", spaceRole: "learning" },
  { id: "n15", spaceRole: "reward" },
  { id: "n16", spaceRole: "learning" },
  { id: "n17", spaceRole: "learning" },
  { id: "n18", spaceRole: "learning" },
  { id: "n19", spaceRole: "item" },
]);

function eventOf(result, type) {
  return result.events.find((event) => event.type === type);
}

function settle(overrides = {}) {
  return settleHarborTurn({
    mapState: createHarborMapState(),
    settlementId: "settlement-1",
    seatId: "seat-1",
    activeSeatCount: 1,
    effectiveTurn: 1,
    startNodeId: "n01",
    plannedRouteNodeIds: ["n02"],
    boardNodes: HARBOR_BOARD_NODES,
    ...overrides,
  });
}

test("local snapshots use schema v12 with a card catalog snapshot and migrate v4–v11", () => {
  const snapshotCompositionSource = functionSource(
    appSource,
    "snapshotWorldComposition",
  );
  const migratedV4Source = functionSource(appSource, "migratedV4Snapshot");
  const migratedV5Source = functionSource(appSource, "migratedV5Snapshot");
  const migratedV6Source = functionSource(appSource, "migratedV6Snapshot");
  const migratedV7Source = functionSource(appSource, "migratedV7Snapshot");
  const migratedV8Source = functionSource(appSource, "migratedV8Snapshot");
  const migratedV9Source = functionSource(appSource, "migratedV9Snapshot");
  const migratedV10Source = functionSource(appSource, "migratedV10Snapshot");
  const migratedV11Source = functionSource(appSource, "migratedV11Snapshot");
  const persistMigratedV6Source = functionSource(
    appSource,
    "persistMigratedV6Snapshot",
  );
  const persistMigratedV7Source = functionSource(
    appSource,
    "persistMigratedV7Snapshot",
  );
  const persistMigratedV8Source = functionSource(
    appSource,
    "persistMigratedV8Snapshot",
  );
  const persistMigratedV9Source = functionSource(
    appSource,
    "persistMigratedV9Snapshot",
  );
  const persistMigratedV10Source = functionSource(
    appSource,
    "persistMigratedV10Snapshot",
  );
  const persistMigratedV11Source = functionSource(
    appSource,
    "persistMigratedV11Snapshot",
  );
  const savedSessionSource = functionSource(appSource, "savedSessionPayload");
  const validSnapshotSource = functionSource(appSource, "validLocalSnapshot");
  const restoreSource = functionSource(appSource, "restoreLocalSession");

  assert.match(appSource, /const LOCAL_SESSION_SCHEMA_VERSION = 12;/);
  assert.match(
    appSource,
    /const LOCAL_SESSION_V6_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v6-backup`;/,
  );
  assert.match(
    appSource,
    /const LOCAL_SESSION_V7_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v7-backup`;/,
  );
  assert.match(
    appSource,
    /const LOCAL_SESSION_V8_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v8-backup`;/,
  );
  assert.match(
    appSource,
    /const LOCAL_SESSION_V9_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v9-backup`;/,
  );
  assert.match(
    appSource,
    /const LOCAL_SESSION_V10_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v10-backup`;/,
  );
  assert.match(
    appSource,
    /const LOCAL_SESSION_V11_BACKUP_KEY = `\$\{LOCAL_SESSION_KEY\}\.v11-backup`;/,
  );

  assert.match(
    snapshotCompositionSource,
    /payload\?\.runtime\?\.world\?\.active\?\.worldPackRef\s*\|\|\s*CLOUD_HARBOR_WORLD_REF/,
  );
  assert.match(
    snapshotCompositionSource,
    /resolveWorldComposition\(worldRef,\s*WORLD_REGISTRIES\)/,
  );

  for (const [sourceVersion, migrationSource] of [
    [4, migratedV4Source],
    [5, migratedV5Source],
    [6, migratedV6Source],
  ]) {
    assert.match(
      migrationSource,
      /schemaVersion:\s*LOCAL_SESSION_SCHEMA_VERSION/,
      `v${sourceVersion} must migrate directly to the current schema`,
    );
    assert.match(
      migrationSource,
      /const mapState = createHarborMapState\([^;]+\);/,
      `v${sourceVersion} must normalize the legacy harbor map state`,
    );
    assert.match(
      migrationSource,
      /world:\s*worldRuntimeState\(\{[\s\S]*?worldRef:\s*PREVIOUS_CLOUD_HARBOR_WORLD_REF,[\s\S]*?routeRef:\s*PREVIOUS_XIMITU_WORLD_ROUTE_REF,[\s\S]*?mapState,[\s\S]*?levelState:\s*LEVEL_ONE\.initialLevelState,[\s\S]*?\}\)/,
      `v${sourceVersion} must seed a canonical forward world runtime`,
    );
    assert.match(
      migrationSource,
      new RegExp(`sourceSchemaVersion:\\s*${sourceVersion}`),
    );
  }

  assert.match(migratedV5Source, /harborMapStateAdded:\s*true/);
  assert.match(migratedV6Source, /forwardWorldRuntimeAdded:\s*true/);
  assert.match(migratedV7Source, /sourceSchemaVersion:\s*7/);
  assert.match(migratedV7Source, /worldCompositionVersionUpdated:\s*true/);
  assert.match(
    migratedV7Source,
    /legacyWorld\.routeRef !== LEGACY_XIMITU_WORLD_ROUTE_REF/,
  );
  assert.match(
    migratedV7Source,
    /worldPackRef: entry\?\.worldPackRef === LEGACY_CLOUD_HARBOR_WORLD_REF[\s\S]*?\? PREVIOUS_CLOUD_HARBOR_WORLD_REF/,
  );
  assert.match(migratedV7Source, /routeRef:\s*PREVIOUS_XIMITU_WORLD_ROUTE_REF/);
  assert.match(migratedV8Source, /sourceSchemaVersion:\s*8/);
  assert.match(migratedV8Source, /dicePackSnapshotAdded:\s*true/);
  assert.match(migratedV8Source, /dicePackSnapshot:\s*createSessionDicePackSnapshot/);
  assert.match(migratedV9Source, /sourceSchemaVersion:\s*9/);
  assert.match(migratedV9Source, /nodeRewardPackSnapshotAdded:\s*true/);
  assert.match(
    migratedV9Source,
    /nodeRewardPackSnapshot:\s*createSessionNodeRewardPackSnapshot/,
  );
  assert.match(
    migratedV9Source,
    /classroomEventProgramSnapshot:\s*createSessionClassroomEventProgramSnapshot/,
  );
  assert.match(migratedV10Source, /sourceSchemaVersion:\s*10/);
  assert.match(migratedV10Source, /classroomEventProgramSnapshotAdded:\s*true/);
  assert.match(
    migratedV10Source,
    /classroomEventProgramSnapshot:\s*createSessionClassroomEventProgramSnapshot/,
  );
  assert.match(migratedV11Source, /sourceSchemaVersion:\s*11/);
  assert.match(migratedV11Source, /cardCatalogSnapshotAdded:\s*true/);
  assert.match(migratedV11Source, /classroomEventProgramMadeReadOnly:\s*true/);
  assert.match(
    migratedV11Source,
    /cardCatalogSnapshot:\s*createSessionCardCatalogSnapshot\(\)/,
  );

  assert.match(
    persistMigratedV6Source,
    /getItem\(LOCAL_SESSION_V6_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV6Source,
    /setItem\(LOCAL_SESSION_V6_BACKUP_KEY,\s*rawV6\)/,
  );
  assert.match(
    persistMigratedV6Source,
    /verified\?\.runtime\?\.world\?\.schemaVersion !== "world-runtime\.v1"/,
  );
  assert.match(
    persistMigratedV6Source,
    /verified\?\.runtime\?\.world\?\.active\?\.worldPackRef !== PREVIOUS_CLOUD_HARBOR_WORLD_REF/,
  );
  assert.match(
    persistMigratedV6Source,
    /setItem\(LOCAL_SESSION_KEY,\s*rawV6\)[\s\S]*throw new Error\("v6 migration could not be verified after local persistence"\)/,
  );
  assert.match(
    persistMigratedV7Source,
    /getItem\(LOCAL_SESSION_V7_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV7Source,
    /setItem\(LOCAL_SESSION_V7_BACKUP_KEY,\s*rawV7\)/,
  );
  assert.match(
    persistMigratedV7Source,
    /verified\?\.runtime\?\.world\?\.routeRef !== PREVIOUS_XIMITU_WORLD_ROUTE_REF/,
  );
  assert.match(
    persistMigratedV7Source,
    /worldPackRef === LEGACY_CLOUD_HARBOR_WORLD_REF/,
  );
  assert.match(
    persistMigratedV8Source,
    /getItem\(LOCAL_SESSION_V8_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV8Source,
    /normalizeSessionDicePackSnapshot\(verified\?\.dicePackSnapshot\)/,
  );
  assert.match(
    persistMigratedV9Source,
    /getItem\(LOCAL_SESSION_V9_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV9Source,
    /normalizeSessionDicePackSnapshot\(verified\?\.dicePackSnapshot\)/,
  );
  assert.match(
    persistMigratedV9Source,
    /normalizeSessionNodeRewardPackSnapshot\(verified\?\.nodeRewardPackSnapshot\)/,
  );
  assert.match(
    persistMigratedV9Source,
    /normalizeSessionClassroomEventProgramSnapshot\([\s\S]*?verified\?\.classroomEventProgramSnapshot/,
  );
  assert.match(
    persistMigratedV10Source,
    /getItem\(LOCAL_SESSION_V10_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV10Source,
    /setItem\(LOCAL_SESSION_V10_BACKUP_KEY,\s*rawV10\)/,
  );
  assert.match(
    persistMigratedV10Source,
    /normalizeSessionClassroomEventProgramSnapshot\([\s\S]*?verified\?\.classroomEventProgramSnapshot/,
  );
  assert.match(
    persistMigratedV11Source,
    /getItem\(LOCAL_SESSION_V11_BACKUP_KEY\)\s*===\s*null/,
  );
  assert.match(
    persistMigratedV11Source,
    /setItem\(LOCAL_SESSION_V11_BACKUP_KEY,\s*rawV11\)/,
  );
  assert.match(
    persistMigratedV11Source,
    /normalizeSessionCardCatalogSnapshot\(verified\?\.cardCatalogSnapshot\)/,
  );
  assert.match(
    savedSessionSource,
    /cardCatalogSnapshot:\s*sessionCardCatalogSnapshot[\s\S]*?createSessionCardCatalogSnapshot\(\)/,
  );
  assert.doesNotMatch(validSnapshotSource, /normalizeSessionCardCatalogSnapshot/);
  assert.match(restoreSource, /economyVersion: STAR_ECONOMY_VERSION/);

  assert.match(
    restoreSource,
    /!\[4,\s*5,\s*6,\s*7,\s*8,\s*9,\s*10,\s*11,\s*LOCAL_SESSION_SCHEMA_VERSION\]\.includes\(sourceSchemaVersion\)/,
  );
  for (const sourceVersion of [4, 5, 6, 7, 8, 9, 10, 11]) {
    assert.match(
      restoreSource,
      new RegExp(
        `sourceSchemaVersion === ${sourceVersion}[\\s\\S]*?`
        + `migratedV${sourceVersion}Snapshot\\(payload\\)[\\s\\S]*?`
        + `persistMigratedV${sourceVersion}Snapshot\\(rawSnapshot, migrated\\)`,
      ),
    );
  }
  assert.match(
    restoreSource,
    /isCloudHarborWorldRef\(restoredWorldRef\)[\s\S]*?\?\s*createHarborMapState\(restoredRuntime\.mapState\)[\s\S]*?:\s*structuredClone\(restoredRuntime\.world\?\.active\?\.mapState\s*\|\|\s*restoredRuntime\.mapState\s*\|\|\s*\{\}\)/,
  );
  assert.match(
    restoreSource,
    /activateWorldComposition\(restoredComposition\.worldRef,\s*\{/,
  );
});

test("map state normalization is immutable, bounded, and repairs safe invariants", () => {
  const processedSettlementIds = [
    ...Array.from({ length: 70 }, (_, index) => `settlement-${index}`),
    "settlement-69",
  ];
  const initial = {
    schemaVersion: "legacy",
    anchorGrantedBySeat: { "seat-granted": true },
    anchorHeldBySeat: {
      "seat-held": true,
      "seat-exited": true,
      ignored: false,
    },
    cloudReefCleared: true,
    cloudRouteOpen: true,
    departureBeaconLit: false,
    regionExitSeenBySeat: { "seat-exited": true },
    foghornHoldThroughTurn: 9,
    processedSettlementIds,
  };
  const before = structuredClone(initial);

  const state = createHarborMapState(initial);

  assert.deepEqual(initial, before);
  assert.equal(state.schemaVersion, HARBOR_MAP_STATE_SCHEMA_VERSION);
  assert.deepEqual(state.anchorGrantedBySeat, {
    "seat-granted": true,
    "seat-held": true,
    "seat-exited": true,
  });
  assert.deepEqual(state.anchorHeldBySeat, {
    "seat-held": true,
    "seat-exited": true,
  });
  assert.equal(state.departureBeaconLit, true);
  assert.equal(state.foghornTriggered, true);
  assert.equal(
    state.processedSettlementIds.length,
    MAX_PROCESSED_HARBOR_SETTLEMENTS,
  );
  assert.equal(state.processedSettlementIds[0], "settlement-6");
  assert.equal(state.processedSettlementIds.at(-1), "settlement-69");
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.anchorHeldBySeat), true);
  assert.equal(Object.isFrozen(state.processedSettlementIds), true);
  assert.throws(() => {
    state.cloudRouteOpen = false;
  }, TypeError);
});

test("retired mooring compatibility returns no stopping choices for any route", () => {
  for (const route of [[], ["n05b"], ["n01", "n02", "n03", "n05a", "n06a", "n07a"]]) {
    const stops = legalMooringStops({
      startNodeId: "n01",
      plannedRouteNodeIds: route,
      boardNodes: HARBOR_BOARD_NODES,
    });
    assert.deepEqual(stops, []);
    assert.equal(Object.isFrozen(stops), true);
  }
  assert.deepEqual(legalMooringStops(), []);
});

test("passing or landing on n03 never grants an anchor or shortens the dice route", () => {
  for (const route of [["n03"], ["n03", "n04"]]) {
    const initial = createHarborMapState();
    const result = settle({
      mapState: initial,
      settlementId: `retired-grant-${route.length}`,
      startNodeId: "n02",
      plannedRouteNodeIds: route,
      mooringSelection: { status: "selected", routeIndex: 0, nodeId: "n03" },
    });
    assert.equal(result.mooringOutcome, "retired");
    assert.deepEqual(result.committedRouteNodeIds, route);
    assert.equal(result.landingNodeId, route.at(-1));
    assert.equal(result.settledNodeId, route.at(-1));
    assert.deepEqual(result.mapState.anchorGrantedBySeat, {});
    assert.deepEqual(result.mapState.anchorHeldBySeat, {});
    assert.deepEqual(result.events, []);
    assert.deepEqual(initial.processedSettlementIds, []);
  }
});

test("old held anchors and selected, invalid, retained or timed-out choices preserve full routes", () => {
  const heldState = createHarborMapState({
    anchorGrantedBySeat: { "seat-1": true },
    anchorHeldBySeat: { "seat-1": true },
  });
  const before = structuredClone(heldState);
  const route = ["n11b", "n12b"];
  const edges = ["e10b", "e11b"];
  const legacyChoices = [
    { status: "selected", routeIndex: 0, nodeId: "n11b" },
    { status: "selected", routeIndex: 99, nodeId: "n99" },
    { status: "selected", routeIndex: 0, nodeId: "wrong-node" },
    { status: "timeout" },
    { status: "retained" },
    null,
  ];
  for (const [index, mooringSelection] of legacyChoices.entries()) {
    const result = settle({
      mapState: heldState,
      settlementId: `retired-choice-${index}`,
      startNodeId: "n10",
      plannedRouteNodeIds: route,
      plannedRouteEdgeIds: edges,
      mooringSelection,
    });
    assert.equal(result.mooringOutcome, "retired");
    assert.deepEqual(result.legalMooringStops, []);
    assert.deepEqual(result.plannedRouteNodeIds, route);
    assert.deepEqual(result.committedRouteNodeIds, route);
    assert.deepEqual(result.plannedRouteEdgeIds, edges);
    assert.deepEqual(result.committedRouteEdgeIds, edges);
    assert.equal(result.landingNodeId, "n12b");
    assert.equal(result.settledNodeId, "n12b");
    assert.equal(result.mapState.cloudRouteOpen, true);
    assert.deepEqual(result.events.map(({ type }) => type), ["cloudfall_gate"]);
    assert.equal(eventOf(result, "cloudfall_gate").routeIndex, 1);
    assert.deepEqual(result.mapState.anchorHeldBySeat, heldState.anchorHeldBySeat);
    assert.deepEqual(result.mapState.anchorGrantedBySeat, heldState.anchorGrantedBySeat);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.events), true);
  }
  assert.deepEqual(heldState, before);
});

test("an old anchor selection cannot trigger a facility passed before the true landing", () => {
  const result = settle({
    mapState: createHarborMapState({ anchorHeldBySeat: { "seat-1": true } }),
    settlementId: "retired-early-foghorn",
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b", "n06b", "n07b"],
    plannedRouteEdgeIds: ["e04b", "e05b", "e06b"],
    fairyActive: true,
    mooringSelection: { status: "selected", routeIndex: 0, nodeId: "n05b" },
  });
  assert.deepEqual(result.committedRouteNodeIds, ["n05b", "n06b", "n07b"]);
  assert.deepEqual(result.committedRouteEdgeIds, ["e04b", "e05b", "e06b"]);
  assert.equal(result.settledNodeId, "n07b");
  assert.equal(result.mapState.foghornTriggered, false);
  assert.equal(result.mapState.foghornHoldThroughTurn, 0);
  assert.deepEqual(result.events, []);
});

test("replaying an old committed mooring settlement never recomputes movement or facilities", () => {
  const historical = createHarborMapState({
    anchorGrantedBySeat: { "seat-1": true },
    anchorHeldBySeat: {},
    foghornTriggered: true,
    foghornHoldThroughTurn: 12,
    processedSettlementIds: ["historical-anchor-use"],
  });
  const result = settle({
    mapState: historical,
    settlementId: "historical-anchor-use",
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b", "n06b", "n07b"],
    plannedRouteEdgeIds: ["e04b", "e05b", "e06b"],
    mooringSelection: { status: "selected", routeIndex: 0, nodeId: "n05b" },
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.mooringOutcome, "duplicate");
  assert.equal(result.committedRouteNodeIds, null);
  assert.equal(result.committedRouteEdgeIds, null);
  assert.equal(result.landingNodeId, null);
  assert.equal(result.settledNodeId, null);
  assert.equal(result.transport, null);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.mapState, historical);
});

test("n06a clears the cloud reef once while every landing still reaches cold n09", () => {
  const first = settle({
    settlementId: "cannon-first",
    startNodeId: "n05a",
    plannedRouteNodeIds: ["n06a"],
  });
  const firstEvent = eventOf(first, "signal_cannon");

  assert.equal(first.mapState.cloudReefCleared, true);
  assert.deepEqual(first.committedRouteNodeIds, ["n06a"]);
  assert.equal(first.landingNodeId, "n06a");
  assert.equal(first.settledNodeId, "n09");
  assert.deepEqual(first.transport, {
    effectRef: "harbor.signal-cannon.v1",
    fromNodeId: "n06a",
    throughNodeIds: ["n08"],
    toNodeId: "n09",
    extraSpaces: 3,
    coldLanding: true,
  });
  assert.equal(firstEvent.firstTime, true);
  assert.equal(firstEvent.routeIndex, 0);
  assert.equal(firstEvent.animationVariant, "full");

  const repeated = settle({
    mapState: first.mapState,
    settlementId: "cannon-repeat",
    seatId: "seat-2",
    startNodeId: "n05a",
    plannedRouteNodeIds: ["n06a"],
  });
  const repeatedEvent = eventOf(repeated, "signal_cannon");
  assert.equal(repeatedEvent.firstTime, false);
  assert.equal(repeatedEvent.animationVariant, "short");
  assert.equal(repeated.settledNodeId, "n09");
  assert.equal(
    repeated.events.filter(({ type }) => type === "signal_cannon").length,
    1,
  );
});

test("signal-cannon settlement follows the authored transport target and capture path", () => {
  const authoredBoardNodes = HARBOR_BOARD_NODES.map((node) => (
    node.id === "n06a"
      ? {
          ...node,
          transportTargetId: "n15",
          transportCaptureNodeIds: ["n08", "n14"],
        }
      : node
  ));
  const result = settle({
    settlementId: "authored-cannon-route",
    startNodeId: "n05a",
    plannedRouteNodeIds: ["n06a"],
    boardNodes: authoredBoardNodes,
  });

  assert.equal(result.settledNodeId, "n15");
  assert.equal(result.transport.toNodeId, "n15");
  assert.deepEqual(result.transport.throughNodeIds, ["n08", "n14"]);
  assert.deepEqual(
    eventOf(result, "signal_cannon").throughNodeIds,
    ["n08", "n14"],
  );
});

test("n12b opens the shared route permanently and repeat landings request short presentation", () => {
  const first = settle({
    settlementId: "gate-first",
    startNodeId: "n11b",
    plannedRouteNodeIds: ["n12b"],
  });
  const firstEvent = eventOf(first, "cloudfall_gate");

  assert.equal(first.mapState.cloudRouteOpen, true);
  assert.equal(first.settledNodeId, "n12b");
  assert.equal(first.transport, null);
  assert.equal(firstEvent.firstTime, true);
  assert.equal(firstEvent.shortcutEdgeId, "e14c");
  assert.equal(firstEvent.shortcutFromNodeId, "n14");
  assert.equal(firstEvent.shortcutToNodeId, "n17");
  assert.equal(firstEvent.animationVariant, "full");

  const repeated = settle({
    mapState: first.mapState,
    settlementId: "gate-repeat",
    seatId: "seat-2",
    startNodeId: "n11b",
    plannedRouteNodeIds: ["n12b"],
  });
  const repeatedEvent = eventOf(repeated, "cloudfall_gate");
  assert.equal(repeated.mapState.cloudRouteOpen, true);
  assert.equal(repeatedEvent.firstTime, false);
  assert.equal(repeatedEvent.animationVariant, "short");
  assert.equal(
    repeated.events.filter(({ type }) => type === "cloudfall_gate").length,
    1,
  );
});

test("foghorn hold uses max(current expiry, effective turn plus active seats)", () => {
  for (let activeSeatCount = 1; activeSeatCount <= 8; activeSeatCount += 1) {
    const result = settle({
      settlementId: `foghorn-${activeSeatCount}`,
      activeSeatCount,
      effectiveTurn: 100,
      startNodeId: "n04",
      plannedRouteNodeIds: ["n05b"],
      fairyActive: true,
    });
    assert.equal(
      result.mapState.foghornHoldThroughTurn,
      100 + activeSeatCount,
    );
  }

  const existingLongerHold = createHarborMapState({
    foghornTriggered: true,
    foghornHoldThroughTurn: 20,
  });
  const unchanged = settle({
    mapState: existingLongerHold,
    settlementId: "foghorn-max-unchanged",
    activeSeatCount: 8,
    effectiveTurn: 10,
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b"],
    fairyActive: true,
  });
  assert.equal(unchanged.mapState.foghornHoldThroughTurn, 20);

  const extended = settle({
    mapState: unchanged.mapState,
    settlementId: "foghorn-max-extended",
    activeSeatCount: 8,
    effectiveTurn: 15,
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b"],
    fairyActive: true,
  });
  assert.equal(extended.mapState.foghornHoldThroughTurn, 23);
  assert.equal(eventOf(extended, "harbor_foghorn").previousHoldThroughTurn, 20);
  assert.equal(eventOf(extended, "harbor_foghorn").firstTime, false);

  const noFairy = settle({
    mapState: extended.mapState,
    settlementId: "foghorn-reveal-only",
    activeSeatCount: 8,
    effectiveTurn: 50,
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b"],
    fairyActive: false,
  });
  assert.equal(noFairy.mapState.foghornHoldThroughTurn, 23);
  assert.equal(eventOf(noFairy, "harbor_foghorn").targetMode, "reveal");
});

test("crossing n18 to n19 lights once for 1-8 seats without changing retired anchor history", () => {
  const seatIds = Array.from({ length: 8 }, (_, index) => `seat-${index + 1}`);
  let mapState = createHarborMapState({
    anchorGrantedBySeat: Object.fromEntries(
      seatIds.map((seatId) => [seatId, true]),
    ),
    anchorHeldBySeat: Object.fromEntries(
      seatIds.map((seatId) => [seatId, true]),
    ),
  });

  for (const [index, seatId] of seatIds.entries()) {
    const result = settle({
      mapState,
      settlementId: `departure-${index + 1}`,
      seatId,
      activeSeatCount: seatIds.length,
      effectiveTurn: index + 1,
      startNodeId: "n18",
      plannedRouteNodeIds: ["n19"],
    });
    const beacon = eventOf(result, "departure_beacon");
    const returned = eventOf(result, "mooring_anchor_returned");
    assert.equal(beacon.firstTime, index === 0);
    assert.equal(beacon.seatFirstTime, true);
    assert.equal(beacon.routeIndex, 0);
    assert.equal(beacon.animationVariant, index === 0 ? "full" : "short");
    assert.equal(returned, undefined);
    assert.equal(result.mapState.anchorHeldBySeat[seatId], true);
    mapState = result.mapState;
  }

  assert.equal(mapState.departureBeaconLit, true);
  assert.deepEqual(
    Object.keys(mapState.regionExitSeenBySeat).sort(),
    [...seatIds].sort(),
  );
  assert.deepEqual(
    mapState.anchorHeldBySeat,
    Object.fromEntries(seatIds.map((seatId) => [seatId, true])),
  );

  const repeatedSeat = settle({
    mapState,
    settlementId: "departure-repeat-seat",
    seatId: "seat-1",
    activeSeatCount: 8,
    effectiveTurn: 9,
    startNodeId: "n18",
    plannedRouteNodeIds: ["n19"],
  });
  assert.equal(eventOf(repeatedSeat, "departure_beacon"), undefined);
  assert.equal(eventOf(repeatedSeat, "mooring_anchor_returned"), undefined);

  const stopsAtBoundary = settle({
    mapState: createHarborMapState({
      anchorGrantedBySeat: { "seat-9": true },
      anchorHeldBySeat: { "seat-9": true },
    }),
    settlementId: "departure-not-yet",
    seatId: "seat-9",
    startNodeId: "n17",
    plannedRouteNodeIds: ["n18"],
  });
  assert.equal(stopsAtBoundary.mapState.departureBeaconLit, false);
  assert.equal(stopsAtBoundary.mapState.anchorHeldBySeat["seat-9"], true);
  assert.equal(eventOf(stopsAtBoundary, "departure_beacon"), undefined);
});

test("departure settlement trusts the committed e18 edge when edge ids are supplied", () => {
  const wrongEdge = settle({
    settlementId: "edge-proof-wrong",
    startNodeId: "n18",
    plannedRouteNodeIds: ["n19"],
    plannedRouteEdgeIds: ["not-e18"],
  });
  assert.equal(eventOf(wrongEdge, "departure_beacon"), undefined);

  const committed = settle({
    settlementId: "edge-proof-right",
    startNodeId: "n18",
    plannedRouteNodeIds: ["n19"],
    plannedRouteEdgeIds: ["e18"],
  });
  assert.equal(eventOf(committed, "departure_beacon").routeIndex, 0);
  assert.deepEqual(committed.committedRouteEdgeIds, ["e18"]);
});

test("settlement ids suppress replays and retain only the newest bounded history", () => {
  const first = settle({
    settlementId: "stable-gate-settlement",
    startNodeId: "n11b",
    plannedRouteNodeIds: ["n12b"],
  });
  const duplicate = settle({
    mapState: first.mapState,
    settlementId: "stable-gate-settlement",
    startNodeId: "n11b",
    plannedRouteNodeIds: ["n12b"],
  });

  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.events, []);
  assert.deepEqual(duplicate.mapState, first.mapState);
  assert.equal(duplicate.committedRouteNodeIds, null);

  let mapState = createHarborMapState();
  for (
    let index = 0;
    index < MAX_PROCESSED_HARBOR_SETTLEMENTS + 6;
    index += 1
  ) {
    mapState = settle({
      mapState,
      settlementId: `bounded-${index}`,
      startNodeId: "n01",
      plannedRouteNodeIds: ["n02"],
    }).mapState;
  }
  assert.equal(
    mapState.processedSettlementIds.length,
    MAX_PROCESSED_HARBOR_SETTLEMENTS,
  );
  assert.equal(mapState.processedSettlementIds[0], "bounded-6");
  assert.equal(
    mapState.processedSettlementIds.at(-1),
    `bounded-${MAX_PROCESSED_HARBOR_SETTLEMENTS + 5}`,
  );
});

test("map settlement is independent of all opaque learning and scoring fields", () => {
  const base = {
    mapState: createHarborMapState(),
    settlementId: "knowledge-independent",
    seatId: "seat-1",
    activeSeatCount: 3,
    effectiveTurn: 7,
    startNodeId: "n04",
    plannedRouteNodeIds: ["n05b"],
    boardNodes: HARBOR_BOARD_NODES,
    fairyActive: true,
  };
  const first = settleHarborTurn({
    ...base,
    learningPack: { opaque: "alpha" },
    assessment: { opaque: 17 },
    spokenEvidence: { opaque: ["one"] },
  });
  const second = settleHarborTurn({
    ...base,
    learningPack: { opaque: "beta" },
    assessment: { opaque: 99 },
    spokenEvidence: { opaque: ["two", "three"] },
  });

  assert.deepEqual(first, second);
});
