import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF, CIRCUIT_WORLD_ROUTE,
  CIRCUIT_WORLD_ROUTE_REF, CIRCUIT_GAME_RELEASE, WORLD_ROUTES, WORLD_REGISTRIES, XIMITU_WORLD_ROUTE,
} from "../public/prototypes/universal-board/world-packs.js";
import {
  validateWorldRoute, walkWorldPlan, commitSharedExpedition,
} from "../public/prototypes/universal-board/world-runtime-core.js";

const INSTANCE = "circuit-session:world:1";
function plan(overrides = {}) {
  return walkWorldPlan({
    moveId: "circuit-move-1", worldInstanceId: INSTANCE, worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: "n48", steps: 6,
    worldRoute: CIRCUIT_WORLD_ROUTE, registries: WORLD_REGISTRIES,
    mapStatesByWorldInstance: { [INSTANCE]: { departureBeaconLit: true } },
    ...overrides,
  });
}
function runtime() {
  return {
    schemaVersion: "world-runtime.v1", routeRef: CIRCUIT_WORLD_ROUTE_REF,
    active: { instanceId: INSTANCE, ordinal: 1, worldPackRef: CLOUD_HARBOR_WORLD_REF,
      mapState: { departureBeaconLit: true }, levelState: { discoveries: ["harbor"] } },
    completed: [], processedTransitionIds: [],
  };
}

test("a circuit is a separately registered, explicit single-world policy; legacy forward routes stay unchanged", () => {
  assert.equal(WORLD_ROUTES[CIRCUIT_WORLD_ROUTE_REF], CIRCUIT_WORLD_ROUTE);
  assert.equal(CIRCUIT_GAME_RELEASE.version, "2.4.0");
  assert.equal(CIRCUIT_GAME_RELEASE.worldRouteRef, CIRCUIT_WORLD_ROUTE_REF);
  assert.deepEqual(validateWorldRoute(CIRCUIT_WORLD_ROUTE, WORLD_REGISTRIES), []);
  assert.equal(XIMITU_WORLD_ROUTE.version, "1.3.0");
  assert.equal(XIMITU_WORLD_ROUTE.transitions[0].toWorldRef, BEYOND_CLOUD_WORLD_REF);
  assert.equal(XIMITU_WORLD_ROUTE.circuit, undefined);
  assert.deepEqual(validateWorldRoute(XIMITU_WORLD_ROUTE, WORLD_REGISTRIES), []);

  for (const circuit of [
    { ...CIRCUIT_WORLD_ROUTE.circuit, policy: "anything" },
    { ...CIRCUIT_WORLD_ROUTE.circuit, worldRef: BEYOND_CLOUD_WORLD_REF },
    { ...CIRCUIT_WORLD_ROUTE.circuit, exitId: "missing" },
    { ...CIRCUIT_WORLD_ROUTE.circuit, extra: true },
  ]) assert.notEqual(validateWorldRoute({ ...CIRCUIT_WORLD_ROUTE, circuit }, WORLD_REGISTRIES).length, 0);
  assert.notEqual(validateWorldRoute({ ...CIRCUIT_WORLD_ROUTE,
    transitions: [{ fromWorldRef: CLOUD_HARBOR_WORLD_REF, toWorldRef: CLOUD_HARBOR_WORLD_REF, exitId: "forward" }],
  }, WORLD_REGISTRIES).length, 0, "ordinary self-edges remain forbidden");
  assert.notEqual(validateWorldRoute({ ...CIRCUIT_WORLD_ROUTE, repeatableTail: {
    worldRef: CLOUD_HARBOR_WORLD_REF, exitId: "forward", instancePolicy: "append-new-instance-v1",
  } }, WORLD_REGISTRIES).length, 0);
});

