// Platform-owned points are separate from this game's coins and stars.
// The server locks a teacher-confirmed participation rule at new-game registration.
const API = "/api/game-points/v1";
const SESSIONS = `${API}/monopoly/sessions`;
const STORAGE = "ximitu-card-hunt.platform-points.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(["awarded", "disabled"]);
const clone = (value) => structuredClone(value);

function sameRoster(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

export function platformPointsCopy(record) {
  if (!record) return "本局没有积分登记，不追溯发放；游戏金币和星星照常保留。";
  if (record.error) return record.error;
  if (record.status === "awarded") return "本局平台积分已到账。";
  if (record.status === "disabled") return "本局积分规则未配置，未到账；之后启用规则也不会补发本局。";
  if (record.status === "registering") return "正在登记本局名单并锁定积分规则…";
  if (!record.session) return "本局积分未登记，未到账；可以查询原登记，不会补建旧局。";
  if (record.completionRequested) return "老师已确认结束，积分回执待确认；重试不会重复发放。";
  if (!record.session.rule?.enabled) return "本局积分规则未配置，结束时不会发放平台积分。";
  return `已锁定参与奖励：每人 ${record.session.rule.points} 积分。老师结束整局时确认结算。`;
}

export function createMonopolyPointsClient({
  getUserId, storage, fetchImpl = globalThis.fetch,
  onChange = () => {}, timeoutMs = 10000, now = () => new Date().toISOString(),
} = {}) {
  const flights = new Map();
  const walletCache = new Map();
  let storageError = "";
  const key = (userId) => `${STORAGE}:${encodeURIComponent(userId)}`;

  function read(userId = getUserId()) {
    if (!userId) return {};
    try {
      const raw = storage.getItem(key(userId));
      const data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid points record");
      return Object.fromEntries(Object.entries(data).filter(([id, record]) => (
        record?.externalSessionId === id && record.expectedUserId === userId
        && Array.isArray(record.studentIds) && record.studentIds.length > 0
        && record.studentIds.length <= 8 && record.studentIds.every((value) => UUID.test(value))
      )));
    } catch {
      storageError = "积分记录暂不可读取，未发起积分写入；游戏仍可继续。";
      return null;
    }
  }

  function save(record) {
    if (record.expectedUserId !== getUserId()) throw new Error("登录账号已改变，请返回原账号查看本局积分。");
    const data = read(record.expectedUserId);
    if (!data) throw new Error(storageError);
    data[record.externalSessionId] = clone(record);
    try {
      storage.setItem(key(record.expectedUserId), JSON.stringify(data));
      storageError = "";
    } catch {
      storageError = "积分重试记录无法保存，未发起新的积分写入；请释放浏览器存储后重试。";
      throw new Error(storageError);
    }
    onChange();
    return record;
  }

  function get(externalSessionId) {
    return clone(read()?.[externalSessionId] || null);
  }

  async function request(path, { record, method = "GET", body, idempotencyKey } = {}) {
    if (!getUserId() || (record && record.expectedUserId !== getUserId())) {
      throw new Error("登录账号已改变，请返回原账号重试。");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(path, {
        method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (record && record.expectedUserId !== getUserId()) throw new Error("登录账号已改变，请返回原账号重试。");
      if (!response.ok) {
        const error = new Error(response.status === 401
          ? "平台登录已失效，积分未确认；重新登录后可重试原结算。"
          : payload.message || "平台积分服务暂不可用，积分未确认。" );
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("积分请求超时，到账状态未确认；请查询或重试原结算。");
      if (error instanceof TypeError) throw new Error("网络暂不可用，积分到账状态未确认；恢复网络后重试。");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function acceptSession(record, session, completion = null) {
    if (!session?.id || session.externalSessionId !== record.externalSessionId
      || session.sourceGameId !== "ximitu-card-hunt"
      || !sameRoster(session.studentIds, record.studentIds)
      || session.rule?.kind !== "teacher_confirmed_session") {
      throw new Error("平台回执与本局名单不一致，未确认到账，请联系老师核查。");
    }
    const receipt = completion || session.settlement;
    if (receipt && TERMINAL.has(receipt.status)) {
      if (receipt.status === "awarded" && (!Array.isArray(receipt.awards)
        || !sameRoster(receipt.awards.map((award) => award.studentId), record.studentIds)
        || receipt.awards.some((award) => !Number.isSafeInteger(award.amount)
          || award.amount <= 0 || !award.ledgerEntryId))) {
        throw new Error("积分到账回执不完整，等待服务端核对。");
      }
      record.receipt = clone({ status: receipt.status, awards: receipt.awards || [] });
      record.status = receipt.status;
    } else {
      if (session.status !== "open") throw new Error("积分结算回执缺失，请重新查询。");
      record.status = "open";
    }
    record.session = clone(session);
    record.completionRequested ||= Boolean(get(record.externalSessionId)?.completionRequested);
    record.error = "";
    record.updatedAt = now();
    return save(record);
  }

  function failed(record, error) {
    // Another account must never receive a late response or error from this one.
    if (record.expectedUserId !== getUserId()) return null;
    record.error = error?.status === 404 && !record.session
      ? "平台未找到本局开局登记，未到账；不补建旧局，请在下一局使用积分规则。"
      : error?.message || "平台积分服务暂不可用，积分未确认。";
    record.status = record.session ? record.status : "unregistered";
    try { save(record); } catch { onChange(); }
    return clone(record);
  }

  function exclusive(record, operation) {
    const flightKey = `${record.expectedUserId}:${record.externalSessionId}`;
    if (flights.has(flightKey)) return flights.get(flightKey);
    const promise = Promise.resolve().then(operation)
      .catch((error) => record.expectedUserId === getUserId()
        ? failed(get(record.externalSessionId) || record, error) : null)
      .finally(() => { flights.delete(flightKey); onChange(); });
    flights.set(flightKey, promise);
    onChange();
    return promise;
  }

  async function refreshWallets(record) {
    if (!record?.session || record.expectedUserId !== getUserId()) return;
    await Promise.all(record.studentIds.map(async (studentId) => {
      const cacheKey = `${record.expectedUserId}:${studentId}`;
      try {
        const { wallet } = await request(`${API}/students/${encodeURIComponent(studentId)}/wallet`, { record });
        if (wallet?.studentId !== studentId || !Number.isSafeInteger(wallet.balance) || wallet.balance < 0) {
          throw new Error("余额回执无效");
        }
        if (record.expectedUserId === getUserId()) walletCache.set(cacheKey, { balance: wallet.balance, fetchedAt: now() });
      } catch {
        if (record.expectedUserId === getUserId()) walletCache.set(cacheKey, { error: "余额未读取" });
      }
    }));
    onChange();
  }

  function registerNewGame({ externalSessionId, studentIds }) {
    const userId = getUserId();
    if (!userId || !externalSessionId || !Array.isArray(studentIds) || !studentIds.length
      || studentIds.length > 8 || studentIds.some((id) => !UUID.test(id))
      || new Set(studentIds).size !== studentIds.length) return Promise.resolve(null);
    // Existing, recovered, and historical games can only be READ, never registered anew.
    if (get(externalSessionId)) return refresh(externalSessionId);
    const record = {
      externalSessionId, expectedUserId: userId, studentIds: [...studentIds],
      registerKey: `monopoly-register:${externalSessionId}`,
      completeKey: `monopoly-complete:${externalSessionId}`,
      session: null, completionRequested: false, status: "registering", error: "", createdAt: now(),
    };
    try { save(record); } catch { onChange(); return Promise.resolve(null); }
    return exclusive(record, async () => {
      const { session } = await request(SESSIONS, {
        record, method: "POST", idempotencyKey: record.registerKey,
        body: { expectedUserId: userId, externalSessionId, studentIds: record.studentIds },
      });
      // Preserve a teacher's end request that happened while registration was in flight.
      return acceptSession(get(externalSessionId) || record, session);
    });
  }

  async function recover(record) {
    const path = record.session?.id
      ? `${SESSIONS}/${encodeURIComponent(record.session.id)}`
      : `${SESSIONS}/by-external/${encodeURIComponent(record.externalSessionId)}`;
    const { session } = await request(path, { record });
    return acceptSession(record, session);
  }

  function refresh(externalSessionId) {
    const record = get(externalSessionId);
    if (!record) return Promise.resolve(null);
    return exclusive(record, async () => {
      const updated = await recover(record);
      await refreshWallets(updated);
      return updated;
    });
  }

  async function confirmCompletion(externalSessionId) {
    let record = get(externalSessionId);
    if (!record) return null; // Old saves and local test seats never receive retroactive registration.
    record.completionRequested = true;
    record.error = "";
    try { save(record); } catch { onChange(); return null; }
    const registrationFlight = flights.get(`${record.expectedUserId}:${externalSessionId}`);
    if (registrationFlight) await registrationFlight;
    record = get(externalSessionId);
    if (!record) return null;
    return exclusive(record, async () => {
      record = await recover(record);
      if (!TERMINAL.has(record.status)) {
        const payload = await request(`${SESSIONS}/${encodeURIComponent(record.session.id)}/complete`, {
          record, method: "POST", idempotencyKey: record.completeKey,
          body: { expectedUserId: record.expectedUserId },
        });
        record = acceptSession(record, payload.session, payload);
      }
      await refreshWallets(record);
      return record;
    });
  }

  return {
    registerNewGame, confirmCompletion, refresh, get,
    records: () => Object.values(read() || {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone),
    error: () => storageError,
    isBusy: (id) => flights.has(`${getUserId()}:${id}`),
    wallet: (studentId) => clone(walletCache.get(`${getUserId()}:${studentId}`) || null),
  };
}
