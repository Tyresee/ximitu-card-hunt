import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "../public/prototypes/universal-board/special-cells-core.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { LANDING_POINTS_KIND, recoverableLandingTurns } from "../public/prototypes/universal-board/landing-points-game.js";
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, CRYSTAL_V121_WORLD_REF, CRYSTAL_V121_ROUTE_REF, BEYOND_CLOUD_WORLD_REF, CIRCUIT_WORLD_ROUTE_REF } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { DEFAULT_NODE_REWARD_PACK, cloneNodeRewardPack, retargetNodeRewardPack, updateNodeRewardPolicy } from "../public/prototypes/universal-board/node-reward-pack-core.js";
import { DEFAULT_DICE_PACK, cloneDicePack } from "../public/prototypes/universal-board/dice-pack-core.js";
import { TEACHER_MODE, TEACHER_DICE_REF, isTeacherSession } from "../public/js/lib/teacher-board-session.js";
import { createPointsWorld } from "../standalone/points-movement.mjs";

const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
function source(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0);
  const tail = app.slice(start);
  return tail.slice(0, tail.slice(1).search(/\n(?:async )?function /) + 1);
}

test("landing registration keeps student and game identity without reviving whole-game awards", () => {
  const start = source("startLocalSession");
  const registration = source("ensureLandingRegistration");
  assert.match(start, /gameSession\.assetGameId = gameSession\.sessionId/);
  assert.match(start, /mode === TEACHER_MODE && authenticatedUserId && selectedStudentProfiles\(\)\.length === normalizedCount/);
  assert.match(start, /if \(usesLandingPoints\(\)\) \{[\s\S]*ensureLandingRegistration\(\{ retryUnstarted: true \}\)/);
  assert.match(registration, /if \(!usesLandingPoints\(local\)\) return null/);
  assert.match(registration, /local\.landingPoints\.ownerId !== authenticatedUserId/);
  assert.match(registration, /externalSessionId = landingGameId\(local\)/);
  assert.match(registration, /studentIds: local\.seats\.map\(\(seat\) => seat\.id\)/);
  assert.match(registration, /retryUnstarted && !local\.processedAttemptIds\?\.length && !Number\.isInteger\(local\.teacherOpportunity\?\.faceIndex\)/);
  assert.match(source("continueExpeditionSession"), /assetGameId = previousSession\.assetGameId \|\| previousSession\.sessionId/);
  assert.doesNotMatch(source("continueExpeditionSession"), /registerNewGame|ensureLandingRegistration/);
  assert.doesNotMatch(source("restoreLocalSession"), /landingPoints\.registerNewGame/);
  assert.match(source("restoreLocalSession"), /if \(usesLandingPoints\(\)\) \{[\s\S]*gameSession\.landingPoints\.rule \? recoverLandingPoints\(\)/);
  assert.doesNotMatch(app, /platformPoints\.|confirmCompletion|createPlatformPointsController/);
});

function finishFixture({ landing = false, offline = false } = {}) {
  const calls = [];
  const storage = new Map();
  const session = { assetGameId: "fixture-game", assetGameEnded: false,
    processedAttemptIds: ["original-turn", "already-paid"],
    ...(landing ? { landingPoints: { kind: LANDING_POINTS_KIND, ownerId: "fixture-teacher" } } : {}) };
  const turns = {
    original: { attemptId: "original-turn", studentId: "fixture-student", status: "planned" },
    unfinished: { attemptId: "not-committed", studentId: "fixture-student", status: "planned" },
    rolled: { attemptId: "unused-die", studentId: "fixture-student", status: "rolled" },
    paid: { attemptId: "already-paid", studentId: "fixture-student", status: "awarded", receipt: { amount: 100 } },
  };
  const forbidden = (name) => () => { calls.push(name); assert.fail(`${name} is retired`); };
  let ctx;
  ctx = createContext({
    GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending,
    busy: false, specialCellsFollowUpActive: false, gameSession: session, LANDING_POINTS_KIND, recoverableLandingTurns, CIRCUIT_WORLD_ROUTE_REF,
    authenticatedUserId: "fixture-teacher", landingRecoveryFlights: new Map(), landingPointsMessage: "",
    destroySentenceListener() {}, hideTurnFeedback() {}, hideTurnShowtime() {},
    endBoardGame: (game) => ({ ...game, assetGameEnded: true }),
    stablePlayerIds: () => ["fixture-student"],
    playerAssetsLedger: { playerAssetsById: { "fixture-student": { coins: 3, stars: 1 } } },
    persistStableSession: () => { calls.push("persist"); }, runtime: {}, fairyState: {}, LOCAL_SESSION_KEY: "fixture-game-key",
    savedSessionPayload: () => ({ gameSession: ctx.gameSession, playerAssetsLedger: ctx.playerAssetsLedger }),
    window: { localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem(key, value) { calls.push("archive"); storage.set(key, value); },
    } },
    lastSessionSummary: {}, syncVisiblePlayerAssets() {}, render() {}, renderHud() {},
    platformPoints: { confirmCompletion: forbidden("whole-game award") },
    queueStudentAssetSettlement: forbidden("legacy outbox enqueue"),
    flushPendingStudentAssetSettlements: forbidden("legacy outbox flush"),
    landingPoints: {
      refresh: (id) => { calls.push(`refresh:${id}`); return offline ? new Promise(() => {}) : Promise.resolve(); },
      get: () => ({ session: { turns } }),
      claim: async (id, attemptId) => { calls.push(`claim:${id}:${attemptId}`); },
      close: async (id) => { calls.push(`close:${id}`); },
      registerNewGame: forbidden("retroactive registration"),
    },
    trackGroupCoinGain() {}, holdCoinFxDisplays() {}, prepareTrackedGroupCoinHolds: () => {}, presentTrackedGroupRewards: async () => {},
    coinFx: { unholdIdle() {} },
    claimGroupLandingRewards: async (id, move) => ctx.landingPoints.claimGroupMove(id, move.instanceId),
    renderPlatformPoints() {}, showLandingError: forbidden("unexpected recovery failure"),
    returnToSetup: async (options) => { assert.equal(options.clearSnapshot, false); calls.push("returned"); },
  });
  for (const name of ["usesLandingPoints", "landingGameId", "syncCircuitLapProgress", "savedLandingGame",
    "groupLandingMoves", "pendingGroupLandingAwards", "groupSourceLocallyCommitted", "restoreConfirmedGroupPositions", "recoverLandingPoints", "finishCurrentGame"]) {
    runInContext(source(name), ctx);
  }
  return { ctx, calls, storage };
}

test("actual teacher end grants no legacy award and only recovers committed original landings", async (t) => {
  for (const landing of [false, true]) await t.test(landing ? "registered landing game" : "legacy game", async () => {
    const { ctx, calls, storage } = finishFixture({ landing });
    const before = JSON.stringify(ctx.playerAssetsLedger);
    await ctx.finishCurrentGame({ returnToSetupAfter: true });
    await ctx.landingRecoveryFlights.get("fixture-teacher:fixture-game");
    assert.equal(ctx.gameSession.assetGameEnded, true);
    assert.equal(JSON.stringify(ctx.playerAssetsLedger), before);
    assert.equal(JSON.parse(storage.get("fixture-game-key:game:fixture-game")).gameSession.assetGameEnded, true);
    assert.deepEqual(calls.slice(0, 2), ["persist", "archive"]);
    assert.ok(calls.includes("returned"));
    assert.deepEqual(calls.filter((call) => /^(refresh|claim|close):/.test(call)), landing ? [
      "refresh:fixture-game", "claim:fixture-game:original-turn", "close:fixture-game",
    ] : []);
    const completedCalls = [...calls];
    await ctx.finishCurrentGame();
    assert.deepEqual(calls, completedCalls, "ending twice must not retry or mint another reward");
  });
});

test("teacher end persists and returns to setup while original landing recovery is offline", async () => {
  const { ctx, calls } = finishFixture({ landing: true, offline: true });
  await ctx.finishCurrentGame({ returnToSetupAfter: true });
  assert.deepEqual(calls, ["persist", "archive", "refresh:fixture-game", "returned"]);
  assert.equal(ctx.gameSession.assetGameEnded, true);
  await ctx.finishCurrentGame();
  assert.equal(calls.filter((call) => call === "refresh:fixture-game").length, 1);
});

function registrationFixture({ processedAttemptIds = [], completedTurns = 0, unknownWorld = false } = {}) {
  const calls = [];
  const storage = new Map();
  const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  const session = { sessionId: "fixture-session", assetGameId: "fixture-game", mode: TEACHER_MODE,
    seats: [{ id: "fixture-student", displayName: "Fixture student" }], processedAttemptIds,
    teacherDiceRef: TEACHER_DICE_REF, teacherOpportunity: null,
    landingPoints: { kind: LANDING_POINTS_KIND, ownerId: "fixture-teacher", rule: null } };
  const registered = {
    id: "fixture-server-session", externalSessionId: session.assetGameId, completedTurns,
    ...createPointsWorld(["fixture-student"], () => "fixture-old-instance", CRYSTAL_V121_ROUTE_REF),
    rule: { revision: "monopoly-final-landing-v1", currency: "wordattack-points",
      worlds: [CRYSTAL_V121_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map((worldRef) => {
        const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
        return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
          nodes: board.nodes.map(({ id }) => ({ nodeId: id, points: 100 })) };
      }) },
  };
  if (unknownWorld) registered.world.active.worldPackRef = "world.ximitu.cloud-harbor@99.0.0";
  const rewards = { schemaVersion: "node-reward-pack-session-snapshot.v1", revision: "fixture-authored-reward-revision",
    pack: updateNodeRewardPolicy(DEFAULT_NODE_REWARD_PACK, CLOUD_HARBOR_WORLD_REF, "n02", { type: "coin", amount: 3 }) };
  const dice = { schemaVersion: "dice-pack-session-snapshot.v1", revision: "fixture-original-dice-revision",
    pack: cloneDicePack(DEFAULT_DICE_PACK) };
  let cached = null;
  const ctx = createContext({
    structuredClone, LANDING_POINTS_KIND, WORLD_REGISTRIES, TEACHER_MODE, isTeacherSession, CIRCUIT_WORLD_ROUTE_REF,
    resolveWorldComposition, cloneNodeRewardPack, retargetNodeRewardPack, DEFAULT_NODE_REWARD_PACK,
    authenticatedUserId: "fixture-teacher", gameSession: session, landingPointsMessage: "waiting",
    activeWorldComposition: composition, activeBoardTemplate: composition.board, activeLevelPack: composition.level,
    theme: composition.theme, runtime: { boardId: composition.board.id, themeId: composition.theme.id,
      ...createPointsWorld(["fixture-student"], () => "fixture-new-instance") },
    sessionNodeRewardPackSnapshot: rewards, sessionDicePackSnapshot: dice,
    playerAssetsLedger: { playerAssetsById: { "fixture-student": { coins: 3, stars: 1 } } }, fairyState: {},
    sessionCardCatalogSnapshot: { revision: "fixture-catalog" }, sessionClassroomEventProgramSnapshot: null,
    pendingStudentAssetSettlements: [], lastDicePresentation: null, teacherSelectedSeatId: null, characterAssignments: ["fixture-character"],
    playerCount: 1, attemptSequence: 0, speechAttemptTurnKey: "", speechAttemptOrdinal: 0,
    scoreRetryUsedTurnKey: null, LOCAL_SESSION_KEY: "fixture-key", LOCAL_SESSION_SCHEMA_VERSION: "fixture-schema",
    camera: { x: 0, y: 0, scale: 1 }, regionArtSceneCache: null, visitedNodeIds: new Set(), unavailableArtwork: new Set(),
    // Only presentation and storage I/O are shims; adoption, snapshot creation,
    // serialization, and world/reward resolution execute the production functions.
    applyConfirmedVisualBoard: (worldRef) => calls.push(["visual-board", worldRef]),
    composedThemeForWorld: (resolved) => resolved.theme,
    initialBoardCamera: () => ({ x: 0, y: 0, scale: 1 }),
    applyTheme: () => calls.push(["theme"]), render: () => calls.push(["render"]),
    updateResumeAvailability: () => calls.push(["resume-availability"]),
    window: { localStorage: { setItem: (key, value) => { calls.push(["persist", key]); storage.set(key, value); } } },
    landingPoints: {
      get: () => cached,
      registerNewGame: async (request) => { calls.push(["register", structuredClone(request)]); cached = { session: registered }; },
      refresh: async (id) => { calls.push(["refresh", id]); cached = { session: registered }; },
    },
  });
  for (const name of ["usesLandingPoints", "landingGameId", "syncCircuitLapProgress", "activateWorldComposition", "createSessionNodeRewardPackSnapshot",
    "savedSessionPayload", "persistStableSession", "ensureLandingRegistration"]) runInContext(source(name), ctx);
  return { ctx, calls, storage, session, registered, rewards, dice, composition };
}

test("actual initial landing registration restores the bridge's exact v1 world and persists matching immutable snapshots", async () => {
  const { ctx, calls, storage, session, registered, rewards, dice } = registrationFixture();
  const originalDice = structuredClone(dice);
  assert.equal(await ctx.ensureLandingRegistration({ retryUnstarted: true }), registered);
  assert.deepEqual(calls[0], ["register", { externalSessionId: "fixture-game", studentIds: ["fixture-student"],
    mode: TEACHER_MODE, retryUnstarted: true }]);
  assert.equal(ctx.activeWorldComposition.worldRef, CRYSTAL_V121_WORLD_REF);
  assert.equal(ctx.activeBoardTemplate.version, "2.2.1");
  assert.equal(ctx.activeLevelPack.version, "2.0.0");
  assert.equal(ctx.theme.version, "2.2.1");
  assert.equal(ctx.runtime.world.routeRef, CRYSTAL_V121_ROUTE_REF);
  assert.deepEqual(ctx.runtime.world, registered.world);
  assert.notEqual(ctx.runtime.world, registered.world, "adopted world must be a snapshot, not a mutable response reference");
  assert.deepEqual(ctx.runtime.mapState, registered.world.active.mapState);
  assert.equal(ctx.runtime.boardId, ctx.activeBoardTemplate.id);
  assert.equal(ctx.runtime.themeId, ctx.theme.id);
  assert.deepEqual(ctx.gameSession.landingPoints.rule, registered.rule);
  assert.notEqual(ctx.gameSession.landingPoints.rule, registered.rule);
  assert.equal(ctx.gameSession.seats, session.seats);
  assert.equal(ctx.gameSession.assetGameId, session.assetGameId);
  assert.equal(ctx.gameSession.teacherDiceRef, session.teacherDiceRef);
  assert.equal(ctx.sessionDicePackSnapshot, dice, "world adoption must not replace the locked dice snapshot");
  assert.deepEqual(dice, originalDice);
  const adoptedRewards = ctx.sessionNodeRewardPackSnapshot;
  assert.equal(adoptedRewards.revision, rewards.revision);
  assert.deepEqual(adoptedRewards.pack.worlds[CRYSTAL_V121_WORLD_REF].nodes, rewards.pack.worlds[CLOUD_HARBOR_WORLD_REF].nodes);
  assert.deepEqual(adoptedRewards.pack.worlds[CRYSTAL_V121_WORLD_REF].nodes.n02, { type: "coin", amount: 3 });
  assert.equal(adoptedRewards.pack.worlds[CRYSTAL_V121_WORLD_REF].boardRef, "ximitu-card-hunt-board.v1@2.2.1");
  assert.equal(adoptedRewards.pack.worlds[CRYSTAL_V121_WORLD_REF].levelRef, "ximitu-card-hunt.level-01@2.0.0");
  assert.deepEqual(adoptedRewards.pack.worlds[BEYOND_CLOUD_WORLD_REF], rewards.pack.worlds[BEYOND_CLOUD_WORLD_REF]);
  assert.equal(adoptedRewards.pack.worlds[CLOUD_HARBOR_WORLD_REF], undefined);
  const saved = JSON.parse(storage.get("fixture-key"));
  assert.deepEqual(saved.runtime.world, registered.world);
  assert.deepEqual(saved.runtime.mapState, registered.world.active.mapState);
  assert.deepEqual(saved.gameSession, JSON.parse(JSON.stringify(ctx.gameSession)));
  assert.deepEqual(saved.nodeRewardPackSnapshot, JSON.parse(JSON.stringify(adoptedRewards)));
  assert.deepEqual(saved.dicePackSnapshot, originalDice);
  assert.equal(saved.themeId, ctx.theme.id);
  assert.equal(calls.filter(([name]) => name === "persist").length, 1);
  assert.ok(calls.findIndex(([name]) => name === "theme") < calls.findIndex(([name]) => name === "persist"));
  assert.equal(ctx.landingPointsMessage, "");
  const savedText = storage.get("fixture-key");
  await ctx.ensureLandingRegistration({ retryUnstarted: true });
  assert.equal(calls.filter(([name]) => name === "register").length, 1);
  assert.equal(calls.filter(([name]) => name === "persist").length, 1, "repeat registration must not rewrite an already locked game");
  assert.equal(storage.get("fixture-key"), savedText);
});

test("initial landing recovery rejects played or unknown worlds before changing composition or saving", async (t) => {
  for (const [name, options, error] of [
    ["local committed attempt", { processedAttemptIds: ["original-turn"] }, /棋局恢复信息不完整/],
    ["server completed turn", { completedTurns: 1 }, /棋局恢复信息不完整/],
    ["unknown exact world", { unknownWorld: true }, /world|世界/i],
  ]) await t.test(name, async () => {
    const { ctx, calls, storage, session, rewards, dice, composition } = registrationFixture(options);
    const runtimeBefore = JSON.stringify(ctx.runtime);
    const snapshotsBefore = JSON.stringify([session, rewards, dice]);
    await assert.rejects(ctx.ensureLandingRegistration({ retryUnstarted: true }), error);
    assert.equal(storage.size, 0);
    assert.equal(ctx.gameSession, session);
    assert.equal(ctx.activeWorldComposition, composition);
    assert.equal(ctx.activeBoardTemplate, composition.board);
    assert.equal(ctx.activeLevelPack, composition.level);
    assert.equal(ctx.theme, composition.theme);
    assert.equal(JSON.stringify(ctx.runtime), runtimeBefore);
    assert.equal(ctx.sessionNodeRewardPackSnapshot, rewards);
    assert.equal(ctx.sessionDicePackSnapshot, dice);
    assert.equal(JSON.stringify([session, rewards, dice]), snapshotsBefore);
    assert.ok(calls.every(([operation]) => ["refresh", "register"].includes(operation)), "no theme activation, render or persistence on rejection");
    if (options.processedAttemptIds) assert.deepEqual(calls, [["refresh", "fixture-game"]]);
  });
});
