import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { airCrossingFrames, isAirCrossingEdge } from "../public/prototypes/universal-board/air-crossing-presentation.js";
import { BOARD_TEMPLATE, THEME_PACKS } from "../public/prototypes/universal-board/packs.js";
import { CRYSTAL_BOARD_TEMPLATE_V220, CRYSTAL_THEME_V220 } from "../public/prototypes/universal-board/crystal-harbor-published-snapshots.js";
import { createRuntime, rollTeacherMove, walkBoardPlan } from "../public/prototypes/universal-board/engine-core.js";
import { createHarborMapState, settleHarborTurn } from "../public/prototypes/universal-board/harbor-items-core.js";
import { resolveLevelOneReward } from "../public/prototypes/universal-board/level-one.js";

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function crossingTurn(board, theme, steps) {
  const runtime = createRuntime({
    mode: "teacher-led", board, theme, taskRandom: () => 0,
    teams: [{ id: "crossing-player", label: "Crossing", members: ["Crossing"] }],
  });
  runtime.teams[0].nodeId = "n15";
  runtime.mapState = createHarborMapState();
  const before = structuredClone(runtime);
  freeze(runtime);
  const plan = walkBoardPlan(board, "n15", steps, {}, runtime.mapState);
  const move = rollTeacherMove({
    attemptId: `crossing-${steps}`, runtime, board, dieValue: steps,
  });
  const harbor = settleHarborTurn({
    mapState: runtime.mapState, settlementId: `crossing-${steps}`,
    seatId: "crossing-player", activeSeatCount: 1, effectiveTurn: 1,
    startNodeId: "n15", plannedRouteNodeIds: plan.nodeIds,
    plannedRouteEdgeIds: plan.edgeIds, boardNodes: board.nodes,
  });
  const reward = resolveLevelOneReward({
    nodeId: move.runtime.teams[0].nodeId, discoveredNodeIds: [],
    playerAssets: { coins: 0, stars: 0, keys: 0 },
    stableSeed: "crossing-regression", settlementId: `crossing-${steps}:landing`,
  });
  assert.deepEqual(runtime, before, "planning, movement and settlement preserve their input snapshot");
  return { plan, move, harbor, reward };
}

