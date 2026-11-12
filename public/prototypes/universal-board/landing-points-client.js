import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "./special-cells-core.js";
import { validLandingPointsValue, FIVEFOLD_POINTS_RULE_VERSION } from "./landing-points-values.js";
import { hasDoubleDiceFields, validTeacherDiceRoll } from "./double-dice-core.js";
// Teacher-led games only. Dice, routes, points and receipts come from the server.
// This outbox never claims a turn by itself: the app calls claim after landing.
const API = "/games/monopoly/api/points/v1";
const SESSIONS = `${API}/sessions`;
const WALLET_API = "/api/game-points/v1/students";
const STORAGE = "ximitu-card-hunt.landing-points.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const TURN_STATES = new Set(["rolled", "planned", "awarded", "abandoned"]);
const GROUP_REWARD_POLICY = "group-final-landing-v1";
const clone = (value) => structuredClone(value);
const object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : object(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const sameRoster = (a, b) => Array.isArray(a) && Array.isArray(b)
  && canonical([...a].sort()) === canonical([...b].sort());
const validRoster = (ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= 8
  && ids.every((id) => typeof id === "string" && UUID.test(id)) && new Set(ids).size === ids.length;

function failure(message, code = "points_client_invalid", status = 0, details) {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details: clone(details) }) });
}

