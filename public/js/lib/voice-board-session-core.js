import { doubleDiceSteps } from "../../prototypes/universal-board/double-dice-core.js";
import { isTeacherSession, validTeacherSession } from "./teacher-board-session.js";
const MAX_PROCESSED_ATTEMPTS = 128;
const TASK_SCHEDULE_SCHEMA_VERSION = "per-speaker-task-cycle.v1";

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizePlayers(players) {
  if (!Array.isArray(players) || players.length < 1 || players.length > 8) {
    throw new Error("players must contain between 1 and 8 seats");
  }
  const ids = new Set();
  const names = new Set();
  return players.map((player, index) => {
    const source = typeof player === "string" ? { name: player } : player;
    const id = requireText(source?.id || `seat-${index + 1}`, "player.id");
    const displayName = requireText(
      source?.displayName || source?.name || source?.label,
      "player.displayName",
    );
    if (ids.has(id)) throw new Error(`duplicate player id: ${id}`);
    if (names.has(displayName)) throw new Error(`duplicate player name: ${displayName}`);
    ids.add(id);
    names.add(displayName);
    return {
      id,
      displayName,
      requestedTeamId: source?.teamId || null,
      status: source?.status === "away" ? "away" : "active",
    };
  });
}

function normalizeTeams(teams) {
  if (!Array.isArray(teams) || teams.length < 1 || teams.length > 8) {
    throw new Error("teams must contain between 1 and 8 teams");
  }
  const ids = new Set();
  return teams.map((team) => {
    const id = requireText(team?.id, "team.id");
    if (ids.has(id)) throw new Error(`duplicate team id: ${id}`);
    ids.add(id);
    return {
      id,
      label: requireText(team?.label || id, "team.label"),
      members: Array.isArray(team?.members) ? [...team.members] : [],
    };
  });
}

function teamForPlayer(player, teams) {
  if (player.requestedTeamId) {
    return teams.find((team) => team.id === player.requestedTeamId);
  }
  return teams.find((team) => team.members.some((member) => (
    member === player.id
    || member === player.displayName
    || member?.id === player.id
    || member?.displayName === player.displayName
    || member?.name === player.displayName
  )));
}

function activeSeatIndexes(session) {
  return session.seats
    .map((seat, index) => (seat.status === "active" ? index : -1))
    .filter((index) => index >= 0);
}

function minimumOpportunitiesMet(session) {
  return session.seats
    .filter((seat) => seat.status === "active")
    .every((seat) => seat.opportunityCount >= session.minOpportunitiesPerSeat);
}

function completionRequirementsMet(session) {
  return (
    minimumOpportunitiesMet(session)
    && session.completedTurns >= session.minTotalTurns
  );
}

function validTaskSchedule(schedule, learningTaskCount) {
  if (schedule === undefined) return true;
  if (
    schedule?.schemaVersion !== TASK_SCHEDULE_SCHEMA_VERSION
    || !Number.isInteger(schedule.startOffset)
    || schedule.startOffset < 0
    || schedule.startOffset >= learningTaskCount
    || !schedule.speakerProgress
    || typeof schedule.speakerProgress !== "object"
    || Array.isArray(schedule.speakerProgress)
  ) return false;
  return Object.values(schedule.speakerProgress).every((progress) => (
    progress
    && typeof progress === "object"
    && !Array.isArray(progress)
    && Number.isInteger(progress.completedCount)
    && progress.completedCount >= 0
    && typeof progress.lastTaskId === "string"
    && progress.lastTaskId.length > 0
    && Array.isArray(progress.recentTaskIds)
    && progress.recentTaskIds.length <= Math.min(8, learningTaskCount)
    && progress.recentTaskIds.every((taskId) => typeof taskId === "string" && taskId.length > 0)
  ));
}

function nextActiveSeatIndex(session) {
  const activeIndexes = activeSeatIndexes(session);
  if (!activeIndexes.length) throw new Error("session has no active seats");
  for (let offset = 1; offset <= session.seats.length; offset += 1) {
    const candidate = (session.activeSeatIndex + offset) % session.seats.length;
    if (session.seats[candidate]?.status === "active") return candidate;
  }
  return session.activeSeatIndex;
}

