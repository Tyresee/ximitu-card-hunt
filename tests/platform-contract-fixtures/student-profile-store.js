import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  createPlayerAssetAccount,
} from "../../public/prototypes/universal-board/player-assets-core.js";
import {
  STAR_ECONOMY_VERSION,
  createStarAccount,
  starAccountAfterEvents,
} from "../../public/prototypes/universal-board/session-star-assets.js";

export const STUDENT_PROFILE_STORE_SCHEMA_VERSION = "student-profile-store.v1";
export const STUDENT_PROFILE_SCHEMA_VERSION = "student-profile.v1";

const MAX_STUDENTS = 512;
const MAX_HISTORY = 4_096;
const MAX_SETTLEMENTS = 8_192;
const STUDENT_ID_PATTERN = /^[a-f0-9-]{36}$/;
const CARD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/;

function profileError(message, code = "student_profile_invalid", statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode });
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value, label, maximum) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum) {
    throw profileError(`${label}必须是 1—${maximum} 个字符`);
  }
  return normalized;
}

function optionalText(value, label, maximum) {
  const normalized = String(value || "").trim();
  if (normalized.length > maximum) {
    throw profileError(`${label}不能超过 ${maximum} 个字符`);
  }
  return normalized;
}

function nonNegativeInteger(value, label, maximum = 1_000_000) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
    throw profileError(`${label}必须是有效的非负整数`);
  }
  return number;
}

function normalizeCardCounts(value = {}) {
  if (!isPlainRecord(value)) throw profileError("卡片数量结构无效");
  const entries = Object.entries(value);
  if (entries.length > 2_048) throw profileError("卡片种类超过上限");
  return Object.fromEntries(entries.map(([rawCardId, rawCount]) => {
    const cardId = String(rawCardId || "").trim();
    if (!CARD_ID_PATTERN.test(cardId)) throw profileError("卡片 ID 无效");
    return [cardId, nonNegativeInteger(rawCount, `卡片 ${cardId} 数量`)];
  }).filter(([, count]) => count > 0));
}

function normalizeAssetAccount(account = {}) {
  try {
    return createPlayerAssetAccount(account);
  } catch (error) {
    throw Object.assign(profileError("学生资产账户无效"), { cause: error });
  }
}

function accountAfterEvents(currentValue, events, { acceptedAnswer }) {
  const account = createPlayerAssetAccount(currentValue);
  const next = {
    ...account,
    waitingCase: account.waitingCase ? { ...account.waitingCase } : null,
    collectedCardIds: [...account.collectedCardIds],
    cardCountsById: { ...account.cardCountsById },
  };
  if (acceptedAnswer) next.acceptedTurns += 1;
  for (const event of events) {
    if (event?.type === "resource_awarded") {
      if (
        event.resource !== "coin"
        || !Number.isInteger(event.amount)
        || event.amount < 1
        || event.amount > 3
      ) {
        throw profileError("资产奖励事件无效");
      }
      next.coins += event.amount;
      continue;
    }
    if (event?.type === "resource_exchanged") {
      if (
        event.from !== "coin"
        || event.fromAmount !== 5
        || !["card", "card_case"].includes(event.to)
        || event.toAmount !== 1
        || next.coins < 5
      ) {
        throw profileError("金币兑换事件无效");
      }
      next.coins -= 5;
      continue;
    }
    if (event?.type === "card_case_awarded") continue;
    if (["card_awarded", "card_opened"].includes(event?.type)) {
      if (event.type === "card_awarded" && (event.resource !== "card" || event.amount !== 1)) {
        throw profileError("卡片奖励事件无效");
      }
      const cardId = String(event.cardId || "").trim();
      if (!CARD_ID_PATTERN.test(cardId)) throw profileError("开出的卡片 ID 无效");
      const duplicate = next.collectedCardIds.includes(cardId);
      if (Boolean(event.duplicate) !== duplicate) {
        throw profileError("卡片重复状态与学生卡册不一致");
      }
      next.cardCountsById[cardId] = (next.cardCountsById[cardId] || 0) + 1;
      if (duplicate) next.duplicateOpenStreak += 1;
      else {
        next.collectedCardIds.push(cardId);
        next.duplicateOpenStreak = 0;
      }
    }
  }
  return createPlayerAssetAccount(next);
}

