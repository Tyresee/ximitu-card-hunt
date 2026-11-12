import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  acceptAnswer,
  closeActivity,
  createRuntime,
  currentTask,
  findPendingRouteChoice,
  rollDie,
  validateBoardTemplate,
  validateLearningPack,
  walkBoard,
  walkBoardPlan,
} from "../public/prototypes/universal-board/engine-core.js";
import {
  ACTIVITY_TEMPLATES,
  EVALUATOR_REGISTRY,
  INTERACTION_TEMPLATES,
  LEARNING_PACKS,
  THEME_PACKS,
} from "../public/prototypes/universal-board/packs.js";
import {
  levelOneLandingBonus,
  levelOneNodeKind,
} from "../public/prototypes/universal-board/level-one.js";

import { CRYSTAL_BOARD_TEMPLATE_V221 as BOARD_TEMPLATE } from "../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js";

const INTERACTION_RENDERERS = {
  "voice.mission-card.v1": () => {},
};

function createConditionalShortcutBoard() {
  return {
    ...BOARD_TEMPLATE,
    edges: [
      ...BOARD_TEMPLATE.edges
        .filter((edge) => edge.id !== "e14c")
        .map((edge) => (
          edge.id === "e14"
            ? { ...edge, order: 0 }
            : edge
        )),
      {
        id: "e14c",
        from: "n14",
        to: "n17",
        order: 1,
        availableWhen: {
          stateKey: "cloudRouteOpen",
          equals: true,
        },
      },
    ],
  };
}

function createTestRuntime({
  learningPack = LEARNING_PACKS.positions,
  theme = THEME_PACKS["cloud-harbor"],
  interactionTemplates = INTERACTION_TEMPLATES,
  evaluatorRegistry = EVALUATOR_REGISTRY,
  interactionRenderers = INTERACTION_RENDERERS,
  taskRandom = () => 0,
  teams,
} = {}) {
  const options = {
    board: BOARD_TEMPLATE,
    theme,
    learningPack,
    interactionTemplates,
    evaluatorRegistry,
    interactionRenderers,
    taskRandom,
  };
  if (teams !== undefined) options.teams = teams;
  return createRuntime(options);
}

test("card-hunt board is a valid four-zone forward world with four reconnecting branches", () => {
  assert.deepEqual(validateBoardTemplate(BOARD_TEMPLATE), []);
  assert.equal(BOARD_TEMPLATE.nodes.length, 61);
  assert.equal(BOARD_TEMPLATE.edges.length, 65);
  assert.deepEqual(BOARD_TEMPLATE.worldSize, { width: 2400, height: 1120 });
  assert.equal(BOARD_TEMPLATE.zones.length, 4);

  const [, , viewportWidth, viewportHeight] = BOARD_TEMPLATE.viewBox;
  assert.equal(
    BOARD_TEMPLATE.nodes.some((node) => node.x > viewportWidth || node.y > viewportHeight),
    true,
  );

  const branchPairs = [
    { junction: "n04", rejoin: "n08" },
    { junction: "n10", rejoin: "n14" },
    { junction: "n21", rejoin: "n25" },
    { junction: "n29", rejoin: "n33" },
  ];
  for (const { junction, rejoin } of branchPairs) {
    assert.equal(BOARD_TEMPLATE.edges.filter((edge) => edge.from === junction).length, 2);
    assert.equal(BOARD_TEMPLATE.edges.filter((edge) => edge.to === rejoin).length, 2);
  }
  assert.deepEqual(walkBoard(BOARD_TEMPLATE, "n43", 7), [
    "n44",
    "n45",
    "n46",
    "n47",
    "n48",
    "n49",
  ]);
  assert.deepEqual(BOARD_TEMPLATE.entry, { id: "main", nodeId: "n01" });
  assert.deepEqual(BOARD_TEMPLATE.exits, [{
    id: "forward",
    nodeId: "n49",
    transitionProfileRef: "world.portal.forward.v1",
  }]);
  assert.equal(
    BOARD_TEMPLATE.edges.some((edge) => edge.from === "n49"),
    false,
  );
  assert.equal(
    BOARD_TEMPLATE.edges.some((edge) => edge.to === "n01"),
    false,
  );

  assert.equal(
    BOARD_TEMPLATE.nodes.every((node) => (
      node.x >= 0
      && node.x <= BOARD_TEMPLATE.worldSize.width
      && node.y >= 0
      && node.y <= BOARD_TEMPLATE.worldSize.height
    )),
    true,
  );
});

test("same engine accepts unrelated learning packs without changing board or theme", () => {
  for (const pack of Object.values(LEARNING_PACKS)) {
    assert.deepEqual(validateLearningPack(pack), []);
    const runtime = createTestRuntime({ learningPack: pack });
    assert.equal(runtime.boardId, BOARD_TEMPLATE.id);
    assert.equal(runtime.themeId, "cloud-harbor");
    assert.equal(runtime.learningPackId, pack.id);
    assert.equal(currentTask(runtime, pack).id, pack.tasks[0].id);
  }
});

test("position cues use the same concepts as the prompt, answer and evaluator", () => {
  const deskTask = LEARNING_PACKS.positions.tasks.find(({ id }) => id === "position-02");
  assert.equal(deskTask.content.cueText, "🎒  ↔  课桌");
  assert.equal(deskTask.content.cueText.includes("🪑"), false);
  assert.deepEqual(deskTask.content.cueConceptIds, ["bag", "next_to", "desk"]);
  assert.deepEqual(deskTask.evaluatorConfig.requiredConceptIds, ["bag", "next_to", "desk"]);

  const brokenPack = structuredClone(LEARNING_PACKS.positions);
  brokenPack.tasks[1].content.cueConceptIds = ["bag", "next_to", "chair"];
  assert.match(
    validateLearningPack(brokenPack).join("; "),
    /cueConceptIds must exactly match requiredConceptIds/,
  );
});

