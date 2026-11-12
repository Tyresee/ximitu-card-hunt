import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, rollTeacherWorldMove, acceptWorldAnswer } from "../public/prototypes/universal-board/engine-core.js";
import { CLOUD_HARBOR_WORLD_REF, CIRCUIT_WORLD_ROUTE, CIRCUIT_WORLD_ROUTE_REF, WORLD_REGISTRIES } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition, walkWorldPlan } from "../public/prototypes/universal-board/world-runtime-core.js";
import { LEARNING_PACKS } from "../public/prototypes/universal-board/packs.js";
import { assertLandingPlan } from "../public/prototypes/universal-board/landing-points-game.js";

const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
function fixture() {
  const runtime = createRuntime({ mode: "teacher-led", board: composition.board, theme: composition.theme,
    teams: [{ id: "player-a", label: "A", members: ["A"] }, { id: "player-b", label: "B", members: ["B"] }] });
  runtime.world = { schemaVersion: "world-runtime.v1", routeRef: CIRCUIT_WORLD_ROUTE_REF,
    active: { instanceId: "circuit-test", ordinal: 1, worldPackRef: CLOUD_HARBOR_WORLD_REF, mapState: {}, levelState: {} },
    completed: [], processedTransitionIds: [] };
  runtime.teams[0].nodeId = "n48";
  runtime.teams[1].nodeId = "n30";
  const worldPlan = walkWorldPlan({ moveId: "cross-finish", worldInstanceId: "circuit-test", worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: "n48", steps: 2,
    worldRoute: CIRCUIT_WORLD_ROUTE, registries: WORLD_REGISTRIES });
  return { attemptId: worldPlan.id, runtime, worldPlan, finalBoard: composition.board, activityTemplates: {} };
}

test("formal teacher and already-authorized voice moves accept the same local lap return", () => {
  for (const mode of ["teacher-led", "voice"]) {
    const input = fixture();
    input.runtime.mode = mode;
    if (mode === "voice") { input.learningPack = LEARNING_PACKS.family; input.runtime.learningPackId = input.learningPack.id; }
    const result = (mode === "teacher-led" ? rollTeacherWorldMove : acceptWorldAnswer)(input);
    assert.equal(result.runtime.teams[0].nodeId, "n02");
    assert.equal(result.runtime.teams[0].completedLaps, 1);
    assert.deepEqual(result.runtime.teams[1], input.runtime.teams[1]);
    assert.deepEqual(result.runtime.world.active, input.runtime.world.active);
    assert.equal(result.effects.filter((effect) => effect.type === "pawn_step").length, 2);
    assert.equal(result.effects.filter((effect) => effect.type === "lap_return").length, 1);
    assert.equal(result.effects.some((effect) => effect.type === "world_transition" || effect.type === "activity_open"), false);
    assert.equal((mode === "teacher-led" ? rollTeacherWorldMove : acceptWorldAnswer)({ ...input, runtime: result.runtime }).duplicate, true);
  }
});

test("formal moves reject undeclared, charged or world-changing lap returns", () => {
  for (const mutate of [
    (plan) => { delete plan.lapReturns; },
    (plan) => { plan.lapReturns[0].zeroStepCost = false; plan.effects.find((effect) => effect.type === "lap_return").zeroStepCost = false; },
    (plan) => { plan.finalLocation.worldInstanceId = "another-space"; },
    (plan) => { plan.effects.find((effect) => effect.type === "lap_return").toEntryNodeId = "n03"; },
  ]) {
    const input = fixture(); input.worldPlan = structuredClone(input.worldPlan); mutate(input.worldPlan);
    assert.throws(() => rollTeacherWorldMove(input), /lap_return|lap return|circuit|movement/);
  }
});

test("an exact finish is a real landing; leaving it on the next turn never adds another lap", () => {
  const input = fixture();
  input.worldPlan = walkWorldPlan({ moveId: "exact-finish", worldInstanceId: "circuit-test", worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: "n48", steps: 1,
    worldRoute: CIRCUIT_WORLD_ROUTE, registries: WORLD_REGISTRIES });
  input.attemptId = input.worldPlan.id;
  const arrived = rollTeacherWorldMove(input);
  assert.equal(arrived.runtime.teams[0].nodeId, "n49");
  assert.equal(arrived.runtime.teams[0].completedLaps, 1);
  assert.equal(arrived.effects.some((effect) => effect.type === "lap_return"), false);
  const next = { ...arrived.runtime, activeTeamIndex: 0 };
  const departing = walkWorldPlan({ moveId: "leave-finish", worldInstanceId: "circuit-test", worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: "n49", steps: 1,
    worldRoute: CIRCUIT_WORLD_ROUTE, registries: WORLD_REGISTRIES });
  const moved = rollTeacherWorldMove({ ...input, runtime: next, worldPlan: departing, attemptId: departing.id });
  assert.equal(moved.runtime.teams[0].nodeId, "n02");
  assert.equal(moved.runtime.teams[0].completedLaps, 1);
  assert.equal(moved.effects.filter((effect) => effect.type === "pawn_step").length, 1);
  assert.equal(moved.effects.filter((effect) => effect.type === "lap_return").length, 1);
});

test("browser landing verification checks the server's lap return as well as walked nodes", () => {
  const { worldPlan } = fixture();
  const studentId = "a";
  const runtime = { world: { active: { worldPackRef: CLOUD_HARBOR_WORLD_REF, instanceId: "circuit-test" } },
    teams: [{ id: "player-a", nodeId: "n02" }] };
  const turn = { attemptId: worldPlan.id, studentId, points: 100, plan: worldPlan, finalLocation: worldPlan.finalLocation };
  const input = { turn, attemptId: worldPlan.id, studentId, runtime, effects: worldPlan.effects, landingNodeId: "n02" };
  assert.equal(assertLandingPlan(input), turn);
  assert.throws(() => assertLandingPlan({ ...input, effects: worldPlan.effects.filter((effect) => effect.type !== "lap_return") }), /绕圈/);
});