function advanceAfterPresentation(session) {
  if (isTeacherSession(session)) return { ...session, phase: "TEACHER_WAITING", inputGate: "closed",
    teacherOpportunity: null, pendingPresentation: null, currentActivity: null,
    turnSequence: session.turnSequence + 1, stateVersion: session.stateVersion + 1 };
  if (session.finishPending && completionRequirementsMet(session)) {
    return {
      ...session,
      phase: "BOSS_READY",
      inputGate: "closed",
      pendingPresentation: null,
      currentActivity: null,
      stateVersion: session.stateVersion + 1,
    };
  }
  return {
    ...session,
    phase: "ANSWER_LISTENING",
    inputGate: "open",
    activeSeatIndex: nextActiveSeatIndex(session),
    pendingPresentation: null,
    currentActivity: null,
    turnSequence: session.turnSequence + 1,
    stateVersion: session.stateVersion + 1,
  };
}

export function createBoardSession({
  sessionId = "local-session",
  players,
  teams,
  minOpportunitiesPerSeat = 2,
  minTotalTurns = 12,
} = {}) {
  const normalizedPlayers = normalizePlayers(players);
  const normalizedTeams = normalizeTeams(teams);
  const minimum = Number(minOpportunitiesPerSeat);
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 6) {
    throw new Error("minOpportunitiesPerSeat must be an integer from 1 to 6");
  }
  const minimumTurns = Number(minTotalTurns);
  if (!Number.isInteger(minimumTurns) || minimumTurns < 1 || minimumTurns > 96) {
    throw new Error("minTotalTurns must be an integer from 1 to 96");
  }

  const seats = normalizedPlayers.map((player) => {
    const team = teamForPlayer(player, normalizedTeams);
    if (!team) throw new Error(`player ${player.id} is not assigned to a team`);
    return {
      id: player.id,
      displayName: player.displayName,
      teamId: team.id,
      status: player.status,
      opportunityCount: 0,
      acceptedCount: 0,
      keywordTriggerCount: 0,
      unclearCount: 0,
      teacherPassCount: 0,
      lastTriggerReason: null,
    };
  });
  if (!seats.some((seat) => seat.status === "active")) {
    throw new Error("session must contain an active seat");
  }

  return {
    schemaVersion: "voice-board-session.local-v1",
    sessionId: requireText(sessionId, "sessionId"),
    screen: "PLAYING",
    phase: "ANSWER_LISTENING",
    inputGate: "open",
    stateVersion: 0,
    turnSequence: 1,
    activeSeatIndex: seats.findIndex((seat) => seat.status === "active"),
    minOpportunitiesPerSeat: minimum,
    minTotalTurns: minimumTurns,
    completedTurns: 0,
    sharedStars: 0,
    finishPending: false,
    finishReason: null,
    pendingPresentation: null,
    currentActivity: null,
    activityHistory: [],
    processedAttemptIds: [],
    processedRecognitionIds: [],
    lastRecognitionOutcome: null,
    seats,
    teamOrder: normalizedTeams.map(({ id, label }) => ({ id, label })),
  };
}

export function currentSessionSeat(session) {
  return session?.seats?.[session.activeSeatIndex] || null;
}

export function sessionRound(session) {
  const activeCount = activeSeatIndexes(session).length;
  if (!activeCount) return 0;
  return Math.floor(session.completedTurns / activeCount) + 1;
}

