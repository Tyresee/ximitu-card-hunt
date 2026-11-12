import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "../public/prototypes/universal-board/special-cells-core.js";
import { doubleDiceSteps } from "../public/prototypes/universal-board/double-dice-core.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assertLandingRoll, recoverableLandingTurns } from "../public/prototypes/universal-board/landing-points-game.js";

const source = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
function appFunction(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  return tail.slice(0, tail.slice(1).search(/\n(?:async )?function /) + 1);
}
const GAME = "synthetic-game", OWNER = "synthetic-owner", STUDENT = "synthetic-pupil", ATTEMPT = "last-lap-turn";
const localGame = (id = GAME, ownerId = OWNER) => ({ assetGameId: id, screen: "PLAYING", phase: "TEACHER_WAITING",
  inputGate: "closed", assetGameEnded: false, mode: "teacher-led", processedAttemptIds: [ATTEMPT],
  landingPoints: { kind: "final-landing-v1", ownerId } });

function fixture({ storageMode, autoSchedule = true } = {}) {
  const calls = [], tasks = [], storage = new Map(), seen = new Set();
  if (storageMode === "damaged") storage.set("intro-seen", "{damaged");
  let context;
  const session = { status: "open", specialCells: null, turns: { [ATTEMPT]: {
    attemptId: ATTEMPT, studentId: STUDENT, status: "planned", points: 100, receipt: null,
  } } };
  const windowStorage = {
    getItem: key => { if (storageMode === "read-failure") throw new Error("storage denied"); return storage.get(key) || null; },
    setItem: (key, raw) => { if (storageMode === "write-failure") throw new Error("quota"); storage.set(key, raw); },
  };
  context = vm.createContext({
    doubleDiceSteps, GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending,
    LANDING_POINTS_KIND: "final-landing-v1", SPECIAL_CELLS_INTRO_SEEN_KEY: "intro-seen", LOCAL_SESSION_KEY: "local-game",
    gameSession: localGame(), authenticatedUserId: OWNER, busy: false,
    specialCellsIntro: null, specialCellsUi: { busy: false }, specialCellsFollowUpActive: false,
    specialCellsOpeningTask: null, specialCellsIntroSeenMemory: seen, specialCellsHiddenIds: new Set(),
    landingRecoveryFlights: new Map(), landingPointsMessage: "", recoverableLandingTurns,
    snapshot: { locked: true, drawNumber: 3, drawHistory: [{ drawNumber: 1 }, { drawNumber: 2 }], cells: [], groupMoves: {}, bonusAwards: {} },
    runtime: { world: { active: { instanceId: "world-one", worldPackRef: "world-one@1" } },
      teams: [{ id: `player-${STUDENT}`, nodeId: "n49" }] },
    isTeacherSession: game => game?.mode === "teacher-led", currentSpecialCells: () => context.snapshot,
    queueMicrotask: callback => tasks.push(callback), window: { localStorage: windowStorage }, localStorage: windowStorage,
    renderSpecialCellsHud() {}, renderBoard() {}, setSpecialCellsOverview() {},
    trackGroupCoinGain() {}, holdCoinFxDisplays() {}, prepareTrackedGroupCoinHolds: () => {}, presentTrackedGroupRewards: async () => {},
    coinFx: { unholdIdle() {} },
    claimGroupLandingRewards: async (id, move) => context.landingPoints.claimGroupMove(id, move.instanceId),
    renderHud() { calls.push("hud"); }, renderPlatformPoints() { calls.push("records"); },
    renderTeacherPanel() { if (autoSchedule) context.scheduleSpecialCellsOpening(); },
    render() { calls.push("render"); if (autoSchedule) context.scheduleSpecialCellsOpening(); },
    syncCircuitLapProgress() { calls.push("sync"); },
    resumePendingSpecialCellMove: async () => {},
    playSpecialCellsIntro: async mode => {
      calls.push(`intro:${context.gameSession.assetGameId}:${context.snapshot.drawNumber}:${mode}`);
      context.specialCellsIntro = { playing: true };
      context.markSpecialCellsIntroSeen(context.gameSession.assetGameId, context.snapshot.drawNumber);
      context.specialCellsIntro = { playing: false };
      context.renderTeacherPanel();
    },
    nodes: { teacherStatus: { textContent: "" }, board: { style: {} } },
    beginTeacherDiceWait: () => () => {},
    console: { warn() {} },
    landingPoints: { get: () => { session.specialCells = context.snapshot; return { session }; },
      getTurn: () => session.turns[ATTEMPT], refresh: async () => ({ session }),
      claim: async () => { session.turns[ATTEMPT].status = "awarded"; session.turns[ATTEMPT].receipt = {}; },
    },
  });
  for (const name of ["usesLandingPoints", "landingGameId", "savedLandingGame", "groupLandingMoves", "pendingGroupLandingAwards",
    "groupSourceLocallyCommitted", "restoreConfirmedGroupPositions", "recoverLandingPoints", "needsLandingRecovery", "showLandingError", "specialCellsBlockingDice", "scheduleSpecialCellsOpening",
    "specialCellsIntroSeen", "markSpecialCellsIntroSeen", "ensureSpecialCellsOpening", "finishLandingTurnFollowUps"]) {
    vm.runInContext(appFunction(name), context);
  }
  const flush = async () => {
    for (let index = 0; index < 16; index++) {
      while (tasks.length) tasks.shift()();
      await Promise.resolve();
    }
  };
  return { context, calls, tasks, session, storage, seen, flush };
}
const intros = fixture => fixture.calls.filter(call => call.startsWith("intro:"));

