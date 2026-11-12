import test from "node:test";
import assert from "node:assert/strict";

import {
  commitSharedExpedition,
  resolveWorldComposition,
  validateWorldPack,
  validateWorldRoute,
  walkWorldPlan,
} from "../public/prototypes/universal-board/world-runtime-core.js";

function board({
  id,
  prefix,
  nodeCount,
  exitNodeNumber = nodeCount,
  zoneCount = 1,
}) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    x: 80 + (index * 90),
    y: 180,
    spaceRole: index + 1 === exitNodeNumber ? "world-exit" : "learning",
  }));
  return {
    kind: "BoardTemplate",
    id,
    version: "1.0.0",
    startNodeId: `${prefix}1`,
    entry: { id: "main", nodeId: `${prefix}1` },
    viewBox: [0, 0, 1200, 620],
    worldSize: { width: 1200, height: 620 },
    zones: Array.from({ length: zoneCount }, (_, index) => ({
      id: `${prefix}-zone-${index + 1}`,
      bounds: {
        x: index * (1200 / zoneCount),
        y: 0,
        width: 1200 / zoneCount,
        height: 620,
      },
    })),
    artRegions: Array.from({ length: zoneCount }, (_, index) => ({
      id: `${prefix}-region-${index + 1}`,
      zoneId: `${prefix}-zone-${index + 1}`,
    })),
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `${prefix}-edge-${index + 1}`,
      from: `${prefix}${index + 1}`,
      to: node.id,
    })),
    exits: [{
      id: "forward",
      nodeId: `${prefix}${exitNodeNumber}`,
      transitionProfileRef: "world.portal.forward.v1",
    }],
  };
}

const BOARD_A_REF = "board.a@1.0.0";
const BOARD_B_REF = "board.b@1.0.0";
const BOARD_C_REF = "board.c@1.0.0";
const THEME_A_REF = "theme.a@1.0.0";
const THEME_B_REF = "theme.b@1.0.0";
const THEME_C_REF = "theme.c@1.0.0";
const LEVEL_A_REF = "level.a@1.0.0";
const LEVEL_B_REF = "level.b@1.0.0";
const LEVEL_C_REF = "level.c@1.0.0";
const WORLD_A_REF = "world.a@1.0.0";
const WORLD_B_REF = "world.b@1.0.0";
const WORLD_C_REF = "world.c@1.0.0";

function worldPack(id, boardTemplateRef, themePackRef, levelPackRef) {
  return {
    kind: "WorldPack",
    id,
    version: "1.0.0",
    boardTemplateRef,
    themePackRef,
    levelPackRef,
    assetBudget: { maxArtRegions: 4 },
  };
}

function fixtures() {
  const boardA = board({
    id: "board.a",
    prefix: "a",
    nodeCount: 3,
  });
  const boardB = board({
    id: "board.b",
    prefix: "b",
    nodeCount: 7,
  });
  const boardC = board({
    id: "board.c",
    prefix: "c",
    nodeCount: 4,
  });
  const themeA = { kind: "ThemePack", id: "theme.a", version: "1.0.0" };
  const themeB = { kind: "ThemePack", id: "theme.b", version: "1.0.0" };
  const themeC = { kind: "ThemePack", id: "theme.c", version: "1.0.0" };
  const levelA = {
    kind: "LevelPack",
    id: "level.a",
    version: "1.0.0",
    initialMapState: { harborSignal: false },
    initialLevelState: { discoveries: 0 },
  };
  const levelB = {
    kind: "LevelPack",
    id: "level.b",
    version: "1.0.0",
    initialMapState: { windGateOpen: false },
    initialLevelState: { discoveries: 0 },
  };
  const levelC = {
    kind: "LevelPack",
    id: "level.c",
    version: "1.0.0",
    initialMapState: {},
    initialLevelState: {},
  };
  const worldA = worldPack("world.a", BOARD_A_REF, THEME_A_REF, LEVEL_A_REF);
  const worldB = worldPack("world.b", BOARD_B_REF, THEME_B_REF, LEVEL_B_REF);
  const worldC = worldPack("world.c", BOARD_C_REF, THEME_C_REF, LEVEL_C_REF);
  return {
    registries: {
      boardTemplates: {
        [BOARD_A_REF]: boardA,
        [BOARD_B_REF]: boardB,
        [BOARD_C_REF]: boardC,
      },
      themePacks: {
        [THEME_A_REF]: themeA,
        [THEME_B_REF]: themeB,
        [THEME_C_REF]: themeC,
      },
      levelPacks: {
        [LEVEL_A_REF]: levelA,
        [LEVEL_B_REF]: levelB,
        [LEVEL_C_REF]: levelC,
      },
      worldPacks: {
        [WORLD_A_REF]: worldA,
        [WORLD_B_REF]: worldB,
        [WORLD_C_REF]: worldC,
      },
    },
    worldA,
    worldB,
    worldC,
  };
}

