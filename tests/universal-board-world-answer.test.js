import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptWorldAnswer,
} from "../public/prototypes/universal-board/engine-core.js";
import {
  walkWorldPlan,
} from "../public/prototypes/universal-board/world-runtime-core.js";

const BOARD_A_REF = "board.answer-a@1.0.0";
const BOARD_B_REF = "board.answer-b@1.0.0";
const THEME_A_REF = "theme.answer-a@1.0.0";
const THEME_B_REF = "theme.answer-b@1.0.0";
const LEVEL_A_REF = "level.answer-a@1.0.0";
const LEVEL_B_REF = "level.answer-b@1.0.0";
const WORLD_A_REF = "world.answer-a@1.0.0";
const WORLD_B_REF = "world.answer-b@1.0.0";
const ROUTE_REF = "route.answer@1.0.0";

function board({
  id,
  prefix,
  nodeCount,
  nodeOverrides = {},
}) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const nodeId = `${prefix}${index + 1}`;
    return {
      id: nodeId,
      x: 80 + (index * 100),
      y: 180,
      spaceRole: index === nodeCount - 1 ? "world-exit" : "learning",
      ...(nodeOverrides[nodeId] || {}),
    };
  });
  return {
    kind: "BoardTemplate",
    id,
    version: "1.0.0",
    startNodeId: `${prefix}1`,
    entry: { id: "main", nodeId: `${prefix}1` },
    viewBox: [0, 0, 1200, 620],
    worldSize: { width: 1200, height: 620 },
    zones: [{
      id: `${prefix}-zone`,
      bounds: { x: 0, y: 0, width: 1200, height: 620 },
    }],
    artRegions: [{
      id: `${prefix}-region`,
      zoneId: `${prefix}-zone`,
    }],
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `${prefix}-edge-${index + 1}`,
      from: `${prefix}${index + 1}`,
      to: node.id,
    })),
    exits: [{
      id: "forward",
      nodeId: `${prefix}${nodeCount}`,
      transitionProfileRef: "world.portal.forward.v1",
    }],
  };
}

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

function fixtures({
  boardBNodeOverrides = {
    b2: {
      spaceRole: "map-effect",
      mapEffectRef: "wind.intermediate.v1",
    },
    b4: {
      spaceRole: "map-effect",
      mapEffectRef: "wind.oracle.v1",
    },
  },
} = {}) {
  const boardA = board({
    id: "board.answer-a",
    prefix: "a",
    nodeCount: 3,
  });
  const boardB = board({
    id: "board.answer-b",
    prefix: "b",
    nodeCount: 8,
    nodeOverrides: boardBNodeOverrides,
  });
  const worldRoute = {
    kind: "WorldRoute",
    id: "route.answer",
    version: "1.0.0",
    entryWorldRef: WORLD_A_REF,
    transitions: [{
      fromWorldRef: WORLD_A_REF,
      exitId: "forward",
      toWorldRef: WORLD_B_REF,
    }],
  };
  const registries = {
    boardTemplates: {
      [BOARD_A_REF]: boardA,
      [BOARD_B_REF]: boardB,
    },
    themePacks: {
      [THEME_A_REF]: {
        kind: "ThemePack",
        id: "theme.answer-a",
        version: "1.0.0",
      },
      [THEME_B_REF]: {
        kind: "ThemePack",
        id: "theme.answer-b",
        version: "1.0.0",
      },
    },
    levelPacks: {
      [LEVEL_A_REF]: {
        kind: "LevelPack",
        id: "level.answer-a",
        version: "1.0.0",
        initialMapState: { harborSignal: false },
        initialLevelState: { discoveries: 0 },
      },
      [LEVEL_B_REF]: {
        kind: "LevelPack",
        id: "level.answer-b",
        version: "1.0.0",
        initialMapState: { windGateOpen: false },
        initialLevelState: { discoveries: 0 },
      },
    },
    worldPacks: {
      [WORLD_A_REF]: worldPack(
        "world.answer-a",
        BOARD_A_REF,
        THEME_A_REF,
        LEVEL_A_REF,
      ),
      [WORLD_B_REF]: worldPack(
        "world.answer-b",
        BOARD_B_REF,
        THEME_B_REF,
        LEVEL_B_REF,
      ),
    },
  };
  return {
    boardA,
    boardB,
    registries,
    worldRoute,
  };
}

