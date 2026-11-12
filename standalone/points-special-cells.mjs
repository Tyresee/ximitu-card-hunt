// Server-authoritative 特效格 rules for teacher-led final-landing sessions.
// Only sessions registered with rewardPolicy points-only-v2-special-cells use
// this module; older session snapshots are never migrated.
import { WORLD_REGISTRIES, WORLD_ROUTES, CIRCUIT_WORLD_ROUTE_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition, walkWorldPlan } from '../public/prototypes/universal-board/world-runtime-core.js';
import {
  GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending, SPECIAL_CELLS_POLICY, SPECIAL_CELLS_SCHEMA, LEGACY_SPECIAL_CELLS_SCHEMA, SPECIAL_CELL_TYPE_BY_ID, SPECIAL_CELL_DENSITIES, SPECIAL_CELL_GROUP_MOVE_LESSON_CAP,
  drawSpecialCells, specialCellAmount, specialCellAt, advanceAlongDefaultRoute,
} from '../public/prototypes/universal-board/special-cells-core.js';
import { pointsError } from './points-movement.mjs';
import { landingPointsValueScale, validLandingPointsValue } from '../public/prototypes/universal-board/landing-points-values.js';
import { createHash } from 'node:crypto';

export { SPECIAL_CELLS_POLICY };
export const GROUP_MOVE_REWARD_POLICY = 'group-final-landing-v1';
export { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending };

export function landingSource(session, attemptId) {
  if (Object.hasOwn(session.turns || {}, attemptId)) return session.turns[attemptId];
  for (const move of Object.values(session.specialCells?.groupMoves || {})) {
    const award = move.awards?.find(entry => entry.attemptId === attemptId);
    if (award) return award;
  }
  return null;
}

function rerollQueue(state) {
  state.pendingRerolls ||= state.pendingReroll ? [structuredClone(state.pendingReroll)] : [];
  return state.pendingRerolls;
}

function syncRerollHead(state) { state.pendingReroll = rerollQueue(state)[0] || null; }


export function hasPendingGroupMoveAwards(session) {
  return Object.values(session.specialCells?.groupMoves || {}).some(move =>
    move.rewardPolicy === GROUP_MOVE_REWARD_POLICY && (move.awards?.some(award => award.status !== 'awarded')
      || groupLandingEffectsPending(move, session.specialCells)));
}

export function createSpecialCellsState() {
  return { policy: SPECIAL_CELLS_POLICY, layoutVersion: SPECIAL_CELLS_SCHEMA, heldDoubleDiceByStudent: {}, drawNumber: 0, layoutSeed: null, density: null, multipliersEnabled: true,
    cells: [], consumed: [], locked: false, drawnAt: null, groupMoves: {}, groupMoveSuccesses: 0,
    bonusAwards: {}, pendingReroll: null, pendingRerolls: [] };
}

export function usesSpecialCells(session) {
  return session?.rewardPolicy === SPECIAL_CELLS_POLICY && session.specialCells?.policy === SPECIAL_CELLS_POLICY;
}

function routeWorlds(session) {
  const route = WORLD_ROUTES[session.world.routeRef];
  const refs = [route.entryWorldRef];
  for (const edge of route.transitions) for (const ref of [edge.fromWorldRef, edge.toWorldRef]) if (!refs.includes(ref)) refs.push(ref);
  return refs.map((worldRef) => {
    const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const ruleWorld = session.rule.worlds.find((entry) => entry.worldRef === worldRef);
    if (!ruleWorld) throw pointsError('本局积分规则没有覆盖全部地图', 'points_rule_unavailable', 503);
    return { worldRef, board, level, valueScale: landingPointsValueScale(session.rule.revision), points: new Map(ruleWorld.nodes.map((node) => [node.nodeId, node.points])) };
  });
}