test("one through six die steps preserve an exact terminal landing and use any remaining steps from the entry", () => {
  const expected = ["n49", "n02", "n03", "n04", "n05a", "n06a"];
  for (let steps = 1; steps <= 6; steps += 1) {
    const move = plan({ steps });
    assert.equal(move.finalLocation.nodeId, expected[steps - 1]);
    assert.equal(move.finalLocation.worldRef, CLOUD_HARBOR_WORLD_REF);
    assert.equal(move.finalLocation.worldInstanceId, INSTANCE);
    assert.equal(move.finalLocation.worldOrdinal, 1);
    assert.equal(move.stepsConsumed, steps);
    assert.equal(move.effects.filter((effect) => effect.type === "pawn_step").length, steps);
    assert.equal(move.transitions.length, 0);
    assert.equal(move.effects.some((effect) => effect.type === "world_transition"), false);
    assert.deepEqual(move.lapCompletions, ["circuit-move-1:step:1"]);
    assert.equal(move.lapReturns.length, steps === 1 ? 0 : 1);
    if (steps > 1) assert.deepEqual(move.lapReturns[0], {
      type: "lap_return", effectId: "circuit-move-1:lap-return:1", policy: "individual-laps-v1",
      worldRef: CLOUD_HARBOR_WORLD_REF, worldInstanceId: INSTANCE,
      fromNodeId: "n49", toNodeId: "n01", toEntryNodeId: "n01", zeroStepCost: true,
    });
    assert.deepEqual(move.arrivalState.mapState, { departureBeaconLit: true });
  }
});