const learningPack = {
  id: "learning.answer",
  objectives: [{ id: "objective.answer" }],
  tasks: [
    {
      id: "task-1",
      objectiveIds: ["objective.answer"],
      interactionTemplateRef: "voice.single-response.v1",
      evaluatorRef: "semantic-frame.v1",
      activityBindings: [{
        templateRef: "challenge.v1",
        content: {
          title: "风帆挑战",
          instruction: "找到正确的风向。",
          target: "north",
        },
      }],
    },
    {
      id: "task-2",
      objectiveIds: ["objective.answer"],
      interactionTemplateRef: "voice.single-response.v1",
      evaluatorRef: "semantic-frame.v1",
      activityBindings: [],
    },
  ],
};

const activityTemplates = {
  "challenge.v1": {
    id: "challenge.v1",
    renderer: "challenge.renderer.v1",
    phases: ["intro", "play", "result"],
    materialTags: ["wind"],
  },
};

function worldRuntime({
  active = "a",
} = {}) {
  const inFirstWorld = active === "a";
  return {
    schemaVersion: "prototype-2",
    phase: "MISSION_PRESENT",
    round: 1,
    taskIndex: 0,
    activeTeamIndex: inFirstWorld ? 1 : 0,
    acceptedCount: 0,
    lastDie: null,
    currentActivity: null,
    processedAttemptIds: [],
    learningPackId: learningPack.id,
    world: {
      schemaVersion: "world-runtime.v1",
      routeRef: ROUTE_REF,
      active: {
        instanceId: inFirstWorld ? "session:world:1" : "session:world:2",
        ordinal: inFirstWorld ? 1 : 2,
        worldPackRef: inFirstWorld ? WORLD_A_REF : WORLD_B_REF,
        mapState: inFirstWorld
          ? { harborSignal: true }
          : { windGateOpen: false },
        levelState: { discoveries: inFirstWorld ? 3 : 0 },
      },
      completed: [],
      processedTransitionIds: [],
    },
    teams: inFirstWorld
      ? [
        {
          id: "player-mia",
          label: "Mia",
          members: ["Mia"],
          nodeId: "a2",
          coins: 4,
          speakerIndex: 0,
        },
        {
          id: "player-leo",
          label: "Leo",
          members: ["Leo", "Noah"],
          nodeId: "a1",
          coins: 2,
          speakerIndex: 0,
        },
      ]
      : [
        {
          id: "player-mia",
          label: "Mia",
          members: ["Mia", "Ava"],
          nodeId: "b1",
          coins: 4,
          speakerIndex: 0,
        },
        {
          id: "player-leo",
          label: "Leo",
          members: ["Leo"],
          nodeId: "b5",
          coins: 2,
          speakerIndex: 0,
        },
      ],
  };
}

function crossWorldPlan({
  attemptId = "attempt-world-1",
  registries,
  worldRoute,
} = {}) {
  return walkWorldPlan({
    moveId: attemptId,
    worldInstanceId: "session:world:1",
    nextWorldInstanceId: "session:world:2",
    worldOrdinal: 1,
    worldRef: WORLD_A_REF,
    startNodeId: "a1",
    steps: 5,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {
      "session:world:1": { harborSignal: true },
      "session:world:2": { windGateOpen: false },
    },
    worldRoute,
    registries,
  });
}

function localWorldPlan({
  attemptId = "attempt-local-1",
  registries,
  worldRoute,
} = {}) {
  return walkWorldPlan({
    moveId: attemptId,
    worldInstanceId: "session:world:2",
    worldOrdinal: 2,
    worldRef: WORLD_B_REF,
    startNodeId: "b1",
    steps: 2,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {
      "session:world:2": { windGateOpen: false },
    },
    worldRoute,
    registries,
  });
}