/** POST sessions/:id/special-cells/draw — only before the first roll. */
export function drawSessionSpecialCells(session, { density, multipliersEnabled, previousDrawNumber }, clock) {
  if (!usesSpecialCells(session)) throw pointsError('本局未启用特效格', 'special_cells_unavailable', 409);
  if (!SPECIAL_CELL_DENSITIES.includes(density) || typeof multipliersEnabled !== 'boolean'
    || !Number.isSafeInteger(previousDrawNumber) || previousDrawNumber < 0) throw pointsError('特效格掉落参数无效');
  const state = session.specialCells;
  // A lost response retried with a fresh key returns the draw it already made.
  if (previousDrawNumber + 1 === state.drawNumber && state.density === density && state.multipliersEnabled === multipliersEnabled) {
    return { duplicate: true };
  }
  if (previousDrawNumber !== state.drawNumber) throw pointsError('特效格已被重新掉落，请刷新', 'special_cells_draw_conflict', 409);
  if (session.status !== 'open') throw pointsError('本局已结束', 'points_session_closed', 409);
  if (state.locked || session.completedTurns > 0 || session.activeTurnId || Object.keys(session.turns).length) {
    throw pointsError('第一次掷骰后特效格已锁定', 'special_cells_locked', 409);
  }
  const drawNumber = state.drawNumber + 1;
  const layout = drawSpecialCells({ sessionId: session.id, drawNumber, studentCount: session.studentIds.length,
    density, multipliersEnabled, worlds: routeWorlds(session), layoutVersion: SPECIAL_CELLS_SCHEMA });
  Object.assign(state, { layoutVersion: SPECIAL_CELLS_SCHEMA, heldDoubleDiceByStudent: state.heldDoubleDiceByStudent || {},
    drawNumber, layoutSeed: layout.layoutSeed, density, multipliersEnabled,
    targetCount: layout.targetCount, cells: layout.cells, consumed: [], drawnAt: new Date(clock()).toISOString() });
  return { duplicate: false };
}

export function lockSpecialCellsOnRoll(session, turn) {
  if (!usesSpecialCells(session)) return;
  const state = session.specialCells;
  const pending = Object.values(state.groupMoves).find((move) => move.status === 'pending');
  if (pending) throw pointsError('请老师先确认或取消全班小挑战', 'special_cells_group_move_pending', 409);
  if (hasPendingGroupMoveAwards(session)) {
    throw pointsError('全班新落格积分尚未全部到账，请先重试', 'special_cells_group_awards_pending', 409);
  }
  state.locked = true;
  const queue = rerollQueue(state);
  const chance = queue.findIndex(entry => entry.studentId === turn.studentId);
  if (chance >= 0) turn.rerollOf = queue.splice(chance, 1)[0].sourceTurnId;
  syncRerollHead(state);
}

/** Refresh after the whole class has finished the current lap and its turn is settled. */
export function refreshCompletedCircuitRound(session, clock) {
  if (!usesSpecialCells(session) || session.movementPolicy !== 'individual-laps-v1'
    || session.world.routeRef !== CIRCUIT_WORLD_ROUTE_REF || session.status !== 'open'
    || session.activeTurnId || !Number.isSafeInteger(session.lapRound) || session.lapRound < 1) return false;
  const state = session.specialCells;
  if (Object.values(state.groupMoves).some(move => move.status === 'pending') || hasPendingGroupMoveAwards(session)) return false;
  if (!session.studentIds.every(studentId => {
    const laps = session.teams.find(team => team.id === studentId)?.completedLaps;
    return Number.isSafeInteger(laps) && laps >= session.lapRound;
  })) return false;

  const completedRound = session.lapRound;
  const drawNumber = state.drawNumber + 1;
  const density = state.density || 'normal';
  const multipliersEnabled = state.multipliersEnabled !== false;
  const layout = drawSpecialCells({ sessionId: session.id, drawNumber, studentCount: session.studentIds.length,
    density, multipliersEnabled, worlds: routeWorlds(session),
    layoutVersion: state.layoutVersion || LEGACY_SPECIAL_CELLS_SCHEMA });
  // Keep old layouts, award IDs, pending claims and the lesson-wide challenge cap.
  // The incremented draw number gives every new cell a distinct business identity.
  state.drawHistory ||= [];
  state.drawHistory.push({ round: completedRound, drawNumber: state.drawNumber, layoutSeed: state.layoutSeed,
    cells: structuredClone(state.cells), consumed: [...state.consumed], drawnAt: state.drawnAt });
  Object.assign(state, { drawNumber, layoutSeed: layout.layoutSeed, density, multipliersEnabled,
    targetCount: layout.targetCount, cells: layout.cells, consumed: [], locked: true,
    drawnAt: new Date(clock()).toISOString() });
  session.lapRound = completedRound + 1;
  return true;
}

