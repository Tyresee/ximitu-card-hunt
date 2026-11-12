import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  LEGACY_BOARD_TEMPLATE_V2,
  LEGACY_CLOUD_HARBOR_THEME_V2,
} from "../public/prototypes/universal-board/packs.js";

import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
  LEGACY_CLOUD_HARBOR_WORLD_REF,
  LEGACY_XIMITU_WORLD_ROUTE,
  LEGACY_XIMITU_WORLD_ROUTE_REF,
  WORLD_PACKS,
  WORLD_REGISTRIES,
  WORLD_REWARD_DEFINITIONS,
  XIMITU_GAME_RELEASE,
  XIMITU_WORLD_ROUTE,
} from "../public/prototypes/universal-board/world-packs.js";
import {
  commitSharedExpedition,
  resolveWorldComposition,
  validateWorldPack,
  validateWorldRoute,
  walkWorldPlan,
} from "../public/prototypes/universal-board/world-runtime-core.js";

test("the release composes two exact, independently loadable four-region worlds", () => {
  assert.equal(XIMITU_GAME_RELEASE.version, "2.3.0");
  assert.equal(XIMITU_GAME_RELEASE.worldRouteRef, "route.ximitu-main@1.3.0");
  assert.equal(CLOUD_HARBOR_WORLD_REF, "world.ximitu.cloud-harbor@1.3.0");
  assert.deepEqual(validateWorldRoute(XIMITU_WORLD_ROUTE, WORLD_REGISTRIES), []);
  assert.deepEqual(
    validateWorldRoute(LEGACY_XIMITU_WORLD_ROUTE, WORLD_REGISTRIES),
    [],
  );
  for (const [worldRef, worldPack] of Object.entries(WORLD_PACKS)) {
    assert.deepEqual(validateWorldPack(worldPack, WORLD_REGISTRIES), []);
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    assert.ok(composition.board.zones.length <= 4);
    assert.ok(composition.board.artRegions.length <= 4);
  }
});

test("the previously published World 01 board and theme remain byte-stable", () => {
  const hash = (value) => createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

  assert.equal(LEGACY_CLOUD_HARBOR_WORLD_REF, "world.ximitu.cloud-harbor@1.0.0");
  assert.equal(LEGACY_XIMITU_WORLD_ROUTE_REF, "route.ximitu-main@1.0.0");
  assert.equal(
    hash(LEGACY_BOARD_TEMPLATE_V2),
    "55cba900b896563e8a5fc5e38997c98779fd77fe2d739e20896bd2fe7c75e758",
  );
  assert.equal(
    hash(LEGACY_CLOUD_HARBOR_THEME_V2),
    "ea36922cf1334c1ad0c169b58dc6be409e40e05dbc93e9182326c5f82ddfc690",
  );
});

test("the first world has a forward-only exit and the route reaches World 02", () => {
  const first = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  assert.equal(first.board.edges.some((edge) => edge.from === "n49"), false);
  assert.equal(first.board.edges.some((edge) => edge.to === "n01"), false);
  assert.deepEqual(first.board.exits, [{
    id: "forward",
    nodeId: "n49",
    transitionProfileRef: "world.portal.forward.v1",
  }]);
  assert.deepEqual(XIMITU_WORLD_ROUTE.transitions, [{
    fromWorldRef: CLOUD_HARBOR_WORLD_REF,
    exitId: "forward",
    toWorldRef: BEYOND_CLOUD_WORLD_REF,
  }]);
  assert.deepEqual(XIMITU_WORLD_ROUTE.repeatableTail, {
    worldRef: BEYOND_CLOUD_WORLD_REF,
    exitId: "forward",
    instancePolicy: "append-new-instance-v1",
  });
});

test("a real six-step plan crosses the old n49 boundary without losing a die step", () => {
  const plan = walkWorldPlan({
    moveId: "attempt-real-registry-1",
    worldInstanceId: "session-1:world:1",
    nextWorldInstanceId: "session-1:world:2",
    worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF,
    startNodeId: "n47",
    steps: 6,
    routeChoicesByWorldInstance: {},
    mapStatesByWorldInstance: {
      "session-1:world:1": {},
      "session-1:world:2": {},
    },
    worldRoute: XIMITU_WORLD_ROUTE,
    registries: WORLD_REGISTRIES,
  });

  assert.equal(plan.stepsConsumed, 6);
  assert.deepEqual(
    plan.effects.map(({ type }) => type),
    [
      "pawn_step",
      "pawn_step",
      "world_transition",
      "pawn_step",
      "pawn_step",
      "pawn_step",
      "pawn_step",
    ],
  );
  assert.equal(plan.finalLocation.worldRef, BEYOND_CLOUD_WORLD_REF);
  assert.equal(plan.finalLocation.nodeId, "w2n05a");
});