function route(transitions = [{
  fromWorldRef: WORLD_A_REF,
  exitId: "forward",
  toWorldRef: WORLD_B_REF,
}]) {
  return {
    kind: "WorldRoute",
    id: "route.main",
    version: "1.0.0",
    entryWorldRef: WORLD_A_REF,
    transitions,
  };
}

function crossWorldPlanOptions(overrides = {}) {
  const { registries } = fixtures();
  return {
    moveId: "move-7",
    worldInstanceId: "session-1:world:1",
    nextWorldInstanceId: "session-1:world:2",
    worldOrdinal: 1,
    worldRef: WORLD_A_REF,
    startNodeId: "a1",
    steps: 5,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {
      "session-1:world:1": { harborSignal: true },
      "session-1:world:2": { windGateOpen: false },
    },
    worldRoute: route(),
    registries,
    ...overrides,
  };
}

test("WorldPack resolves exact immutable board/theme/level refs within a four-zone load unit", () => {
  const { registries, worldA } = fixtures();
  assert.deepEqual(validateWorldPack(worldA, registries), []);

  const resolved = resolveWorldComposition(WORLD_A_REF, registries);
  assert.equal(resolved.worldRef, WORLD_A_REF);
  assert.equal(resolved.board.id, "board.a");
  assert.equal(resolved.theme.id, "theme.a");
  assert.equal(resolved.level.id, "level.a");
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.board), true);
});

test("WorldPack rejects more than four regions, teaching evidence, score fields, latest and missing refs", () => {
  const { registries, worldA } = fixtures();
  const oversizedBoard = board({
    id: "board.a",
    prefix: "a",
    nodeCount: 3,
    zoneCount: 5,
  });
  const oversizedRegistries = {
    ...registries,
    boardTemplates: {
      ...registries.boardTemplates,
      [BOARD_A_REF]: oversizedBoard,
    },
  };
  assert.match(
    validateWorldPack(worldA, oversizedRegistries).join("; "),
    /zones cannot exceed 4|artRegions cannot exceed 4/,
  );

  for (const forbidden of [
    { taskId: "family-01" },
    { transcript: "She has two apples." },
    { score: 96 },
    { learningPackRef: "family@1.0.0" },
  ]) {
    assert.match(
      validateWorldPack({ ...worldA, ...forbidden }, registries).join("; "),
      /forbidden teaching or score fields/,
    );
  }

  assert.match(
    validateWorldPack({
      ...worldA,
      boardTemplateRef: "board.a@latest",
    }, registries).join("; "),
    /exact versioned ref|latest/,
  );
  assert.match(
    validateWorldPack({
      ...worldA,
      boardTemplateRef: "board.missing@1.0.0",
    }, registries).join("; "),
    /not registered/,
  );
  assert.throws(
    () => resolveWorldComposition("world.a@latest", registries),
    /exact versioned ref|latest/,
  );
});