/** Applied once when the final landing is frozen (plan). */
export function applySpecialCellLanding(session, turn) {
  if (!usesSpecialCells(session)) return;
  const state = session.specialCells;
  const cell = specialCellAt(state, turn.event.worldRef, turn.event.nodeId);
  if (!cell) return;
  const type = SPECIAL_CELL_TYPE_BY_ID[cell.type];
  // A one-time challenge is reserved by the first seat until confirm/cancel;
  // consuming it only on confirm must not queue it once per co-located pupil.
  if (type.oneTime && type.category === 'move' && Object.values(state.groupMoves).some(move =>
    move.cellId === cell.cellId && move.status === 'pending')) return;
  const { amount, bonus, formula } = specialCellAmount(type.id, turn.points, landingPointsValueScale(turn.ruleVersion || session.initialRuleVersion || session.rule.revision));
  const result = { cellId: cell.cellId, type: type.id, category: type.category, baseAmount: turn.points, amount, bonus, formula };
  if (type.id === 'redpack') result.eachStudent = type.eachStudent;
  if (session.status !== 'open' && ['move', 'reroll', 'double_dice'].includes(type.category)) {
    result.exhausted = true;
  } else if (type.id === 'double_dice') {
    if (state.layoutVersion !== SPECIAL_CELLS_SCHEMA || !state.heldDoubleDiceByStudent) {
      throw pointsError('旧布局不能发放双骰机会', 'special_cells_version_invalid', 409);
    }
    state.heldDoubleDiceByStudent[turn.studentId] = { sourceTurnId: turn.attemptId, cellId: cell.cellId };
    result.doubleDiceGranted = true;
  }
  if (type.category === 'move' && session.status === 'open') {
    if (state.groupMoveSuccesses >= SPECIAL_CELL_GROUP_MOVE_LESSON_CAP) result.exhausted = true; // 今天走够啦
    else {
      const instanceId = `gm-${turn.attemptId}`;
      state.groupMoves[instanceId] = { instanceId, cellId: cell.cellId, type: type.id, steps: type.groupSteps,
        sourceTurnId: turn.attemptId, status: 'pending', moves: [] };
      result.groupMoveInstanceId = instanceId;
    }
  }
  if (type.category === 'reroll' && session.status === 'open') {
    result.rerollGranted = !turn.rerollOf; // a second 再掷 landing does not chain
    if (result.rerollGranted) {
      const queue = rerollQueue(state);
      if (!queue.some(entry => entry.sourceTurnId === turn.attemptId && entry.studentId === turn.studentId)) {
        queue.push({ studentId: turn.studentId, sourceTurnId: turn.attemptId });
      }
      syncRerollHead(state);
    }
  }
  if (type.oneTime && type.category !== 'move') state.consumed.push(cell.cellId);
  turn.specialCell = result;
}

/** Bonus credits beyond the base landing (multiplier/addend and red packets). */
export async function settleSpecialCellBonuses(session, turn, platform, context) {
  const special = turn.specialCell;
  if (!usesSpecialCells(session) || !special) return;
  const awards = session.specialCells.bonusAwards;
  const wanted = [];
  if (special.bonus > 0) wanted.push({ key: `${turn.attemptId}:special`, studentId: turn.studentId, amount: special.bonus });
  if (special.type === 'redpack') {
    for (const studentId of session.studentIds) wanted.push({ key: `${special.cellId}:${studentId}`, studentId, amount: special.eachStudent });
  }
  for (const entry of wanted) {
    awards[entry.key] ||= { ...entry, turnId: turn.attemptId, cellId: special.cellId, type: special.type, status: 'pending', receipt: null };
  }
  for (const entry of wanted) {
    const award = awards[entry.key];
    if (award.status === 'awarded') continue;
    // Platform credits bonuses via claimSpecialCellBonus; older bridges without
    // that method keep an honest awaiting_platform marker instead of faking success.
    if (typeof platform?.claimSpecialCellBonus !== 'function') { award.status = 'awaiting_platform'; continue; }
    try {
      const receipt = await platform.claimSpecialCellBonus(session.platformSessionId, {
        bonusId: award.key, turnId: award.turnId, studentId: award.studentId, cellId: award.cellId,
        type: award.type, amount: award.amount, policy: SPECIAL_CELLS_POLICY }, context);
      if (receipt?.bonus?.amount !== award.amount || receipt.bonus.studentId !== award.studentId) throw new Error('bonus receipt mismatch');
      award.status = 'awarded'; award.receipt = structuredClone(receipt);
    } catch { award.status = 'pending'; }
  }
}

