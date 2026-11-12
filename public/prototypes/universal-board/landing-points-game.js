import { validTeacherDiceRoll } from "./double-dice-core.js";
// Compare the browser's presentation with the independently computed server turn.
// These checks guard presentation drift; the wallet never trusts their output.
export const LANDING_POINTS_KIND = "final-landing-v1";

export function assertLandingRoll({ turn, attemptId, studentId, runtime }) {
  const world = runtime.world?.active;
  const team = runtime.teams.find((entry) => entry.id === `player-${studentId}`);
  if (!turn || turn.attemptId !== attemptId || turn.studentId !== studentId
    || turn.teacherDiceRef !== "teacher-dice.v1"
    || !validTeacherDiceRoll(turn)
    || turn.startLocation?.worldRef !== world?.worldPackRef
    || turn.startLocation?.worldInstanceId !== world?.instanceId
    || turn.startLocation?.nodeId !== team?.nodeId) {
    throw new Error("服务器棋局与当前画面不一致，已暂停掷骰，请恢复原棋局。");
  }
  return turn;
}

export function assertLandingPlan({ turn, attemptId, studentId, runtime, effects, landingNodeId }) {
  const world = runtime.world?.active;
  const team = runtime.teams.find((entry) => entry.id === `player-${studentId}`);
  if (!turn || turn.attemptId !== attemptId || turn.studentId !== studentId
    || turn.finalLocation?.worldRef !== world?.worldPackRef
    || turn.finalLocation?.worldInstanceId !== world?.instanceId
    || turn.finalLocation?.nodeId !== team?.nodeId || team.nodeId !== landingNodeId
    || !Number.isSafeInteger(turn.points) || turn.points <= 0) {
    throw new Error("最终落点与服务器不一致，未申请积分，请保留本局并重试。");
  }
  const walked = effects.filter((event) => event.type === "pawn_step").map((event) => event.nodeId);
  const expected = turn.plan?.effects?.filter((event) => event.type === "pawn_step").map((event) => event.nodeId);
  if (JSON.stringify(walked) !== JSON.stringify(expected)) {
    throw new Error("移动路线与服务器不一致，未申请积分。");
  }
  const lapReturns = (events) => (events || []).filter((event) => event.type === "lap_return")
    .map(({ effectId, worldRef, worldInstanceId, fromNodeId, toEntryNodeId, zeroStepCost }) =>
      ({ effectId, worldRef, worldInstanceId, fromNodeId, toEntryNodeId, zeroStepCost }));
  if (JSON.stringify(lapReturns(effects)) !== JSON.stringify(lapReturns(turn.plan?.effects))) {
    throw new Error("绕圈返回与服务器不一致，未申请积分。");
  }
  return turn;
}

export function landingNodePoints(rule, worldRef, nodeId) {
  if (rule?.kind !== "server_verified_final_landing" || rule.enabled !== true) return null;
  const points = rule.worlds?.find((world) => world.worldRef === worldRef)
    ?.nodes.find((node) => node.nodeId === nodeId)?.points;
  return Number.isSafeInteger(points) && points > 0 ? points : null;
}

export function recoverableLandingTurns(serverSession, processedAttemptIds) {
  const committed = new Set(processedAttemptIds || []);
  const pendingBonusTurns = new Set(Object.values(serverSession?.specialCells?.bonusAwards || {})
    .filter((award) => award.status !== "awarded").map((award) => award.turnId));
  return Object.values(serverSession?.turns || {}).filter((turn) => committed.has(turn.attemptId)
    && (turn.status === "planned" && !turn.receipt
      || turn.status === "awarded" && pendingBonusTurns.has(turn.attemptId)));
}