test("only the current theme marks e15 as an airborne ordinary step; old sessions retain their bridge", () => {
  const scene = THEME_PACKS["cloud-harbor"].scenePresentation;
  assert.equal(scene.boardRef, `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
  assert.deepEqual(scene.airCrossingEdgeIds, ["e15"]);
  assert.equal(scene.timberEdgeIds.includes("e15"), false);
  for (const edge of BOARD_TEMPLATE.edges) {
    assert.equal(isAirCrossingEdge(scene, edge.id), edge.id === "e15");
    assert.equal(isAirCrossingEdge(CRYSTAL_THEME_V220.scenePresentation, edge.id), false);
  }
  assert.equal(CRYSTAL_THEME_V220.scenePresentation.timberEdgeIds.includes("e15"), true);
  assert.equal(isAirCrossingEdge(null, "e15"), false);
  assert.equal(isAirCrossingEdge(scene, null), false);
  const { pathData: newPath, ...currentRule } = BOARD_TEMPLATE.edges.find(({ id }) => id === "e15");
  const { pathData: oldPath, ...publishedRule } = CRYSTAL_BOARD_TEMPLATE_V220.edges.find(({ id }) => id === "e15");
  assert.notEqual(newPath, oldPath);
  assert.deepEqual(currentRule, publishedRule, "air crossing never becomes a transport or conditional edge");
});

for (const [steps, nodeIds, edgeIds] of [
  [1, ["n16"], ["e15"]],
  [2, ["n16", "n17"], ["e15", "e16"]],
]) {
  test(`${steps} die step(s) from n15 cross e15 exactly once and stop at ${nodeIds.at(-1)}`, () => {
    const result = crossingTurn(BOARD_TEMPLATE, THEME_PACKS["cloud-harbor"], steps);
    assert.deepEqual(result.plan, { nodeIds, edgeIds });
    assert.deepEqual(result.move.effects.map(({ type }) => type), [
      "teacher_move", "dice_reveal", ...nodeIds.map(() => "pawn_step"),
    ]);
    assert.deepEqual(result.move.effects.filter(({ type }) => type === "pawn_step").map(({ nodeId }) => nodeId), nodeIds);
    assert.equal(result.move.runtime.lastDie, steps);
    assert.equal(result.move.runtime.teams[0].nodeId, nodeIds.at(-1));
    assert.equal(result.move.runtime.completedMoveCount, 1);
    assert.equal(result.harbor.transport, null);
    assert.deepEqual(result.harbor.events, []);
    assert.deepEqual(result.reward.rewards, []);
    assert.equal(result.reward.trackDiscovery, false);
  });
}

test("all six die results preserve the published route, final reward and harbor trigger sequence", () => {
  for (let steps = 1; steps <= 6; steps += 1) {
    const original = crossingTurn(CRYSTAL_BOARD_TEMPLATE_V220, CRYSTAL_THEME_V220, steps);
    const current = crossingTurn(BOARD_TEMPLATE, THEME_PACKS["cloud-harbor"], steps);
    assert.deepEqual(current, original, `die ${steps}: visual flight must not alter any game result`);
    assert.equal(current.move.effects.filter(({ type }) => type === "pawn_step").length, steps);
    assert.equal(current.harbor.events.some(({ type }) => type === "departure_beacon"), steps >= 4);
  }
});

function movement(transform) {
  const match = transform.match(/translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\) rotate\(([-\d.e+]+)deg\) scale\(([-\d.e+]+)\)/);
  assert.ok(match, transform);
  return match.slice(1).map(Number);
}

test("airborne keyframes rise between the banks and land at the exact destination without mutating input", () => {
  const points = freeze([{ x: 120, y: 240 }, { x: 195, y: 220 }, { x: 270, y: 205 }]);
  const fractions = freeze([0, .5, 1]);
  const before = structuredClone({ points, fractions });
  const frames = airCrossingFrames(points, fractions);
  assert.deepEqual(frames.map(({ offset }) => offset), fractions);
  const [start, middle, end] = frames.map(({ transform }) => movement(transform));
  assert.deepEqual(start, [0, 0, 0, 1]);
  assert.equal(middle[0], 75);
  assert.ok(middle[1] < -20 && middle[1] >= -65, "the extra airborne lift stays bounded");
  assert.ok(middle[3] > 1 && middle[3] <= 1.1);
  for (const [actual, expected] of end.map((value, index) => [value, [150, -35, 0, 1][index]])) {
    assert.ok(Math.abs(actual - expected) < 1e-9, "no residual landing offset, rotation or scale");
  }
  assert.deepEqual({ points, fractions }, before);
});

test("reduced motion fades at the landing location without any positional travel or rotation", () => {
  const options = freeze({ reducedMotion: true });
  const first = airCrossingFrames(freeze([{ x: 1, y: 2 }, { x: 900, y: -100 }]), freeze([0, 1]), options);
  const second = airCrossingFrames(freeze([{ x: -500, y: 300 }, { x: 0, y: 0 }]), freeze([0, 1]), options);
  assert.deepEqual(first, second, "reduced motion does not depend on crossing distance");
  assert.ok(first[0].opacity < first.at(-1).opacity);
  assert.equal(first.at(-1).opacity, 1);
  for (const { transform } of first) {
    assert.match(transform, /^translate\(-50%, -50%\) scale\(/, "only the constant centering transform remains");
    assert.doesNotMatch(transform, /translate3d|rotate/);
  }
  assert.deepEqual(options, { reducedMotion: true });
});

const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
function appFunctionSource(name) {
  const marker = `async function ${name}(`;
  const start = app.indexOf(marker);
  assert.notEqual(start, -1);
  const end = app.slice(start + marker.length).search(/\n(?:async )?function /);
  assert.notEqual(end, -1);
  return app.slice(start, start + marker.length + end);
}

test("the actual pawn presenter cleans up a canceled airborne animation and settles only its supplied node", async () => {
  const sourcePawn = { style: {}, querySelector: () => ({}) };
  const calls = [];
  const movingTeam = freeze({ id: "p1", nodeId: "n16" });
  const pawn = { dataset: {}, style: { setProperty() {} }, remove() { calls.push("remove"); } };
  const nodes = {
    board: { querySelector: () => sourcePawn },
    fxLayer: { dataset: {}, append(element) { assert.ok(element.style); calls.push("append"); } },
  };
  const bindings = {
    nodes, runtime: freeze({ teams: [movingTeam] }), visitedNodeIds: new Set(),
    document: { createElement: () => ({ style: {}, append(child) { assert.strictEqual(child, pawn); }, remove() {} }) },
    nodeById: new Map(), boardPointToFxPoint: () => null,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    visualMovementEdge: () => ({ id: "e15" }),
    groundedSceneSelection: () => ({ scene: THEME_PACKS["cloud-harbor"].scenePresentation }),
    isAirCrossingEdge, airCrossingFrames,
    centerTransportPair: async (...ids) => { calls.push(["camera", ...ids]); },
    ensureNodeVisible: () => { throw new Error("air crossing must frame both banks"); },
    reducedMotionRequested: () => false,
    visualPawnMovementGeometry: ({ fractions }) => ({ edgeId: "e15", points: fractions.map((t) => ({ x: 100 + 150 * t, y: 200 - 35 * t })) }),
    characterProfileForSeatIndex: () => ({ accent: "#fff" }),
    positionedFx: () => pawn, appendHtmlCharacterPawnArt: () => {},
    boardSounds: { play() {} },
    animationFinished: async () => { assert.equal(sourcePawn.style.opacity, "0"); throw new Error("animation canceled"); },
    settlePawnStepPresentation: (...args) => { calls.push(["settle", ...args]); sourcePawn.style.opacity = ""; return true; },
    renderBoard: () => { throw new Error("settlement should update the existing board"); }, sleep: async () => {},
  };
  const presenter = Function(...Object.keys(bindings), `let visualNodeId = "n15"; ${appFunctionSource("playPawnStep")} return { run: playPawnStep, position: () => visualNodeId };`)(...Object.values(bindings));
  const effect = freeze({ effectId: "committed-step-1", nodeId: "n16", edgeId: "e15" });
  await assert.rejects(presenter.run(effect, movingTeam), /animation canceled/);
  assert.deepEqual(calls[0], ["camera", "n15", "n16"]);
  assert.equal(calls.filter((call) => call === "remove").length, 1);
  assert.deepEqual(calls.at(-1), ["settle", movingTeam, "n16", 0]);
  assert.equal(presenter.position(), "n16");
  assert.deepEqual([...bindings.visitedNodeIds], ["n16"]);
  assert.equal(sourcePawn.style.opacity, "");
  assert.deepEqual(nodes.fxLayer.dataset, {});
  assert.equal(pawn.dataset.travelMode, "air-crossing");
  assert.equal(movingTeam.nodeId, "n16", "presenter never mutates the committed team snapshot");
});
