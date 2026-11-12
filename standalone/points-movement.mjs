import { hasDoubleDiceFields } from '../public/prototypes/universal-board/double-dice-core.js';
import { randomUUID } from 'node:crypto';
import { WORLD_REGISTRIES, WORLD_ROUTES, XIMITU_WORLD_ROUTE, CIRCUIT_WORLD_ROUTE_REF, isCloudHarborWorldRef } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition, walkWorldPlan, commitSharedExpedition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { createHarborMapState, settleHarborTurn } from '../public/prototypes/universal-board/harbor-items-core.js';

export function pointsError(message, code = 'points_invalid', statusCode = 422, details) {
  return Object.assign(new Error(message), { code, statusCode, ...(details ? { details } : {}) });
}
export const CURRENT_ROUTE_REF = `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`;
export function createPointsWorld(studentIds, createId = randomUUID, routeRef = CURRENT_ROUTE_REF) {
  const route = WORLD_ROUTES[routeRef];
  if (!route) throw pointsError('本局地图路线版本不可用', 'points_rule_unavailable', 503);
  const composition = resolveWorldComposition(route.entryWorldRef, WORLD_REGISTRIES);
  return {
    world: { schemaVersion: 'world-runtime.v1', routeRef,
      active: { instanceId: createId(), ordinal: 1, worldPackRef: composition.worldRef,
        mapState: isCloudHarborWorldRef(composition.worldRef) ? createHarborMapState() : structuredClone(composition.level.initialMapState || {}),
        levelState: structuredClone(composition.level.initialLevelState || {}) }, completed: [], processedTransitionIds: [] },
    teams: studentIds.map(id => ({ id, nodeId: composition.board.entryNodeId || composition.board.startNodeId,
      ...(routeRef === CIRCUIT_WORLD_ROUTE_REF ? { completedLaps: 0 } : {}) })),
  };
}
const available = (edge, state) => !edge.availableWhen || state[edge.availableWhen.stateKey] === edge.availableWhen.equals;
const record = value => value && typeof value === 'object' && !Array.isArray(value);