test("WorldRoute accepts an exact acyclic chain and only an explicit terminal repeatable tail", () => {
  const { registries } = fixtures();
  assert.deepEqual(validateWorldRoute(route(), registries), []);
  assert.deepEqual(validateWorldRoute({
    ...route(),
    repeatableTail: {
      worldRef: WORLD_B_REF,
      exitId: "forward",
      instancePolicy: "append-new-instance-v1",
    },
  }, registries), []);

  const cycle = route([
    {
      fromWorldRef: WORLD_A_REF,
      exitId: "forward",
      toWorldRef: WORLD_B_REF,
    },
    {
      fromWorldRef: WORLD_B_REF,
      exitId: "forward",
      toWorldRef: WORLD_A_REF,
    },
  ]);
  assert.match(validateWorldRoute(cycle, registries).join("; "), /cycle/);

  const ordinarySelfEdge = route([
    {
      fromWorldRef: WORLD_A_REF,
      exitId: "forward",
      toWorldRef: WORLD_A_REF,
    },
  ]);
  assert.match(
    validateWorldRoute(ordinarySelfEdge, registries).join("; "),
    /cannot target the same world/,
  );

  const nonTerminalTail = {
    ...route([
      {
        fromWorldRef: WORLD_A_REF,
        exitId: "forward",
        toWorldRef: WORLD_B_REF,
      },
      {
        fromWorldRef: WORLD_B_REF,
        exitId: "forward",
        toWorldRef: WORLD_C_REF,
      },
    ]),
    repeatableTail: {
      worldRef: WORLD_B_REF,
      exitId: "forward",
      instancePolicy: "append-new-instance-v1",
    },
  };
  assert.match(
    validateWorldRoute(nonTerminalTail, registries).join("; "),
    /repeatable tail must be terminal/,
  );

  assert.match(
    validateWorldRoute({
      ...route(),
      repeatableTail: {
        worldRef: WORLD_B_REF,
        exitId: "forward",
        instancePolicy: "reuse-active-instance",
      },
    }, registries).join("; "),
    /append-new-instance-v1/,
  );

  assert.match(
    validateWorldRoute({
      ...route(),
      repeatableTail: {
        worldRef: WORLD_C_REF,
        exitId: "forward",
        instancePolicy: "append-new-instance-v1",
      },
    }, registries).join("; "),
    /unreachable world/,
  );

  const missing = route([{
    fromWorldRef: WORLD_A_REF,
    exitId: "forward",
    toWorldRef: "world.missing@1.0.0",
  }]);
  assert.match(validateWorldRoute(missing, registries).join("; "), /not registered/);

  const unknownExit = route([{
    fromWorldRef: WORLD_A_REF,
    exitId: "back-to-start",
    toWorldRef: WORLD_B_REF,
  }]);
  assert.match(validateWorldRoute(unknownExit, registries).join("; "), /unknown exit/);

  assert.match(
    validateWorldRoute({
      ...route(),
      entryWorldRef: "world.a@latest",
    }, registries).join("; "),
    /exact versioned ref|latest/,
  );
});

