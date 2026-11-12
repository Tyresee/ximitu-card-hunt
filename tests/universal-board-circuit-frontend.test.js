import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  CIRCUIT_WORLD_ROUTE, CIRCUIT_WORLD_ROUTE_REF, CLOUD_HARBOR_WORLD_REF,
  WORLD_ROUTES, XIMITU_WORLD_ROUTE,
  WORLD_REGISTRIES, isCloudHarborWorldRef, isCurrentCloudHarborWorldRef,
} from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition, walkWorldPlan } from "../public/prototypes/universal-board/world-runtime-core.js";
import { createHarborMapState, settleHarborTurn } from "../public/prototypes/universal-board/harbor-items-core.js";
import { pointsOnlyNodePresentation } from "../public/prototypes/universal-board/points-only-presentation.js";
import { cloudHarborNodePresentation } from "../public/prototypes/universal-board/cloud-harbor-presentation.js";

const source = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /) + 1;
  return `${source.slice(start - 6, start) === "async " ? "async " : ""}${tail.slice(0, end)}`;
}
function harness(name, bindings) {
  const context = vm.createContext({ ...bindings });
  vm.runInContext(functionSource(name), context);
  return context;
}

test("new front-end runtimes select the circuit but saved routes remain exact", () => {
  const context = harness("worldRuntimeState", { CIRCUIT_WORLD_ROUTE_REF, CLOUD_HARBOR_WORLD_REF, structuredClone });
  assert.equal(context.worldRuntimeState().routeRef, CIRCUIT_WORLD_ROUTE_REF);
  const saved = `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`;
  const select = harness("currentWorldRoute", { runtime: { world: { routeRef: saved } }, WORLD_ROUTES, CIRCUIT_WORLD_ROUTE });
  assert.equal(select.currentWorldRoute(), XIMITU_WORLD_ROUTE);
  select.runtime = { world: {} };
  assert.equal(select.currentWorldRoute(), CIRCUIT_WORLD_ROUTE);
});

test("loop previews explicitly identify local returns while historic previews still cross worlds", () => {
  let route = CIRCUIT_WORLD_ROUTE;
  const context = harness("worldRouteTransitionForExit", { currentWorldRoute: () => route });
  const loop = context.worldRouteTransitionForExit(CLOUD_HARBOR_WORLD_REF, "forward");
  assert.equal(loop.circuit, true);
  assert.equal(loop.fromWorldRef, loop.toWorldRef);
  assert.equal(context.worldRouteTransitionForExit(CLOUD_HARBOR_WORLD_REF, "missing"), null);
  route = XIMITU_WORLD_ROUTE;
  const legacy = context.worldRouteTransitionForExit(CLOUD_HARBOR_WORLD_REF, "forward");
  assert.equal(legacy.toWorldRef, "world.ximitu.beyond-cloud@1.0.0");
  assert.equal(legacy.circuit, undefined);
});