test("late receipt advancing the bonus generation starts its short opening and releases the dice gate", async () => {
  const f = fixture();
  f.context.snapshot.drawNumber = 2; f.seen.add(`${GAME}:2`);
  let finishClaim, claimStarted;
  const waiting = new Promise(resolve => { finishClaim = resolve; });
  const started = new Promise(resolve => { claimStarted = resolve; });
  f.context.landingPoints.claim = async () => {
    claimStarted(); await waiting;
    f.session.turns[ATTEMPT].status = "awarded"; f.session.turns[ATTEMPT].receipt = {};
    f.context.snapshot.drawNumber = 3;
    f.context.renderTeacherPanel(); // The real client notifies after accepting the response.
  };
  f.context.runSpecialCellFollowUp = async () => { f.calls.push("follow-up"); };
  const finishing = f.context.finishLandingTurnFollowUps(ATTEMPT, GAME);
  await started;
  await f.context.ensureSpecialCellsOpening(); // A concurrent older render only sees completed draw2.
  assert.deepEqual(intros(f), []);
  assert.equal(f.calls.includes("follow-up"), false, "the follow-up waits for recovery, rather than racing it");
  finishClaim(); await finishing; await f.flush();
  assert.deepEqual(intros(f), [`intro:${GAME}:3:short`]);
  assert.equal(f.context.specialCellsBlockingDice(), "");
  assert.equal(f.context.gameSession.phase, "TEACHER_WAITING");
  assert.equal(f.session.turns[ATTEMPT].status, "awarded");
  assert.match(appFunction("renderTeacherPanel"), /scheduleSpecialCellsOpening\(\)/);
  assert.match(source, /void finishLandingTurnFollowUps\(attemptId, landingGameId\(\)\)/);
});

test("recovery finding a new draw before a failed roll reopens the same saved opportunity", async () => {
  const f = fixture(); f.context.snapshot.drawNumber = 2; f.seen.add(`${GAME}:2`);
  const opportunity = { id: "original-saved-opportunity", seatId: STUDENT };
  Object.assign(f.context, {
    gameSession: { ...localGame(), phase: "TEACHER_ROLL_READY", inputGate: "open", teacherOpportunity: opportunity },
    voiceBoardAsrAuthenticated: true, qaHarnessEnabled: false,
    currentSessionSeat: () => ({ id: STUDENT }), ensureLandingRegistration: async () => {},
    recoverLandingPoints: async () => { f.context.snapshot.drawNumber = 3; },
    assertLandingRoll, currentDicePack: () => null,
    persistStableSession: () => f.calls.push("saved-die"), playerAssetsLedger: {}, fairyState: {},
    boardSounds: { unlock() {} }, runBoardTurn: async command => f.calls.push(`roll-presentation:${command.attemptId}`),
  });
  const attempts = [];
  f.context.landingPoints.roll = async (_id, options) => { attempts.push(options.attemptId); throw new Error("network unavailable"); };
  vm.runInContext(appFunction("runTeacherTurn"), f.context);
  await f.context.runTeacherTurn(); await f.flush();
  assert.equal(f.context.busy, false);
  assert.equal(f.context.gameSession.phase, "TEACHER_ROLL_READY");
  assert.equal(f.context.gameSession.teacherOpportunity, opportunity);
  assert.deepEqual(intros(f), [`intro:${GAME}:3:short`]);
  assert.equal(f.context.specialCellsBlockingDice(), "");
  f.context.landingPoints.roll = async (_id, options) => {
    attempts.push(options.attemptId);
    return { turn: { attemptId: options.attemptId, studentId: STUDENT, teacherDiceRef: "teacher-dice.v1", faceIndex: 0, steps: 1,
      startLocation: { worldRef: "world-one@1", worldInstanceId: "world-one", nodeId: "n49" } } };
  };
  await f.context.runTeacherTurn();
  assert.deepEqual(attempts, [opportunity.id, opportunity.id]);
  assert.equal(f.context.gameSession.teacherOpportunity.faceIndex, 0);
  assert.ok(f.calls.includes(`roll-presentation:${opportunity.id}`));
});