test("task scheduling rotates independently for every speaker instead of locking to seat order", () => {
  const pack = LEARNING_PACKS.positions;
  let runtime = createTestRuntime({
    learningPack: pack,
    teams: [
      { id: "player-a", label: "A", members: ["A"] },
      { id: "player-b", label: "B", members: ["B"] },
    ],
  });

  assert.equal(currentTask(runtime, pack).id, "position-01");
  runtime = acceptAnswer({
    attemptId: "speaker-a-turn-1",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack: pack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  }).runtime;
  assert.equal(currentTask(runtime, pack).id, "position-02");
  runtime = acceptAnswer({
    attemptId: "speaker-b-turn-1",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack: pack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  }).runtime;
  assert.equal(currentTask(runtime, pack).id, "position-02");
  runtime = acceptAnswer({
    attemptId: "speaker-a-turn-2",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack: pack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  }).runtime;
  assert.equal(currentTask(runtime, pack).id, "position-01");
});

test("a new session may start at another task while each speaker still completes a full cycle", () => {
  const pack = LEARNING_PACKS.family;
  let runtime = createTestRuntime({
    learningPack: pack,
    taskRandom: () => 0.5,
    teams: [{ id: "player-a", label: "A", members: ["A"] }],
  });
  const seen = [];
  for (let turn = 0; turn < pack.tasks.length; turn += 1) {
    seen.push(currentTask(runtime, pack).id);
    runtime = acceptAnswer({
      attemptId: `single-speaker-${turn}`,
      runtime,
      board: BOARD_TEMPLATE,
      learningPack: pack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue: 1,
    }).runtime;
  }
  assert.equal(seen[0], "family-07");
  assert.equal(new Set(seen).size, pack.tasks.length);
});

test("family pack covers the first classroom grammar set without owning game rules", () => {
  const pack = LEARNING_PACKS.family;
  const objectiveIds = pack.objectives.map((objective) => objective.id);
  assert.equal(pack.id, "family-have-has");
  assert.equal(pack.tasks.length, 12);
  assert.deepEqual(objectiveIds, [
    "grammar.have_has",
    "language.he_she",
    "family.members",
  ]);
  for (const task of pack.tasks) {
    assert.equal(task.evaluatorConfig.rollTrigger.mode, "primary-or-keyword");
    assert.deepEqual(task.evaluatorConfig.rollTrigger.triggerTerms, ["have", "has"]);
    assert.equal(typeof task.content.responseScaffold, "string");
    assert.equal(typeof task.feedback.modelContent, "string");
    assert.equal("diceWeight" in task, false);
    assert.equal("points" in task, false);
  }
});

test("theme can change independently from learning content", () => {
  const pack = LEARNING_PACKS.science;
  const cloudRuntime = createTestRuntime({ learningPack: pack });
  const orbitRuntime = createTestRuntime({
    learningPack: pack,
    theme: THEME_PACKS["orbit-lab"],
  });
  assert.equal(cloudRuntime.learningPackId, orbitRuntime.learningPackId);
  assert.notEqual(cloudRuntime.themeId, orbitRuntime.themeId);
  assert.equal(
    THEME_PACKS["cloud-harbor"].transportSkins["jump.launcher.v1"].label,
    "云霄信号炮",
  );
  assert.equal(
    THEME_PACKS["orbit-lab"].transportSkins["jump.launcher.v1"].label,
    "轨道弹射器",
  );
});

test("route choice is data-driven and both branches reconnect", () => {
  const upper = walkBoard(BOARD_TEMPLATE, "n04", 4, { n04: 0 });
  const lower = walkBoard(BOARD_TEMPLATE, "n04", 4, { n04: 1 });
  assert.deepEqual(upper, ["n05a", "n06a", "n07a", "n08"]);
  assert.deepEqual(lower, ["n05b", "n06b", "n07b", "n08"]);
});

test("route choices accept stable outgoing edge ids at the n10 junction", () => {
  assert.deepEqual(
    walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: "e10a" }),
    ["n11a", "n12a", "n13a", "n14"],
  );
  assert.deepEqual(
    walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: "e10b" }),
    ["n11b", "n12b", "n13b", "n14"],
  );
  assert.deepEqual(
    walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: 1 }),
    ["n11b", "n12b", "n13b", "n14"],
  );
});

test("route choices reject edge ids that are not outgoing from that junction", () => {
  assert.throws(
    () => walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: "e04a" }),
    /route choice edge e04a is not outgoing from junction n10/,
  );
  assert.throws(
    () => walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: "missing-edge" }),
    /route choice edge missing-edge is not outgoing from junction n10/,
  );
  assert.throws(
    () => walkBoard(BOARD_TEMPLATE, "n10", 4, { n10: 2 }),
    /route choice index for n10 must be between 0 and 1/,
  );
});

test("pending route preview stops at n10 and describes every complete option", () => {
  assert.deepEqual(
    findPendingRouteChoice(BOARD_TEMPLATE, "n09", 5),
    {
      junctionNodeId: "n10",
      stepsBeforeJunction: 1,
      remainingSteps: 4,
      routeBeforeJunction: ["n10"],
      options: [
        {
          edgeId: "e10a",
          order: 0,
          routeNodeIds: ["n11a", "n12a", "n13a", "n14"],
          edgeIds: ["e10a", "e11a", "e12a", "e13a"],
          destinationNodeId: "n14",
        },
        {
          edgeId: "e10b",
          order: 1,
          routeNodeIds: ["n11b", "n12b", "n13b", "n14"],
          edgeIds: ["e10b", "e11b", "e12b", "e13b"],
          destinationNodeId: "n14",
        },
      ],
    },
  );
  assert.equal(
    findPendingRouteChoice(BOARD_TEMPLATE, "n10", 4, { n10: "e10b" }),
    null,
  );
});