export function createLandingPointsClient({
  getUserId, storage, fetchImpl = globalThis.fetch, onChange = () => {}, timeoutMs = 10000,
  now = () => new Date().toISOString(), createId = () => globalThis.crypto.randomUUID(),
} = {}) {
  if (typeof getUserId !== "function") throw new TypeError("getUserId is required");
  const flights = new Map();
  const wallets = new Map();
  let storageError = "";
  const notify = () => { try { onChange(); } catch { /* Observers cannot alter transactions. */ } };
  const key = (actor) => `${STORAGE}:${encodeURIComponent(actor)}`;
  // Perf: the board asks for the outbox many times per redraw and it grows every
  // turn. Re-parse only when the stored text changed; callers still get clones.
  let parsed = { userId: null, raw: null, records: null };
  const flightKey = (record) => `${record.expectedUserId}:${record.externalSessionId}`;

  function actor() {
    const id = getUserId();
    if (typeof id !== "string" || !id) throw failure("请先登录平台。", "auth_required", 401);
    return id;
  }

  function assertActor(expected) {
    if (getUserId() !== expected) throw failure("登录账号已改变，请返回原账号恢复本局积分。", "auth_context_changed", 409);
  }

  function read(userId = getUserId()) {
    if (!userId) return {};
    try {
      const raw = storage?.getItem(key(userId));
      if (raw && parsed.userId === userId && parsed.raw === raw) { storageError = ""; return parsed.records; }
      parsed = { userId: null, raw: null, records: null };
      const records = raw ? JSON.parse(raw) : {};
      if (!object(records) || Object.entries(records).some(([externalId, record]) => (
        !ID.test(externalId) || !object(record) || record.externalSessionId !== externalId
        || record.expectedUserId !== userId || !validRoster(record.studentIds) || !object(record.operations)
      ))) throw new Error("invalid outbox");
      for (const record of Object.values(records)) {
        const session = record.session;
        // Restoring a composite result must use the same validation as a
        // network reply. Old single-die outboxes keep their existing format.
        if (Object.values(session?.turns || {}).some((turn) => hasDoubleDiceFields(turn) || turn?.steps > 6)) {
          checkedSession(record, session);
        }
      }
      storageError = "";
      if (raw) parsed = { userId, raw, records };
      return records;
    } catch {
      storageError = "积分恢复记录无法读取，未发起新的积分写入；请保留存档并重试。";
      return null;
    }
  }

  function get(externalId) {
    const records = read();
    return clone(records && own(records, externalId) || null);
  }

  function save(record) {
    assertActor(record.expectedUserId);
    const records = read(record.expectedUserId);
    if (!records) throw failure(storageError, "points_storage_unavailable");
    parsed = { userId: null, raw: null, records: null };
    records[record.externalSessionId] = clone(record);
    try {
      if (!storage?.setItem || !storage?.getItem) throw new Error("storage unavailable");
      const raw = JSON.stringify(records);
      storage.setItem(key(record.expectedUserId), raw);
      if (storage.getItem(key(record.expectedUserId)) !== raw) throw new Error("storage write not retained");
      storageError = "";
    } catch {
      storageError = "积分重试记录无法保存，未发起新的积分写入；请释放浏览器存储后重试。";
      throw failure(storageError, "points_storage_unavailable");
    }
    notify();
    return clone(record);
  }

  async function request(path, expectedUserId, { method = "GET", body, idempotencyKey } = {}) {
    assertActor(expectedUserId);
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(path, {
            method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
            headers: {
              ...(body ? { "content-type": "application/json" } : {}),
              ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          const payload = await response.json().catch(() => null);
          assertActor(expectedUserId);
          if (!response.ok) {
            const code = payload?.error?.code || payload?.code
              || (typeof payload?.error === "string" ? payload.error : "points_service_unavailable");
            throw failure(response.status === 401 ? "平台登录已失效，请重新登录后恢复原回合。"
              : payload?.error?.message || payload?.message || "平台积分暂不可用，请重试原回合。",
            code, response.status, payload?.error?.details ?? payload?.details);
          }
          if (!object(payload)) throw failure("积分服务回执不完整，请查询原回合。", "points_receipt_invalid");
          return payload;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(failure("积分请求超时，状态尚未确认；请查询或重试原回合。", "points_timeout"));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      assertActor(expectedUserId);
      if (error.name === "AbortError") throw failure("积分请求超时，状态尚未确认；请重试原回合。", "points_timeout");
      if (error instanceof TypeError) throw failure("网络暂不可用，原回合已保留；请恢复网络后重试。", "points_network_unavailable");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function checkedWallet(value, studentId) {
    if (!object(value) || value.studentId !== studentId || value.currency !== "wordattack-points"
      || !Number.isSafeInteger(value.balance) || value.balance < 0) {
      throw failure("钱包回执与学生不一致，余额尚未确认。", "points_receipt_invalid");
    }
    return clone(value);
  }

  function checkedReceipt(receipt, turn) {
    const landing = receipt?.landing;
    if (!object(turn) || !object(landing) || landing.turnId !== turn.attemptId || landing.studentId !== turn.studentId
      || !Number.isSafeInteger(landing.amount) || landing.amount < 0
      || (turn.points !== undefined && landing.amount !== turn.points)) {
      throw failure("积分到账回执与原回合不一致，请查询原回合。", "points_receipt_invalid");
    }
    checkedWallet(receipt.wallet, turn.studentId);
  }

  function checkedGroupAwards(session) {
    const identities = new Set(Object.keys(session.turns));
    for (const [instanceId, move] of Object.entries(session.specialCells?.groupMoves || {})) {
      if (move?.rewardPolicy !== GROUP_REWARD_POLICY) {
        if (move?.awards !== undefined) throw failure("全班落格奖励协议不一致，请查询原棋局。", "points_group_awards_invalid");
        continue; // Historical confirmed moves never acquire new rewards.
      }
      if (!ID.test(instanceId) || move.instanceId !== instanceId || move.status !== "confirmed"
        || !Array.isArray(move.moves) || !Array.isArray(move.awards)) {
        throw failure("全班落格奖励记录不完整，请查询原棋局。", "points_group_awards_invalid");
      }
      if (move.landingEffectsPolicy !== undefined && move.landingEffectsPolicy !== GROUP_LANDING_EFFECTS_POLICY) {
        throw failure("全班落格特效协议不一致，请查询原棋局。", "points_group_awards_invalid");
      }
      const moved = move.moves.filter((entry) => Array.isArray(entry?.path) && entry.path.length > 0);
      if (new Set(move.moves.map((entry) => entry?.studentId)).size !== move.moves.length
        || move.moves.some((entry) => !session.studentIds.includes(entry?.studentId) || !Array.isArray(entry.path))
        || move.awards.length !== moved.length || new Set(move.awards.map((award) => award?.studentId)).size !== moved.length) {
        throw failure("全班落格奖励与学生名单不一致，请查询原棋局。", "points_group_awards_invalid");
      }
      for (const award of move.awards) {
        const entry = moved.find((value) => value.studentId === award?.studentId);
        const event = award?.event;
        const revision = award?.ruleVersion || session.initialRuleVersion || session.rule.revision;
        const frozenRule = revision === session.rule.revision ? session.rule : session.ruleHistory?.[revision];
        const rule = frozenRule?.worlds?.find((world) => world.worldRef === event?.worldRef);
        if (!entry || typeof award.attemptId !== "string" || !ID.test(award.attemptId) || !award.attemptId.startsWith("group-landing:")
          || identities.has(award.attemptId) || !validLandingPointsValue(revision, award.points)
          || !["planned", "awarded"].includes(award.status) || !object(event)
          || canonical(Object.keys(event).sort()) !== canonical(["boardRef", "levelRef", "nodeId", "studentId", "turnId", "worldInstanceId", "worldRef"])
          || event.turnId !== award.attemptId || event.studentId !== award.studentId
          || event.worldInstanceId !== move.worldInstanceId || event.nodeId !== entry.toNodeId
          || !rule || event.boardRef !== rule.boardRef || event.levelRef !== rule.levelRef
          || rule.nodes?.find((node) => node.nodeId === event.nodeId)?.points !== award.points
          || (award.status === "planned" && award.receipt !== null)) {
          throw failure("全班落格奖励与原位置或格价不一致，请查询原棋局。", "points_group_awards_invalid");
        }
        identities.add(award.attemptId);
        if (award.status === "awarded") {
          checkedReceipt(award.receipt, award);
          const landing = award.receipt.landing;
          if (Object.entries(event).some(([key, value]) => landing[key] !== value)
            || landing.ruleVersion !== revision || landing.status !== "awarded"
            || landing.currency !== "wordattack-points") {
            throw failure("全班落格到账回执与原奖励不一致，请查询原棋局。", "points_receipt_invalid");
          }
        }
      }
    }
  }

  function checkedSession(record, session) {
    if (!object(session) || typeof session.id !== "string" || !ID.test(session.id)
      || session.externalSessionId !== record.externalSessionId || session.createdBy !== record.expectedUserId
      || session.mode !== "teacher-led" || !validRoster(session.studentIds)
      || (record.studentIds && !sameRoster(session.studentIds, record.studentIds))
      || !["open", "closed"].includes(session.status) || session.rule?.kind !== "server_verified_final_landing"
      || session.rule.enabled !== true || typeof session.rule.revision !== "string"
      || !object(session.world) || !object(session.turns) || !Array.isArray(session.teams)) {
      throw failure("服务端棋局与当前账号或学生名单不一致，请保留存档核查。", "points_session_invalid");
    }
    for (const [attemptId, turn] of Object.entries(session.turns)) {
      if (!object(turn) || turn.attemptId !== attemptId || !ID.test(attemptId)
        || !session.studentIds.includes(turn.studentId) || !TURN_STATES.has(turn.status)
        || !validTeacherDiceRoll(turn)
        || (hasDoubleDiceFields(turn) && session.specialCells?.layoutVersion !== "special-cells.v2")) {
        throw failure("服务端回合记录不完整，请查询原回合。", "points_turn_invalid");
      }
      if (["planned", "awarded"].includes(turn.status) && (!object(turn.plan) || !object(turn.finalLocation))) {
        throw failure("服务端路线记录不完整，请查询原回合。", "points_turn_invalid");
      }
      if (turn.status === "awarded") checkedReceipt(turn.receipt, turn);
    }
    if (session.activeTurnId != null && !own(session.turns, session.activeTurnId)) {
      throw failure("服务端当前回合缺失，请查询原棋局。", "points_turn_invalid");
    }
    checkedGroupAwards(session);
    return session;
  }

  function accept(record, payload, operationId = null) {
    const session = checkedSession(record, payload.session);
    if (payload.turn && canonical(own(session.turns, payload.turn.attemptId)) !== canonical(payload.turn)) {
      throw failure("服务端回合回执不一致，请查询原回合。", "points_turn_invalid");
    }
    if (payload.receipt) checkedReceipt(payload.receipt, payload.turn);
    if (payload.groupMove && canonical(own(session.specialCells?.groupMoves || {}, payload.groupMove.instanceId)) !== canonical(payload.groupMove)) {
      throw failure("全班前进回执不一致，请查询原棋局。", "points_group_awards_invalid");
    }
    record.studentIds = [...session.studentIds];
    record.session = clone(session);
    record.error = null;
    record.updatedAt = now();
    for (const [id, operation] of Object.entries(record.operations)) {
      const turn = operation.attemptId && own(session.turns, operation.attemptId);
      const group = operation.instanceId && own(session.specialCells?.groupMoves || {}, operation.instanceId);
      const groupPaid = group?.rewardPolicy === GROUP_REWARD_POLICY && group.awards.every((award) => award.status === "awarded")
        && !groupLandingEffectsPending(group, session.specialCells);
      if (id === operationId && operation.kind !== "group-claim" || operation.kind === "register"
        || operation.kind === "rule-upgrade" && session.rule.revision === FIVEFOLD_POINTS_RULE_VERSION
        || operation.kind === "close" && session.status === "closed"
        || operation.kind === "roll" && turn
        || operation.kind === "plan" && ["planned", "awarded"].includes(turn?.status)
        || operation.kind === "claim" && turn?.status === "awarded"
        || operation.kind === "group-move" && group && group.status !== "pending"
        || operation.kind === "group-claim" && groupPaid) {
        operation.status = "done";
        operation.error = null;
      }
    }
    const saved = save(record);
    for (const turn of Object.values(session.turns)) {
      if (turn.status === "awarded") cacheWallet(record, turn.receipt.wallet);
    }
    for (const award of Object.values(session.specialCells?.bonusAwards || {})) {
      if (award?.status === "awarded" && object(award.receipt?.wallet)) {
        cacheWallet(record, award.receipt.wallet);
      }
    }
    for (const move of Object.values(session.specialCells?.groupMoves || {})) {
      for (const award of move.awards || []) {
        if (award.status === "awarded") cacheWallet(record, award.receipt.wallet);
      }
    }
    return saved;
  }

  function cacheWallet(record, value) {
    assertActor(record.expectedUserId);
    const wallet = checkedWallet(value, value.studentId);
    const cacheKey = `${record.expectedUserId}:${wallet.studentId}`;
    const previous = wallets.get(cacheKey);
    // A replay receipt can be older than a subsequent purchase or reward.
    if (Number.isSafeInteger(previous?.revision) && Number.isSafeInteger(wallet.revision)
      && wallet.revision < previous.revision) return;
    wallets.set(cacheKey, { ...wallet, fetchedAt: now() });
  }

  function rememberFailure(record, error, operationId) {
    if (record.expectedUserId !== getUserId()) return;
    const latest = get(record.externalSessionId) || record;
    latest.error = { message: error.message, code: error.code || "points_service_unavailable", status: error.status || 0,
      ...(error.details === undefined ? {} : { details: clone(error.details) }) };
    if (operationId && latest.operations[operationId]) {
      latest.operations[operationId].error = clone(latest.error);
      // This rejection proves no plan was committed. A new route choice may use a new key.
      if (error.code === "points_route_choice_required") latest.operations[operationId].status = "rejected";
    }
    try { save(latest); } catch { notify(); }
  }

  function exclusive(record, signature, operation) {
    const id = flightKey(record), existing = flights.get(id);
    if (existing) return existing.signature === signature ? existing.promise
      : Promise.reject(failure("本局上一次请求尚未结束，请稍后重试。", "points_client_busy", 409));
    const promise = Promise.resolve().then(operation).finally(() => { flights.delete(id); notify(); });
    flights.set(id, { signature, promise });
    notify();
    return promise;
  }

  async function readSession(record) {
    const path = record.session?.id ? `${SESSIONS}/${encodeURIComponent(record.session.id)}`
      : `${SESSIONS}/by-external/${encodeURIComponent(record.externalSessionId)}`;
    const payload = await request(path, record.expectedUserId);
    accept(record, payload);
    return payload;
  }

  async function refreshWallets(record) {
    await Promise.all(record.studentIds.map(async (studentId) => {
      const cacheKey = `${record.expectedUserId}:${studentId}`;
      try {
        const { wallet } = await request(`${WALLET_API}/${encodeURIComponent(studentId)}/wallet`, record.expectedUserId);
        cacheWallet(record, checkedWallet(wallet, studentId));
      } catch (error) {
        if (getUserId() === record.expectedUserId) wallets.set(cacheKey, { error: "余额未读取", code: error.code });
      }
    }));
    assertActor(record.expectedUserId);
    notify();
  }

  function newRecord(externalSessionId, studentIds = null) {
    if (typeof externalSessionId !== "string" || !ID.test(externalSessionId)) throw failure("棋局编号无效。");
    return { externalSessionId, expectedUserId: actor(), studentIds, session: null, operations: {},
      error: null, createdAt: now(), updatedAt: now() };
  }

  function refresh(externalSessionId, { wallets: includeWallets = true } = {}) {
    const record = get(externalSessionId) || newRecord(externalSessionId);
    return exclusive(record, "refresh", async () => {
      try {
        const payload = await readSession(record);
        if (includeWallets) await refreshWallets(get(externalSessionId));
        return payload;
      } catch (error) {
        if (record.studentIds) rememberFailure(record, error);
        throw error;
      }
    });
  }

  async function ready(externalSessionId) {
    if (externalSessionId) return refresh(externalSessionId);
    const context = await request(`${API}/context`, actor());
    if (typeof context.enabled !== "boolean" || !Array.isArray(context.supportedModes)
      || !context.supportedModes.includes("teacher-led") || typeof context.ruleVersion !== "string") {
      throw failure("积分服务配置不完整，请稍后重试。", "points_context_invalid");
    }
    return context;
  }

  function prepare(record, operationId, kind, path, body, attemptId, instanceId) {
    const previous = own(record.operations, operationId);
    if (previous && canonical(previous.body) !== canonical(body)) {
      // A changed 特效格 draw request is fenced by previousDrawNumber on the server.
      if (kind !== "special-draw" && (kind !== "plan" || previous.status !== "rejected")) {
        throw failure("同一回合请求内容已改变，请先查询原回合。", "points_request_conflict", 409);
      }
    } else if (previous) return previous;
    const idempotencyKey = `landing-${kind}:${createId()}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(idempotencyKey)) throw failure("无法保存有效的积分请求编号。");
    const operation = { kind, path, body: clone(body), idempotencyKey, status: "pending", error: null,
      ...(attemptId ? { attemptId } : {}), ...(instanceId ? { instanceId } : {}) };
    record.operations[operationId] = operation;
    save(record); // Never write remotely before the original retry identity is durable.
    return operation;
  }

  async function send(record, operationId, operation) {
    try {
      const payload = await request(operation.path, record.expectedUserId, {
        method: "POST", body: operation.body, idempotencyKey: operation.idempotencyKey,
      });
      accept(get(record.externalSessionId) || record, payload, operationId);
      return payload;
    } catch (error) { rememberFailure(record, error, operationId); throw error; }
  }

  function registerNewGame({ externalSessionId, studentIds, mode = "teacher-led", retryUnstarted = false } = {}) {
    if (!validRoster(studentIds) || mode !== "teacher-led") return Promise.reject(failure("即时积分仅支持绑定正式学生的老师主持新局。"));
    let record;
    try {
      record = get(externalSessionId);
      if (record && !sameRoster(record.studentIds, studentIds)) throw failure("本局学生名单已锁定。", "points_roster_conflict", 409);
      const registering = record && flights.get(flightKey(record));
      if (registering?.signature === "register") return registering.promise;
      if (record && (!retryUnstarted || record.session)) return refresh(externalSessionId);
      record ||= newRecord(externalSessionId, [...studentIds]);
      if (retryUnstarted && Object.values(record.operations).some((op) => op.kind !== "register")) {
        throw failure("已开始的棋局不能重新登记积分。", "points_registration_closed", 409);
      }
      const body = { expectedUserId: record.expectedUserId, externalSessionId, studentIds: [...studentIds], mode };
      const existing = own(record.operations, "register");
      const operation = prepare(record, "register", "register", SESSIONS, body);
      return exclusive(record, "register", async () => {
        if (existing) {
          try { return await readSession(get(externalSessionId)); }
          catch (error) { if (error.status !== 404) { rememberFailure(record, error, "register"); throw error; } }
        }
        return send(record, "register", operation);
      });
    } catch (error) { return Promise.reject(error); }
  }

  function upgradeRule(externalSessionId) {
    try {
      const record = get(externalSessionId);
      if (!record?.session) throw failure("本局尚未登记成功，请先恢复原登记。", "points_session_unregistered", 409);
      if (record.session.rule.revision === FIVEFOLD_POINTS_RULE_VERSION) {
        return Promise.resolve({ session: clone(record.session), duplicate: true });
      }
      const operationId = `rule-upgrade:${FIVEFOLD_POINTS_RULE_VERSION}`;
      return exclusive(record, operationId, async () => {
        const latest = get(externalSessionId);
        const body = { expectedUserId: latest.expectedUserId };
        const path = `${SESSIONS}/${encodeURIComponent(latest.session.id)}/upgrade-rule`;
        const operation = prepare(latest, operationId, "rule-upgrade", path, body);
        return send(latest, operationId, operation);
      });
    } catch (error) { return Promise.reject(error); }
  }

  function turnPayload(record, attemptId) {
    const turn = own(record.session.turns, attemptId);
    return { session: clone(record.session), turn: clone(turn), duplicate: true,
      ...(turn?.receipt ? { receipt: clone(turn.receipt) } : {}) };
  }

  function mutate(externalSessionId, kind, { attemptId, studentId, routeChoicesByWorldInstance } = {}) {
    let record;
    try {
      record = get(externalSessionId);
      if (!record?.session) throw failure("本局尚未登记成功，请先恢复原登记。", "points_session_unregistered", 409);
      if (kind !== "close" && (typeof attemptId !== "string" || !ID.test(attemptId))) throw failure("回合编号无效。");
      const turn = attemptId && own(record.session.turns, attemptId);
      if (kind === "roll") {
        if (!record.studentIds.includes(studentId)) throw failure("该学生不在本局名单中。");
        if (turn && turn.studentId !== studentId) throw failure("同一回合不能改换学生。", "points_request_conflict", 409);
        if (turn) return Promise.resolve(turnPayload(record, attemptId));
      }
      if (["plan", "claim"].includes(kind) && !turn) throw failure("原回合骰子记录尚未确认，请先查询。", "points_turn_missing", 409);
      if (kind === "plan" && ["planned", "awarded"].includes(turn.status)) return Promise.resolve(turnPayload(record, attemptId));
      const pendingBonus = Object.values(record.session.specialCells?.bonusAwards || {})
        .some((award) => award.turnId === attemptId && award.status !== "awarded");
      if (kind === "claim" && turn.status === "awarded" && !pendingBonus) return Promise.resolve(turnPayload(record, attemptId));
      if (kind === "claim" && !["planned", "awarded"].includes(turn.status)) throw failure("原回合尚未完成路线，请先恢复原路线。", "points_turn_not_planned", 409);
      if (kind === "plan" && turn.status === "abandoned") throw failure("此回合已结束，不能重新规划路线。", "points_turn_abandoned", 409);
      if (kind === "close" && record.session.status === "closed") return Promise.resolve({ session: clone(record.session), duplicate: true });
      if (["roll", "plan"].includes(kind) && record.session.status !== "open") throw failure("本局已经结束。", "points_session_closed", 409);
      if (kind === "plan" && !object(routeChoicesByWorldInstance)) throw failure("请选择有效路线。");
      const body = { expectedUserId: record.expectedUserId,
        ...(kind === "roll" ? { studentId, attemptId } : {}),
        ...(kind === "plan" ? { routeChoicesByWorldInstance: clone(routeChoicesByWorldInstance) } : {}) };
      const path = `${SESSIONS}/${encodeURIComponent(record.session.id)}${["roll", "close"].includes(kind)
        ? `/${kind}` : `/turns/${encodeURIComponent(attemptId)}/${kind}`}`;
      const operationId = kind === "close" ? kind : `${kind}:${attemptId}`;
      const signature = `${operationId}:${canonical(body)}`;
      return exclusive(record, signature, async () => {
        const latest = get(externalSessionId);
        const operation = prepare(latest, operationId, kind, path, body, attemptId);
        return send(latest, operationId, operation);
      });
    } catch (error) { return Promise.reject(error); }
  }

  // 特效格: the browser asks for a draw or reports the teacher's decision; the
  // layout, amounts and pushed positions always come back from the server.
  function specialCells(externalSessionId, kind, { density, multipliersEnabled, instanceId, decision } = {}) {
    try {
      const record = get(externalSessionId);
      if (!record?.session) throw failure("本局尚未登记成功，请先恢复原登记。", "points_session_unregistered", 409);
      const special = record.session.specialCells;
      if (!object(special)) throw failure("本局未启用特效格。", "special_cells_unavailable", 409);
      const sessionPath = `${SESSIONS}/${encodeURIComponent(record.session.id)}`;
      let body, path, operationId;
      if (kind === "special-draw") {
        if (!["few", "normal", "many"].includes(density) || typeof multipliersEnabled !== "boolean") throw failure("特效格数量设置无效。");
        if (special.locked) throw failure("第一次掷骰后特效格已锁定。", "special_cells_locked", 409);
        body = { expectedUserId: record.expectedUserId, density, multipliersEnabled, previousDrawNumber: special.drawNumber };
        path = `${sessionPath}/special-cells/draw`; operationId = `special-draw:${special.drawNumber}`;
      } else {
        if (typeof instanceId !== "string" || !ID.test(instanceId)
          || kind !== "group-claim" && !["confirm", "cancel"].includes(decision)) throw failure("全班小挑战请求无效。");
        const move = own(special.groupMoves || {}, instanceId);
        if (!move) throw failure("未找到全班小挑战，请刷新。", "special_cells_group_move_not_found", 404);
        if (kind === "group-claim") {
          if (move.status !== "confirmed") throw failure("请先完成并保存全班前进。", "special_cells_group_move_unconfirmed", 409);
          if (move.rewardPolicy !== GROUP_REWARD_POLICY || move.awards.every((award) => award.status === "awarded") && !groupLandingEffectsPending(move, special)) {
            return Promise.resolve({ session: clone(record.session), groupMove: clone(move), duplicate: true });
          }
          body = { expectedUserId: record.expectedUserId };
          path = `${sessionPath}/group-moves/${encodeURIComponent(instanceId)}/claim`; operationId = `group-claim:${instanceId}`;
        } else {
          if (move.status !== "pending") return Promise.resolve({ session: clone(record.session), groupMove: clone(move), duplicate: true });
          body = { expectedUserId: record.expectedUserId, decision };
          path = `${sessionPath}/group-moves/${encodeURIComponent(instanceId)}/resolve`; operationId = `group-move:${instanceId}`;
        }
      }
      const signature = `${operationId}:${canonical(body)}`;
      return exclusive(record, signature, async () => {
        const latest = get(externalSessionId);
        const operation = prepare(latest, operationId, kind, path, body, undefined, instanceId);
        return send(latest, operationId, operation);
      });
    } catch (error) { return Promise.reject(error); }
  }

  function getLandingSource(id, attemptId) {
    const session = get(id)?.session;
    const normal = session?.turns?.[attemptId];
    if (normal) return clone(normal);
    for (const move of Object.values(session?.specialCells?.groupMoves || {})) {
      const award = move.awards?.find(entry => entry.attemptId === attemptId);
      if (award) return clone(award);
    }
    return null;
  }

  return {
    ready, registerNewGame, get, refresh, upgradeRule,
    drawSpecialCells: (id, options) => specialCells(id, "special-draw", options),
    resolveGroupMove: (id, instanceId, decision) => specialCells(id, "group-move", { instanceId, decision }),
    claimGroupMove: (id, instanceId) => specialCells(id, "group-claim", { instanceId }),
    getSpecialCells: (id) => clone(get(id)?.session?.specialCells || null),
    roll: (id, options) => mutate(id, "roll", options),
    plan: (id, options) => mutate(id, "plan", options),
    // No node, score, amount, route or dice can be sent by claim.
    claim: (id, attemptId) => mutate(id, "claim", { attemptId }),
    close: (id) => mutate(id, "close"),
    getTurn: getLandingSource, getLandingSource,
    getRouteChoices: (id, attemptId) => {
      const record = get(id);
      return clone(record?.session?.turns?.[attemptId]?.routeChoicesByWorldInstance
        ?? record?.operations?.[`plan:${attemptId}`]?.body.routeChoicesByWorldInstance ?? null);
    },
    pendingTurns: (id) => Object.values(get(id)?.session?.turns || {}).filter((turn) => turn.status === "planned").map(clone),
    records: () => Object.values(read() || {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone),
    wallet: (studentId) => clone(wallets.get(`${getUserId()}:${studentId}`) || null),
    isBusy: (id) => flights.has(`${getUserId()}:${id}`),
    error: () => storageError,
  };
}