test("repeatable tail appends fresh ordinals across multiple instances and resets world state", () => {
  const { registries } = fixtures();
  const repeatableRoute = {
    ...route(),
    repeatableTail: {
      worldRef: WORLD_B_REF,
      exitId: "forward",
      instancePolicy: "append-new-instance-v1",
    },
  };
  let worldRuntime = {
    schemaVersion: "world-runtime.v1",
    routeRef: "route.main@1.0.0",
    active: {
      instanceId: "session-tail:world:2",
      ordinal: 2,
      worldPackRef: WORLD_B_REF,
      mapState: { windGateOpen: true },
      levelState: { discoveries: 9 },
    },
    completed: [{
      instanceId: "session-tail:world:1",
      ordinal: 1,
      worldPackRef: WORLD_A_REF,
    }],
    processedTransitionIds: [],
  };
  let teams = [
    { id: "player-1", nodeId: "b7", coins: 5 },
    { id: "player-2", nodeId: "b4", coins: 3 },
  ];

  for (let nextOrdinal = 3; nextOrdinal <= 6; nextOrdinal += 1) {
    const currentInstanceId = worldRuntime.active.instanceId;
    const nextWorldInstanceId = `session-tail:world:${nextOrdinal}`;
    const plan = walkWorldPlan({
      moveId: `move-tail-${nextOrdinal}`,
      worldInstanceId: currentInstanceId,
      nextWorldInstanceId,
      worldOrdinal: worldRuntime.active.ordinal,
      worldRef: WORLD_B_REF,
      startNodeId: "b7",
      steps: 3,
      routeChoicesByWorldInstance: {},
      mapStatesByWorldInstance: {
        [currentInstanceId]: {
          windGateOpen: true,
        },
        [nextWorldInstanceId]: {
          windGateOpen: true,
        },
      },
      worldRoute: repeatableRoute,
      registries,
    });

    assert.equal(plan.stepsConsumed, 3);
    assert.deepEqual(
      plan.effects.map(({ type }) => type),
      ["world_transition", "pawn_step", "pawn_step", "pawn_step"],
    );
    assert.deepEqual(plan.finalLocation, {
      worldRef: WORLD_B_REF,
      worldInstanceId: nextWorldInstanceId,
      worldOrdinal: nextOrdinal,
      nodeId: "b4",
    });
    assert.equal(plan.transitions[0].fromWorldRef, WORLD_B_REF);
    assert.equal(plan.transitions[0].toWorldRef, WORLD_B_REF);
    assert.notEqual(
      plan.transitions[0].fromWorldInstanceId,
      plan.transitions[0].toWorldInstanceId,
    );
    assert.deepEqual(plan.arrivalState, {
      mapState: { windGateOpen: false },
      levelState: { discoveries: 0 },
    });

    const committed = commitSharedExpedition({
      worldRuntime,
      teams,
      activeTeamId: "player-1",
      plan,
    });
    assert.equal(committed.worldRuntime.active.ordinal, nextOrdinal);
    assert.equal(
      committed.worldRuntime.active.instanceId,
      nextWorldInstanceId,
    );
    assert.deepEqual(committed.worldRuntime.active.mapState, {
      windGateOpen: false,
    });
    assert.deepEqual(committed.worldRuntime.active.levelState, {
      discoveries: 0,
    });
    assert.deepEqual(
      committed.teams.map(({ nodeId }) => nodeId),
      ["b4", "b1"],
    );
    assert.equal(
      new Set(
        committed.worldRuntime.completed.map(({ instanceId }) => instanceId),
      ).size,
      committed.worldRuntime.completed.length,
    );

    worldRuntime = {
      ...committed.worldRuntime,
      active: {
        ...committed.worldRuntime.active,
        mapState: { windGateOpen: true },
        levelState: { discoveries: nextOrdinal * 2 },
      },
    };
    teams = committed.teams.map((team) => ({
      ...team,
      nodeId: team.id === "player-1" ? "b7" : "b6",
    }));
  }

  assert.equal(worldRuntime.active.ordinal, 6);
  assert.equal(worldRuntime.completed.length, 5);
});

test("repeatable tail refuses to reuse active or completed instance ids", () => {
  const { registries } = fixtures();
  const repeatableRoute = {
    ...route(),
    repeatableTail: {
      worldRef: WORLD_B_REF,
      exitId: "forward",
      instancePolicy: "append-new-instance-v1",
    },
  };
  assert.throws(
    () => walkWorldPlan({
      moveId: "move-tail-same-instance",
      worldInstanceId: "session-tail:world:2",
      nextWorldInstanceId: "session-tail:world:2",
      worldOrdinal: 2,
      worldRef: WORLD_B_REF,
      startNodeId: "b7",
      steps: 1,
      routeChoicesByWorldInstance: {},
      mapStatesByWorldInstance: {},
      worldRoute: repeatableRoute,
      registries,
    }),
    /must differ from the active world instance/,
  );

  const planToCompletedInstance = walkWorldPlan({
    moveId: "move-tail-completed-instance",
    worldInstanceId: "session-tail:world:2",
    nextWorldInstanceId: "session-tail:world:1",
    worldOrdinal: 2,
    worldRef: WORLD_B_REF,
    startNodeId: "b7",
    steps: 1,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {},
    worldRoute: repeatableRoute,
    registries,
  });
  assert.throws(
    () => commitSharedExpedition({
      worldRuntime: {
        schemaVersion: "world-runtime.v1",
        routeRef: "route.main@1.0.0",
        active: {
          instanceId: "session-tail:world:2",
          ordinal: 2,
          worldPackRef: WORLD_B_REF,
          mapState: {},
          levelState: {},
        },
        completed: [{
          instanceId: "session-tail:world:1",
          ordinal: 1,
          worldPackRef: WORLD_A_REF,
        }],
        processedTransitionIds: [],
      },
      teams: [{ id: "player-1", nodeId: "b7" }],
      activeTeamId: "player-1",
      plan: planToCompletedInstance,
    }),
    /cannot revisit a completed world instance/,
  );
});

