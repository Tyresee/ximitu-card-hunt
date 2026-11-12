import { doubleDiceSteps, hasDoubleDiceFields } from "../../prototypes/universal-board/double-dice-core.js";
// Teacher-hosted play is a separate authority, never a fabricated speech result.
export const TEACHER_MODE = "teacher-led";
export const TEACHER_DICE = "treasure";
export const TEACHER_DICE_REF = "teacher-dice.v1";
export const isTeacherSession = (session) => session?.mode === TEACHER_MODE;

export function initializeTeacherSession(session) {
  return { ...session, mode: TEACHER_MODE, phase: "TEACHER_WAITING", inputGate: "closed",
    teacherDiceRef: TEACHER_DICE_REF, teacherOpportunity: null, finishPending: false };
}

export function grantTeacherOpportunity(session, { seatId, opportunityId } = {}) {
  if (!isTeacherSession(session) || session.screen !== "PLAYING" || session.assetGameEnded
    || session.phase !== "TEACHER_WAITING" || session.teacherOpportunity) {
    throw new Error("teacher opportunity cannot be granted now");
  }
  const index = session.seats.findIndex((seat) => seat.id === seatId && seat.status === "active");
  if (index < 0 || typeof opportunityId !== "string" || !opportunityId.trim()
    || session.processedAttemptIds.includes(opportunityId)) throw new Error("invalid teacher opportunity");
  return { ...session, activeSeatIndex: index, phase: "TEACHER_ROLL_READY", inputGate: "open",
    teacherOpportunity: { id: opportunityId, seatId, source: "teacher", diceFamily: TEACHER_DICE },
    stateVersion: session.stateVersion + 1 };
}

export function commitTeacherTurn(session, { attemptId, eventId } = {}) {
  if (!isTeacherSession(session)) throw new Error("not a teacher session");
  if (session.processedAttemptIds.includes(attemptId)) return session;
  const opportunity = session.teacherOpportunity;
  if (session.screen !== "PLAYING" || session.assetGameEnded || session.phase !== "TEACHER_ROLL_READY"
    || session.inputGate !== "open" || !opportunity || opportunity.id !== attemptId
    || opportunity.seatId !== session.seats[session.activeSeatIndex]?.id
    || opportunity.source !== "teacher" || opportunity.diceFamily !== TEACHER_DICE
    || typeof eventId !== "string" || !eventId.trim()) throw new Error("teacher opportunity does not match turn");
  return { ...session, teacherOpportunity: null, inputGate: "settlement_pending",
    completedTurns: session.completedTurns + 1, finishPending: false,
    seats: session.seats.map((seat) => seat.id === opportunity.seatId
      ? { ...seat, opportunityCount: seat.opportunityCount + 1, lastTriggerReason: "teacher_opportunity" } : seat),
    pendingPresentation: { eventId, attemptId, taskId: null, actorSeatId: opportunity.seatId,
      actorTeamId: session.seats[session.activeSeatIndex].teamId, resolution: "teacher_opportunity" },
    processedAttemptIds: [...session.processedAttemptIds, attemptId].slice(-128),
    stateVersion: session.stateVersion + 1 };
}

export function validTeacherSession(session, runtime) {
  if (!isTeacherSession(session)) return runtime?.mode !== TEACHER_MODE;
  if (session.teacherDiceRef !== undefined && session.teacherDiceRef !== TEACHER_DICE_REF) return false;
  if (runtime?.mode !== TEACHER_MODE || runtime.learningPackId !== null || runtime.taskSchedule !== null
    || runtime.acceptedCount !== 0 || runtime.taskIndex !== 0 || session.sharedStars !== 0
    || session.finishPending || session.seats.some((seat) => seat.acceptedCount || seat.teacherPassCount
      || seat.keywordTriggerCount || seat.unclearCount)
    || !["TEACHER_WAITING", "TEACHER_ROLL_READY", "COMPLETED"].includes(session.phase)) return false;
  const opportunity = session.teacherOpportunity;
  if (session.phase === "TEACHER_ROLL_READY" && session.inputGate === "open") {
    return opportunity?.source === "teacher" && opportunity.diceFamily === TEACHER_DICE
      && typeof opportunity.id === "string" && opportunity.id.length > 0
      && !session.processedAttemptIds.includes(opportunity.id)
      && (opportunity.faceIndex === undefined || (Number.isInteger(opportunity.faceIndex)
        && opportunity.faceIndex >= 0 && opportunity.faceIndex < 6))
      && (!hasDoubleDiceFields(opportunity) || (doubleDiceSteps(opportunity) !== null
        && opportunity.faceIndex === opportunity.faceIndices[0]))
      && opportunity.seatId === session.seats[session.activeSeatIndex]?.id;
  }
  return opportunity === null;
}