test("conditional edges stay closed without state and never replace the main road", () => {
  const board = createConditionalShortcutBoard();
  assert.deepEqual(validateBoardTemplate(board), []);
  assert.deepEqual(
    walkBoardPlan(board, "n14", 1),
    {
      nodeIds: ["n15"],
      edgeIds: ["e14"],
    },
  );
  assert.deepEqual(
    walkBoardPlan(board, "n14", 1, {}, { cloudRouteOpen: true }),
    {
      nodeIds: ["n15"],
      edgeIds: ["e14"],
    },
    "opening an optional route must not silently redirect the main road",
  );
  assert.throws(
    () => walkBoardPlan(board, "n14", 1, { n14: "e14c" }),
    /route choice edge e14c is unavailable from junction n14/,
  );
});

test("an open conditional edge consumes one step and exposes its stable edge id", () => {
  const board = createConditionalShortcutBoard();
  assert.deepEqual(
    walkBoardPlan(
      board,
      "n14",
      1,
      { n14: "e14c" },
      { cloudRouteOpen: true },
    ),
    {
      nodeIds: ["n17"],
      edgeIds: ["e14c"],
    },
  );
});

test("one die plan can resolve consecutive junctions in sequence", () => {
  const board = createConditionalShortcutBoard();
  const mapState = { cloudRouteOpen: true };

  assert.equal(
    findPendingRouteChoice(board, "n10", 5, {}, mapState)?.junctionNodeId,
    "n10",
  );
  const secondChoice = findPendingRouteChoice(
    board,
    "n10",
    5,
    { n10: "e10b" },
    mapState,
  );
  assert.equal(secondChoice?.junctionNodeId, "n14");
  assert.equal(secondChoice?.stepsBeforeJunction, 4);

  assert.deepEqual(
    walkBoardPlan(
      board,
      "n10",
      5,
      { n10: "e10b", n14: "e14c" },
      mapState,
    ),
    {
      nodeIds: ["n11b", "n12b", "n13b", "n14", "n17"],
      edgeIds: ["e10b", "e11b", "e12b", "e13b", "e14c"],
    },
  );
});

test("board validation rejects malformed conditional edge rules", () => {
  const board = createConditionalShortcutBoard();
  const invalidRules = [
    {
      availableWhen: null,
      expected: /edge e14c availableWhen must be an object/,
    },
    {
      availableWhen: { equals: true },
      expected: /edge e14c availableWhen\.stateKey must be a non-empty string/,
    },
    {
      availableWhen: { stateKey: "cloudRouteOpen" },
      expected: /edge e14c availableWhen\.equals is required/,
    },
  ];

  for (const { availableWhen, expected } of invalidRules) {
    const invalidBoard = {
      ...board,
      edges: board.edges.map((edge) => (
        edge.id === "e14c" ? { ...edge, availableWhen } : edge
      )),
    };
    assert.match(validateBoardTemplate(invalidBoard).join("; "), expected);
  }
});

test("route walkers strictly validate traversal inputs", () => {
  assert.throws(
    () => findPendingRouteChoice(BOARD_TEMPLATE, "missing-node", 1),
    /start node does not exist: missing-node/,
  );
  assert.throws(
    () => findPendingRouteChoice(BOARD_TEMPLATE, "n10", 1.5),
    /steps must be a non-negative safe integer/,
  );
  assert.throws(
    () => findPendingRouteChoice(BOARD_TEMPLATE, "n10", 1, { n10: true }),
    /route choice for n10 must be an edge id or numeric index/,
  );
  assert.throws(
    () => findPendingRouteChoice(BOARD_TEMPLATE, "n10", 1, { n09: 0 }),
    /route choice node is not a junction: n09/,
  );
});

test("extended world branches are data-driven and reconnect", () => {
  const branchCases = [
    {
      junction: "n21",
      upper: ["n22a", "n23a", "n24a", "n25"],
      lower: ["n22b", "n23b", "n24b", "n25"],
    },
    {
      junction: "n29",
      upper: ["n30a", "n31a", "n32a", "n33"],
      lower: ["n30b", "n31b", "n32b", "n33"],
    },
  ];

  for (const branchCase of branchCases) {
    assert.deepEqual(
      walkBoard(BOARD_TEMPLATE, branchCase.junction, 4, { [branchCase.junction]: 0 }),
      branchCase.upper,
    );
    assert.deepEqual(
      walkBoard(BOARD_TEMPLATE, branchCase.junction, 4, { [branchCase.junction]: 1 }),
      branchCase.lower,
    );
  }
});

test("accepted answer commits one die result and ordered movement effects", () => {
  const learningPack = LEARNING_PACKS.routines;
  const runtime = createTestRuntime({ learningPack });
  const result = acceptAnswer({
    attemptId: "ordered-movement",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 3,
  });
  assert.equal(result.effects.filter((effect) => effect.type === "dice_reveal").length, 1);
  assert.deepEqual(
    result.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n02", "n03", "n04"],
  );
  assert.equal(result.runtime.acceptedCount, 1);
  assert.equal(result.runtime.teams[0].nodeId, "n04");
  assert.equal(result.duplicate, false);
  assert.equal(
    result.effects.every((effect) => typeof effect.effectId === "string"),
    true,
  );
  assert.equal(new Set(result.effects.map((effect) => effect.effectId)).size, result.effects.length);
});