export function isRestorableBoardSessionSnapshot({
  session,
  runtime,
  playerCount,
  boardNodeIds,
  expectedBoardId,
  expectedThemeId,
  expectedLearningPackId,
  learningTaskCount,
} = {}) {
  if (
    session?.schemaVersion !== "voice-board-session.local-v1"
    || runtime?.schemaVersion !== "prototype-1"
    || (expectedBoardId && runtime.boardId !== expectedBoardId)
    || (expectedThemeId && runtime.themeId !== expectedThemeId)
    || (expectedLearningPackId && runtime.learningPackId !== expectedLearningPackId)
    || (!isTeacherSession(session) && (!Number.isInteger(learningTaskCount)
    || learningTaskCount < 1
    || !Number.isInteger(runtime.taskIndex)
    || runtime.taskIndex < 0
    || runtime.taskIndex >= learningTaskCount
    || !validTaskSchedule(runtime.taskSchedule, learningTaskCount)))
    || !Number.isInteger(runtime.round)
    || runtime.round < 1
    || !Number.isInteger(runtime.acceptedCount)
    || runtime.acceptedCount < 0
    || (runtime.lastDoubleDice !== undefined && (!isTeacherSession(session)
      || doubleDiceSteps(runtime.lastDoubleDice) !== runtime.lastDie))
    || (
      runtime.lastDie !== null
      && (
        !Number.isInteger(runtime.lastDie)
        || runtime.lastDie < 1
        || (runtime.lastDie > 6 && (!isTeacherSession(session)
          || doubleDiceSteps(runtime.lastDoubleDice) !== runtime.lastDie))
      )
    )
    || !Array.isArray(runtime.processedAttemptIds)
    || runtime.processedAttemptIds.some((attemptId) => typeof attemptId !== "string")
    || !Number.isInteger(playerCount)
    || playerCount < 1
    || playerCount > 8
    || !Array.isArray(session?.seats)
    || session.seats.length !== playerCount
    || !Array.isArray(session?.teamOrder)
    || !Array.isArray(runtime?.teams)
    || runtime.teams.length < 1
    || runtime.teams.length > 8
    || !Number.isInteger(runtime.activeTeamIndex)
    || runtime.activeTeamIndex < 0
    || runtime.activeTeamIndex >= runtime.teams.length
    || !["MISSION_PRESENT", "EVENT_ACTIVE"].includes(runtime.phase)
    || !Number.isInteger(session.activeSeatIndex)
    || session.activeSeatIndex < 0
    || session.activeSeatIndex >= session.seats.length
    || !Number.isInteger(session.completedTurns)
    || session.completedTurns < 0
    || !Number.isInteger(session.sharedStars)
    || session.sharedStars < 0
    || !Number.isInteger(session.turnSequence)
    || session.turnSequence < 1
    || !Number.isInteger(session.stateVersion)
    || session.stateVersion < 0
    || !Array.isArray(session.processedAttemptIds)
    || session.processedAttemptIds.some((attemptId) => typeof attemptId !== "string")
    || !Array.isArray(session.processedRecognitionIds)
    || session.processedRecognitionIds.some((recognitionId) => typeof recognitionId !== "string")
    || !Array.isArray(session.activityHistory)
    || !Number.isInteger(session.minOpportunitiesPerSeat)
    || session.minOpportunitiesPerSeat < 1
    || session.minOpportunitiesPerSeat > 6
    || !Number.isInteger(session.minTotalTurns)
    || session.minTotalTurns < 1
    || session.minTotalTurns > 96
  ) {
    return false;
  }

  const phaseContracts = {
    TEACHER_WAITING: { screen: "PLAYING", gates: ["closed"] },
    TEACHER_ROLL_READY: { screen: "PLAYING", gates: ["open", "settlement_pending"] },
    ANSWER_LISTENING: {
      screen: "PLAYING",
      gates: ["open", "settlement_pending"],
    },
    ACTIVITY_ACTIVE: { screen: "PLAYING", gates: ["closed"] },
    BOSS_READY: { screen: "PLAYING", gates: ["closed"] },
    COMPLETED: { screen: "RESULTS", gates: ["closed"] },
  };
  const phaseContract = phaseContracts[session.phase];
  if (
    !validTeacherSession(session, runtime)
    || (!isTeacherSession(session) && session.phase.startsWith("TEACHER_"))
    || !phaseContract
    || session.screen !== phaseContract.screen
    || !phaseContract.gates.includes(session.inputGate)
  ) {
    return false;
  }
  if (
    ["BOSS_READY", "COMPLETED"].includes(session.phase)
    && !completionRequirementsMet(session)
    && !(session.phase === "COMPLETED" && session.assetGameEnded === true
      && session.finishReason === "teacher-ended-game")
  ) {
    return false;
  }

  const validNodeIds = boardNodeIds instanceof Set || boardNodeIds instanceof Map
    ? boardNodeIds
    : Array.isArray(boardNodeIds)
      ? new Set(boardNodeIds)
      : null;
  const runtimeTeamIds = new Set();
  const teamById = new Map();
  for (const team of runtime.teams) {
    if (
      typeof team?.id !== "string"
      || !team.id
      || runtimeTeamIds.has(team.id)
      || typeof team.label !== "string"
      || !team.label
      || !Array.isArray(team.members)
      || team.members.length < 1
      || team.members.some((member) => typeof member !== "string" || !member)
      || !Number.isInteger(team.speakerIndex)
      || team.speakerIndex < 0
      || team.speakerIndex >= team.members.length
      || typeof team.nodeId !== "string"
      || !team.nodeId
      || (validNodeIds && !validNodeIds.has(team.nodeId))
      || !Number.isInteger(team.coins)
      || team.coins < 0
    ) {
      return false;
    }
    runtimeTeamIds.add(team.id);
    teamById.set(team.id, team);
  }
  if (
    session.teamOrder.length !== runtime.teams.length
    || session.teamOrder.some((team) => !runtimeTeamIds.has(team?.id))
  ) {
    return false;
  }
  const seatIds = new Set();
  for (const seat of session.seats) {
    if (
      typeof seat?.id !== "string"
      || !seat.id
      || seatIds.has(seat.id)
      || typeof seat.displayName !== "string"
      || !seat.displayName
      || !runtimeTeamIds.has(seat.teamId)
      || !["active", "away"].includes(seat.status)
      || !teamById.get(seat.teamId).members.includes(seat.displayName)
      || !Number.isInteger(seat.opportunityCount)
      || seat.opportunityCount < 0
      || !Number.isInteger(seat.acceptedCount)
      || seat.acceptedCount < 0
      || seat.acceptedCount > seat.opportunityCount
      || !Number.isInteger(seat.keywordTriggerCount)
      || seat.keywordTriggerCount < 0
      || seat.keywordTriggerCount > seat.opportunityCount
      || !Number.isInteger(seat.unclearCount)
      || seat.unclearCount < 0
      || !Number.isInteger(seat.teacherPassCount)
      || seat.teacherPassCount < 0
      || seat.teacherPassCount > seat.opportunityCount
      || (
        seat.acceptedCount
        + seat.keywordTriggerCount
        + seat.teacherPassCount
        > seat.opportunityCount
      )
    ) {
      return false;
    }
    seatIds.add(seat.id);
  }
  if (
    session.lastRecognitionOutcome
    && (
      typeof session.lastRecognitionOutcome.recognitionResultId !== "string"
      || !session.processedRecognitionIds.includes(
        session.lastRecognitionOutcome.recognitionResultId,
      )
      || !["retry", "teacher_review"].includes(session.lastRecognitionOutcome.result)
      || !Number.isInteger(session.lastRecognitionOutcome.turnSequence)
      || session.lastRecognitionOutcome.turnSequence < 1
    )
  ) {
    return false;
  }

  if (session.inputGate === "settlement_pending") {
    if (
      typeof session.pendingPresentation?.eventId !== "string"
      || !session.pendingPresentation.eventId.trim()
    ) {
      return false;
    }
  } else if (session.pendingPresentation) {
    return false;
  }
  if (
    session.phase === "ACTIVITY_ACTIVE"
    && (
      !session.currentActivity
      || !runtime.currentActivity
      || runtime.phase !== "EVENT_ACTIVE"
    )
  ) {
    return false;
  }
  if (
    runtime.currentActivity
    && (
      typeof runtime.currentActivity.templateId !== "string"
      || !runtime.currentActivity.templateId
      || !Array.isArray(runtime.currentActivity.materialTags)
      || !runtime.currentActivity.content
      || typeof runtime.currentActivity.content.title !== "string"
      || typeof runtime.currentActivity.content.instruction !== "string"
      || typeof runtime.currentActivity.content.target !== "string"
    )
  ) {
    return false;
  }
  if (
    session.phase !== "ACTIVITY_ACTIVE"
    && session.inputGate !== "settlement_pending"
    && (session.currentActivity || runtime.currentActivity || runtime.phase === "EVENT_ACTIVE")
  ) {
    return false;
  }
  return true;
}