function acceptOptions({
  attemptId,
  runtime,
  worldPlan,
  finalBoard,
  finalMapState = { windGateOpen: true, oracleSeen: true },
}) {
  return {
    attemptId,
    runtime,
    learningPack,
    activityTemplates,
    worldPlan,
    finalBoard,
    finalMapState,
  };
}

test("acceptWorldAnswer commits one scoped cross-world move and only the final landing effect", () => {
  const { boardB, registries, worldRoute } = fixtures();
  const attemptId = "attempt-world-1";
  const plan = crossWorldPlan({ attemptId, registries, worldRoute });
  const runtime = worldRuntime();
  const result = acceptWorldAnswer(acceptOptions({
    attemptId,
    runtime,
    worldPlan: plan,
    finalBoard: boardB,
  }));

  assert.equal(result.duplicate, false);
  assert.equal(result.task.id, "task-1");
  assert.deepEqual(
    result.runtime.teams.map(({ id, nodeId }) => [id, nodeId]),
    [
      ["player-mia", "b1"],
      ["player-leo", "b4"],
    ],
  );
  assert.equal(result.runtime.teams[0].coins, 4);
  assert.equal(result.runtime.teams[1].speakerIndex, 1);
  assert.equal(result.runtime.activeTeamIndex, 0);
  assert.equal(result.runtime.round, 2);
  assert.equal(result.runtime.taskIndex, 1);
  assert.equal(result.runtime.acceptedCount, 1);
  assert.equal(result.runtime.lastDie, 5);
  assert.deepEqual(result.runtime.processedAttemptIds, [attemptId]);
  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);

  assert.equal(result.runtime.world.active.worldPackRef, WORLD_B_REF);
  assert.equal(result.runtime.world.active.instanceId, "session:world:2");
  assert.equal(result.runtime.world.active.ordinal, 2);
  assert.deepEqual(
    result.runtime.world.active.mapState,
    { windGateOpen: true, oracleSeen: true },
  );
  assert.deepEqual(
    result.runtime.world.active.levelState,
    { discoveries: 0 },
  );
  assert.deepEqual(
    result.runtime.world.completed[0].archivedState,
    {
      mapState: { harborSignal: true },
      levelState: { discoveries: 3 },
    },
  );

  assert.deepEqual(
    result.effects.map(({ type }) => type),
    [
      "answer_accepted",
      "dice_reveal",
      "pawn_step",
      "pawn_step",
      "world_transition",
      "pawn_step",
      "pawn_step",
      "pawn_step",
      "map_effect",
    ],
  );
  assert.equal(
    result.effects.filter(({ type }) => type === "dice_reveal").length,
    1,
  );
  assert.equal(
    result.effects.filter(({ type }) => type === "map_effect").length,
    1,
  );
  assert.deepEqual(
    result.effects.find(({ type }) => type === "map_effect"),
    {
      type: "map_effect",
      effectId: `${attemptId}:final:map-effect`,
      actorTeamId: "player-leo",
      mapEffectRef: "wind.oracle.v1",
      nodeId: "b4",
      worldRef: WORLD_B_REF,
      worldInstanceId: "session:world:2",
    },
  );
  assert.equal(
    result.effects.some((effect) => (
      effect.type === "map_effect"
      && effect.nodeId === "b2"
    )),
    false,
    "an intermediate map-effect node must not resolve",
  );

  for (const effect of result.effects.filter(({ type }) => type === "pawn_step")) {
    assert.match(effect.worldRef, /@1\.0\.0$/);
    assert.match(effect.worldInstanceId, /^session:world:/);
  }
  const transition = result.effects.find(
    ({ type }) => type === "world_transition",
  );
  assert.equal(transition.fromWorldRef, WORLD_A_REF);
  assert.equal(transition.toWorldRef, WORLD_B_REF);
  assert.equal(transition.fromWorldInstanceId, "session:world:1");
  assert.equal(transition.toWorldInstanceId, "session:world:2");
});