test("a legacy landing event is validated but cannot open after final landing", () => {
  const learningPack = LEARNING_PACKS.positions;
  const runtime = createTestRuntime({ learningPack });
  const result = acceptAnswer({
    attemptId: "landing-event-reward-node",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    landingActivityPolicy: {
      mode: "event",
      nodeId: "n02",
      event: {
        eventId: "event.position-01.reward-node.v1",
        sourceTaskRef: "positions@0.1.0#position-01",
        templateRef: "draw-and-explain.v1",
        content: {
          title: "奖励节点挑战",
          instruction: "画出一个新位置并用完整句子描述。",
          target: "Use under, on or next to.",
        },
      },
    },
    dieValue: 1,
  });

  assert.equal(result.runtime.teams[0].nodeId, "n02");
  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);
  assert.deepEqual(
    result.effects.map(({ type }) => type),
    ["answer_accepted", "dice_reveal", "pawn_step"],
  );
});

test("landing activity mode none suppresses an authored activity node", () => {
  const learningPack = LEARNING_PACKS.positions;
  const board = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n02" ? { ...node, spaceRole: "activity" } : node
    )),
  };
  const result = acceptAnswer({
    attemptId: "landing-activity-none",
    runtime: createTestRuntime({ learningPack }),
    board,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    landingActivityPolicy: {
      mode: "none",
      nodeId: "n02",
    },
    dieValue: 1,
  });

  assert.equal(result.runtime.phase, "MISSION_PRESENT");
  assert.equal(result.runtime.currentActivity, null);
  assert.equal(result.effects.some(({ type }) => type === "activity_open"), false);
});

test("landing activity policy rejects untrusted fields, wrong nodes and templates", () => {
  const learningPack = LEARNING_PACKS.positions;
  const base = {
    runtime: createTestRuntime({ learningPack }),
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  };
  const validEvent = {
    eventId: "event.position-01.strict.v1",
    sourceTaskRef: "positions@0.1.0#position-01",
    templateRef: "draw-and-explain.v1",
    content: {
      title: "严格事件",
      instruction: "完成一个位置挑战。",
      target: "The ball is under the chair.",
    },
  };

  assert.throws(
    () => acceptAnswer({
      ...base,
      attemptId: "landing-policy-wrong-node",
      landingActivityPolicy: {
        mode: "event",
        nodeId: "n01",
        event: validEvent,
      },
    }),
    /nodeId must match final landing: n02/,
  );
  assert.throws(
    () => acceptAnswer({
      ...base,
      attemptId: "landing-policy-unknown-template",
      landingActivityPolicy: {
        mode: "event",
        nodeId: "n02",
        event: { ...validEvent, templateRef: "missing.v1" },
      },
    }),
    /unknown activity template: missing\.v1/,
  );

  for (const [attemptId, landingActivityPolicy] of [
    [
      "landing-policy-unknown-root",
      { mode: "none", nodeId: "n02", reward: { coins: 10 } },
    ],
    [
      "landing-policy-score",
      {
        mode: "event",
        nodeId: "n02",
        event: { ...validEvent, score: 100 },
      },
    ],
    [
      "landing-policy-movement",
      {
        mode: "event",
        nodeId: "n02",
        event: { ...validEvent, steps: 6 },
      },
    ],
    [
      "landing-policy-transcript",
      {
        mode: "event",
        nodeId: "n02",
        event: {
          ...validEvent,
          content: { ...validEvent.content, transcript: "forged speech" },
        },
      },
    ],
  ]) {
    assert.throws(
      () => acceptAnswer({
        ...base,
        attemptId,
        landingActivityPolicy,
      }),
      /does not accept fields/,
    );
  }
});

test("runtime map state defaults empty and drives conditional paths when accepting an answer", () => {
  const board = createConditionalShortcutBoard();
  const learningPack = LEARNING_PACKS.positions;
  const createdRuntime = createTestRuntime({ learningPack });
  assert.deepEqual(createdRuntime.mapState, {});

  const runtime = {
    ...createdRuntime,
    mapState: { cloudRouteOpen: true },
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n14" } : team
    )),
  };
  const result = acceptAnswer({
    attemptId: "conditional-shortcut",
    runtime,
    board,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
    routeChoices: { n14: "e14c" },
  });

  assert.equal(result.runtime.teams[0].nodeId, "n17");
  assert.deepEqual(result.runtime.mapState, { cloudRouteOpen: true });
  assert.notStrictEqual(result.runtime.mapState, runtime.mapState);
  assert.deepEqual(
    result.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n17"],
  );
});

test("a legal early stop truncates movement without changing the revealed die", () => {
  const learningPack = LEARNING_PACKS.positions;
  const createdRuntime = createTestRuntime({ learningPack });
  const runtime = {
    ...createdRuntime,
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n04" } : team
    )),
  };
  const result = acceptAnswer({
    attemptId: "early-stop",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 4,
    routeChoices: { n04: "e04a" },
    stopNodeId: "n05a",
  });

  assert.equal(
    result.effects.find((effect) => effect.type === "dice_reveal")?.value,
    4,
  );
  assert.deepEqual(
    result.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n05a"],
  );
  assert.equal(result.effects.some((effect) => effect.type === "transport_move"), false);
  assert.equal(result.runtime.teams[0].nodeId, "n05a");
});

test("answer acceptance rejects stops outside a legal non-transport early node", () => {
  const learningPack = LEARNING_PACKS.positions;
  const createdRuntime = createTestRuntime({ learningPack });
  const runtime = {
    ...createdRuntime,
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n04" } : team
    )),
  };
  const baseOptions = {
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 4,
    routeChoices: { n04: "e04a" },
  };

  assert.throws(
    () => acceptAnswer({
      ...baseOptions,
      attemptId: "stop-off-route",
      stopNodeId: "n20",
    }),
    /stopNodeId must be an early node in the planned route: n20/,
  );
  assert.throws(
    () => acceptAnswer({
      ...baseOptions,
      attemptId: "stop-at-final",
      stopNodeId: "n08",
    }),
    /stopNodeId must be an early node in the planned route: n08/,
  );
  assert.throws(
    () => acceptAnswer({
      ...baseOptions,
      attemptId: "stop-at-transport",
      stopNodeId: "n06a",
    }),
    /stopNodeId cannot be a transport node: n06a/,
  );
});