export function recordSpeechOutcome(session, {
  recognitionResultId,
  result,
  taskId = null,
  reason = null,
} = {}) {
  if (isTeacherSession(session)) throw new Error("teacher mode cannot record speech outcomes");
  const normalizedRecognitionId = requireText(
    recognitionResultId,
    "recognitionResultId",
  );
  if ((session.processedRecognitionIds || []).includes(normalizedRecognitionId)) {
    return session;
  }
  if (session.screen !== "PLAYING" || session.phase !== "ANSWER_LISTENING") {
    throw new Error(`speech outcome cannot be recorded during ${session.phase}`);
  }
  if (session.inputGate !== "open") {
    throw new Error(`speech outcome cannot be recorded while inputGate is ${session.inputGate}`);
  }
  if (!["retry", "teacher_review"].includes(result)) {
    throw new Error("speech outcome must be retry or teacher_review");
  }
  const seats = session.seats.map((seat, index) => (
    index === session.activeSeatIndex
      ? {
          ...seat,
          unclearCount: seat.unclearCount + 1,
        }
      : seat
  ));
  return {
    ...session,
    seats,
    processedRecognitionIds: [
      ...(session.processedRecognitionIds || []),
      normalizedRecognitionId,
    ].slice(-MAX_PROCESSED_ATTEMPTS),
    lastRecognitionOutcome: {
      recognitionResultId: normalizedRecognitionId,
      result,
      taskId,
      reason,
      actorSeatId: currentSessionSeat(session)?.id || null,
      turnSequence: session.turnSequence,
    },
    stateVersion: session.stateVersion + 1,
  };
}