test("acceptWorldAnswer validates a declared legacy event but never opens it after landing", () => {
  const { boardB, registries, worldRoute } = fixtures();
  const attemptId = "attempt-world-event-1";
  const plan = crossWorldPlan({ attemptId, registries, worldRoute });
  const result = acceptWorldAnswer({
    ...acceptOptions({
      attemptId,
      runtime: worldRuntime(),
      worldPlan: plan,
      finalBoard: boardB,
    }),
    landingActivityPolicy: {
      mode: "event",
      nodeId: "b4",
      event: {
        eventId: "event.wind-oracle.v1",
        sourceTaskRef: "learning.answer@1.0.0#task-1",
        templateRef: "challenge.v1",
        content: {
          title: "风向神谕",
          instruction: "找到正确风向并说明原因。",
          target: "north",
        },
      },
    },
  });

  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);
  assert.equal(result.effects.at(-1).type, "map_effect");
  assert.equal(
    result.effects.some(({ type }) => type === "activity_open"),
    false,
    "final landing must never append a second classroom or voice activity",
  );
});

test("acceptWorldAnswer is attempt-idempotent after active team and world advance", () => {
  const { boardB, registries, worldRoute } = fixtures();
  const attemptId = "attempt-idempotent-1";
  const plan = crossWorldPlan({ attemptId, registries, worldRoute });
  const first = acceptWorldAnswer(acceptOptions({
    attemptId,
    runtime: worldRuntime(),
    worldPlan: plan,
    finalBoard: boardB,
  }));
  const duplicate = acceptWorldAnswer(acceptOptions({
    attemptId,
    runtime: first.runtime,
    worldPlan: plan,
    finalBoard: boardB,
  }));

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.runtime, first.runtime);
  assert.deepEqual(duplicate.effects, []);
  assert.equal(duplicate.task, null);
});

test("acceptWorldAnswer resolves final transport but never starts a landing activity", () => {
  const { boardB, registries, worldRoute } = fixtures({
    boardBNodeOverrides: {
      b2: {
        spaceRole: "map-effect",
        mapEffectRef: "wind.intermediate.v1",
      },
      b3: {
        spaceRole: "transport",
        transportTargetId: "b6",
        transportProfileRef: "cannon.sky.v1",
        transportUnlockAfterCompletedTurns: 0,
        transportCaptureNodeIds: ["b1", "b2"],
      },
      b6: {
        spaceRole: "activity",
      },
    },
  });
  const attemptId = "attempt-transport-1";
  const plan = localWorldPlan({ attemptId, registries, worldRoute });
  const result = acceptWorldAnswer(acceptOptions({
    attemptId,
    runtime: worldRuntime({ active: "b" }),
    worldPlan: plan,
    finalBoard: boardB,
    finalMapState: { windGateOpen: false },
  }));

  assert.equal(result.runtime.teams[0].nodeId, "b6");
  assert.equal(result.runtime.teams[1].nodeId, "b5");
  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);
  assert.deepEqual(
    result.effects.map(({ type }) => type),
    [
      "answer_accepted",
      "dice_reveal",
      "pawn_step",
      "pawn_step",
      "transport_move",
    ],
  );
  assert.equal(
    result.effects.some(({ type }) => type === "map_effect"),
    false,
  );
  assert.deepEqual(
    result.effects.find(({ type }) => type === "transport_move"),
    {
      type: "transport_move",
      effectId: `${attemptId}:final:transport`,
      actorTeamId: "player-mia",
      transportProfileRef: "cannon.sky.v1",
      fromNodeId: "b3",
      toNodeId: "b6",
      captureNodeIds: ["b1", "b2"],
      worldRef: WORLD_B_REF,
      worldInstanceId: "session:world:2",
    },
  );
  assert.equal(result.effects.some(({ type }) => type === "activity_open"), false);
});

