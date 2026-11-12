// Game-owned copy of the established BoardLayoutStore. The platform store and data remain separate.
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
  BOARD_LAYOUT_DRAFT_SCHEMA_VERSION,
  boardLayoutRef,
  boardLayoutSignature,
  normalizeBoardLayoutDraft,
} from "../public/prototypes/universal-board/board-layout-editor-core.js";

export const BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION = "board-layout-registry.v1";

const DRAFT_KEYS = Object.freeze([
  "baseSignature",
  "boardRef",
  "nodePositions",
  "schemaVersion",
  "worldRef",
]);
const POSITION_KEYS = Object.freeze(["x", "y"]);
const STORED_ENTRY_KEYS = Object.freeze([
  "draft",
  "revision",
  "updatedAt",
  "updatedBy",
]);

function layoutError(message, code = "board_layout_invalid", statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode });
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === keys[index]);
}

function validIdentity(value, maximum = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertStoredDraftShape(draft) {
  if (!hasExactKeys(draft, DRAFT_KEYS)) {
    throw layoutError("棋盘布局数据文件中的草稿结构无效", "board_layout_store_corrupt", 500);
  }
  if (
    draft.schemaVersion !== BOARD_LAYOUT_DRAFT_SCHEMA_VERSION
    || !validIdentity(draft.worldRef)
    || !validIdentity(draft.boardRef)
    || !validIdentity(draft.baseSignature)
    || !isPlainRecord(draft.nodePositions)
  ) {
    throw layoutError("棋盘布局数据文件中的草稿字段无效", "board_layout_store_corrupt", 500);
  }
  for (const position of Object.values(draft.nodePositions)) {
    if (
      !hasExactKeys(position, POSITION_KEYS)
      || !Number.isInteger(position.x)
      || !Number.isInteger(position.y)
    ) {
      throw layoutError("棋盘布局数据文件中的节点坐标无效", "board_layout_store_corrupt", 500);
    }
  }
}

function canonicalDraft(board, input, worldRef) {
  if (!hasExactKeys(input, DRAFT_KEYS)) {
    throw layoutError("布局草稿必须只包含规定字段");
  }
  if (
    input.schemaVersion !== BOARD_LAYOUT_DRAFT_SCHEMA_VERSION
    || input.worldRef !== worldRef
    || input.boardRef !== boardLayoutRef(board)
    || input.baseSignature !== boardLayoutSignature(board)
    || !isPlainRecord(input.nodePositions)
    || Object.keys(input.nodePositions).length > board.nodes.length
  ) {
    throw layoutError("布局草稿与当前棋盘版本不匹配");
  }

  const nodeIds = new Set(board.nodes.map(({ id }) => id));
  for (const [nodeId, position] of Object.entries(input.nodePositions)) {
    if (
      !nodeIds.has(nodeId)
      || !hasExactKeys(position, POSITION_KEYS)
      || !Number.isInteger(position.x)
      || !Number.isInteger(position.y)
    ) {
      throw layoutError(`节点 ${nodeId} 的布局坐标无效`);
    }
  }

  const normalized = normalizeBoardLayoutDraft(board, input, { worldRef });
  if (!normalized) {
    throw layoutError("布局草稿包含未知节点或越出原区域的坐标");
  }
  return normalized;
}

export class BoardLayoutStore {
  constructor({
    dataDir,
    boardsByWorldRef,
    clock = Date.now,
    createId = randomUUID,
  } = {}) {
    if (typeof dataDir !== "string" || !dataDir) {
      throw new TypeError("BoardLayoutStore requires dataDir");
    }
    const boardEntries = boardsByWorldRef instanceof Map
      ? [...boardsByWorldRef.entries()]
      : Object.entries(boardsByWorldRef || {});
    if (!boardEntries.length || boardEntries.some(([worldRef, board]) => (
      !validIdentity(worldRef) || !board?.id || !Array.isArray(board.nodes)
    ))) {
      throw new TypeError("BoardLayoutStore requires boardsByWorldRef");
    }
    if (typeof clock !== "function" || typeof createId !== "function") {
      throw new TypeError("BoardLayoutStore requires clock and createId functions");
    }

    this.dataDir = resolve(dataDir);
    this.filePath = resolve(this.dataDir, "visual-layouts.json");
    this.boardsByWorldRef = new Map(boardEntries);
    this.clock = clock;
    this.createId = createId;
    this.initializePromise = null;
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    if (!this.initializePromise) {
      this.initializePromise = mkdir(this.dataDir, {
        recursive: true,
        mode: 0o700,
      }).then(() => this);
      this.initializePromise.catch(() => {
        this.initializePromise = null;
      });
    }
    return this.initializePromise;
  }

  async read() {
    await this.initialize();
    await this.writeQueue.catch(() => undefined);
    const state = await this.#readState();
    return this.#publicRegistry(state);
  }

  async save({ actorUserId, expectedRevision = null, draft } = {}) {
    if (!validIdentity(actorUserId)) {
      throw layoutError("actorUserId 无效");
    }
    if (
      expectedRevision !== null
      && !validIdentity(expectedRevision, 128)
    ) {
      throw layoutError("expectedRevision 必须是修订号或 null");
    }
    if (!isPlainRecord(draft) || !validIdentity(draft.worldRef)) {
      throw layoutError("布局草稿缺少 worldRef");
    }
    const board = this.boardsByWorldRef.get(draft.worldRef);
    if (!board) throw layoutError("不支持编辑这个棋盘世界");
    const normalizedDraft = canonicalDraft(board, draft, draft.worldRef);

    await this.initialize();
    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const state = await this.#readState();
        const current = state.layouts[draft.worldRef] || null;
        const currentRevision = current?.revision || null;
        if (currentRevision !== expectedRevision) {
          throw layoutError(
            "布局已在其他页面更新，请刷新后重试",
            "board_layout_revision_conflict",
            409,
          );
        }
        if (
          current
          && JSON.stringify(current.draft) === JSON.stringify(normalizedDraft)
        ) {
          return this.#publicEntry(draft.worldRef, current);
        }

        const revision = this.createId();
        const updatedAt = new Date(this.clock()).toISOString();
        if (!validIdentity(revision, 128) || !validTimestamp(updatedAt)) {
          throw new TypeError("BoardLayoutStore generated invalid metadata");
        }
        state.layouts[draft.worldRef] = {
          revision,
          updatedAt,
          updatedBy: actorUserId,
          draft: normalizedDraft,
        };
        await this.#persistState(state);
        return this.#publicEntry(draft.worldRef, state.layouts[draft.worldRef]);
      });
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return clone(await operation);
  }

  #emptyState() {
    return {
      schemaVersion: BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION,
      layouts: {},
    };
  }

  #assertState(state) {
    if (
      !hasExactKeys(state, ["layouts", "schemaVersion"])
      || state.schemaVersion !== BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION
      || !isPlainRecord(state.layouts)
    ) {
      throw layoutError("棋盘布局数据文件结构无效", "board_layout_store_corrupt", 500);
    }
    for (const [worldRef, entry] of Object.entries(state.layouts)) {
      if (
        !this.boardsByWorldRef.has(worldRef)
        || !hasExactKeys(entry, STORED_ENTRY_KEYS)
        || !validIdentity(entry.revision, 128)
        || !validTimestamp(entry.updatedAt)
        || !validIdentity(entry.updatedBy)
      ) {
        throw layoutError("棋盘布局数据文件条目无效", "board_layout_store_corrupt", 500);
      }
      assertStoredDraftShape(entry.draft);
      if (entry.draft.worldRef !== worldRef) {
        throw layoutError("棋盘布局数据文件世界引用无效", "board_layout_store_corrupt", 500);
      }
    }
    return state;
  }

  async #readState() {
    let raw;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return this.#emptyState();
      throw error;
    }
    try {
      return this.#assertState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === "board_layout_store_corrupt") throw error;
      throw Object.assign(
        layoutError("棋盘布局数据文件损坏", "board_layout_store_corrupt", 500),
        { cause: error },
      );
    }
  }

  #publicEntry(worldRef, stored = null) {
    const board = this.boardsByWorldRef.get(worldRef);
    const base = {
      worldRef,
      boardRef: boardLayoutRef(board),
      baseSignature: boardLayoutSignature(board),
      status: "empty",
      revision: stored?.revision || null,
      updatedAt: stored?.updatedAt || null,
      updatedBy: stored?.updatedBy || null,
      draft: null,
    };
    if (!stored) return base;
    try {
      return {
        ...base,
        status: "active",
        draft: canonicalDraft(board, stored.draft, worldRef),
      };
    } catch {
      return { ...base, status: "stale" };
    }
  }

  #publicRegistry(state) {
    return {
      schemaVersion: BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION,
      layouts: [...this.boardsByWorldRef.keys()].map((worldRef) => (
        this.#publicEntry(worldRef, state.layouts[worldRef] || null)
      )),
    };
  }

  async #persistState(state) {
    this.#assertState(state);
    const temporaryPath = resolve(
      this.dataDir,
      `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, this.filePath);
      try {
        const directoryHandle = await open(this.dataDir, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch {
        // Some filesystems do not support syncing directory handles.
      }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
