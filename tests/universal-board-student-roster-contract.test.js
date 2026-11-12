import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";

const appUrl = new URL("../public/prototypes/universal-board/app.js", import.meta.url);
const htmlUrl = new URL("../public/prototypes/universal-board/index.html", import.meta.url);

test("pregame setup loads a student roster before character assignment", async () => {
  const [app, html] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(htmlUrl, "utf8"),
  ]);
  for (const selector of [
    "student-create-form",
    "student-profile-list",
    "student-roster-progress",
    "student-create-name",
    "student-manager-open",
    "student-manager-dialog",
    "student-manager-nickname",
    "student-manager-course-stage",
    "character-options",
  ]) {
    assert.match(html, new RegExp(`id=["']${selector}["']`));
  }
  assert.match(app, /fetch\("\/api\/student-profiles\/v1", \{ cache: "no-store" \}\)/);
  assert.match(app, /method: "PATCH"/);
  assert.match(app, /function studentGameName\(student\)/);
  assert.match(app, /nickname: nodes\.studentManagerNickname\.value\.trim\(\)/);
  assert.match(app, /id: student\.id,[\s\S]*teamId: `player-\$\{student\.id\}`/);
  assert.doesNotMatch(app, /studentProfileById\(studentId\)\?\.assetAccount \|\| \{\}/);
  assert.match(app, /startSession\.disabled = !complete/);
  assert.match(app, /"\u5148\u4ece\u8d44\u6599\u5e93\u9009\u62e9\u5b66\u751f"/);
});

function functionSource(app, name) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `missing function ${name}`);
  const tail = app.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}

