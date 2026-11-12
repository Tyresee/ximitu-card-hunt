import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
function fn(name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const tail = app.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return tail.slice(0, end + 1);
}

function fixture({ payload = {
  gameSession: { screen: "PLAYING", sessionId: "same-game", seats: [{ id: "saved-pupil" }],
    teacherOpportunity: { id: "original-attempt", seatId: "saved-pupil", faceIndex: 4 } },
}, raw, ...overrides } = {}) {
  const serialized = raw === undefined ? JSON.stringify(payload) : raw;
  const calls = [];
  const context = createContext({
    gameSession: null, sessionConfigurationLoading: false, LAYOUT_EDITOR_REQUESTED: false,
    authenticatedUserId: "teacher-a", qaHarnessEnabled: false, LOCAL_SESSION_KEY: "game-save",
    window: { localStorage: { getItem: key => { assert.equal(key, "game-save"); return serialized; } } },
    restoreLocalSession: () => { calls.push("restore"); context.gameSession = payload.gameSession; },
    ...overrides,
  });
  runInContext(fn("restoreLocalSessionOnStartup"), context);
  return { context, calls, serialized };
}

test("opening an active game restores the original saved roster, attempt and locked die", () => {
  const f = fixture();
  assert.equal(f.context.restoreLocalSessionOnStartup(), true);
  assert.deepEqual(f.calls, ["restore"]);
  assert.equal(f.context.gameSession.sessionId, "same-game");
  assert.equal(f.context.gameSession.seats[0].id, "saved-pupil");
  assert.equal(f.context.gameSession.teacherOpportunity.id, "original-attempt");
  assert.equal(f.context.gameSession.teacherOpportunity.faceIndex, 4);
  assert.equal(f.context.restoreLocalSessionOnStartup(), false, "a second startup cannot overwrite the live game");
  assert.deepEqual(f.calls, ["restore"]);
});

test("startup never resumes before authentication/configuration, or into the editor", () => {
  for (const options of [
    { sessionConfigurationLoading: true }, { authenticatedUserId: null }, { LAYOUT_EDITOR_REQUESTED: true },
  ]) {
    const f = fixture(options);
    assert.equal(f.context.restoreLocalSessionOnStartup(), false);
    assert.deepEqual(f.calls, []);
  }
  const qa = fixture({ authenticatedUserId: null, qaHarnessEnabled: true });
  assert.equal(qa.context.restoreLocalSessionOnStartup(), true);
});

test("paused, finished, corrupt, and another teacher's saves stay intact on their entry screen", () => {
  for (const options of [
    { payload: null }, { raw: "{damaged-json" },
    { payload: { gameSession: { screen: "RESULTS" } } },
    { payload: { gameSession: { screen: "PLAYING", assetGameEnded: true } } },
    { payload: { autoResumeOnReload: false, gameSession: { screen: "PLAYING" } } },
    { payload: { ownerUserId: "teacher-b", gameSession: { screen: "PLAYING" } } },
    { payload: { gameSession: { screen: "PLAYING", landingPoints: { ownerId: "teacher-b" } } } },
  ]) {
    const f = fixture(options);
    assert.equal(f.context.restoreLocalSessionOnStartup(), false);
    assert.deepEqual(f.calls, []);
  }
});

test("active saves keep the selected child, and explicit pause writes only a reload preference", () => {
  const writes = new Map();
  const session = { sessionId: "original-game", landingPoints: { ownerId: "teacher-a" } };
  const context = createContext({
    gameSession: session, runtime: { teams: [{ nodeId: "n12a" }] }, playerAssetsLedger: {}, fairyState: {},
    LOCAL_SESSION_SCHEMA_VERSION: 12, LOCAL_SESSION_KEY: "game-save", teacherSelectedSeatId: "saved-pupil",
    authenticatedUserId: "teacher-a", isTeacherSession: () => true, theme: { id: "cloud-harbor" },
    playerCount: 1, characterAssignments: ["same-character"], attemptSequence: 7,
    speechAttemptTurnKey: null, speechAttemptOrdinal: 0, scoreRetryUsedTurnKey: null, camera: {},
    pendingStudentAssetSettlements: [], sessionDicePackSnapshot: { dice: "locked" },
    sessionNodeRewardPackSnapshot: { rewards: "locked" }, sessionCardCatalogSnapshot: { cards: "locked" },
    sessionClassroomEventProgramSnapshot: null, lastDicePresentation: { steps: 5 }, structuredClone,
    window: { localStorage: { setItem: (key, value) => writes.set(key, JSON.parse(value)) } },
    updateResumeAvailability() {},
  });
  runInContext(`${fn("savedSessionPayload")}\n${fn("persistStableSession")}`, context);
  assert.equal(context.persistStableSession(), true);
  const active = writes.get("game-save");
  assert.equal(active.autoResumeOnReload, true);
  assert.equal(active.teacherSelectedSeatId, "saved-pupil");
  assert.equal(active.ownerUserId, "teacher-a");
  assert.equal(context.persistStableSession(undefined, undefined, undefined, undefined,
    { autoResumeOnReload: false }), true);
  const paused = writes.get("game-save");
  assert.equal(paused.autoResumeOnReload, false);
  assert.deepEqual({ ...paused, autoResumeOnReload: true }, active);
  assert.equal(session.sessionId, "original-game");
});