export function commitTriggeredTurn(session, {
  attemptId,
  eventId,
  taskId = null,
  resolution = "primary_accepted",
  triggerReason = null,
} = {}) {
  if (isTeacherSession(session)) throw new Error("teacher mode cannot accept speech turns");
  const normalizedAttemptId = requireText(attemptId, "attemptId");
  if ((session.processedAttemptIds || []).includes(normalizedAttemptId)) {
    return session;
  }
  if (session.screen !== "PLAYING" || session.phase !== "ANSWER_LISTENING") {
    throw new Error(`turn cannot be committed during ${session.phase}`);
  }
  if (session.inputGate !== "open") {
    throw new Error(`turn cannot be committed while inputGate is ${session.inputGate}`);
  }

  const actor = currentSessionSeat(session);
  if (!actor || actor.status !== "active") throw new Error("active seat is unavailable");
  if (![
    "primary_accepted",
    "knowledge_wrong_low_score",
    "keyword_trigger",
    "teacher_pass",
  ].includes(resolution)) {
    throw new Error(
      "resolution must be primary_accepted, knowledge_wrong_low_score, keyword_trigger or teacher_pass",
    );
  }
  const normalizedTriggerReason = triggerReason || (
    resolution === "primary_accepted"
      ? "primary_accepted"
      : resolution === "knowledge_wrong_low_score"
        ? "knowledge_wrong_low_score"
        : resolution === "keyword_trigger"
          ? "keyword_match"
          : "teacher_pass"
  );
  const seats = session.seats.map((seat, index) => (
    index === session.activeSeatIndex
      ? {
          ...seat,
          opportunityCount: seat.opportunityCount + 1,
          acceptedCount: seat.acceptedCount + (resolution === "primary_accepted" ? 1 : 0),
          keywordTriggerCount: seat.keywordTriggerCount
            + (resolution === "keyword_trigger" ? 1 : 0),
          teacherPassCount: seat.teacherPassCount + (resolution === "teacher_pass" ? 1 : 0),
          lastTriggerReason: normalizedTriggerReason,
        }
      : seat
  ));
  const pendingEventId = requireText(
    eventId || `${normalizedAttemptId}:presentation`,
    "eventId",
  );
  const candidate = {
    ...session,
    seats,
    completedTurns: session.completedTurns + 1,
    sharedStars: session.sharedStars + (resolution === "primary_accepted" ? 1 : 0),
    inputGate: "settlement_pending",
    pendingPresentation: {
      eventId: pendingEventId,
      attemptId: normalizedAttemptId,
      taskId,
      actorSeatId: actor.id,
      actorTeamId: actor.teamId,
      resolution,
      triggerReason: normalizedTriggerReason,
    },
    processedAttemptIds: [
      ...(session.processedAttemptIds || []),
      normalizedAttemptId,
    ].slice(-MAX_PROCESSED_ATTEMPTS),
    stateVersion: session.stateVersion + 1,
  };
  const finishPending = completionRequirementsMet(candidate);
  return {
    ...candidate,
    finishPending,
    finishReason: finishPending
      ? "minimum-opportunities-and-total-turns-met"
      : null,
  };
}