test("attempt ids make answer acceptance idempotent and effect ids stable", () => {
  const learningPack = LEARNING_PACKS.routines;
  const initialRuntime = createTestRuntime({ learningPack });
  assert.throws(
    () => acceptAnswer({
      runtime: initialRuntime,
      board: BOARD_TEMPLATE,
      learningPack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue: 2,
    }),
    /attemptId must be a non-empty string/,
  );

  const first = acceptAnswer({
    attemptId: "speech-attempt-001",
    runtime: initialRuntime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 2,
  });
  const replayFromSameBase = acceptAnswer({
    attemptId: "speech-attempt-001",
    runtime: initialRuntime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 2,
  });
  assert.deepEqual(
    first.effects.map((effect) => effect.effectId),
    replayFromSameBase.effects.map((effect) => effect.effectId),
  );

  const committedState = {
    acceptedCount: first.runtime.acceptedCount,
    lastDie: first.runtime.lastDie,
    nodeId: first.runtime.teams[0].nodeId,
  };
  const duplicate = acceptAnswer({
    attemptId: " speech-attempt-001 ",
    runtime: first.runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 6,
  });
  assert.equal(duplicate.duplicate, true);
  assert.strictEqual(duplicate.runtime, first.runtime);
  assert.deepEqual(duplicate.effects, []);
  assert.deepEqual({
    acceptedCount: duplicate.runtime.acceptedCount,
    lastDie: duplicate.runtime.lastDie,
    nodeId: duplicate.runtime.teams[0].nodeId,
  }, committedState);
});

test("runtime retains only the 64 most recent processed attempt ids", () => {
  const learningPack = LEARNING_PACKS.positions;
  let runtime = createTestRuntime({ learningPack });
  for (let index = 1; index <= 65; index += 1) {
    const result = acceptAnswer({
      attemptId: `attempt-${index}`,
      runtime,
      board: BOARD_TEMPLATE,
      learningPack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue: 1,
    });
    runtime = result.runtime.phase === "EVENT_ACTIVE"
      ? closeActivity(result.runtime)
      : result.runtime;
  }
  assert.equal(runtime.processedAttemptIds.length, 64);
  assert.equal(runtime.processedAttemptIds.includes("attempt-1"), false);
  assert.equal(runtime.processedAttemptIds[0], "attempt-2");
  assert.equal(runtime.processedAttemptIds.at(-1), "attempt-65");
});

test("the opening signal cannon is available immediately", () => {
  const learningPack = LEARNING_PACKS.positions;
  for (const acceptedCount of [0, 1]) {
    const createdRuntime = createTestRuntime({ learningPack });
    const runtime = {
      ...createdRuntime,
      acceptedCount,
      teams: createdRuntime.teams.map((team, index) => (
        index === 0 ? { ...team, nodeId: "n05a" } : team
      )),
    };
    const result = acceptAnswer({
      attemptId: `locked-launcher-${acceptedCount}`,
      runtime,
      board: BOARD_TEMPLATE,
      learningPack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue: 1,
    });
    assert.equal(
      result.effects.some((effect) => effect.type === "transport_move"),
      true,
    );
    assert.equal(result.runtime.teams[0].nodeId, "n09");
  }

  for (let dieValue = 1; dieValue <= 6; dieValue += 1) {
    const runtime = createTestRuntime({ learningPack });
    const result = acceptAnswer({
      attemptId: `opening-roll-${dieValue}`,
      runtime,
      board: BOARD_TEMPLATE,
      learningPack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue,
    });
    assert.equal(
      result.effects.some((effect) => effect.type === "transport_move"),
      dieValue === 5,
      `opening die ${dieValue} transport availability must follow its landing space`,
    );
    if (dieValue === 5) {
      assert.equal(result.runtime.teams[0].nodeId, "n09");
    }
  }
});

test("landing on a transport space commits one target before the launcher animation", () => {
  const learningPack = LEARNING_PACKS.positions;
  const createdRuntime = createTestRuntime({ learningPack });
  const runtime = {
    ...createdRuntime,
    acceptedCount: 2,
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n05a" } : team
    )),
  };
  const result = acceptAnswer({
    attemptId: "launcher-transport",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  });
  const transportEffects = result.effects.filter((effect) => effect.type === "transport_move");

  assert.deepEqual(
    result.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n06a"],
  );
  assert.equal(transportEffects.length, 1);
  assert.deepEqual(transportEffects[0], {
    type: "transport_move",
    actorTeamId: "player-mia",
    transportProfileRef: "jump.launcher.v1",
    fromNodeId: "n06a",
    toNodeId: "n09",
    captureNodeIds: ["n08"],
    effectId: "launcher-transport:effect:4",
  });
  assert.equal(result.runtime.teams[0].nodeId, "n09");
});

test("transport effects expose optional authored capture node metadata", () => {
  const learningPack = LEARNING_PACKS.positions;
  const board = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n06a"
        ? { ...node, transportCaptureNodeIds: ["n08"] }
        : node
    )),
  };
  assert.deepEqual(validateBoardTemplate(board), []);

  const createdRuntime = createTestRuntime({ learningPack });
  const runtime = {
    ...createdRuntime,
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n05a" } : team
    )),
  };
  const result = acceptAnswer({
    attemptId: "launcher-capture-metadata",
    runtime,
    board,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  });
  const transportEffect = result.effects.find((effect) => effect.type === "transport_move");

  assert.deepEqual(transportEffect.captureNodeIds, ["n08"]);
  assert.notStrictEqual(
    transportEffect.captureNodeIds,
    board.nodes.find((node) => node.id === "n06a").transportCaptureNodeIds,
  );
});