test("a remaining-step fork after the lap return still honors the explicit route choice", () => {
  const move = plan({ routeChoicesByWorldInstance: { [INSTANCE]: { n04: "e04b" } } });
  assert.equal(move.finalLocation.nodeId, "n06b");
  assert.deepEqual(move.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n49", "n02", "n03", "n04", "n05b", "n06b"]);
  const atExit = plan({ startNodeId: "n49", steps: 1 });
  assert.equal(atExit.finalLocation.nodeId, "n02");
  assert.equal(atExit.lapReturns.length, 1);
  assert.deepEqual(atExit.lapCompletions, [], "leaving an already finished lap cannot complete it again");
});

test("two and eight students preserve individual positions/laps, shared state, and idempotent loop commits", () => {
  for (const count of [2, 8]) {
    const worldRuntime = runtime();
    const teams = Array.from({ length: count }, (_, index) => ({
      id: `student-${index}`, nodeId: index ? `n0${index + 1}` : "n48", completedLaps: index,
    }));
    const original = structuredClone({ worldRuntime, teams });
    const committed = commitSharedExpedition({ worldRuntime, teams, activeTeamId: "student-0", plan: plan() });
    assert.equal(committed.duplicate, false);
    assert.equal(committed.teams[0].nodeId, "n06a");
    assert.equal(committed.teams[0].completedLaps, 1);
    assert.deepEqual(committed.teams.slice(1), teams.slice(1));
    assert.deepEqual(committed.worldRuntime.active, worldRuntime.active);
    assert.deepEqual(committed.worldRuntime.completed, []);
    assert.deepEqual(committed.worldRuntime.processedTransitionIds, []);
    assert.deepEqual(committed.worldRuntime.processedLapReturnIds, ["circuit-move-1:lap-return:1"]);
    assert.deepEqual(committed.worldRuntime.processedLapCompletionIds, ["circuit-move-1:step:1"]);
    assert.deepEqual({ worldRuntime, teams }, original, "input snapshots stay immutable");
    const replay = commitSharedExpedition({ worldRuntime: committed.worldRuntime, teams: committed.teams,
      activeTeamId: "student-0", plan: plan() });
    assert.equal(replay.duplicate, true);
    assert.deepEqual(replay.teams, committed.teams);
    assert.deepEqual(replay.worldRuntime, committed.worldRuntime);
    assert.deepEqual(replay.effects, []);
  }
});

test("non-crossing circuit turns keep lap progress and ordinary forward plans retain their historic shape", () => {
  const teams = [{ id: "student-0", nodeId: "n02", completedLaps: 3 }, { id: "student-1", nodeId: "n03", completedLaps: 0 }];
  const committed = commitSharedExpedition({ worldRuntime: runtime(), teams, activeTeamId: "student-0",
    plan: plan({ startNodeId: "n02", steps: 1 }) });
  assert.equal(committed.teams[0].completedLaps, 3);
  assert.equal(committed.worldRuntime.processedLapReturnIds, undefined);
  assert.deepEqual(committed.teams[1], teams[1]);

  const ordinary = plan({ worldRoute: XIMITU_WORLD_ROUTE, nextWorldInstanceId: "forward-world-2", steps: 1 });
  assert.equal(ordinary.lapReturns, undefined);
  assert.equal(ordinary.lapCompletions, undefined);
  assert.equal(ordinary.transitions.length, 1);
  assert.equal(ordinary.finalLocation.worldRef, BEYOND_CLOUD_WORLD_REF);
  assert.equal(ordinary.finalLocation.worldInstanceId, "forward-world-2");
});

test("an exact terminal landing completes a lap once, stays there, and the next move leaves without counting it twice", () => {
  for (const count of [1, 2, 8]) {
    const teams = Array.from({ length: count }, (_, index) => ({ id: `student-${index}`,
      nodeId: index ? "n30" : "n48", completedLaps: index ? 2 : 0 }));
    const ending = plan({ steps: 1 });
    const completed = commitSharedExpedition({ worldRuntime: runtime(), teams, activeTeamId: "student-0", plan: ending });
    assert.equal(completed.teams[0].nodeId, "n49");
    assert.equal(completed.teams[0].completedLaps, 1);
    assert.deepEqual(completed.teams.slice(1), teams.slice(1));
    assert.deepEqual(completed.worldRuntime.processedLapCompletionIds, ["circuit-move-1:step:1"]);
    assert.equal(completed.worldRuntime.processedLapReturnIds, undefined);
    const replay = commitSharedExpedition({ worldRuntime: completed.worldRuntime, teams: completed.teams,
      activeTeamId: "student-0", plan: ending });
    assert.equal(replay.duplicate, true);
    assert.deepEqual(replay.teams, completed.teams);
    const leaving = plan({ moveId: "leave-terminal", startNodeId: "n49", steps: 1 });
    const departed = commitSharedExpedition({ worldRuntime: completed.worldRuntime, teams: completed.teams,
      activeTeamId: "student-0", plan: leaving });
    assert.equal(departed.teams[0].nodeId, "n02");
    assert.equal(departed.teams[0].completedLaps, 1);
    assert.deepEqual(departed.teams.slice(1), teams.slice(1));
    const leaveReplay = commitSharedExpedition({ worldRuntime: departed.worldRuntime, teams: departed.teams,
      activeTeamId: "student-0", plan: leaving });
    assert.equal(leaveReplay.duplicate, true);
    assert.deepEqual(leaveReplay.teams, departed.teams);
  }
});

test("frozen pre-correction plans retain their saved zero-step terminal return and old lap-count semantics", () => {
  const frozen = structuredClone(plan({ steps: 1 }));
  const savedReturn = structuredClone(plan({ steps: 2 }).lapReturns[0]);
  delete frozen.lapCompletions;
  frozen.lapReturns.push(savedReturn);
  frozen.effects.push(savedReturn);
  frozen.segments.push(savedReturn);
  frozen.finalLocation.nodeId = "n01";
  Object.freeze(frozen);
  const teams = [{ id: "student-0", nodeId: "n48", completedLaps: 0 }];
  const committed = commitSharedExpedition({ worldRuntime: runtime(), teams, activeTeamId: "student-0", plan: frozen });
  assert.equal(committed.teams[0].nodeId, "n01");
  assert.equal(committed.teams[0].completedLaps, 1);
  assert.equal(committed.worldRuntime.processedLapCompletionIds, undefined);
  assert.deepEqual(committed.worldRuntime.processedLapReturnIds, [savedReturn.effectId]);
  assert.equal(commitSharedExpedition({ worldRuntime: committed.worldRuntime, teams: committed.teams,
    activeTeamId: "student-0", plan: frozen }).duplicate, true);
});

test("lap-completion receipts must reference unique actual pawn-step effects in the same world", () => {
  const teams = [{ id: "student-0", nodeId: "n48", completedLaps: 0 }];
  for (const completions of [["missing-step"], ["circuit-move-1:lap-return:1"],
    ["circuit-move-1:step:1", "circuit-move-1:step:1"]]) {
    const altered = { ...plan(), lapCompletions: completions };
    assert.throws(() => commitSharedExpedition({ worldRuntime: runtime(), teams, activeTeamId: "student-0", plan: altered }), /lapCompletions/);
  }
});