function emptyAssets() {
  return {
    account: normalizeAssetAccount(),
    coinsEarned: 0,
    coinsSpent: 0,
  };
}

function publicAssets(assets) {
  const cataloguedCards = Object.values(assets.account.cardCountsById)
    .reduce((total, count) => total + count, 0);
  const uncataloguedCards = nonNegativeInteger(
    assets.account.uncataloguedCards,
    "未分配具体卡片的历史卡片数",
  );
  const totalCards = cataloguedCards + uncataloguedCards;
  return {
    coins: assets.account.coins,
    coinsEarned: assets.coinsEarned,
    coinsSpent: assets.coinsSpent,
    cards: totalCards,
    uniqueCards: assets.account.collectedCardIds.length,
    duplicateCards: Math.max(
      0,
      cataloguedCards - assets.account.collectedCardIds.length,
    ),
    uncataloguedCards,
    collectedCardIds: [...assets.account.collectedCardIds],
    cardCountsById: { ...assets.account.cardCountsById },
  };
}

function normalizedStoredAssets(assets = {}) {
  return {
    account: normalizeAssetAccount(assets.account),
    coinsEarned: nonNegativeInteger(assets.coinsEarned, "历史获得金币"),
    coinsSpent: nonNegativeInteger(assets.coinsSpent, "历史消耗金币"),
  };
}

function publicProfile(profile, { includeAccount = false, includeHistory = false } = {}) {
  const latest = profile.latestStarGameId && profile.starGames?.[profile.latestStarGameId];
  return {
    schemaVersion: STUDENT_PROFILE_SCHEMA_VERSION,
    id: profile.id,
    displayName: profile.displayName,
    nickname: profile.nickname || "",
    courseStage: profile.courseStage || "",
    note: profile.note,
    status: profile.status,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    revision: profile.revision,
    assets: publicAssets(profile.assets),
    ...(includeAccount ? { assetAccount: structuredClone(profile.assets.account) } : {}),
    ...(includeHistory ? { assetHistory: structuredClone(profile.assetHistory) } : {}),
    latestGame: latest ? structuredClone({ gameId: latest.gameId, account: latest.account,
      createdAt: latest.createdAt, updatedAt: latest.updatedAt, endedAt: latest.endedAt }) : null,
  };
}

export class StudentProfileStore {
  constructor({ dataDir, clock = Date.now, createId = randomUUID } = {}) {
    if (typeof dataDir !== "string" || !dataDir) {
      throw new TypeError("StudentProfileStore requires dataDir");
    }
    this.dataDir = resolve(dataDir);
    this.clock = clock;
    this.createId = createId;
    this.initializePromise = null;
    this.writeQueues = new Map();
  }

  async initialize() {
    if (!this.initializePromise) {
      this.initializePromise = mkdir(this.dataDir, { recursive: true, mode: 0o700 })
        .then(() => this);
      this.initializePromise.catch(() => { this.initializePromise = null; });
    }
    return this.initializePromise;
  }

  async list({ tenantId } = {}) {
    const state = await this.#readAfterWrites(tenantId);
    return {
      schemaVersion: STUDENT_PROFILE_STORE_SCHEMA_VERSION,
      students: state.students
        .filter(({ status }) => status === "active")
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"))
        .map((profile) => publicProfile(profile, { includeAccount: true })),
    };
  }