test("both launchers advance at most three extra spaces", () => {
  const openingLauncher = BOARD_TEMPLATE.nodes.find((node) => node.id === "n06a");
  const offscreenLauncher = BOARD_TEMPLATE.nodes.find((node) => node.id === "n34");
  assert.equal(openingLauncher.transportTargetId, "n09");
  assert.equal("transportUnlockAfterCompletedTurns" in openingLauncher, false);
  assert.deepEqual(walkBoard(BOARD_TEMPLATE, "n06a", 3), ["n07a", "n08", "n09"]);
  assert.equal(offscreenLauncher.transportTargetId, "n37");
  assert.deepEqual(walkBoard(BOARD_TEMPLATE, "n34", 3), ["n35", "n36", "n37"]);
});

test("the offscreen launcher uses the same generic transport contract", () => {
  const learningPack = LEARNING_PACKS.positions;
  const createdRuntime = createTestRuntime({ learningPack });
  const runtime = {
    ...createdRuntime,
    teams: createdRuntime.teams.map((team, index) => (
      index === 0 ? { ...team, nodeId: "n33" } : team
    )),
  };
  const result = acceptAnswer({
    attemptId: "offscreen-launcher-transport",
    runtime,
    board: BOARD_TEMPLATE,
    learningPack,
    activityTemplates: ACTIVITY_TEMPLATES,
    dieValue: 1,
  });
  const transportEffects = result.effects.filter((effect) => effect.type === "transport_move");

  assert.deepEqual(
    result.effects.filter((effect) => effect.type === "pawn_step").map((effect) => effect.nodeId),
    ["n34"],
  );
  assert.equal(transportEffects.length, 1);
  assert.equal(transportEffects[0].actorTeamId, "player-mia");
  assert.equal(transportEffects[0].transportProfileRef, "jump.launcher.v1");
  assert.equal(transportEffects[0].fromNodeId, "n34");
  assert.equal(transportEffects[0].toNodeId, "n37");
  assert.equal(Object.hasOwn(transportEffects[0], "captureNodeIds"), false);
  assert.equal(result.runtime.teams[0].nodeId, "n37");
});

test("runtime rejects unknown interaction templates and evaluators", () => {
  const unknownInteractionPack = {
    ...LEARNING_PACKS.positions,
    tasks: LEARNING_PACKS.positions.tasks.map((task, index) => (
      index === 0
        ? { ...task, interactionTemplateRef: "voice.unknown.v1" }
        : task
    )),
  };
  assert.throws(
    () => createTestRuntime({ learningPack: unknownInteractionPack }),
    /task position-01 references unknown interaction template voice\.unknown\.v1/,
  );

  const unknownEvaluatorPack = {
    ...LEARNING_PACKS.positions,
    tasks: LEARNING_PACKS.positions.tasks.map((task, index) => (
      index === 0
        ? { ...task, evaluatorRef: "unknown-evaluator.v1" }
        : task
    )),
  };
  assert.throws(
    () => createTestRuntime({ learningPack: unknownEvaluatorPack }),
    /task position-01 references unknown evaluator unknown-evaluator\.v1/,
  );

  assert.throws(
    () => createTestRuntime({
      interactionTemplates: {
        ...INTERACTION_TEMPLATES,
        "voice.single-response.v1": {
          ...INTERACTION_TEMPLATES["voice.single-response.v1"],
          renderer: "",
        },
      },
    }),
    /interaction template voice\.single-response\.v1 is missing renderer/,
  );

  assert.throws(
    () => createTestRuntime({
      interactionTemplates: {
        ...INTERACTION_TEMPLATES,
        "voice.single-response.v1": {
          ...INTERACTION_TEMPLATES["voice.single-response.v1"],
          renderer: "missing.renderer.v1",
        },
      },
    }),
    /interaction template voice\.single-response\.v1 references unsupported renderer missing\.renderer\.v1/,
  );
});

test("runtime accepts one player state and eight independent player states", () => {
  const soloRuntime = createTestRuntime({
    teams: [{ id: "solo", label: "Mia", members: ["Mia"] }],
  });
  assert.equal(soloRuntime.teams.length, 1);
  assert.deepEqual(soloRuntime.teams[0].members, ["Mia"]);

  const fullRuntime = createTestRuntime({
    teams: Array.from({ length: 8 }, (_, index) => ({
      id: `player-${index + 1}`,
      label: `Player ${index + 1}`,
      members: [`Player ${index + 1}`],
    })),
  });
  assert.equal(fullRuntime.teams.length, 8);
  assert.equal(
    fullRuntime.teams.reduce((sum, team) => sum + team.members.length, 0),
    8,
  );
  assert.deepEqual(fullRuntime.teams.map((team) => team.coins), Array(8).fill(0));
});

test("runtime rejects team and member counts outside classroom bounds", () => {
  const invalidCases = [
    {
      teams: [],
      message: /teams must contain between 1 and 8 teams/,
    },
    {
      teams: Array.from({ length: 9 }, (_, index) => ({
        id: `team-${index}`,
        members: [`student-${index}`],
      })),
      message: /teams must contain between 1 and 8 teams/,
    },
    {
      teams: [{ id: "empty", members: [] }],
      message: /team empty must contain at least 1 member/,
    },
    {
      teams: [{
        id: "crowded",
        members: Array.from({ length: 9 }, (_, index) => `student-${index}`),
      }],
      message: /teams must contain between 1 and 8 members in total/,
    },
    {
      teams: [
        { id: "same", members: ["A"] },
        { id: "same", members: ["B"] },
      ],
      message: /teams contains duplicate id: same/,
    },
  ];

  for (const invalidCase of invalidCases) {
    assert.throws(
      () => createTestRuntime({ teams: invalidCase.teams }),
      invalidCase.message,
    );
  }
});

