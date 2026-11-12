import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgePresentation,
  buildSessionSummary,
  commitAcceptedTurn,
  commitTriggeredTurn,
  completeBossSession,
  createBoardSession,
  currentSessionSeat,
  isRestorableBoardSessionSnapshot,
  recordSpeechOutcome,
  resolveSessionActivity,
  sessionRound,
} from "../public/js/lib/voice-board-session-core.js";
import { minimumTurnsForSession } from "../public/prototypes/universal-board/experience-core.js";

function seatId(seat) {
  return typeof seat === "string" ? seat : seat?.id;
}

function createPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `seat-${index + 1}`,
    displayName: `Player ${index + 1}`,
    // Adjacent seats intentionally share a team. Rotation must still follow
    // seat order instead of alternating or advancing by team.
    teamId: index < 2 ? "comet" : "rainbow",
  }));
}

function createTeams() {
  return [
    {
      id: "comet",
      label: "Comet Team",
      adventureResources: { keys: 2, cannonCharges: 1 },
    },
    {
      id: "rainbow",
      label: "Rainbow Team",
      adventureResources: { keys: 1, cannonCharges: 3 },
    },
  ];
}

function settleAcceptedTurn(session, attemptId) {
  const eventId = `${attemptId}:presentation`;
  const committed = commitAcceptedTurn(session, { attemptId, eventId });
  return acknowledgePresentation(committed, {
    eventId,
    activityPending: false,
  });
}

test("session accepts one to eight seats and starts with a two-opportunity minimum", () => {
  for (const count of [1, 8]) {
    const session = createBoardSession({
      players: createPlayers(count),
      teams: createTeams(),
    });

    assert.equal(session.phase, "ANSWER_LISTENING");
    assert.equal(session.screen, "PLAYING");
    assert.equal(session.inputGate, "open");
    assert.equal(session.sharedStars, 0);
    assert.equal(session.minOpportunitiesPerSeat, 2);
    assert.equal(session.minTotalTurns, 12);
    assert.equal(seatId(currentSessionSeat(session)), "seat-1");
    assert.equal(sessionRound(session), 1);
  }

  assert.throws(
    () => createBoardSession({ players: [], teams: createTeams() }),
    /between 1 and 8|1.{0,12}8|players/i,
  );
  assert.throws(
    () => createBoardSession({ players: createPlayers(9), teams: createTeams() }),
    /between 1 and 8|1.{0,12}8|players/i,
  );
  for (const minTotalTurns of [0, 1.5, 97]) {
    assert.throws(
      () => createBoardSession({
        players: createPlayers(1),
        teams: createTeams(),
        minTotalTurns,
      }),
      /minTotalTurns must be an integer from 1 to 96/,
    );
  }
});

test("accepted turns rotate by global seat order, not by team", () => {
  let session = createBoardSession({
    players: createPlayers(3),
    teams: createTeams(),
  });

  assert.equal(seatId(currentSessionSeat(session)), "seat-1");

  session = settleAcceptedTurn(session, "rotation-1");
  assert.equal(
    seatId(currentSessionSeat(session)),
    "seat-2",
    "the next adjacent seat speaks even when it belongs to the same team",
  );
  assert.equal(sessionRound(session), 1);

  session = settleAcceptedTurn(session, "rotation-2");
  assert.equal(seatId(currentSessionSeat(session)), "seat-3");
  assert.equal(sessionRound(session), 1);

  session = settleAcceptedTurn(session, "rotation-3");
  assert.equal(seatId(currentSessionSeat(session)), "seat-1");
  assert.equal(sessionRound(session), 2);
});

test("a committed answer is settled before another microphone input can be accepted", () => {
  const initial = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
  });
  const committed = commitAcceptedTurn(initial, {
    attemptId: "settlement-1",
    eventId: "settlement-1:presentation",
  });

  assert.equal(committed.phase, "ANSWER_LISTENING");
  assert.equal(committed.inputGate, "settlement_pending");
  assert.equal(committed.sharedStars, 1);
  assert.equal(seatId(currentSessionSeat(committed)), "seat-1");

  assert.throws(
    () => commitAcceptedTurn(committed, { attemptId: "settlement-2" }),
    /settlement|presentation|input.?gate|not open/i,
  );

  const acknowledged = acknowledgePresentation(committed, {
    eventId: "settlement-1:presentation",
    activityPending: false,
  });
  assert.equal(acknowledged.phase, "ANSWER_LISTENING");
  assert.equal(acknowledged.inputGate, "open");
  assert.equal(seatId(currentSessionSeat(acknowledged)), "seat-2");
});