test("busy and follow-up states defer opening until an idle render, including a busy change after queuing", async () => {
  for (const flag of ["busy", "specialCellsFollowUpActive"]) {
    const f = fixture(); f.context[flag] = true;
    f.context.renderTeacherPanel(); await f.flush();
    assert.deepEqual(intros(f), []);
    f.context[flag] = false; f.context.renderTeacherPanel();
    f.context[flag] = true; await f.flush();
    assert.deepEqual(intros(f), []);
    f.context[flag] = false; f.context.renderTeacherPanel(); await f.flush();
    assert.equal(intros(f).length, 1);
  }
});

test("repeated renders coalesce and queued opening adopts the latest same-game generation", async () => {
  const f = fixture();
  for (let count = 0; count < 10; count++) f.context.renderTeacherPanel();
  assert.equal(f.tasks.length, 1);
  f.context.snapshot.drawNumber = 4;
  f.context.renderTeacherPanel(); await f.flush();
  assert.deepEqual(intros(f), [`intro:${GAME}:4:short`]);
  for (let count = 0; count < 10; count++) f.context.renderTeacherPanel();
  await f.flush();
  assert.equal(intros(f).length, 1);
});

test("unavailable or damaged intro storage does not repeat the show or permanently block the dice", async () => {
  for (const storageMode of ["read-failure", "write-failure", "damaged"]) {
    const f = fixture({ storageMode });
    f.context.renderTeacherPanel(); await f.flush();
    assert.equal(f.context.specialCellsIntroSeen(GAME, 3), true, storageMode);
    assert.equal(f.context.specialCellsBlockingDice(), "", storageMode);
    for (let count = 0; count < 10; count++) f.context.renderTeacherPanel();
    await f.flush();
    assert.equal(intros(f).length, 1, storageMode);
    assert.deepEqual(f.context.gameSession.processedAttemptIds, [ATTEMPT], "presentation fallback cannot rewrite rule proof");
  }
});

test("switching games or accounts cancels old queued work without swallowing the new game's queue", async () => {
  const f = fixture(); f.context.renderTeacherPanel();
  f.context.gameSession = localGame("new-game", "new-owner"); f.context.authenticatedUserId = "new-owner";
  f.context.renderTeacherPanel(); await f.flush();
  assert.deepEqual(intros(f), ["intro:new-game:3:short"]);
  const account = fixture(); account.context.renderTeacherPanel();
  account.context.authenticatedUserId = "another-owner"; await account.flush();
  assert.deepEqual(intros(account), []);
  account.context.authenticatedUserId = OWNER; account.context.renderTeacherPanel(); await account.flush();
  assert.deepEqual(intros(account), [`intro:${GAME}:3:short`]);
});

test("serial follow-ups stop after an awaited recovery if the game ended, returned to setup or changed owner", async () => {
  for (const change of [ctx => { ctx.gameSession.assetGameEnded = true; }, ctx => { ctx.gameSession = null; },
    ctx => { ctx.gameSession.screen = "RESULTS"; }, ctx => { ctx.authenticatedUserId = "another-owner"; }]) {
    const f = fixture({ autoSchedule: false });
    f.context.recoverLandingPoints = async () => { f.calls.push("recover"); change(f.context); };
    f.context.runSpecialCellFollowUp = async () => { f.calls.push("follow-up"); };
    await f.context.finishLandingTurnFollowUps(ATTEMPT, GAME);
    assert.deepEqual(f.calls, ["recover"]);
  }
  const f = fixture({ autoSchedule: false }); f.session.turns[ATTEMPT].receipt = {};
  f.context.runSpecialCellFollowUp = async () => { f.calls.push("follow-up"); f.context.gameSession.assetGameEnded = true; };
  await f.context.finishLandingTurnFollowUps(ATTEMPT, GAME);
  assert.deepEqual(f.calls, ["follow-up"], "the post-challenge await has the same current-game fence");
});

test("scheduler cannot enter an ended game, setup, or unresolved group payout", async () => {
  for (const change of [ctx => { ctx.gameSession.assetGameEnded = true; }, ctx => { ctx.gameSession.screen = "SETUP"; },
    ctx => { ctx.snapshot.groupMoves.pending = { status: "pending" }; },
    ctx => { ctx.snapshot.groupMoves.confirmed = { status: "confirmed", rewardPolicy: "group-final-landing-v1", awards: [{ status: "planned" }] }; }]) {
    const f = fixture(); change(f.context);
    f.context.renderTeacherPanel(); await f.flush();
    assert.deepEqual(intros(f), []);
  }
});
