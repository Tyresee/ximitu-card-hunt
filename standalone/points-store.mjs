import { createHash, randomInt, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DOUBLE_DICE_POLICY } from '../public/prototypes/universal-board/double-dice-core.js';
import { SPECIAL_CELLS_SCHEMA } from '../public/prototypes/universal-board/special-cells-core.js';
import { teacherDiceFaces } from '../public/prototypes/universal-board/teacher-dice.js';
import { createPointsWorld, planPointsMove, pointsError } from './points-movement.mjs';
import { CURRENT_POINTS_RULE_VERSION, pointsRuleRouteRef } from './points-rule-versions.mjs';
import { validLandingPointsValue, isFivefoldRuleUpgrade } from '../public/prototypes/universal-board/landing-points-values.js';
import { WORLD_REGISTRIES, WORLD_ROUTES, CIRCUIT_WORLD_ROUTE_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { SPECIAL_CELLS_POLICY, createSpecialCellsState, drawSessionSpecialCells, lockSpecialCellsOnRoll,
  applySpecialCellLanding, settleSpecialCellBonuses, resolveSpecialCellGroupMove,
  refreshCompletedCircuitRound, groupLandingEffectsPending, settleGroupLandingEffects, GROUP_MOVE_REWARD_POLICY } from './points-special-cells.mjs';

const SCHEMA = 'monopoly-authoritative-turns.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const queues = new Map();
const LOCK_SCHEMA = 'monopoly-process-lock.v1';
export function canonicalPointsJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalPointsJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalPointsJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(canonicalPointsJson(value)).digest('hex');
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
function id(value, label = 'ID') { if (typeof value !== 'string' || !ID.test(value)) throw pointsError(`${label}无效`); return value; }
function actorId(actor) {
  id(actor?.id, '账号');
  if (!['owner', 'member'].includes(actor.role)) throw pointsError('无权使用课堂积分', 'points_forbidden', 403);
  return actor.id;
}
function access(state, actor, sessionId) {
  actorId(actor);
  const session = own(state.sessions, sessionId);
  if (!session) throw pointsError('未找到这局服务器记录', 'points_session_not_found', 404);
  if (session.createdBy !== actor.id && actor.role !== 'owner') throw pointsError('无权操作这局游戏', 'points_forbidden', 403);
  return session;
}
function validateRule(rule) {
  const mapRevision = rule?.revision === CURRENT_POINTS_RULE_VERSION && rule.baseRevision !== undefined
    ? rule.baseRevision : rule?.revision;
  if (rule?.revision === CURRENT_POINTS_RULE_VERSION && rule.baseRevision !== undefined
    && !['monopoly-final-landing-v1', 'monopoly-final-landing-v2'].includes(rule.baseRevision)) {
    throw pointsError('平台规则原地图版本无效', 'points_rule_unavailable', 503);
  }
  const routeRef = pointsRuleRouteRef(mapRevision), route = WORLD_ROUTES[routeRef];
  if (!route || rule?.kind !== 'server_verified_final_landing' || rule.enabled !== true
    || rule.currency !== 'wordattack-points'
    || !Array.isArray(rule.worlds) || !rule.worlds.length) throw pointsError('平台落点积分尚未启用', 'points_rule_unavailable', 503);
  const worlds = new Set([route.entryWorldRef, ...route.transitions.flatMap(edge => [edge.fromWorldRef, edge.toWorldRef])]);
  if (rule.worlds.length !== worlds.size || new Set(rule.worlds.map(world => world.worldRef)).size !== worlds.size) {
    throw pointsError('平台规则快照未完整覆盖本局地图', 'points_rule_unavailable', 503);
  }
  for (const world of rule.worlds) {
    if (!worlds.has(world.worldRef)) throw pointsError('平台规则地图版本不匹配', 'points_rule_unavailable', 503);
    const { board, level } = resolveWorldComposition(world.worldRef, WORLD_REGISTRIES);
    const nodeIds = new Set(board.nodes.map(node => node.id));
    if (world.boardRef !== `${board.id}@${board.version}` || world.levelRef !== `${level.id}@${level.version}`
      || !Array.isArray(world.nodes) || world.nodes.length !== nodeIds.size
      || new Set(world.nodes.map(node => node.nodeId)).size !== nodeIds.size
      || world.nodes.some(node => !nodeIds.has(node.nodeId) || !validLandingPointsValue(rule.revision, node.points))) {
      throw pointsError('平台规则快照无效', 'points_rule_unavailable', 503);
    }
  }
  return routeRef;
}
function validateReceipt(receipt, session, turn) {
  const landing = receipt?.landing;
  if (!landing || Object.entries(turn.event).some(([key, value]) => landing[key] !== value)
    || landing.amount !== turn.points || landing.ruleVersion !== (turn.ruleVersion || session.initialRuleVersion || session.rule.revision)
    || landing.status !== 'awarded' || landing.currency !== 'wordattack-points'
    || !receipt.wallet || receipt.wallet.studentId !== turn.studentId || receipt.wallet.currency !== 'wordattack-points'
    || !Number.isSafeInteger(receipt.wallet.balance) || receipt.wallet.balance < 0) {
    throw pointsError('平台到账回执不完整，请稍后重试查询', 'points_receipt_invalid', 502);
  }
}

function assertPointsIdle(session) {
  if (session.activeTurnId || Object.values(session.turns || {}).some(turn => ['rolled', 'planned'].includes(turn.status))
    || Object.values(session.specialCells?.bonusAwards || {}).some(award => award.status !== 'awarded')
    || Object.values(session.specialCells?.groupMoves || {}).some(move => move.status === 'pending'
      || move.awards?.some(award => award.status !== 'awarded') || groupLandingEffectsPending(move, session.specialCells))) {
    throw pointsError('请先结清原回合、宝藏与全班落格奖励，再切换新格价', 'points_rule_upgrade_pending', 409);
  }
}

function publicPointsResult(value) {
  const result = structuredClone(value);
  // Old server turns remain immutable audit records. Every response strips their
  // retired dice bonuses so retries/recovery cannot reintroduce coins or stars.
  const clearBonus = turn => { if (turn && typeof turn === 'object') turn.bonus = { coins: 0, stars: 0 }; };
  clearBonus(result.turn);
  for (const turn of Object.values(result.session?.turns || {})) clearBonus(turn);
  return result;
}

export class PointsTurnStore {
  constructor({ dataDir, platform, random = randomInt, createId = randomUUID, clock = Date.now } = {}) {
    if (!dataDir) throw new TypeError('PointsTurnStore requires dataDir');
    this.dataDir = resolve(dataDir); this.filePath = resolve(this.dataDir, 'authoritative-turns.json');
    this.platform = platform; this.random = random; this.createId = createId; this.clock = clock;
  }
  async #read() {
    let state;
    try { state = JSON.parse(await readFile(this.filePath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { schemaVersion: SCHEMA, sessions: {}, externalSessions: {}, receipts: {} }; throw pointsError('服务器棋局存储损坏', 'points_store_corrupt', 503); }
    if (state?.schemaVersion !== SCHEMA || !state.sessions || !state.externalSessions || !state.receipts) throw pointsError('服务器棋局存储版本无效', 'points_store_corrupt', 503);
    return state;
  }
  async #write(state) {
    const temporary = `${this.filePath}.${this.createId()}.tmp`;
    let file;
    try {
      file = await open(temporary, 'wx', 0o600); await file.writeFile(JSON.stringify(state)); await file.sync(); await file.close(); file = null;
      await rename(temporary, this.filePath);
      const directory = await open(this.dataDir, 'r'); try { await directory.sync(); } finally { await directory.close(); }
    } finally { if (file) await file.close(); await rm(temporary, { force: true }); }
  }
  async #readLock(path) {
    let raw;
    try { raw = await readFile(path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    let owner;
    try { owner = JSON.parse(raw); } catch { /* Invalid legacy locks require operator inspection. */ }
    if (owner?.schemaVersion !== LOCK_SCHEMA || !Number.isSafeInteger(owner.pid) || owner.pid < 1
      || typeof owner.createdAt !== 'string' || !Number.isFinite(Date.parse(owner.createdAt))
      || typeof owner.token !== 'string' || !ID.test(owner.token)) {
      throw pointsError('积分存储锁缺少有效进程信息，请核查服务器锁文件后恢复，未自动移除', 'points_store_lock_invalid', 503);
    }
    return owner;
  }
  #ownerDead(owner) {
    try { process.kill(owner.pid, 0); return false; }
    catch (error) {
      // EPERM and unknown failures do not prove that the owning process exited.
      return error.code === 'ESRCH';
    }
  }
  async #publishLock(path, owner) {
    const temporary = `${path}.${owner.token}.owner`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(owner)); await handle.sync(); await handle.close(); handle = null;
      // Hard linking a completed owner file is an atomic, exclusive publish.
      // A process killed before this call cannot leave a blank shared lock.
      await link(temporary, path);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    } finally { if (handle) await handle.close(); await rm(temporary, { force: true }); }
  }
  async #releaseLock(path, owner) {
    const current = await this.#readLock(path);
    if (!current) return;
    if (current.pid !== owner.pid || current.token !== owner.token || current.createdAt !== owner.createdAt) {
      throw pointsError('积分存储锁所属进程发生变化，未移除锁文件', 'points_store_lock_changed', 503);
    }
    await unlink(path);
  }
  async #acquireLock(path, depth = 0) {
    if (depth > 8) throw pointsError('积分存储锁恢复链异常，请检查服务器锁文件', 'points_store_lock_recovery_limit', 503);
    const owner = { schemaVersion: LOCK_SCHEMA, pid: process.pid,
      createdAt: new Date(this.clock()).toISOString(), token: this.createId() };
    if (await this.#publishLock(path, owner)) return () => this.#releaseLock(path, owner);
    const existing = await this.#readLock(path);
    if (!existing) {
      if (await this.#publishLock(path, owner)) return () => this.#releaseLock(path, owner);
      throw pointsError('棋局正在保存，请稍后重试', 'points_store_busy', 409);
    }
    if (!this.#ownerDead(existing)) throw pointsError('棋局正在由活跃进程保存，请稍后重试', 'points_store_busy', 409);

    // Every stale-owner deletion is serialized by a separate lock. A crashed
    // recovery process is recovered by the same protocol one level deeper.
    // The bounded chain never steals a live/unknown owner or guesses from age.
    const releaseRecovery = await this.#acquireLock(`${path}.recovery`, depth + 1);
    try {
      const current = await this.#readLock(path);
      if (current) {
        if (!this.#ownerDead(current)) throw pointsError('棋局正在由活跃进程保存，请稍后重试', 'points_store_busy', 409);
        await unlink(path);
      }
      if (!await this.#publishLock(path, owner)) throw pointsError('棋局正在保存，请稍后重试', 'points_store_busy', 409);
      return () => this.#releaseLock(path, owner);
    } finally { await releaseRecovery(); }
  }
  async #transaction(write, callback) {
    const prior = queues.get(this.filePath) || Promise.resolve();
    const job = prior.catch(() => {}).then(async () => {
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const releaseLock = write ? await this.#acquireLock(`${this.filePath}.lock`) : null;
      try { const state = await this.#read(); const result = await callback(state); if (write) await this.#write(state); return publicPointsResult(result); }
      finally { if (releaseLock) await releaseLock(); }
    });
    queues.set(this.filePath, job);
    try { return await job; } finally { if (queues.get(this.filePath) === job) queues.delete(this.filePath); }
  }
  async #idempotent(state, actor, operation, key, payload, callback) {
    id(key, '幂等键');
    const identity = `${actor.id}:${operation}:${key}`, requestHash = hash(payload), previous = own(state.receipts, identity);
    if (previous) {
      if (previous.requestHash !== requestHash) throw pointsError('同一操作不能变更内容', 'points_idempotency_conflict', 409);
      const session = access(state, actor, previous.sessionId);
      const turn = previous.attemptId ? own(session.turns, previous.attemptId) : null;
      return { session, ...(turn ? { turn } : {}), ...(previous.hasReceipt ? { receipt: turn.receipt } : {}), duplicate: true };
    }
    const result = await callback();
    state.receipts[identity] = { requestHash, sessionId: result.session.id,
      attemptId: result.turn?.attemptId || null, hasReceipt: Boolean(result.receipt) };
    return result;
  }
  async register({ actor, externalSessionId, studentIds, mode, idempotencyKey, context }) {
    actorId(actor); id(externalSessionId, '本局ID');
    if (mode !== 'teacher-led') throw pointsError('知识答题模式尚未接入服务器积分回执', 'points_voice_unavailable', 409);
    if (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > 8 || new Set(studentIds).size !== studentIds.length
      || studentIds.some(student => !UUID.test(student))) throw pointsError('请使用已登记学生的UUID');
    return this.#transaction(true, state => this.#idempotent(state, actor, 'register', idempotencyKey,
      { externalSessionId, studentIds, mode }, async () => {
        const externalKey = `${actor.id}:${externalSessionId}`;
        const previous = own(state.sessions, own(state.externalSessions, externalKey));
        if (previous) {
          if (canonicalPointsJson(previous.studentIds) !== canonicalPointsJson(studentIds) || previous.mode !== mode) throw pointsError('棋局登记名单不能更改', 'points_session_conflict', 409);
          return { session: previous, duplicate: true };
        }
        if (!this.platform?.register) throw pointsError('平台积分服务尚未连接', 'points_platform_unavailable', 503);
        let registered, recoveringRegistration = false;
        try {
          registered = await this.platform.register({ externalSessionId, studentIds, ruleVersion: CURRENT_POINTS_RULE_VERSION }, context);
        } catch (error) {
          // A previous release may have registered v1 before its first local write failed.
          // Read that exact registration; never replace its rule or rebuild a paid game.
          if (!this.platform.getByExternal || !['game_points_idempotency_conflict', 'game_points_roster_conflict'].includes(error.code)) throw error;
          registered = await this.platform.getByExternal(externalSessionId, context);
          recoveringRegistration = true;
        }
        const platformSession = registered?.session;
        if (!platformSession || !UUID.test(platformSession.id) || platformSession.externalSessionId !== externalSessionId
          || canonicalPointsJson(platformSession.studentIds) !== canonicalPointsJson(studentIds)
          || (recoveringRegistration && (platformSession.gameMode !== mode || platformSession.createdBy !== actor.id))
          || (!recoveringRegistration && platformSession.rule?.revision !== CURRENT_POINTS_RULE_VERSION)) {
          throw pointsError('平台棋局回执不匹配', 'points_receipt_invalid', 502);
        }
        if (!Number.isSafeInteger(platformSession.landingCount) || platformSession.landingCount !== 0) {
          throw pointsError('平台已有本局奖励记录，请恢复原服务器棋局，不可重新从起点登记', 'points_state_recovery_required', 409);
        }
        const routeRef = validateRule(platformSession.rule);
        // Movement has its own immutable policy. The approved monetary snapshot
        // still covers all 123 historical nodes and is never rewritten for a lap.
        const circuit = !recoveringRegistration && platformSession.rule.revision === CURRENT_POINTS_RULE_VERSION;
        const session = { id: this.createId(), externalSessionId, studentIds: [...studentIds], mode,
          createdBy: actor.id, createdAt: new Date(this.clock()).toISOString(), status: 'open',
          platformSessionId: platformSession.id, rule: structuredClone(platformSession.rule),
          // New sessions only: older snapshots keep home-points-only without special cells.
          rewardPolicy: SPECIAL_CELLS_POLICY, specialCells: createSpecialCellsState(),
          ...createPointsWorld(studentIds, this.createId, circuit ? CIRCUIT_WORLD_ROUTE_REF : routeRef),
          ...(circuit ? { movementPolicy: 'individual-laps-v1', lapRound: 1 } : {}),
          completedTurns: 0, activeTurnId: null, turns: {} };
        state.sessions[session.id] = session; state.externalSessions[externalKey] = session.id;
        return { session, duplicate: false };
      }));
  }
  async get({ actor, sessionId, externalSessionId }) {
    actorId(actor);
    return this.#transaction(false, state => {
      const resolved = externalSessionId === undefined ? sessionId : own(state.externalSessions, `${actor.id}:${id(externalSessionId)}`);
      return { session: access(state, actor, resolved) };
    });
  }
  async #upgradeRule(session, context) {
    if (session.rule.revision === CURRENT_POINTS_RULE_VERSION) return { session, duplicate: true };
    if (session.status !== 'open') throw pointsError('本局已结束', 'points_session_closed', 409);
    assertPointsIdle(session);
    validateRule(session.rule);
    if (!this.platform?.upgradeRule) throw pointsError('平台新格价暂不可用，请保留原棋局重试', 'points_platform_unavailable', 503);
    const previous = structuredClone(session.rule);
    // The private bridge independently derives exactly one fivefold schedule.
    // Its retry key is stable even if its first response or our local save was lost.
    const response = await this.platform.upgradeRule(session.platformSessionId, {
      expectedRuleVersion: previous.revision, targetRuleVersion: CURRENT_POINTS_RULE_VERSION,
    }, context);
    const remote = response?.session;
    if (!remote || remote.id !== session.platformSessionId || remote.externalSessionId !== session.externalSessionId
      || canonicalPointsJson(remote.studentIds) !== canonicalPointsJson(session.studentIds)
      || remote.createdBy !== session.createdBy || remote.gameMode !== session.mode
      || canonicalPointsJson(remote.ruleHistory?.[previous.revision]) !== canonicalPointsJson(previous)
      || !isFivefoldRuleUpgrade(previous, remote.rule)) {
      throw pointsError('平台新格价回执与原棋局不一致，尚未切换', 'points_receipt_invalid', 502);
    }
    validateRule(remote.rule);
    session.initialRuleVersion ||= previous.revision;
    session.ruleHistory = { ...(session.ruleHistory || {}), [previous.revision]: previous };
    session.rule = structuredClone(remote.rule);
    session.ruleUpgrade = { from: previous.revision, to: CURRENT_POINTS_RULE_VERSION,
      upgradedAt: new Date(this.clock()).toISOString() };
    return { session, duplicate: false };
  }
  async upgradeRule({ actor, sessionId, idempotencyKey, context }) {
    actorId(actor);
    return this.#transaction(true, state => this.#idempotent(state, actor, 'rule-upgrade', idempotencyKey,
      { sessionId, targetRuleVersion: CURRENT_POINTS_RULE_VERSION }, () => this.#upgradeRule(access(state, actor, sessionId), context)));
  }
  async roll({ actor, sessionId, studentId, attemptId, idempotencyKey, context }) {
    actorId(actor); id(attemptId, '回合ID');
    if (attemptId.startsWith('group-landing:')) throw pointsError('此回合ID仅供服务器全班落格使用');
    return this.#transaction(true, state => this.#idempotent(state, actor, 'roll', idempotencyKey,
      { sessionId, studentId, attemptId }, async () => {
        const session = access(state, actor, sessionId);
        if (session.mode !== 'teacher-led') throw pointsError('知识答题积分凭证尚未就绪', 'points_voice_unavailable', 409);
        if (!session.studentIds.includes(studentId)) throw pointsError('学生不属于本局', 'points_student_invalid', 403);
        const previous = own(session.turns, attemptId);
        if (previous) {
          if (previous.studentId !== studentId) throw pointsError('回合学生不能更换', 'points_turn_conflict', 409);
          return { turn: previous, session, duplicate: true };
        }
        if (session.status !== 'open') throw pointsError('本局已结束', 'points_session_closed', 409);
        if (session.activeTurnId) throw pointsError('请先完成已掷骰的回合', 'points_turn_pending', 409);
        await this.#upgradeRule(session, context);
        const doubleDiceLayout = session.rewardPolicy === SPECIAL_CELLS_POLICY
          && session.specialCells?.policy === SPECIAL_CELLS_POLICY && session.specialCells.layoutVersion === SPECIAL_CELLS_SCHEMA;
        const held = doubleDiceLayout
          ? session.specialCells.heldDoubleDiceByStudent : null;
        if (doubleDiceLayout && (!held || typeof held !== 'object' || Array.isArray(held))) {
          throw pointsError('双骰机会存储记录无效，请恢复原棋局', 'points_state_conflict', 409);
        }
        const hasHeldDoubleDice = Boolean(held && Object.hasOwn(held, studentId));
        const heldDoubleDice = hasHeldDoubleDice ? held[studentId] : null;
        if (hasHeldDoubleDice && (!heldDoubleDice || typeof heldDoubleDice !== 'object' || Array.isArray(heldDoubleDice)
          || Object.keys(heldDoubleDice).length !== 2 || typeof heldDoubleDice.sourceTurnId !== 'string'
          || typeof heldDoubleDice.cellId !== 'string' || !ID.test(heldDoubleDice.sourceTurnId)
          || !ID.test(heldDoubleDice.cellId))) {
          throw pointsError('双骰机会来源记录无效，请恢复原棋局', 'points_state_conflict', 409);
        }
        const faceIndex = this.random(6);
        if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex > 5) throw pointsError('服务器骰子异常', 'points_random_invalid', 503);
        const face = teacherDiceFaces({ mode: 'teacher-led', teacherDiceRef: 'teacher-dice.v1' }, null)[faceIndex];
        const secondFaceIndex = heldDoubleDice ? this.random(6) : null;
        if (heldDoubleDice && (!Number.isInteger(secondFaceIndex) || secondFaceIndex < 0 || secondFaceIndex > 5)) {
          throw pointsError('服务器骰子异常', 'points_random_invalid', 503);
        }
        const world = session.world.active;
        const turn = { attemptId, studentId, ruleVersion: session.rule.revision, status: 'rolled', faceIndex, steps: face.steps, bonus: { coins: 0, stars: 0 },
          teacherDiceRef: 'teacher-dice.v1', nextWorldInstanceId: this.createId(),
          startLocation: { worldRef: world.worldPackRef, worldInstanceId: world.instanceId,
            worldOrdinal: world.ordinal, nodeId: session.teams.find(team => team.id === studentId).nodeId },
          createdAt: new Date(this.clock()).toISOString(), receipt: null };
        lockSpecialCellsOnRoll(session, turn);
        if (heldDoubleDice) {
          Object.assign(turn, { dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [faceIndex, secondFaceIndex],
            steps: faceIndex + secondFaceIndex + 2, doubleDiceOf: heldDoubleDice.sourceTurnId });
          delete session.specialCells.heldDoubleDiceByStudent[studentId];
        }
        session.turns[attemptId] = turn; session.activeTurnId = attemptId;
        return { session, turn, duplicate: false };
      }));
  }
  async plan({ actor, sessionId, attemptId, routeChoicesByWorldInstance, idempotencyKey }) {
    actorId(actor); id(attemptId, '回合ID');
    return this.#transaction(true, state => this.#idempotent(state, actor, 'plan', idempotencyKey,
      { sessionId, attemptId, routeChoicesByWorldInstance }, () => {
        const session = access(state, actor, sessionId), turn = own(session.turns, attemptId);
        if (!turn) throw pointsError('请先取得服务器骰子', 'points_turn_not_found', 404);
        const choices = routeChoicesByWorldInstance || {};
        if (turn.status !== 'rolled') {
          if (canonicalPointsJson(turn.routeChoicesByWorldInstance) !== canonicalPointsJson(choices)) throw pointsError('已确认路线不能变更', 'points_turn_conflict', 409);
          return { session, turn, duplicate: true };
        }
        if (session.activeTurnId !== attemptId || session.status !== 'open') throw pointsError('回合状态已变化', 'points_turn_conflict', 409);
        const resolved = planPointsMove(session, turn, choices);
        session.world = resolved.world; session.teams = resolved.teams; session.completedTurns++;
        Object.assign(turn, { status: 'planned', routeChoicesByWorldInstance: structuredClone(choices),
          plan: resolved.plan, finalLocation: resolved.finalLocation, event: resolved.event, points: resolved.points,
          plannedAt: new Date(this.clock()).toISOString() });
        applySpecialCellLanding(session, turn);
        return { session, turn, duplicate: false };
      }));
  }
  async claim({ actor, sessionId, attemptId, idempotencyKey, context }) {
    actorId(actor); id(attemptId, '回合ID');
    return this.#transaction(true, async state => {
      const result = await this.#idempotent(state, actor, 'claim', idempotencyKey,
      { sessionId, attemptId }, async () => {
        const session = access(state, actor, sessionId), turn = own(session.turns, attemptId);
        if (!turn?.event) throw pointsError('本轮最终落点尚未确认', 'points_turn_unplanned', 409);
        if (turn.receipt) return { session, turn, receipt: turn.receipt, duplicate: true };
        if (!this.platform?.claim) throw pointsError('平台积分服务尚未连接', 'points_platform_unavailable', 503);
        const receipt = await this.platform.claim(session.platformSessionId, turn.event, context);
        validateReceipt(receipt, session, turn);
        turn.status = 'awarded'; turn.receipt = structuredClone(receipt); turn.awardedAt = new Date(this.clock()).toISOString();
        if (session.activeTurnId === attemptId) session.activeTurnId = null;
        return { session, turn, receipt, duplicate: false };
      });
      // A base receipt can already exist when its bonus response was lost.
      // Retry the frozen bonus IDs even for an exact idempotent claim replay.
      await settleSpecialCellBonuses(result.session, result.turn, this.platform, context);
      refreshCompletedCircuitRound(result.session, this.clock);
      return result;
    });
  }
  async drawSpecialCells({ actor, sessionId, density, multipliersEnabled, previousDrawNumber, idempotencyKey }) {
    actorId(actor);
    return this.#transaction(true, state => this.#idempotent(state, actor, 'special-cells-draw', idempotencyKey,
      { sessionId, density, multipliersEnabled, previousDrawNumber }, () => {
        const session = access(state, actor, sessionId);
        const { duplicate } = drawSessionSpecialCells(session, { density, multipliersEnabled, previousDrawNumber }, this.clock);
        return { session, duplicate };
      }));
  }
  async resolveGroupMove({ actor, sessionId, instanceId, decision, idempotencyKey }) {
    actorId(actor); id(instanceId, '全班挑战ID');
    return this.#transaction(true, async state => {
      const result = await this.#idempotent(state, actor, 'group-move', idempotencyKey,
      { sessionId, instanceId, decision }, () => {
        const session = access(state, actor, sessionId);
        const { move, duplicate } = resolveSpecialCellGroupMove(session, instanceId, decision);
        return { session, groupMove: move, duplicate };
      });
      result.groupMove ||= result.session.specialCells.groupMoves[instanceId];
      refreshCompletedCircuitRound(result.session, this.clock);
      return result;
    });
  }
  async claimGroupMove({ actor, sessionId, instanceId, idempotencyKey, context }) {
    actorId(actor); id(instanceId, '全班挑战ID');
    return this.#transaction(true, async state => {
      const result = await this.#idempotent(state, actor, 'group-move-claim', idempotencyKey,
        { sessionId, instanceId }, () => {
          const session = access(state, actor, sessionId);
          const move = own(session.specialCells?.groupMoves || {}, instanceId);
          if (!move || move.status !== 'confirmed') {
            throw pointsError('请先完成并保存全班前进', 'special_cells_group_move_unconfirmed', 409);
          }
          return { session, groupMove: move, duplicate: false };
        });
      const move = result.groupMove ||= result.session.specialCells.groupMoves[instanceId];
      if (move.rewardPolicy === GROUP_MOVE_REWARD_POLICY) {
        // Each pupil has a separate signed, frozen landing identity. Preserve
        // successful receipts if another pupil is offline or a response is lost.
        await Promise.all(move.awards.map(async award => {
          if (award.status === 'awarded') return;
          try {
            if (!this.platform?.claim) throw pointsError('平台积分尚未连接', 'points_platform_unavailable', 503);
            const receipt = await this.platform.claim(result.session.platformSessionId, award.event, context);
            validateReceipt(receipt, result.session, award);
            award.status = 'awarded'; award.receipt = structuredClone(receipt);
            award.awardedAt = new Date(this.clock()).toISOString(); award.error = null;
          } catch (error) {
            award.status = 'planned';
            award.error = { code: error.code || 'points_platform_unavailable', message: '新落格积分待到账，请重试原奖励' };
          }
        }));
      }
      await settleGroupLandingEffects(result.session, move, this.platform, context);
      refreshCompletedCircuitRound(result.session, this.clock);
      return result;
    });
  }
  async end({ actor, sessionId, idempotencyKey }) {
    actorId(actor);
    return this.#transaction(true, state => this.#idempotent(state, actor, 'end', idempotencyKey, { sessionId }, () => {
      const session = access(state, actor, sessionId);
      // Closing never turns an unfinished animation into a new reward. A
      // planned claim remains recoverable after closing; an unplanned roll is
      // abandoned permanently, so neither a fresh turn nor a reroll can follow.
      const active = own(session.turns, session.activeTurnId);
      if (active?.status === 'rolled') { active.status = 'abandoned'; session.activeTurnId = null; }
      session.status = 'closed'; session.closedAt ||= new Date(this.clock()).toISOString(); return { session };
    }));
  }
}