test("an acknowledged classroom activity keeps the original speaker until it resolves", () => {
  const initial = createBoardSession({
    players: createPlayers(3),
    teams: createTeams(),
  });
  const committed = commitAcceptedTurn(initial, {
    attemptId: "activity-1",
    eventId: "activity-1:presentation",
  });
  const activity = acknowledgePresentation(committed, {
    eventId: "activity-1:presentation",
    activityPending: true,
  });

  assert.equal(activity.phase, "ACTIVITY_ACTIVE");
  assert.equal(activity.inputGate, "closed");
  assert.equal(
    seatId(currentSessionSeat(activity)),
    "seat-1",
    "the accepted speaker owns the activity until its outcome is resolved",
  );
  assert.throws(
    () => commitAcceptedTurn(activity, { attemptId: "activity-overlap" }),
    /activity|input.?gate|not open/i,
  );

  const resolved = resolveSessionActivity(activity, {
    outcome: "completed",
  });
  assert.equal(resolved.phase, "ANSWER_LISTENING");
  assert.equal(resolved.inputGate, "open");
  assert.equal(seatId(currentSessionSeat(resolved)), "seat-2");
});

test("a one-opportunity quick session still cannot end after one accepted sentence", () => {
  let session = createBoardSession({
    players: createPlayers(1),
    teams: createTeams(),
    minOpportunitiesPerSeat: 1,
  });

  session = settleAcceptedTurn(session, "quick-gate-1");

  assert.equal(session.completedTurns, 1);
  assert.equal(session.seats[0].opportunityCount, 1);
  assert.equal(session.finishPending, false);
  assert.equal(session.phase, "ANSWER_LISTENING");
  assert.equal(session.inputGate, "open");
});

test("shared boss requires both every seat's opportunities and the 12-turn floor", () => {
  let session = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
  });

  session = settleAcceptedTurn(session, "boss-gate-1");
  session = settleAcceptedTurn(session, "boss-gate-2");
  assert.equal(session.phase, "ANSWER_LISTENING");
  assert.equal(sessionRound(session), 2);

  session = settleAcceptedTurn(session, "boss-gate-3");
  assert.equal(session.phase, "ANSWER_LISTENING");
  assert.equal(seatId(currentSessionSeat(session)), "seat-2");

  session = settleAcceptedTurn(session, "boss-gate-4");
  assert.equal(session.sharedStars, 4);
  assert.equal(session.finishPending, false);
  assert.equal(session.phase, "ANSWER_LISTENING");

  for (let turn = 5; turn <= 11; turn += 1) {
    session = settleAcceptedTurn(session, `boss-gate-${turn}`);
    assert.equal(session.phase, "ANSWER_LISTENING");
  }

  session = settleAcceptedTurn(session, "boss-gate-12");
  assert.equal(session.completedTurns, 12);
  assert.equal(session.sharedStars, 12);
  assert.equal(session.finishPending, true);
  assert.equal(session.phase, "BOSS_READY");
  assert.equal(session.inputGate, "closed");

  const completed = completeBossSession(session, {
    outcome: "victory",
  });
  assert.equal(completed.phase, "COMPLETED");
  assert.equal(completed.screen, "RESULTS");
  assert.equal(completed.inputGate, "closed");
});

test("one, two, four and eight player sessions finish with equal seat opportunities", () => {
  const configurations = [
    { playerCount: 1, teamCount: 1, minTotalTurns: 12, opportunitiesPerSeat: 12 },
    { playerCount: 2, teamCount: 2, minTotalTurns: 12, opportunitiesPerSeat: 6 },
    { playerCount: 4, teamCount: 4, minTotalTurns: 12, opportunitiesPerSeat: 3 },
    { playerCount: 8, teamCount: 8, minTotalTurns: 24, opportunitiesPerSeat: 3 },
  ];

  for (const configuration of configurations) {
    const teams = Array.from({ length: configuration.teamCount }, (_, index) => ({
      id: `team-${index + 1}`,
      label: `Team ${index + 1}`,
      members: [],
    }));
    const players = Array.from({ length: configuration.playerCount }, (_, index) => {
      const team = teams[index % teams.length];
      const player = {
        id: `seat-${index + 1}`,
        displayName: `Player ${index + 1}`,
        teamId: team.id,
      };
      team.members.push(player.displayName);
      return player;
    });
    const minTotalTurns = minimumTurnsForSession({
      playerCount: configuration.playerCount,
      teamCount: configuration.teamCount,
      minOpportunitiesPerSeat: 2,
    });
    assert.equal(minTotalTurns, configuration.minTotalTurns);

    let session = createBoardSession({
      players,
      teams,
      minOpportunitiesPerSeat: 2,
      minTotalTurns,
    });
    for (let turn = 1; turn <= minTotalTurns; turn += 1) {
      session = settleAcceptedTurn(
        session,
        `fair-${configuration.playerCount}-${turn}`,
      );
    }

    assert.equal(session.phase, "BOSS_READY");
    assert.deepEqual(
      session.seats.map((seat) => seat.opportunityCount),
      Array(configuration.playerCount).fill(configuration.opportunitiesPerSeat),
    );
  }
});