test("reaching an exit consumes one ordinary step, transition consumes zero, and remaining die steps continue", () => {
  const plan = walkWorldPlan(crossWorldPlanOptions());

  assert.equal(plan.schemaVersion, "world-move-plan.v1");
  assert.equal(plan.policy, "shared-expedition-v1");
  assert.equal(plan.dieValue, 5);
  assert.equal(plan.stepsConsumed, 5);
  assert.deepEqual(
    plan.effects.map((effect) => effect.type),
    [
      "pawn_step",
      "pawn_step",
      "world_transition",
      "pawn_step",
      "pawn_step",
      "pawn_step",
    ],
  );
  assert.deepEqual(
    plan.effects
      .filter((effect) => effect.type === "pawn_step")
      .map((effect) => [effect.worldInstanceId, effect.nodeId, effect.stepNumber]),
    [
      ["session-1:world:1", "a2", 1],
      ["session-1:world:1", "a3", 2],
      ["session-1:world:2", "b2", 3],
      ["session-1:world:2", "b3", 4],
      ["session-1:world:2", "b4", 5],
    ],
  );
  assert.equal(plan.transitions.length, 1);
  assert.equal(plan.transitions[0].zeroStepCost, true);
  assert.equal(plan.transitions[0].fromNodeId, "a3");
  assert.equal(plan.transitions[0].toEntryNodeId, "b1");
  assert.deepEqual(plan.finalLocation, {
    worldRef: WORLD_B_REF,
    worldInstanceId: "session-1:world:2",
    worldOrdinal: 2,
    nodeId: "b4",
  });
  assert.equal(
    Object.keys(plan).filter((key) => key === "finalLocation").length,
    1,
    "the plan must expose one authoritative final landing",
  );
});

test("a die ending exactly on the old-world exit still arrives in the next world with no phantom step", () => {
  const plan = walkWorldPlan(crossWorldPlanOptions({
    startNodeId: "a2",
    steps: 1,
  }));
  assert.equal(plan.stepsConsumed, 1);
  assert.deepEqual(
    plan.effects.map((effect) => effect.type),
    ["pawn_step", "world_transition"],
  );
  assert.equal(plan.effects[0].nodeId, "a3");
  assert.equal(plan.finalLocation.nodeId, "b1");
  assert.equal(plan.finalLocation.worldRef, WORLD_B_REF);
});

test("one die move is rejected before it can cross a second world", () => {
  const { registries } = fixtures();
  const shortSecondWorldRegistries = {
    ...registries,
    boardTemplates: {
      ...registries.boardTemplates,
      [BOARD_B_REF]: board({
        id: "board.b",
        prefix: "b",
        nodeCount: 6,
      }),
    },
  };
  const chainedRoute = route([
    {
      fromWorldRef: WORLD_A_REF,
      exitId: "forward",
      toWorldRef: WORLD_B_REF,
    },
    {
      fromWorldRef: WORLD_B_REF,
      exitId: "forward",
      toWorldRef: WORLD_C_REF,
    },
  ]);
  assert.deepEqual(validateWorldRoute(chainedRoute, shortSecondWorldRegistries), []);
  assert.throws(
    () => walkWorldPlan(crossWorldPlanOptions({
      registries: shortSecondWorldRegistries,
      worldRoute: chainedRoute,
      startNodeId: "a2",
      steps: 6,
    })),
    /cannot cross more than one world/,
  );
});

test("walkWorldPlan refuses task, transcript and score inputs instead of reading them", () => {
  for (const [key, value] of [
    ["taskId", "family-01"],
    ["transcript", "She has two apples."],
    ["score", 96],
  ]) {
    assert.throws(
      () => walkWorldPlan(crossWorldPlanOptions({ [key]: value })),
      /unsupported fields/,
    );
  }
  assert.throws(
    () => walkWorldPlan(crossWorldPlanOptions({
      mapStatesByWorldInstance: {
        "session-1:world:1": { score: 96 },
      },
    })),
    /forbidden teaching or score fields/,
  );

  const plan = walkWorldPlan(crossWorldPlanOptions());
  assert.doesNotMatch(
    JSON.stringify(plan),
    /taskId|transcript|score|learningPack/i,
  );
});