test("retired student outboxes remain auditable and never become new asset writes", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /pendingStudentAssetSettlements: structuredClone/);
  assert.doesNotMatch(app, /\/asset-settlements|queueStudentAssetSettlement|flushPendingStudentAssetSettlements/);
  const restore = functionSource(app, "restoreLocalSession");
  const backup = restore.indexOf(":before-points-only:");
  assert.ok(backup >= 0);
  assert.ok(restore.indexOf("window.localStorage.setItem(backupKey, rawSnapshot)", backup) > backup);
  assert.ok(restore.indexOf("rewardPolicy: \"home-points-only.v1\"", backup) > backup);
  assert.match(restore, /pendingStudentAssetSettlements = Array\.isArray\(payload\.pendingStudentAssetSettlements\)/);
  assert.match(restore, /\.map\(\(settlement\) => structuredClone\(settlement\)\)/);
  const turn = functionSource(app, "runBoardTurn");
  assert.match(turn, /ownerId: actorSeat\.id,[\s\S]*settlementId: attemptId/);
  assert.match(turn, /assertLandingPlan\(\{ turn: authoritative\.turn, attemptId, studentId: actorSeat\.id/);
  assert.match(turn, /persistStableSession\([\s\S]*transactionPersisted = true;[\s\S]*await playLandingConfirmation[\s\S]*await landingPoints\.claim\(landingGameId\(\), attemptId\)/);
  assert.doesNotMatch(functionSource(app, "returnToSetup"), /pendingStudentAssetSettlements\.length|fetch\(/);
});

test("actual new-game startup archives old pending settlements without blocking or reassigning them", async () => {
  const app = await readFile(appUrl, "utf8");
  const key = "fixture-session";
  const retiredQueue = [{ settlementId: "old-turn", studentId: "old-student", coins: 4 }];
  const previous = JSON.stringify({ gameSession: { sessionId: "old-chapter", assetGameId: "old-game" },
    pendingStudentAssetSettlements: retiredQueue, playerAssetsLedger: { old: { coins: 4, stars: 1 } } });
  const storage = new Map([[key, previous]]);
  const calls = [];
  const roster = [{ id: "student-uuid-a", displayName: "Fixture A" }];
  const theme = { id: "cloud-harbor" };
  let ctx;
  ctx = createContext({
    structuredClone, sessionConfigurationLoading: false, LOCAL_SESSION_KEY: key,
    window: { localStorage: { getItem: (id) => storage.get(id) || null,
      setItem: (id, value) => { calls.push(`write:${id}`); storage.set(id, value); } } },
    rewardPresentationEpoch: 0, rewardPresentationQueues: new Map(),
    nodes: { cardRevealStage: {}, themeSelect: {}, learningSelect: {}, playerCount: {} },
    selectedStudentProfiles: () => roster, qaHarnessEnabled: false,
    characterAssignments: ["fixture-character"], normalizeCharacterAssignments: (value) => value,
    characterSelectionComplete: () => true, studentGameName: (student) => student.displayName,
    THEME_PACKS: { "cloud-harbor": theme }, theme, CLOUD_HARBOR_WORLD_REF: "fixture-world",
    LEARNING_PACKS: { family: { id: "fixture-learning" } }, SESSION_CONFIGS: { standard: { minOpportunitiesPerSeat: 2 } },
    createPrototypeRuntime: () => ({ teams: [{ id: "player-student-uuid-a", nodeId: "n01" }], mapState: {} }),
    minimumTurnsForSession: () => 2,
    createBoardSession: (input) => ({ ...input, seats: input.players, processedAttemptIds: [] }),
    crypto: { randomUUID: () => "new-id" }, TEACHER_MODE: "teacher-led",
    initializeTeacherSession: (session) => ({ ...session, mode: "teacher-led" }),
    STAR_ECONOMY_VERSION: "fixture-legacy-version", LANDING_POINTS_KIND: "final-landing-v1",
    authenticatedUserId: "teacher-uuid", pendingStudentAssetSettlements: structuredClone(retiredQueue),
    activeLevelPack: {}, activeBoardTemplate: { startNodeId: "n01" },
    worldRuntimeState: () => ({ active: { instanceId: "new-world-instance" } }),
    syncRuntimeToSession: (runtime) => runtime,
    createLedgerForSession: () => ({ playerAssetsById: { "student-uuid-a": { coins: 0, stars: 0 } } }),
    createInitialFairy: () => ({}), initialBoardCamera: () => ({}),
    persistStableSession: () => {
      calls.push("persist-new");
      storage.set(key, JSON.stringify({ gameSession: ctx.gameSession,
        pendingStudentAssetSettlements: ctx.pendingStudentAssetSettlements }));
    },
    ensureLandingRegistration: async () => { calls.push(`register:${ctx.gameSession.assetGameId}`); },
    // The special-cells opening only starts after registration resolves.
    ensureSpecialCellsOpening: async () => {},
    showLandingError: (error) => assert.fail(error.message),
    isTeacherSession: (session) => session.mode === "teacher-led",
    flushPendingStudentAssetSettlements: () => assert.fail("old outbox must not be flushed"),
    fetch: () => assert.fail("startup must not write retired assets"),
  });
  for (const name of ["cancelPendingDiceChoice", "cancelPendingRouteChoice", "cancelPendingCoinExchangeChoice",
    "destroySentenceListener", "hideTurnFeedback", "hideTurnShowtime", "activateWorldComposition",
    "syncVisiblePlayerAssets", "resetSpeechAttemptTracking", "render"]) ctx[name] = () => {};
  for (const name of ["createSessionDicePackSnapshot", "createSessionNodeRewardPackSnapshot", "createSessionCardCatalogSnapshot"]) {
    ctx[name] = () => ({});
  }
  for (const name of ["sessionPlayers", "usesLandingPoints", "startLocalSession"]) runInContext(functionSource(app, name), ctx);
  ctx.startLocalSession({ mode: "teacher-led", themeId: "cloud-harbor", learningPackId: "fixture-learning", count: 1, minOpportunities: 2 });
  assert.equal(storage.get(`${key}:game:old-game`), previous, "archive preserves the complete original bytes and pending IDs");
  assert.equal(ctx.gameSession.assetGameId, "local-session-new-id");
  assert.equal(ctx.gameSession.seats[0].id, "student-uuid-a");
  assert.equal(ctx.gameSession.seats[0].teamId, "player-student-uuid-a");
  assert.equal(ctx.gameSession.landingPoints.ownerId, "teacher-uuid");
  assert.equal(ctx.pendingStudentAssetSettlements.length, 0);
  assert.equal(JSON.parse(storage.get(key)).pendingStudentAssetSettlements.length, 0);
  assert.deepEqual(calls, [`write:${key}:game:old-game`, "persist-new", "register:local-session-new-id"]);
});