test("attempt ids are idempotent even while presentation settlement is pending", () => {
  const initial = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
  });
  const first = commitAcceptedTurn(initial, {
    attemptId: " stable-attempt-id ",
  });
  const duplicate = commitAcceptedTurn(first, {
    attemptId: "stable-attempt-id",
  });

  assert.strictEqual(duplicate, first);
  assert.equal(duplicate.sharedStars, 1);
  assert.equal(seatId(currentSessionSeat(duplicate)), "seat-1");
  assert.equal(duplicate.inputGate, "settlement_pending");
});

test("low-score mistakes, keyword triggers and teacher passes move without claiming mastery", () => {
  const initial = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
    minOpportunitiesPerSeat: 1,
  });
  const lowScore = commitTriggeredTurn(initial, {
    attemptId: "wrong-low-score-1",
    resolution: "knowledge_wrong_low_score",
  });
  assert.equal(lowScore.sharedStars, 0);
  assert.equal(lowScore.seats[0].opportunityCount, 1);
  assert.equal(lowScore.seats[0].acceptedCount, 0);
  assert.equal(
    lowScore.seats[0].lastTriggerReason,
    "knowledge_wrong_low_score",
  );

  const afterLowScore = acknowledgePresentation(lowScore, {
    eventId: lowScore.pendingPresentation.eventId,
  });
  const keyword = commitTriggeredTurn(afterLowScore, {
    attemptId: "keyword-1",
    resolution: "keyword_trigger",
    triggerReason: "keyword_match",
  });
  assert.equal(keyword.sharedStars, 0);
  assert.equal(keyword.seats[1].opportunityCount, 1);
  assert.equal(keyword.seats[1].acceptedCount, 0);
  assert.equal(keyword.seats[1].keywordTriggerCount, 1);

  const afterKeyword = acknowledgePresentation(keyword, {
    eventId: keyword.pendingPresentation.eventId,
  });
  const teacherPass = commitTriggeredTurn(afterKeyword, {
    attemptId: "teacher-1",
    resolution: "teacher_pass",
  });
  assert.equal(teacherPass.sharedStars, 0);
  assert.equal(teacherPass.seats[0].opportunityCount, 2);
  assert.equal(teacherPass.seats[0].acceptedCount, 0);
  assert.equal(teacherPass.seats[0].teacherPassCount, 1);
});

test("retry and teacher-review speech outcomes are idempotent and do not consume a turn", () => {
  const initial = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
  });
  const retry = recordSpeechOutcome(initial, {
    recognitionResultId: "recognition-1",
    result: "retry",
    taskId: "family-01",
    reason: "utterance_incomplete",
  });
  const duplicate = recordSpeechOutcome(retry, {
    recognitionResultId: "recognition-1",
    result: "retry",
  });
  assert.strictEqual(duplicate, retry);
  assert.equal(retry.seats[0].unclearCount, 1);
  assert.equal(retry.seats[0].opportunityCount, 0);
  assert.equal(retry.completedTurns, 0);
  assert.equal(retry.inputGate, "open");
});