export function commitAcceptedTurn(session, options = {}) {
  return commitTriggeredTurn(session, {
    ...options,
    resolution: "primary_accepted",
  });
}

export function acknowledgePresentation(session, {
  eventId,
  activityPending = false,
} = {}) {
  if (session.inputGate !== "settlement_pending" || !session.pendingPresentation) {
    throw new Error("no settlement presentation is pending");
  }
  const normalizedEventId = requireText(eventId, "eventId");
  if (normalizedEventId !== session.pendingPresentation.eventId) {
    throw new Error("eventId does not match the pending presentation");
  }
  if (activityPending) {
    return {
      ...session,
      phase: "ACTIVITY_ACTIVE",
      inputGate: "closed",
      currentActivity: {
        eventId: normalizedEventId,
        actorSeatId: session.pendingPresentation.actorSeatId,
        actorTeamId: session.pendingPresentation.actorTeamId,
      },
      pendingPresentation: null,
      stateVersion: session.stateVersion + 1,
    };
  }
  return advanceAfterPresentation(session);
}

export function resolveSessionActivity(session, { outcome = "completed" } = {}) {
  if (session.phase !== "ACTIVITY_ACTIVE" || !session.currentActivity) {
    throw new Error("no classroom activity is active");
  }
  if (!["completed", "skipped"].includes(outcome)) {
    throw new Error("activity outcome must be completed or skipped");
  }
  const resolved = {
    ...session,
    activityHistory: [
      ...session.activityHistory,
      {
        ...session.currentActivity,
        outcome,
      },
    ],
    currentActivity: null,
    stateVersion: session.stateVersion + 1,
  };
  return advanceAfterPresentation(resolved);
}

export function completeBossSession(session) {
  if (session.phase !== "BOSS_READY") {
    throw new Error(`boss cannot be completed during ${session.phase}`);
  }
  return {
    ...session,
    screen: "RESULTS",
    phase: "COMPLETED",
    inputGate: "closed",
    bossCompleted: true,
    stateVersion: session.stateVersion + 1,
  };
}

export function endBoardGame(session) {
  if (!session || session.inputGate === "settlement_pending") {
    throw new Error("finish the committed turn before ending the game");
  }
  return { ...session, assetGameEnded: true, finishReason: "teacher-ended-game",
    ...(isTeacherSession(session) ? { teacherOpportunity: null } : {}),
    screen: "RESULTS", phase: "COMPLETED", inputGate: "closed",
    currentActivity: null, pendingPresentation: null, stateVersion: session.stateVersion + 1 };
}

export function buildSessionSummary(session, teams = []) {
  if (session.phase !== "COMPLETED") {
    throw new Error("session summary is only available after completion");
  }
  const teamById = new Map(teams.map((team) => [team.id, team]));
  return {
    public: {
      sharedStars: session.sharedStars,
      completedTurns: session.completedTurns,
      teams: session.teamOrder.map((team) => {
        const runtimeTeam = teamById.get(team.id);
        return {
          id: team.id,
          label: team.label,
          coins: Number(runtimeTeam?.coins) || 0,
          adventureScore: Number(runtimeTeam?.adventureScore) || 0,
          nodeId: runtimeTeam?.nodeId || null,
        };
      }),
    },
    teacher: {
      minOpportunitiesPerSeat: session.minOpportunitiesPerSeat,
      minTotalTurns: session.minTotalTurns,
      seats: session.seats.map((seat) => ({
        id: seat.id,
        displayName: seat.displayName,
        teamId: seat.teamId,
        status: seat.status,
        opportunityCount: seat.opportunityCount,
        acceptedCount: seat.acceptedCount,
        keywordTriggerCount: seat.keywordTriggerCount,
        unclearCount: seat.unclearCount,
        teacherPassCount: seat.teacherPassCount,
      })),
    },
  };
}