test("board validation rejects dangling transport targets", () => {
  const invalidBoard = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n06a" ? { ...node, transportTargetId: "missing-node" } : node
    )),
  };
  assert.match(validateBoardTemplate(invalidBoard).join("; "), /unknown target missing-node/);
});

test("board validation rejects invalid transport unlock turns", () => {
  for (const transportUnlockAfterCompletedTurns of [-1, 1.5, 97]) {
    const invalidBoard = {
      ...BOARD_TEMPLATE,
      nodes: BOARD_TEMPLATE.nodes.map((node) => (
        node.id === "n06a"
          ? { ...node, transportUnlockAfterCompletedTurns }
          : node
      )),
    };
    assert.match(
      validateBoardTemplate(invalidBoard).join("; "),
      /transportUnlockAfterCompletedTurns must be an integer from 0 to 96/,
    );
  }
});

test("board validation rejects invalid transport capture node metadata", () => {
  const nonArrayBoard = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n06a"
        ? { ...node, transportCaptureNodeIds: "n08" }
        : node
    )),
  };
  assert.match(
    validateBoardTemplate(nonArrayBoard).join("; "),
    /transport node n06a transportCaptureNodeIds must be an array/,
  );

  const unknownAndDuplicateBoard = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n06a"
        ? { ...node, transportCaptureNodeIds: ["n08", "n08", "missing-node"] }
        : node
    )),
  };
  const errors = validateBoardTemplate(unknownAndDuplicateBoard).join("; ");
  assert.match(errors, /transport node n06a has duplicate capture node n08/);
  assert.match(errors, /transport node n06a has unknown capture node missing-node/);
});

test("map-effect nodes require an isolated mapEffectRef contract", () => {
  const missingRef = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n05b"
        ? { ...node, mapEffectRef: "" }
        : node
    )),
  };
  assert.match(
    validateBoardTemplate(missingRef).join("; "),
    /map-effect node n05b is missing mapEffectRef/,
  );

  const illegalRef = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node) => (
      node.id === "n01"
        ? { ...node, mapEffectRef: "harbor.foghorn.v1" }
        : node
    )),
  };
  assert.match(
    validateBoardTemplate(illegalRef).join("; "),
    /node n01 has mapEffectRef but is not a map-effect space/,
  );
});

test("harbor foghorn is a map effect and never resolves a learning activity", () => {
  for (const learningPack of [LEARNING_PACKS.positions, LEARNING_PACKS.science]) {
    const createdRuntime = createTestRuntime({ learningPack });
    const runtime = {
      ...createdRuntime,
      teams: createdRuntime.teams.map((team, index) => (
        index === 0 ? { ...team, nodeId: "n04" } : team
      )),
    };
    const result = acceptAnswer({
      attemptId: `harbor-foghorn-${learningPack.id}`,
      runtime,
      board: BOARD_TEMPLATE,
      learningPack,
      activityTemplates: ACTIVITY_TEMPLATES,
      dieValue: 1,
      routeChoices: { n04: "e04b" },
    });
    const mapEffects = result.effects.filter((effect) => effect.type === "map_effect");

    assert.equal(result.runtime.teams[0].nodeId, "n05b");
    assert.equal(result.runtime.currentActivity, null);
    assert.equal(result.runtime.phase, "MISSION_PRESENT");
    assert.equal(result.effects.some((effect) => effect.type === "activity_open"), false);
    assert.equal(mapEffects.length, 1);
    assert.deepEqual(
      result.effects.map((effect) => effect.type),
      ["answer_accepted", "dice_reveal", "pawn_step", "map_effect"],
      "the harbor effect must remain downstream of answer, die, and movement",
    );
    assert.deepEqual(
      {
        actorTeamId: mapEffects[0].actorTeamId,
        mapEffectRef: mapEffects[0].mapEffectRef,
        nodeId: mapEffects[0].nodeId,
      },
      {
        actorTeamId: "player-mia",
        mapEffectRef: "harbor.foghorn.v1",
        nodeId: "n05b",
      },
    );
  }

  assert.equal(levelOneNodeKind("n05b"), "foghorn");
  assert.deepEqual(levelOneLandingBonus("n05b", 0), {
    kind: "foghorn",
    coins: 0,
    stars: 0,
    keys: 0,
    event: "harbor_foghorn",
  });
});

test("board validation rejects camera worlds with invalid spatial bounds", () => {
  const undersizedWorld = {
    ...BOARD_TEMPLATE,
    worldSize: { width: 800, height: 400 },
  };
  assert.match(
    validateBoardTemplate(undersizedWorld).join("; "),
    /worldSize cannot be smaller than the viewport/,
  );

  const overflowingZone = {
    ...BOARD_TEMPLATE,
    zones: BOARD_TEMPLATE.zones.map((zone, index) => (
      index === 0
        ? { ...zone, bounds: { ...zone.bounds, width: 2500 } }
        : zone
    )),
  };
  assert.match(validateBoardTemplate(overflowingZone).join("; "), /zone zone-01 exceeds world bounds/);

  const overflowingNode = {
    ...BOARD_TEMPLATE,
    nodes: BOARD_TEMPLATE.nodes.map((node, index) => (
      index === 0 ? { ...node, x: 2501 } : node
    )),
  };
  assert.match(validateBoardTemplate(overflowingNode).join("; "), /node n01 exceeds world bounds/);
});

test("die helper always returns an integer from one to six", () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.999999), 6);
  assert.equal(rollDie(() => 0.5), 4);
});