test("public summary hides seat progress while teacher summary includes it", () => {
  let session = createBoardSession({
    players: createPlayers(2),
    teams: createTeams(),
    minOpportunitiesPerSeat: 1,
    minTotalTurns: 2,
  });
  session = settleAcceptedTurn(session, "summary-1");
  session = settleAcceptedTurn(session, "summary-2");
  session = completeBossSession(session);

  const runtimeTeams = [
    {
      id: "comet",
      label: "Comet Team",
      coins: 7,
      adventureScore: 18,
      nodeId: "n08",
    },
    { id: "rainbow", label: "Rainbow Team", coins: 4, nodeId: "n06b" },
  ];
  const summary = buildSessionSummary(session, runtimeTeams);

  assert.deepEqual(summary.public, {
    sharedStars: 2,
    completedTurns: 2,
    teams: [
      {
        id: "comet",
        label: "Comet Team",
        coins: 7,
        adventureScore: 18,
        nodeId: "n08",
      },
      {
        id: "rainbow",
        label: "Rainbow Team",
        coins: 4,
        adventureScore: 0,
        nodeId: "n06b",
      },
    ],
  });
  assert.doesNotMatch(
    JSON.stringify(summary.public),
    /seat-1|seat-2|Player 1|Player 2|opportunit/i,
  );

  assert.deepEqual(
    Object.keys(summary.teacher).sort(),
    ["minOpportunitiesPerSeat", "minTotalTurns", "seats"],
  );
  assert.equal(summary.teacher.minOpportunitiesPerSeat, 1);
  assert.equal(summary.teacher.minTotalTurns, 2);
  assert.equal(summary.teacher.seats.length, 2);
  for (const seat of summary.teacher.seats) {
    assert.deepEqual(
      Object.keys(seat).sort(),
      [
        "acceptedCount",
        "displayName",
        "id",
        "keywordTriggerCount",
        "opportunityCount",
        "status",
        "teacherPassCount",
        "teamId",
        "unclearCount",
      ],
    );
    assert.equal(seat.opportunityCount, 1);
    assert.equal(seat.acceptedCount, 1);
    assert.equal(seat.unclearCount, 0);
    assert.equal(seat.teacherPassCount, 0);
  }
});

test("local restore rejects incompatible or structurally corrupt snapshots", () => {
  const session = createBoardSession({
    players: createPlayers(3),
    teams: createTeams(),
  });
  const runtime = {
    schemaVersion: "prototype-1",
    boardId: "board-v1",
    themeId: "theme-v1",
    learningPackId: "learning-v1",
    phase: "MISSION_PRESENT",
    activeTeamIndex: 0,
    taskIndex: 0,
    round: 1,
    acceptedCount: 0,
    lastDie: null,
    processedAttemptIds: [],
    teams: [
      {
        id: "comet",
        label: "Comet Team",
        members: ["Player 1", "Player 2"],
        speakerIndex: 0,
        nodeId: "n01",
        coins: 0,
      },
      {
        id: "rainbow",
        label: "Rainbow Team",
        members: ["Player 3"],
        speakerIndex: 0,
        nodeId: "n01",
        coins: 0,
      },
    ],
    currentActivity: null,
  };
  const restoreOptions = {
    session,
    runtime,
    playerCount: 3,
    boardNodeIds: new Set(["n01"]),
    expectedBoardId: "board-v1",
    expectedThemeId: "theme-v1",
    expectedLearningPackId: "learning-v1",
    learningTaskCount: 12,
  };
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
  }), true);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: { ...session, schemaVersion: "voice-board-session.local-v0" },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: { ...session, minTotalTurns: 0 },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: { ...session, minTotalTurns: 97 },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: {
      ...session,
      phase: "BOSS_READY",
      inputGate: "closed",
    },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: {
      ...session,
      inputGate: "settlement_pending",
      pendingPresentation: null,
    },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    session: {
      ...session,
      seats: session.seats.map((seat, index) => (
        index === 0 ? { ...seat, teamId: "missing-team" } : seat
      )),
    },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    playerCount: 8,
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: {
      ...runtime,
      teams: runtime.teams.map((team, index) => (
        index === 1 ? { id: team.id } : team
      )),
    },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: {
      ...runtime,
      teams: runtime.teams.map((team, index) => (
        index === 0 ? { ...team, nodeId: "missing-node" } : team
      )),
    },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: { ...runtime, taskIndex: -1 },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: { ...runtime, taskIndex: 12 },
  }), false);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: {
      ...runtime,
      taskSchedule: {
        schemaVersion: "per-speaker-task-cycle.v1",
        startOffset: 4,
        speakerProgress: {
          "comet:0": {
            completedCount: 2,
            lastTaskId: "task-02",
            recentTaskIds: ["task-01", "task-02"],
          },
        },
      },
    },
  }), true);
  assert.equal(isRestorableBoardSessionSnapshot({
    ...restoreOptions,
    runtime: {
      ...runtime,
      taskSchedule: {
        schemaVersion: "per-speaker-task-cycle.v1",
        startOffset: 12,
        speakerProgress: {},
      },
    },
  }), false);
});