test("landing activity policy validates and suppresses against the real transport target", () => {
  const { boardB, registries, worldRoute } = fixtures({
    boardBNodeOverrides: {
      b3: {
        spaceRole: "transport",
        transportTargetId: "b6",
        transportProfileRef: "cannon.sky.v1",
        transportUnlockAfterCompletedTurns: 0,
      },
      b6: {
        spaceRole: "activity",
      },
    },
  });
  const wrongAttemptId = "attempt-transport-policy-wrong";
  const wrongPlan = localWorldPlan({
    attemptId: wrongAttemptId,
    registries,
    worldRoute,
  });
  assert.throws(
    () => acceptWorldAnswer({
      ...acceptOptions({
        attemptId: wrongAttemptId,
        runtime: worldRuntime({ active: "b" }),
        worldPlan: wrongPlan,
        finalBoard: boardB,
        finalMapState: { windGateOpen: false },
      }),
      landingActivityPolicy: {
        mode: "none",
        nodeId: "b3",
      },
    }),
    /nodeId must match final landing: b6/,
  );

  const attemptId = "attempt-transport-policy-none";
  const plan = localWorldPlan({ attemptId, registries, worldRoute });
  const result = acceptWorldAnswer({
    ...acceptOptions({
      attemptId,
      runtime: worldRuntime({ active: "b" }),
      worldPlan: plan,
      finalBoard: boardB,
      finalMapState: { windGateOpen: false },
    }),
    landingActivityPolicy: {
      mode: "none",
      nodeId: "b6",
    },
  });

  assert.equal(result.runtime.teams[0].nodeId, "b6");
  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);
  assert.deepEqual(
    result.effects.map(({ type }) => type),
    [
      "answer_accepted",
      "dice_reveal",
      "pawn_step",
      "pawn_step",
      "transport_move",
    ],
  );
});

test("acceptWorldAnswer rejects mismatched attempt, start, active team and die contracts", () => {
  const { boardB, registries, worldRoute } = fixtures();
  const attemptId = "attempt-validate-1";
  const plan = crossWorldPlan({ attemptId, registries, worldRoute });
  const base = acceptOptions({
    attemptId,
    runtime: worldRuntime(),
    worldPlan: plan,
    finalBoard: boardB,
  });

  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      attemptId: "attempt-other",
    }),
    /worldPlan\.id must match attemptId/,
  );

  const wrongStart = structuredClone(plan);
  wrongStart.startLocation.nodeId = "a2";
  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      worldPlan: wrongStart,
    }),
    /start does not match the active team and world/,
  );

  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      runtime: {
        ...base.runtime,
        activeTeamIndex: 0,
      },
    }),
    /start does not match the active team and world/,
  );

  const illegalDie = structuredClone(plan);
  illegalDie.dieValue = 7;
  illegalDie.stepsConsumed = 7;
  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      worldPlan: illegalDie,
    }),
    /consume one legal die value exactly/,
  );
});

test("acceptWorldAnswer refuses score and transcript fields instead of consuming them", () => {
  const { boardB, registries, worldRoute } = fixtures();
  const attemptId = "attempt-evidence-boundary-1";
  const plan = crossWorldPlan({ attemptId, registries, worldRoute });
  const base = acceptOptions({
    attemptId,
    runtime: worldRuntime(),
    worldPlan: plan,
    finalBoard: boardB,
  });

  for (const [key, value] of [
    ["score", 96],
    ["aiscore", 91],
    ["transcript", "She has two apples."],
  ]) {
    assert.throws(
      () => acceptWorldAnswer({ ...base, [key]: value }),
      /does not accept fields/,
    );
  }

  const scorePlan = structuredClone(plan);
  scorePlan.diagnostics = { score: 96 };
  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      worldPlan: scorePlan,
    }),
    /worldPlan contains forbidden score or transcript fields/,
  );

  assert.throws(
    () => acceptWorldAnswer({
      ...base,
      finalMapState: {
        windGateOpen: true,
        evidence: { transcript: "She has two apples." },
      },
    }),
    /finalMapState contains forbidden score or transcript fields/,
  );
});