test("World 02 w2n52 appends fresh World 02 instances without a terminal throw", () => {
  let worldRuntime = {
    schemaVersion: "world-runtime.v1",
    routeRef: "route.ximitu-main@1.3.0",
    active: {
      instanceId: "session-world2-tail:world:2",
      ordinal: 2,
      worldPackRef: BEYOND_CLOUD_WORLD_REF,
      mapState: { auroraBridgeOpen: true },
      levelState: {
        discoveredNodeIds: ["w2n52"],
        displayedDiscoveryIds: ["world-02-complete"],
      },
    },
    completed: [{
      instanceId: "session-world2-tail:world:1",
      ordinal: 1,
      worldPackRef: CLOUD_HARBOR_WORLD_REF,
    }],
    processedTransitionIds: [],
  };
  let teams = [
    { id: "player-1", nodeId: "w2n50", coins: 6 },
    { id: "player-2", nodeId: "w2n40", coins: 2 },
    { id: "player-3", nodeId: "w2n12", coins: 1 },
  ];

  for (let nextOrdinal = 3; nextOrdinal <= 5; nextOrdinal += 1) {
    const currentInstanceId = worldRuntime.active.instanceId;
    const nextWorldInstanceId = `session-world2-tail:world:${nextOrdinal}`;
    const plan = walkWorldPlan({
      moveId: `attempt-world2-tail-${nextOrdinal}`,
      worldInstanceId: currentInstanceId,
      nextWorldInstanceId,
      worldOrdinal: worldRuntime.active.ordinal,
      worldRef: BEYOND_CLOUD_WORLD_REF,
      startNodeId: "w2n50",
      steps: 4,
      routeChoicesByWorldInstance: {},
      mapStatesByWorldInstance: {
        [currentInstanceId]: { auroraBridgeOpen: true },
        [nextWorldInstanceId]: { auroraBridgeOpen: true },
      },
      worldRoute: XIMITU_WORLD_ROUTE,
      registries: WORLD_REGISTRIES,
    });

    assert.equal(plan.stepsConsumed, 4);
    assert.deepEqual(
      plan.effects.map(({ type }) => type),
      [
        "pawn_step",
        "pawn_step",
        "world_transition",
        "pawn_step",
        "pawn_step",
      ],
    );
    assert.deepEqual(
      plan.effects
        .filter(({ type }) => type === "pawn_step")
        .map(({ nodeId }) => nodeId),
      ["w2n51", "w2n52", "w2n02", "w2n03"],
    );
    assert.equal(plan.transitions[0].zeroStepCost, true);
    assert.equal(plan.transitions[0].fromWorldRef, BEYOND_CLOUD_WORLD_REF);
    assert.equal(plan.transitions[0].toWorldRef, BEYOND_CLOUD_WORLD_REF);
    assert.equal(plan.transitions[0].fromNodeId, "w2n52");
    assert.equal(plan.transitions[0].toEntryNodeId, "w2n01");
    assert.equal(plan.finalLocation.worldInstanceId, nextWorldInstanceId);
    assert.equal(plan.finalLocation.worldOrdinal, nextOrdinal);
    assert.equal(plan.finalLocation.nodeId, "w2n03");
    assert.deepEqual(plan.arrivalState, {
      mapState: { auroraBridgeOpen: false },
      levelState: {
        discoveredNodeIds: [],
        displayedDiscoveryIds: [],
        discoveredNodeIdsByPlayerId: {},
        discoveriesByPlayerId: {},
      },
    });

    const committed = commitSharedExpedition({
      worldRuntime,
      teams,
      activeTeamId: "player-1",
      plan,
    });
    assert.deepEqual(
      committed.teams.map(({ nodeId }) => nodeId),
      ["w2n03", "w2n01", "w2n01"],
    );
    assert.deepEqual(
      committed.worldRuntime.active.mapState,
      { auroraBridgeOpen: false },
    );
    assert.deepEqual(
      committed.worldRuntime.active.levelState,
      {
        discoveredNodeIds: [],
        displayedDiscoveryIds: [],
        discoveredNodeIdsByPlayerId: {},
        discoveriesByPlayerId: {},
      },
    );
    assert.equal(
      new Set(
        [
          ...committed.worldRuntime.completed.map(({ instanceId }) => instanceId),
          committed.worldRuntime.active.instanceId,
        ],
      ).size,
      committed.worldRuntime.completed.length + 1,
    );

    worldRuntime = {
      ...committed.worldRuntime,
      active: {
        ...committed.worldRuntime.active,
        mapState: { auroraBridgeOpen: true },
        levelState: {
          discoveredNodeIds: ["w2n52"],
          displayedDiscoveryIds: [`world-02-${nextOrdinal}`],
        },
      },
    };
    teams = committed.teams.map((team) => ({
      ...team,
      nodeId: team.id === "player-1" ? "w2n50" : "w2n49",
    }));
  }

  assert.equal(worldRuntime.active.ordinal, 5);
  assert.equal(worldRuntime.completed.length, 4);
});

test("every registered node reward resolves without teaching or score fields", () => {
  for (const composition of [
    resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES),
    resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES),
  ]) {
    for (const node of composition.board.nodes) {
      const binding = composition.level.nodeBindings[node.id];
      assert.ok(binding, `${composition.worldRef}#${node.id} needs a reward binding`);
      assert.ok(
        WORLD_REWARD_DEFINITIONS[binding.rewardRef],
        `${binding.rewardRef} must be registered`,
      );
    }
  }
  assert.doesNotMatch(
    JSON.stringify({
      worldPacks: WORLD_PACKS,
      route: XIMITU_WORLD_ROUTE,
      rewardDefinitions: WORLD_REWARD_DEFINITIONS,
    }),
    /taskId|transcript|score|learningPack/i,
  );
});