test("universal learning schema is strict and exposes no game-rule controls", () => {
  const schema = JSON.parse(readFileSync(
    new URL("../docs/schemas/universal-learning-pack.v0.schema.json", import.meta.url),
    "utf8",
  ));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.task.additionalProperties, false);
  assert.equal(schema.$defs.activityBinding.additionalProperties, false);
  for (const forbidden of ["script", "code", "probability", "diceWeight", "points", "winner"]) {
    assert.equal(schema.$defs.task.properties[forbidden], undefined);
    assert.equal(schema.$defs.evaluatorConfig.properties[forbidden], undefined);
  }
});

test("prototype renders authored strings without assigning innerHTML", () => {
  const appSource = readFileSync(
    new URL("../public/prototypes/universal-board/app.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.match(appSource, /\.textContent\s*=/);
  assert.match(appSource, /new Option\(/);
});

test("prototype exposes AI-scored dice choice and owner-safe personal asset lifecycle", () => {
  const html = readFileSync(
    new URL("../public/prototypes/universal-board/index.html", import.meta.url),
    "utf8",
  );
  const appSource = readFileSync(
    new URL("../public/prototypes/universal-board/app.js", import.meta.url),
    "utf8",
  );
  for (const id of [
    "setup-stage",
    "start-session",
    "activity-stage",
    "boss-stage",
    "results-stage",
    "resume-session",
    "player-character-tabs",
    "character-options",
    "turn-showtime",
    "turn-feedback",
    "mission-score-result",
    "dice-dock",
    "dice-dock-list",
    "dice-choice-stage",
    "dice-score-retry",
    "dice-score-retry-note",
    "dice-roll-stage",
    "dice-roll-cube-slot",
    "dice-roll-faces",
    "dice-roll-result",
    "card-reveal-stage",
    "session-goal",
    "collection-fx-layer",
    "collection-status",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /Roll the dice!/i);
  assert.doesNotMatch(html, /太阳队|队伍棋子|TEAM CHALLENGE/);
  assert.match(html, /玩家棋子/);
  assert.match(html, /CLASS CHALLENGE/);
  assert.match(html, /AI 会自动停录并给出表现分/);
  assert.doesNotMatch(html, /阿里云|ASR|工程验证|本地可玩闭环/);
  assert.match(appSource, /commitTeacherTurn : commitTriggeredTurn\)\(/);
  assert.match(appSource, /SentenceAssessmentClient/);
  assert.match(appSource, /chooseDieForProfile/);
  assert.match(appSource, /DICE_CHOICE_RETRY/);
  assert.match(appSource, /sentenceFramePresentation/);
  assert.match(appSource, /presentDiceRoll/);
  assert.match(appSource, /physical-die-face/);
  assert.match(appSource, /\.animate\(keyframes/);
  assert.match(appSource, /settlePlayerAssetsForMove/);
  assert.match(
    appSource,
    /settlePlayerAssetsForMove\(\{[\s\S]{0,320}diceRoll:\s*dieRoll/,
    "the selected die roll must be passed into personal asset settlement",
  );
  assert.match(html, /id="asr-toggle"/);
  assert.match(html, /id="teacher-accept"/);
  assert.doesNotMatch(html, /id="simulate-accepted"/);
  assert.doesNotMatch(html, /id="simulate-review"/);
  assert.doesNotMatch(html, /id="preview-activity"/);
  assert.doesNotMatch(html, /id="preview-launcher"/);
  assert.doesNotMatch(appSource, /function simulateAcceptedAnswer/);
  assert.doesNotMatch(appSource, /function simulateTeacherReview/);
  assert.doesNotMatch(appSource, /function previewLauncherTransport/);
  assert.doesNotMatch(appSource, /function previewCurrentActivity/);
  assert.doesNotMatch(appSource, /forcedStartNodeId/);
  assert.match(appSource, /turnFlowGuard\.consumeTurnCommand/);
  assert.match(appSource, /async function runAcceptedTurn\(turnCommand\)/);
  assert.doesNotMatch(
    appSource,
    /runAcceptedTurn\(\s*\{/,
    "formal turns must never be opened with caller-authored options",
  );
  assert.match(appSource, /let qaControlsEnabled = false;/);
  assert.match(appSource, /qaHarnessEnabled = qaControlsEnabled && QA_HARNESS_REQUESTED/);
  assert.match(appSource, /acknowledgePresentation\(/);
  assert.match(appSource, /completeBossSession\(/);
  assert.match(appSource, /localStorage\.setItem/);
  assert.match(
    appSource,
    /qaControlsEnabled\s*&&\s*QA_FAST_MODE_REQUESTED/,
    "QA fast-forward must stay behind the server-authorized QA gate",
  );
  assert.match(appSource, /minimumTurnsForSession\(/);
  assert.match(appSource, /const FEEDBACK_PHASES = \["judgement", "reward", "dice", "move", "effect"\]/);
  assert.match(appSource, /void playTurnShowtime\(\)/);
  assert.match(appSource, /assetSettlement\.summary/);
  assert.match(appSource, /const TURN_FEEDBACK_AUTO_DISMISS_MS = 6500;/);
  assert.match(appSource, /buildCollectionPresentationEvents/);
  assert.match(appSource, /createPlayerAssetStrip/);
  assert.match(appSource, /createPlayerRewardDetail/);
  assert.match(appSource, /dataset\.hudDensity\s*=\s*"compact"/);
  assert.match(appSource, /aria-describedby/);
  assert.match(appSource, /data\.playerAsset|dataset\.playerAsset/);
  assert.match(appSource, /animateDiceOptionsFromDock/);
  assert.doesNotMatch(html, /全班共享|个人贡献|共享宝库|全班图鉴/);
  assert.match(html, /右侧骰子候场：从上到下由最强到最基础/);
});