/** POST sessions/:id/group-moves/:instanceId/resolve {decision: confirm|cancel}. */
export function resolveSpecialCellGroupMove(session, instanceId, decision) {
  if (!usesSpecialCells(session)) throw pointsError('本局未启用特效格', 'special_cells_unavailable', 409);
  if (!['confirm', 'cancel'].includes(decision)) throw pointsError('请选择完成或取消');
  const state = session.specialCells;
  const move = Object.hasOwn(state.groupMoves, instanceId) ? state.groupMoves[instanceId] : null;
  if (!move) throw pointsError('未找到全班小挑战', 'special_cells_group_move_not_found', 404);
  const expected = decision === 'confirm' ? ['confirmed', 'exhausted'] : ['cancelled'];
  if (move.status !== 'pending') {
    if (expected.includes(move.status)) return { move, duplicate: true };
    throw pointsError('全班小挑战已处理', 'special_cells_group_move_conflict', 409);
  }
  if (session.activeTurnId && session.activeTurnId !== move.sourceTurnId) throw pointsError('回合状态已变化', 'points_turn_conflict', 409);
  if (decision === 'cancel') { move.status = 'cancelled'; return { move, duplicate: false }; }
  if (session.status !== 'open') throw pointsError('本局已结束', 'points_session_closed', 409);
  if (state.groupMoveSuccesses >= SPECIAL_CELL_GROUP_MOVE_LESSON_CAP) { move.status = 'exhausted'; return { move, duplicate: false }; }
  if (hasPendingGroupMoveAwards(session)) {
    throw pointsError('请先结清上一批新落格积分与特效加成', 'special_cells_group_awards_pending', 409);
  }
  const queued = Object.values(state.groupMoves).find(entry => entry.status === 'pending');
  if (queued && queued.instanceId !== instanceId) throw pointsError('请先完成前一个全班小挑战', 'special_cells_group_move_pending', 409);
  const source = landingSource(session, move.sourceTurnId);
  if (source?.status !== 'awarded' || !source.receipt) {
    throw pointsError('请先完成触发回合的落格到账', 'points_turn_pending', 409);
  }
  const active = session.world.active;
  const { board } = resolveWorldComposition(active.worldPackRef, WORLD_REGISTRIES);
  // Every moved pupil receives the new final tile. Registered special cells
  // are settled later, after this whole batch's base receipts have arrived.
  move.moves = session.teams.map((team) => {
    if (session.movementPolicy === 'individual-laps-v1' && session.world.routeRef === CIRCUIT_WORLD_ROUTE_REF) {
      const plan = walkWorldPlan({ moveId: `${instanceId}:${team.id}`, worldInstanceId: active.instanceId,
        worldOrdinal: active.ordinal, worldRef: active.worldPackRef, startNodeId: team.nodeId, steps: move.steps,
        mapStatesByWorldInstance: { [active.instanceId]: active.mapState },
        worldRoute: WORLD_ROUTES[session.world.routeRef], registries: WORLD_REGISTRIES });
      const path = plan.effects.filter(effect => effect.type === 'pawn_step').map(effect => effect.nodeId);
      const lapCount = Array.isArray(plan.lapCompletions) ? plan.lapCompletions.length : (plan.lapReturns?.length || 0);
      const completedLaps = (team.completedLaps || 0) + lapCount;
      if (!Number.isSafeInteger(completedLaps) || completedLaps < 0) {
        throw pointsError('学生圈数状态无效', 'points_state_conflict', 409);
      }
      const entry = { studentId: team.id, fromNodeId: team.nodeId, toNodeId: plan.finalLocation.nodeId, path,
        lapReturns: structuredClone(plan.lapReturns || []),
        ...(Array.isArray(plan.lapCompletions) ? { lapCompletions: [...plan.lapCompletions] } : {}) };
      team.nodeId = plan.finalLocation.nodeId;
      team.completedLaps = completedLaps;
      return entry;
    }
    const { nodeId, path } = advanceAlongDefaultRoute(board, team.nodeId, move.steps, active.mapState);
    const entry = { studentId: team.id, fromNodeId: team.nodeId, toNodeId: nodeId, path };
    team.nodeId = nodeId;
    return entry;
  });
  const worldRule = session.rule.worlds.find(world => world.worldRef === active.worldPackRef);
  const { level } = resolveWorldComposition(active.worldPackRef, WORLD_REGISTRIES);
  if (worldRule?.boardRef !== `${board.id}@${board.version}` || worldRule.levelRef !== `${level.id}@${level.version}`) {
    throw pointsError('本局积分规则没有覆盖全班新落点', 'points_rule_unavailable', 503);
  }
  // Freeze before any wallet request; old confirmed moves have no such awards
  // and remain historical records without retroactive credits.
  move.rewardPolicy = GROUP_MOVE_REWARD_POLICY;
  move.landingEffectsPolicy = GROUP_LANDING_EFFECTS_POLICY;
  move.awards = move.moves.filter(entry => entry.path.length > 0).map(entry => {
    const points = worldRule.nodes.find(node => node.nodeId === entry.toNodeId)?.points;
    if (!session.studentIds.includes(entry.studentId) || !validLandingPointsValue(session.rule.revision, points)) {
      throw pointsError('全班新落格积分规则无效', 'points_rule_unavailable', 503);
    }
    const attemptId = `group-landing:${createHash('sha256').update(JSON.stringify([session.id, instanceId, entry.studentId])).digest('hex')}`;
    return { studentId: entry.studentId, attemptId, points, ruleVersion: session.rule.revision, status: 'planned', receipt: null, landingEffectsApplied: false,
      ...(source.rerollOf && source.studentId === entry.studentId ? { rerollOf: source.rerollOf } : {}),
      event: { turnId: attemptId, studentId: entry.studentId, worldRef: active.worldPackRef,
        boardRef: worldRule.boardRef, levelRef: worldRule.levelRef, worldInstanceId: active.instanceId, nodeId: entry.toNodeId } };
  });
  move.status = 'confirmed'; move.worldInstanceId = active.instanceId;
  state.groupMoveSuccesses += 1;
  if (state.groupMoveSuccesses >= SPECIAL_CELL_GROUP_MOVE_LESSON_CAP) {
    for (const queued of Object.values(state.groupMoves)) if (queued.status === 'pending') queued.status = 'exhausted';
  }
  if (SPECIAL_CELL_TYPE_BY_ID[move.type].oneTime && !state.consumed.includes(move.cellId)) state.consumed.push(move.cellId);
  return { move, duplicate: false };
}


/** Replayable cash/effect settlement after every pupil in this batch has a base receipt. */
export async function settleGroupLandingEffects(session, move, platform, context) {
  if (move.landingEffectsPolicy !== GROUP_LANDING_EFFECTS_POLICY
    || move.status !== 'confirmed' || move.awards?.some(award => award.status !== 'awarded')) return;
  // Seat order is authoritative when two pupils reach the same one-time cell.
  for (const award of move.awards || []) {
    if (award.landingEffectsApplied === true) continue;
    const synthetic = { ...award, status: 'awarded' };
    applySpecialCellLanding(session, synthetic);
    award.specialCell = synthetic.specialCell ? structuredClone(synthetic.specialCell) : null;
    award.landingEffectsApplied = true;
  }
  for (const award of move.awards || []) {
    await settleSpecialCellBonuses(session, award, platform, context);
  }
}
