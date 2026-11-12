import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTeacherSession, grantTeacherOpportunity, commitTeacherTurn, TEACHER_DICE } from "../public/js/lib/teacher-board-session.js";
import { createBoardSession, acknowledgePresentation, endBoardGame, commitTriggeredTurn, recordSpeechOutcome, isRestorableBoardSessionSnapshot } from "../public/js/lib/voice-board-session-core.js";
import { createRuntime, currentTask, rollTeacherMove, rollTeacherWorldMove, acceptAnswer, acceptWorldAnswer } from "../public/prototypes/universal-board/engine-core.js";
import { BOARD_TEMPLATE, THEME_PACKS } from "../public/prototypes/universal-board/packs.js";
import { DICE_DOCK_STRENGTH_ORDER } from "../public/prototypes/universal-board/dice-presentation.js";
import { createPlayerAssetsLedger, settlePlayerAssetTurn } from "../public/prototypes/universal-board/session-star-assets.js";
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, XIMITU_WORLD_ROUTE } from "../public/prototypes/universal-board/world-packs.js";
import { walkWorldPlan, resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";

function fixture(count = 2) {
  const teams = Array.from({ length: count }, (_, i) => ({ id: `team-${i}`, label: `P${i}`, members: [`P${i}`] }));
  const runtime = createRuntime({ mode: "teacher-led", board: BOARD_TEMPLATE, theme: THEME_PACKS["cloud-harbor"], teams });
  const session = initializeTeacherSession(createBoardSession({ sessionId: "teacher-game", teams,
    players: teams.map((team, i) => ({ id: `student-${i}`, displayName: team.label, teamId: team.id })) }));
  return { runtime, session };
}
function restorable(session, runtime) {
  return isRestorableBoardSessionSnapshot({ session, runtime, playerCount: session.seats.length,
    boardNodeIds: new Set(BOARD_TEMPLATE.nodes.map((node) => node.id)), expectedBoardId: BOARD_TEMPLATE.id,
    expectedThemeId: THEME_PACKS["cloud-harbor"].id });
}

test("teacher mode starts without knowledge data for 1, 2 and 8 students, using only highest die", () => {
  for (const count of [1, 2, 8]) {
    const { runtime, session } = fixture(count);
    assert.equal(currentTask(runtime), null);
    assert.equal(runtime.learningPackId, null);
    assert.equal(session.phase, "TEACHER_WAITING");
    assert.equal(restorable(session, runtime), true);
  }
  assert.equal(TEACHER_DICE, DICE_DOCK_STRENGTH_ORDER[0]);
});

test("one opportunity is bound to selected student and cannot be granted twice or forged as speech", () => {
  const { session } = fixture();
  assert.throws(() => grantTeacherOpportunity(session, { seatId: "outsider", opportunityId: "x" }));
  const ready = grantTeacherOpportunity(session, { seatId: "student-1", opportunityId: "roll-1" });
  assert.equal(ready.activeSeatIndex, 1);
  assert.throws(() => grantTeacherOpportunity(ready, { seatId: "student-0", opportunityId: "roll-2" }));
  assert.throws(() => commitTeacherTurn(ready, { attemptId: "roll-2", eventId: "event" }));
  assert.throws(() => commitTriggeredTurn(ready, { attemptId: "roll-1" }));
  assert.throws(() => recordSpeechOutcome(ready, { recognitionResultId: "voice", result: "retry" }));
  const committed = commitTeacherTurn(ready, { attemptId: "roll-1", eventId: "event" });
  assert.equal(committed.teacherOpportunity, null);
  assert.equal(committed.seats[1].opportunityCount, 1);
  assert.equal(committed.sharedStars, 0);
  assert.equal(committed.seats[1].acceptedCount, 0);
  assert.equal(commitTeacherTurn(committed, { attemptId: "roll-1" }), committed);
  assert.throws(() => endBoardGame(committed));
  assert.throws(() => acknowledgePresentation(committed, { eventId: "wrong" }));
});

test("same student can be rewarded consecutively past voice chapter quota without auto-ending", () => {
  let { session } = fixture();
  for (let i = 0; i < 20; i++) {
    session = grantTeacherOpportunity(session, { seatId: "student-1", opportunityId: `roll-${i}` });
    session = commitTeacherTurn(session, { attemptId: `roll-${i}`, eventId: `event-${i}` });
    session = acknowledgePresentation(session, { eventId: `event-${i}` });
    assert.equal(session.phase, "TEACHER_WAITING");
    assert.equal(session.activeSeatIndex, 1);
    assert.equal(session.finishPending, false);
  }
  assert.equal(session.seats[0].opportunityCount, 0);
  assert.equal(session.seats[1].opportunityCount, 20);
  const ended = endBoardGame(session);
  assert.equal(ended.screen, "RESULTS");
  assert.throws(() => grantTeacherOpportunity(ended, { seatId: "student-1", opportunityId: "again" }));
  assert.equal(fixture().session.completedTurns, 0);
});

test("restore keeps unused opportunity and sampled face; corrupt mode or face is refused", () => {
  const { runtime, session } = fixture();
  const ready = grantTeacherOpportunity(session, { seatId: "student-0", opportunityId: "roll-1" });
  ready.teacherOpportunity.faceIndex = 4;
  const restored = JSON.parse(JSON.stringify(ready));
  assert.equal(restorable(restored, runtime), true);
  assert.equal(restored.teacherOpportunity.faceIndex, 4);
  assert.equal(restorable(restored, { ...runtime, mode: "voice" }), false);
  restored.teacherOpportunity.faceIndex = 6;
  assert.equal(restorable(restored, runtime), false);
  assert.equal(restorable(endBoardGame(ready), runtime), true);
});

test("teacher map movement shares exact routes, emits no accepted answer and rejects duplicate settlement", () => {
  const { runtime } = fixture();
  const options = { attemptId: "teacher-roll", runtime, board: BOARD_TEMPLATE, dieValue: 2 };
  assert.throws(() => acceptAnswer(options));
  const moved = rollTeacherMove(options);
  assert.equal(moved.task, null);
  assert.equal(moved.runtime.acceptedCount, 0);
  assert.equal(moved.runtime.completedMoveCount, 1);
  assert.equal(moved.runtime.taskSchedule, null);
  assert.equal(moved.effects.filter((e) => e.type === "pawn_step").length, 2);
  assert.equal(moved.effects.some((e) => e.type === "answer_accepted" || e.type === "activity_open"), false);
  assert.equal(rollTeacherMove({ ...options, runtime: moved.runtime }).duplicate, true);
  assert.throws(() => rollTeacherMove({ ...options, runtime: { ...runtime, mode: "voice" } }));
});

test("teacher world transition consumes exact steps without knowledge, while voice entry remains locked", () => {
  const { runtime } = fixture();
  const start = BOARD_TEMPLATE.exits[0].nodeId;
  runtime.teams[0].nodeId = start;
  runtime.world = { schemaVersion: "world-runtime.v1", routeRef: `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`, active: { worldPackRef: CLOUD_HARBOR_WORLD_REF, instanceId: "game:world:1", ordinal: 1, mapState: {}, levelState: {} }, completed: [], processedMoveIds: [] };
  const worldPlan = walkWorldPlan({ moveId: "cross", worldInstanceId: "game:world:1", nextWorldInstanceId: "game:world:2",
    worldOrdinal: 1, worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: start, steps: 2,
    worldRoute: XIMITU_WORLD_ROUTE, registries: WORLD_REGISTRIES });
  const final = resolveWorldComposition(worldPlan.finalLocation.worldRef, WORLD_REGISTRIES);
  const options = { attemptId: "cross", runtime, worldPlan, finalBoard: final.board, activityTemplates: {} };
  assert.throws(() => acceptWorldAnswer(options));
  const moved = rollTeacherWorldMove(options);
  assert.equal(moved.task, null);
  assert.equal(moved.effects.filter((e) => e.type === "pawn_step").length, 2);
  assert.equal(moved.effects.filter((e) => e.type === "world_transition").length, 1);
  assert.equal(moved.runtime.acceptedCount, 0);
  assert.equal(moved.runtime.teams.length, 2);
});

test("teacher rewards use existing coin/star ledger without voice statistics; retries do not duplicate", () => {
  const ledger = createPlayerAssetsLedger({ playerIds: ["student-0", "student-1"] });
  const options = { ownerId: "student-1", settlementId: "teacher:actor", acceptedAnswer: false,
    rewards: [{ resource: "coin", amount: 2 }, { resource: "star", amount: 1 }] };
  const result = settlePlayerAssetTurn(ledger, options);
  assert.equal(result.ledger.playerAssetsById["student-1"].acceptedTurns, 0);
  assert.equal(result.ledger.playerAssetsById["student-1"].stars, 1);
  assert.equal(result.ledger.playerAssetsById["student-1"].coins, 2);
  assert.equal(result.ledger.playerAssetsById["student-0"].stars, 0);
  assert.deepEqual(settlePlayerAssetTurn(result.ledger, options).ledger, result.ledger);
});

test("voice authorization remains before shared pipeline; teacher mode never calls assessment or score picker", () => {
  const source = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const voiceEntry = source.slice(source.indexOf("async function runAcceptedTurn"), source.indexOf("async function runBoardTurn"));
  assert.match(voiceEntry, /turnFlowGuard\.consumeTurnCommand/);
  assert.match(voiceEntry, /phase !== "ANSWER_LISTENING"/);
  assert.ok(voiceEntry.indexOf("consumeTurnCommand") < voiceEntry.indexOf("return runBoardTurn"));
  const teacherStart = source.indexOf("async function runTeacherTurn");
  const teacherEntry = source.slice(teacherStart, source.indexOf("function renderMission", teacherStart));
  assert.doesNotMatch(teacherEntry, /chooseDieForProfile|handleSentenceDecision|score: 100|assessment\.start/);
  assert.match(teacherEntry, /persistStableSession[\s\S]*await runBoardTurn/);
  assert.match(source, /teacherMove\s*\? doubleDiceSteps\(gameSession\.teacherOpportunity\) !== null \? await rollTeacherDoubleDice\(\) : await rollTeacherDie\(\)\s*: await chooseDieForProfile/);
});