test("authoritative lap-progress synchronization never teleports a pawn or replaces the shared map", () => {
  const runtime = { world: { routeRef: CIRCUIT_WORLD_ROUTE_REF, active: { mapState: { open: true } } },
    teams: [{ id: "player-a", nodeId: "n06a", completedLaps: 0 }, { id: "player-b", nodeId: "n46", completedLaps: 0 }] };
  const context = harness("syncCircuitLapProgress", { runtime, CIRCUIT_WORLD_ROUTE_REF });
  context.syncCircuitLapProgress({ world: { routeRef: CIRCUIT_WORLD_ROUTE_REF }, lapRound: 2,
    teams: [{ id: "a", nodeId: "n02", completedLaps: 3 }, { id: "b", nodeId: "n03", completedLaps: 1 }] });
  assert.equal(context.runtime.teams[0].nodeId, "n06a");
  assert.equal(context.runtime.teams[1].nodeId, "n46");
  assert.equal(context.runtime.teams[0].completedLaps, 3);
  assert.equal(context.runtime.teams[1].completedLaps, 1);
  assert.equal(context.runtime.circuitLapRound, 2);
  assert.equal(context.runtime.world, runtime.world);
  const before = context.runtime;
  context.syncCircuitLapProgress({ world: { routeRef: "route.ximitu-main@1.3.0" }, teams: [] });
  assert.equal(context.runtime, before, "legacy server sessions do not acquire circuit counters");
  assert.doesNotMatch(functionSource("renderHud"), /landingPoints\.get\(/, "rendering does not clone the entire points outbox");
});

test("lap return presentation changes only the acting visual node and follows it on the same board", async () => {
  const runtime = { teams: [{ id: "a", nodeId: "n48" }, { id: "b", nodeId: "n40" }] };
  const events = [];
  const context = harness("playCircuitLapReturn", { runtime,
    visualNodeId: "n49", visitedNodeIds: new Set(),
    nodes: { board: { querySelector: () => null }, voiceState: {} },
    presentationDuration: (value) => value, reducedMotionRequested: () => true,
    renderBoard: () => events.push("render"), ensureNodeVisible: async (node) => events.push(node),
    boardSounds: { play: () => {} },
  });
  await context.playCircuitLapReturn({ toEntryNodeId: "n01" }, { id: "a", label: "甲" });
  assert.equal(context.visualNodeId, "n01");
  assert.equal(context.runtime, runtime);
  assert.deepEqual(runtime.teams, [{ id: "a", nodeId: "n48" }, { id: "b", nodeId: "n40" }]);
  assert.deepEqual(events, ["render", "n01"]);
  assert.equal(context.visitedNodeIds.has("n01"), true);
});

test("a locked automatic bonus generation plays one short opening; the historic locked draw does not replay", async () => {
  const snapshot = { locked: true, drawNumber: 1, cells: [] };
  const played = [];
  const seen = new Set();
  const context = harness("ensureSpecialCellsOpening", {
    landingGameId: () => "game-1", currentSpecialCells: () => snapshot,
    specialCellsIntro: null, specialCellsUi: { busy: false }, busy: false,
    specialCellsFollowUpActive: false, renderSpecialCellsHud: () => {},
    resumePendingSpecialCellMove: async () => {},
    specialCellsIntroSeen: (_id, draw) => seen.has(draw),
    playSpecialCellsIntro: async (mode) => { played.push(mode); seen.add(snapshot.drawNumber); },
  });
  await context.ensureSpecialCellsOpening();
  assert.equal(played.length, 0);
  snapshot.drawNumber = 2;
  snapshot.drawHistory = [{ drawNumber: 1 }];
  await context.ensureSpecialCellsOpening();
  await context.ensureSpecialCellsOpening();
  assert.deepEqual(played, ["short"]);
});

test("circuit terminal copy describes the return and legacy terminal copy keeps its original destination", () => {
  const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  let circuit = true;
  const old = Object.freeze({ category: "world-transition", trigger: "after-enter", badgeLabel: "进入新世界",
    shortLabel: "前往云外秘境", detail: "向前穿越到下一世界，不回到起点。", hasDirectReward: false });
  const outcome = harness("circuitNodeOutcome", { circuitPresentationActive: () => circuit });
  const current = outcome.circuitNodeOutcome(composition, "n49", old);
  assert.equal(current.shortLabel, "下一步接起点后格");
  assert.equal(current.badgeLabel, "完成本圈");
  assert.equal(current.category, old.category);
  assert.equal(current.hasDirectReward, false);
  assert.match(current.detail, /只有自己的棋子/);
  assert.doesNotMatch(current.detail, /下一世界/);
  assert.equal(old.shortLabel, "前往云外秘境", "immutable source copy remains unchanged");
  for (const [name, value] of [["nodeKindLabel", "圈终点"], ["nodeEffectBadge", "完成本圈"],
    ["landingRoleCopy", "圈终点 · 点数用完停在这里，下一步接起点后格"]]) {
    const copy = harness(name, { circuitPresentationActive: () => circuit, activeWorldComposition: composition, isCloudHarborWorldRef });
    const actual = copy[name](name === "landingRoleCopy" ? "goal" : "portal");
    assert.equal(typeof actual === "object" ? actual.label : actual, value);
    circuit = false;
    const historical = copy[name](name === "landingRoleCopy" ? "goal" : "portal");
    assert.match(typeof historical === "object" ? historical.label : historical, /世界/);
    circuit = true;
  }
  const presentation = harness("activeNodePresentation", {
    activeWorldComposition: composition, activeBoardTemplate: composition.board,
    nodeById: new Map(composition.board.nodes.map((node) => [node.id, node])), theme: composition.theme,
    nodeKindLabel: () => "前进世界门", activeNodeKind: () => "portal", activeNodeOutcome: () => current,
    isCloudHarborWorldRef, isCurrentCloudHarborWorldRef,
    presentationForLevelOneNode: () => ({ label: "前进星门", teaser: "去另一世界" }),
    circuitPresentationActive: () => circuit, pointsOnlyNodePresentation, cloudHarborNodePresentation,
  });
  assert.equal(presentation.activeNodePresentation("n49").label, "圈终点");
  circuit = false;
  assert.equal(presentation.activeNodePresentation("n49").label, "前进星门");
  assert.equal(outcome.circuitNodeOutcome(composition, "n49", old), old);
});

test("all circuit tail-to-entry moves produce identical harbor map state from the first or complete same-world route", () => {
  const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  const state = createHarborMapState({ departureBeaconLit: true, regionExitSeenBySeat: { student: true } });
  let checked = 0;
  for (const startNodeId of ["n44", "n45", "n46", "n47", "n48", "n49"]) {
    for (let steps = 1; steps <= 6; steps += 1) {
      const move = walkWorldPlan({ moveId: "compare-harbor", worldInstanceId: "same-world", worldOrdinal: 1,
        worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId, steps, worldRoute: CIRCUIT_WORLD_ROUTE, registries: WORLD_REGISTRIES });
      if (!move.lapReturns.length) continue;
      const segments = move.segments.filter((segment) => segment.type === "walk");
      const beforeReturn = move.segments[0]?.type === "walk" ? move.segments[0] : { nodeIds: [], edgeIds: [] };
      const settle = (nodeIds, edgeIds) => settleHarborTurn({ mapState: state, settlementId: "compare-harbor",
        seatId: "student", activeSeatCount: 2, effectiveTurn: 50, startNodeId,
        plannedRouteNodeIds: nodeIds, plannedRouteEdgeIds: edgeIds, boardNodes: composition.board.nodes,
        boardTemplateRef: `${composition.board.id}@${composition.board.version}` });
      const local = settle(beforeReturn.nodeIds, beforeReturn.edgeIds);
      const complete = settle(segments.flatMap((segment) => segment.nodeIds), segments.flatMap((segment) => segment.edgeIds));
      assert.deepEqual(local.mapState, complete.mapState, `${startNodeId} + ${steps}`);
      assert.deepEqual(local.events, complete.events, `${startNodeId} + ${steps}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 20, "cover every remaining-die tail/entry combination");
});