// Same immutable topology and movement primitives as the browser, with all
// starting state supplied by persisted server state rather than the request.
export function planPointsMove(session, turn, routeChoicesByWorldInstance = {}) {
  if (!record(routeChoicesByWorldInstance)) throw pointsError('路线选择格式无效');
  const start = session.world.active;
  const allowedInstances = new Set([start.instanceId, turn.nextWorldInstanceId]);
  for (const [instance, choices] of Object.entries(routeChoicesByWorldInstance)) {
    if (!allowedInstances.has(instance) || !record(choices) || Object.values(choices).some(v => typeof v !== 'string')) {
      throw pointsError('路线选择包含未知世界或非法选项');
    }
  }
  const actor = session.teams.find(team => team.id === turn.studentId);
  if (!actor || actor.nodeId !== turn.startLocation.nodeId || start.instanceId !== turn.startLocation.worldInstanceId) {
    throw pointsError('棋局位置已经变化', 'points_state_conflict', 409);
  }
  let plan;
  try {
    plan = walkWorldPlan({ moveId: turn.attemptId, worldInstanceId: start.instanceId,
      nextWorldInstanceId: turn.nextWorldInstanceId, worldOrdinal: start.ordinal,
      worldRef: start.worldPackRef, startNodeId: actor.nodeId, steps: turn.steps,
      ...(hasDoubleDiceFields(turn) ? { dicePolicy: turn.dicePolicy, faceIndices: [...turn.faceIndices] } : {}),
      routeChoicesByWorldInstance, mapStatesByWorldInstance: { [start.instanceId]: start.mapState },
      worldRoute: WORLD_ROUTES[session.world.routeRef], registries: WORLD_REGISTRIES });
  } catch (error) { throw pointsError(error.message, 'points_route_invalid'); }

  // The general planner has a default branch for previews. Money-bearing turns
  // require an explicit choice at every encountered fork and reject unused choices.
  const used = new Set();
  let from = actor.nodeId;
  for (const effect of plan.effects) {
    if (effect.type === 'world_transition' || effect.type === 'lap_return') { from = effect.toEntryNodeId; continue; }
    if (effect.type !== 'pawn_step') continue;
    const composition = resolveWorldComposition(effect.worldRef, WORLD_REGISTRIES);
    const state = effect.worldInstanceId === start.instanceId ? start.mapState : composition.level.initialMapState || {};
    const options = composition.board.edges.filter(edge => edge.from === from && available(edge, state));
    const selected = routeChoicesByWorldInstance[effect.worldInstanceId]?.[from];
    if (options.length > 1 && selected === undefined) {
      throw pointsError('请先选择岔路', 'points_route_choice_required', 409,
        { worldInstanceId: effect.worldInstanceId, junctionNodeId: from, options: options.map(({ id, to }) => ({ edgeId: id, toNodeId: to })) });
    }
    if (selected !== undefined) used.add(`${effect.worldInstanceId}\n${from}`);
    from = effect.nodeId;
  }
  for (const [instance, choices] of Object.entries(routeChoicesByWorldInstance)) {
    for (const node of Object.keys(choices)) if (!used.has(`${instance}\n${node}`)) throw pointsError('路线选择不属于本轮经过的节点', 'points_route_invalid');
  }

  let beforeWorld = structuredClone(session.world);
  if (isCloudHarborWorldRef(start.worldPackRef)) {
    const segments = plan.segments.filter(segment => segment.type === 'walk' && segment.worldInstanceId === start.instanceId);
    if (segments.length) {
      const composition = resolveWorldComposition(start.worldPackRef, WORLD_REGISTRIES);
      const harbor = settleHarborTurn({ mapState: start.mapState, settlementId: turn.attemptId,
        seatId: turn.studentId, activeSeatCount: session.studentIds.length, effectiveTurn: session.completedTurns + 1,
        startNodeId: actor.nodeId, plannedRouteNodeIds: segments.flatMap(segment => segment.nodeIds),
        plannedRouteEdgeIds: segments.flatMap(segment => segment.edgeIds),
        boardNodes: composition.board.nodes, boardTemplateRef: `${composition.board.id}@${composition.board.version}` });
      if (harbor.duplicate) throw pointsError('地图回合已提交', 'points_state_conflict', 409);
      beforeWorld.active.mapState = structuredClone(harbor.mapState);
    }
  }
  const committed = commitSharedExpedition({ worldRuntime: beforeWorld, teams: session.teams,
    activeTeamId: turn.studentId, plan });
  const world = structuredClone(committed.worldRuntime);
  const teams = structuredClone(committed.teams);
  const composition = resolveWorldComposition(plan.finalLocation.worldRef, WORLD_REGISTRIES);
  const landed = composition.board.nodes.find(node => node.id === plan.finalLocation.nodeId);
  const transport = landed.spaceRole === 'transport' && session.completedTurns >= (landed.transportUnlockAfterCompletedTurns || 0);
  const finalNodeId = transport ? landed.transportTargetId : landed.id;
  teams.find(team => team.id === turn.studentId).nodeId = finalNodeId;

  const levelState = world.active.levelState;
  const discovered = levelState.discoveredNodeIds || [];
  if (!isCloudHarborWorldRef(composition.worldRef)) {
    const rewardRef = composition.level.nodeBindings?.[finalNodeId]?.rewardRef;
    const profile = composition.level.landingProfiles?.[rewardRef];
    if (!profile) throw pointsError('最终落点规则不存在', 'points_rule_unavailable', 503);
    if (profile.kind !== 'ordinary') {
      if (!discovered.includes(finalNodeId) && profile.firstStateChanges) Object.assign(world.active.mapState, structuredClone(profile.firstStateChanges));
      levelState.discoveredNodeIds = [...new Set([...discovered, finalNodeId])];
    }
  }
  const ruleWorld = session.rule.worlds.find(entry => entry.worldRef === composition.worldRef);
  const nodeRule = ruleWorld?.nodes.find(entry => entry.nodeId === finalNodeId);
  if (!ruleWorld || ruleWorld.boardRef !== `${composition.board.id}@${composition.board.version}`
    || ruleWorld.levelRef !== `${composition.level.id}@${composition.level.version}` || !nodeRule
    || !Number.isSafeInteger(nodeRule.points) || nodeRule.points < 0) {
    throw pointsError('本局积分规则没有覆盖最终落点', 'points_rule_unavailable', 503);
  }
  return { plan, world, teams, finalLocation: { ...plan.finalLocation, nodeId: finalNodeId },
    event: { turnId: turn.attemptId, studentId: turn.studentId, worldRef: composition.worldRef,
      boardRef: ruleWorld.boardRef, levelRef: ruleWorld.levelRef, worldInstanceId: plan.finalLocation.worldInstanceId, nodeId: finalNodeId },
    points: nodeRule.points };
}