  async create({
    tenantId,
    actorUserId,
    displayName,
    nickname = "",
    courseStage = "",
    note = "",
  } = {}) {
    const name = requiredText(displayName, "学生姓名", 40);
    const normalizedNickname = optionalText(nickname, "游戏昵称", 24);
    const normalizedCourseStage = optionalText(courseStage, "课程阶段", 60);
    const normalizedNote = optionalText(note, "学生备注", 240);
    return this.#write(tenantId, async (state) => {
      if (state.students.length >= MAX_STUDENTS) {
        throw profileError("学生资料数量已达到上限", "student_profile_limit_reached", 409);
      }
      if (state.students.some((student) => (
        student.status === "active"
        && student.displayName.localeCompare(name, "zh-CN", { sensitivity: "accent" }) === 0
      ))) {
        throw profileError("资料库中已经有同名学生", "student_profile_name_conflict", 409);
      }
      const id = this.createId();
      if (!STUDENT_ID_PATTERN.test(id)) throw new TypeError("generated student id is invalid");
      const timestamp = new Date(this.clock()).toISOString();
      const profile = {
        id,
        displayName: name,
        nickname: normalizedNickname,
        courseStage: normalizedCourseStage,
        note: normalizedNote,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: this.createId(),
        assets: emptyAssets(),
        processedSettlementIds: [],
        assetHistory: [],
        updatedBy: requiredText(actorUserId, "操作账号", 128),
      };
      state.students.push(profile);
      return publicProfile(profile, { includeAccount: true });
    });
  }

  async update({
    tenantId,
    actorUserId,
    studentId,
    expectedRevision,
    displayName,
    nickname = "",
    courseStage = "",
    note = "",
  } = {}) {
    if (!STUDENT_ID_PATTERN.test(String(studentId || ""))) {
      throw profileError("学生 ID 无效");
    }
    const normalizedExpectedRevision = requiredText(expectedRevision, "学生资料版本", 128);
    const name = requiredText(displayName, "学生姓名", 40);
    const normalizedNickname = optionalText(nickname, "游戏昵称", 24);
    const normalizedCourseStage = optionalText(courseStage, "课程阶段", 60);
    const normalizedNote = optionalText(note, "学生备注", 240);
    return this.#write(tenantId, async (state) => {
      const profile = state.students.find(({ id }) => id === studentId);
      if (!profile || profile.status !== "active") {
        throw profileError("没有找到这个学生资料", "student_profile_not_found", 404);
      }
      if (profile.revision !== normalizedExpectedRevision) {
        throw profileError(
          "学生资料已在另一个页面更新，请重新加载后再保存",
          "student_profile_revision_conflict",
          409,
        );
      }
      if (state.students.some((student) => (
        student.id !== studentId
        && student.status === "active"
        && student.displayName.localeCompare(name, "zh-CN", { sensitivity: "accent" }) === 0
      ))) {
        throw profileError("资料库中已经有同名学生", "student_profile_name_conflict", 409);
      }
      const timestamp = new Date(this.clock()).toISOString();
      profile.displayName = name;
      profile.nickname = normalizedNickname;
      profile.courseStage = normalizedCourseStage;
      profile.note = normalizedNote;
      profile.updatedAt = timestamp;
      profile.updatedBy = requiredText(actorUserId, "操作账号", 128);
      profile.revision = this.createId();
      return publicProfile(profile, { includeAccount: true });
    });
  }

  async applyAssetSettlement({
    tenantId,
    actorUserId,
    studentId,
    sessionId,
    settlementId,
    expectedRevision,
    acceptedAnswer = false,
    account,
    events = [],
    legacyMigration = false,
  } = {}) {
    if (account?.economyVersion === STAR_ECONOMY_VERSION) {
      return this.applyStarSettlement({ tenantId, actorUserId, studentId, sessionId,
        settlementId, expectedRevision, acceptedAnswer, account, events, legacyMigration });
    }
    if (!STUDENT_ID_PATTERN.test(String(studentId || ""))) {
      throw profileError("学生 ID 无效");
    }
    const normalizedSessionId = requiredText(sessionId, "课堂 Session ID", 160);
    const normalizedSettlementId = requiredText(settlementId, "资产结算 ID", 220);
    const normalizedExpectedRevision = requiredText(expectedRevision, "学生资料版本", 128);
    const normalizedAccount = normalizeAssetAccount(account);
    if (!Array.isArray(events) || events.length > 64) {
      throw profileError("资产事件列表无效");
    }
    if (typeof acceptedAnswer !== "boolean") {
      throw profileError("acceptedAnswer 必须是布尔值");
    }
    const cardsAwarded = events.filter((event) => (
      (event?.type === "card_awarded" && Number(event?.amount) === 1)
      || event?.type === "card_opened"
    )).length;
    const coinsEarned = events.reduce((total, event) => (
      event?.type === "resource_awarded" && event?.resource === "coin"
        ? total + Number(event.amount || 0)
        : total
    ), 0);
    const coinsSpent = events.reduce((total, event) => (
      event?.type === "resource_exchanged" && event?.from === "coin"
        ? total + Number(event.fromAmount || 0)
        : total
    ), 0);
    return this.#write(tenantId, async (state) => {
      const profile = state.students.find(({ id }) => id === studentId);
      if (!profile || profile.status !== "active") {
        throw profileError("没有找到这个学生资料", "student_profile_not_found", 404);
      }
      if (profile.processedSettlementIds.includes(normalizedSettlementId)) {
        return {
          duplicate: true,
          student: publicProfile(profile, { includeAccount: true }),
        };
      }
      if (profile.revision !== normalizedExpectedRevision) {
        throw profileError(
          "学生资产已在另一个页面更新，请返回课前页面重新加载",
          "student_asset_revision_conflict",
          409,
        );
      }
      const calculatedAccount = accountAfterEvents(profile.assets.account, events, {
        acceptedAnswer,
      });
      if (JSON.stringify(calculatedAccount) !== JSON.stringify(normalizedAccount)) {
        throw profileError(
          "资产结果与本轮奖励事件不一致",
          "student_asset_settlement_mismatch",
          409,
        );
      }
      const before = publicAssets(profile.assets);
      const timestamp = new Date(this.clock()).toISOString();
      profile.assets = normalizedStoredAssets(profile.assets);
      profile.assets = {
        account: calculatedAccount,
        coinsEarned: profile.assets.coinsEarned + coinsEarned,
        coinsSpent: profile.assets.coinsSpent + coinsSpent,
      };
      profile.processedSettlementIds = [
        ...profile.processedSettlementIds,
        normalizedSettlementId,
      ].slice(-MAX_SETTLEMENTS);
      profile.assetHistory = [
        ...profile.assetHistory,
        {
          settlementId: normalizedSettlementId,
          sessionId: normalizedSessionId,
          occurredAt: timestamp,
          before,
          after: publicAssets(profile.assets),
          cardsAwarded,
          coinsEarned,
          coinsSpent,
        },
      ].slice(-MAX_HISTORY);
      profile.updatedAt = timestamp;
      profile.updatedBy = requiredText(actorUserId, "操作账号", 128);
      profile.revision = this.createId();
      return {
        duplicate: false,
        student: publicProfile(profile, { includeAccount: true }),
      };
    });
  }

  async applyStarSettlement({ tenantId, actorUserId, studentId, sessionId,
    settlementId, expectedRevision, acceptedAnswer, account, events, legacyMigration }) {
    if (!STUDENT_ID_PATTERN.test(String(studentId || ""))) throw profileError("学生 ID 无效");
    const gameId = requiredText(sessionId, "棋局 ID", 160);
    if (!/^[a-zA-Z0-9_-]+$/.test(gameId) || ["__proto__", "constructor", "prototype"].includes(gameId)) {
      throw profileError("棋局 ID 无效");
    }
    const eventId = requiredText(settlementId, "资产结算 ID", 220);
    const revision = requiredText(expectedRevision, "学生资料版本", 128);
    if (typeof legacyMigration !== "boolean") throw profileError("迁移标记无效");
    let proposed;
    try { proposed = createStarAccount(account); }
    catch (error) { throw Object.assign(profileError("本局星星账户无效"), { cause: error }); }
    return this.#write(tenantId, async (state) => {
      const profile = state.students.find(({ id }) => id === studentId);
      if (!profile || profile.status !== "active") throw profileError("没有找到这个学生资料", "student_profile_not_found", 404);
      profile.starGames ||= {};
      let game = Object.hasOwn(profile.starGames, gameId) ? profile.starGames[gameId] : null;
      if (game?.processedSettlementIds.includes(eventId)) {
        return { duplicate: true, student: publicProfile(profile, { includeAccount: true }) };
      }
      if (profile.revision !== revision) throw profileError("学生资料已更新，请刷新后继续本局", "student_asset_revision_conflict", 409);
      if (game?.endedAt) throw profileError("这局已经结束，请新开一局", "student_game_ended", 409);
      if (!game) {
        if (Object.keys(profile.starGames).length >= 4096) throw profileError("棋局记录已达上限", "student_game_limit", 409);
        if (legacyMigration && profile.legacyStarGameId && profile.legacyStarGameId !== gameId) {
          throw profileError("旧卡片已归入另一局，不能重复迁移", "student_legacy_already_migrated", 409);
        }
        game = { gameId, account: createStarAccount(legacyMigration ? profile.assets.account : {}),
          createdAt: new Date(this.clock()).toISOString(), endedAt: null, processedSettlementIds: [], history: [] };
      }
      let calculated;
      try {
        calculated = starAccountAfterEvents(game.account, events, { acceptedAnswer });
      } catch (error) {
        throw Object.assign(profileError("本局奖励事件无效"), { cause: error });
      }
      if (JSON.stringify(calculated) !== JSON.stringify(proposed)) {
        throw profileError("本局资产与奖励记录不一致", "student_asset_settlement_mismatch", 409);
      }
      const timestamp = new Date(this.clock()).toISOString();
      const endsGame = events.some(({ type }) => type === "game_ended");
      profile.starGames[gameId] = { ...game, account: calculated, updatedAt: timestamp,
        endedAt: endsGame ? timestamp : null,
        processedSettlementIds: [...game.processedSettlementIds, eventId].slice(-MAX_SETTLEMENTS),
        history: [...game.history, { settlementId: eventId, occurredAt: timestamp,
          before: game.account, after: calculated }].slice(-MAX_HISTORY) };
      if (legacyMigration) profile.legacyStarGameId = gameId;
      profile.latestStarGameId = gameId;
      profile.updatedAt = timestamp;
      profile.updatedBy = requiredText(actorUserId, "操作账号", 128);
      profile.revision = this.createId();
      return { duplicate: false, student: publicProfile(profile, { includeAccount: true }) };
    });
  }

  async #readAfterWrites(tenantId) {
    await this.initialize();
    const key = requiredText(tenantId, "资料库租户", 128);
    await this.writeQueues.get(key)?.catch(() => undefined);
    return this.#readState(key);
  }

  async #write(tenantId, operation) {
    await this.initialize();
    const key = requiredText(tenantId, "资料库租户", 128);
    const previous = this.writeQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      const state = await this.#readState(key);
      const result = await operation(state);
      await this.#persistState(key, state);
      return result;
    });
    this.writeQueues.set(key, current.then(() => undefined, () => undefined));
    return structuredClone(await current);
  }

  #filePath(tenantId) {
    const filename = Buffer.from(tenantId, "utf8").toString("base64url");
    return resolve(this.dataDir, `${filename}.json`);
  }

  async #readState(tenantId) {
    try {
      const parsed = JSON.parse(await readFile(this.#filePath(tenantId), "utf8"));
      if (
        parsed?.schemaVersion !== STUDENT_PROFILE_STORE_SCHEMA_VERSION
        || !Array.isArray(parsed.students)
      ) {
        throw new Error("invalid student profile store shape");
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { schemaVersion: STUDENT_PROFILE_STORE_SCHEMA_VERSION, students: [] };
      }
      if (error instanceof SyntaxError || error?.message === "invalid student profile store shape") {
        throw profileError("学生资料库文件损坏", "student_profile_store_corrupt", 500);
      }
      throw error;
    }
  }

  async #persistState(tenantId, state) {
    const filePath = this.#filePath(tenantId);
    const temporaryPath = resolve(
      this.dataDir,
      `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, filePath);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