test("shared-expedition commit carries waiting pawns to the new entry while the actor keeps its final landing", () => {
  const plan = walkWorldPlan(crossWorldPlanOptions());
  const worldRuntime = {
    schemaVersion: "world-runtime.v1",
    routeRef: "route.main@1.0.0",
    active: {
      instanceId: "session-1:world:1",
      ordinal: 1,
      worldPackRef: WORLD_A_REF,
      mapState: { harborSignal: true },
      levelState: { discoveries: 3 },
    },
    completed: [],
    processedTransitionIds: [],
  };
  const teams = [
    { id: "player-1", label: "Mia", nodeId: "a2", coins: 4 },
    { id: "player-2", label: "Leo", nodeId: "a1", coins: 2 },
    { id: "player-3", label: "Ava", nodeId: "a3", coins: 1 },
  ];
  const committed = commitSharedExpedition({
    worldRuntime,
    teams,
    activeTeamId: "player-2",
    plan,
  });

  assert.equal(committed.duplicate, false);
  assert.deepEqual(
    committed.teams.map(({ id, nodeId }) => [id, nodeId]),
    [
      ["player-1", "b1"],
      ["player-2", "b4"],
      ["player-3", "b1"],
    ],
  );
  assert.equal(committed.teams[0].coins, 4);
  assert.deepEqual(committed.worldRuntime.active, {
    instanceId: "session-1:world:2",
    ordinal: 2,
    worldPackRef: WORLD_B_REF,
    mapState: { windGateOpen: false },
    levelState: { discoveries: 0 },
  });
  assert.equal(committed.worldRuntime.completed.length, 1);
  assert.deepEqual(
    committed.worldRuntime.completed[0].archivedState,
    {
      mapState: { harborSignal: true },
      levelState: { discoveries: 3 },
    },
  );
  assert.deepEqual(
    committed.worldRuntime.processedTransitionIds,
    ["move-7:world-transition:1"],
  );
  assert.equal(Object.isFrozen(committed), true);
  assert.equal(Object.isFrozen(committed.teams[0]), true);

  const duplicate = commitSharedExpedition({
    worldRuntime: committed.worldRuntime,
    teams: committed.teams,
    activeTeamId: "player-2",
    plan,
  });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.effects, []);
  assert.deepEqual(duplicate.teams, committed.teams);
});

test("a move without a transition only advances the active pawn", () => {
  const { registries } = fixtures();
  const plan = walkWorldPlan({
    moveId: "move-local",
    worldInstanceId: "session-1:world:2",
    worldOrdinal: 2,
    worldRef: WORLD_B_REF,
    startNodeId: "b1",
    steps: 2,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {},
    worldRoute: route(),
    registries,
  });
  const committed = commitSharedExpedition({
    worldRuntime: {
      schemaVersion: "world-runtime.v1",
      routeRef: "route.main@1.0.0",
      active: {
        instanceId: "session-1:world:2",
        ordinal: 2,
        worldPackRef: WORLD_B_REF,
        mapState: {},
        levelState: {},
      },
      completed: [],
      processedTransitionIds: [],
    },
    teams: [
      { id: "player-1", nodeId: "b1" },
      { id: "player-2", nodeId: "b3" },
    ],
    activeTeamId: "player-1",
    plan,
  });
  assert.deepEqual(
    committed.teams.map(({ nodeId }) => nodeId),
    ["b3", "b3"],
  );
  assert.equal(committed.worldRuntime.active.worldPackRef, WORLD_B_REF);
  assert.deepEqual(committed.worldRuntime.completed, []);
});

test("shared-expedition commit rejects score and transcript parameters", () => {
  const plan = walkWorldPlan(crossWorldPlanOptions());
  const base = {
    worldRuntime: {
      schemaVersion: "world-runtime.v1",
      routeRef: "route.main@1.0.0",
      active: {
        instanceId: "session-1:world:1",
        ordinal: 1,
        worldPackRef: WORLD_A_REF,
        mapState: {},
        levelState: {},
      },
      completed: [],
      processedTransitionIds: [],
    },
    teams: [{ id: "player-1", nodeId: "a1" }],
    activeTeamId: "player-1",
    plan,
  };
  assert.throws(
    () => commitSharedExpedition({ ...base, score: 96 }),
    /unsupported fields/,
  );
  assert.throws(
    () => commitSharedExpedition({ ...base, transcript: "hello" }),
    /unsupported fields/,
  );
});
