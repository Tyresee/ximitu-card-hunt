import {
  ACTIVITY_TEMPLATES,
  LEARNING_PACKS,
} from "./packs.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
  WORLD_REGISTRIES,
  WORLD_REWARD_DEFINITIONS,
} from "./world-packs.js";
import { resolveWorldComposition } from "./world-runtime-core.js";

export const CLASSROOM_EVENT_PROGRAM_SCHEMA_VERSION = (
  "voice-board-classroom-event-program.v1"
);
export const CLASSROOM_EVENT_PROGRAM_CONTRACT_REF = (
  "voice-board-classroom-event-contract.v1"
);

export const CLASSROOM_EVENT_PROGRAM_WORLD_REFS = Object.freeze([
  CLOUD_HARBOR_WORLD_REF,
  BEYOND_CLOUD_WORLD_REF,
]);

export const CLASSROOM_EVENT_PROGRAM_MODES = Object.freeze([
  "inherit",
  "none",
  "event",
]);

const PACK_KEYS = Object.freeze([
  "contractRef",
  "learningPacks",
  "schemaVersion",
]);
const LEARNING_PACK_KEYS = Object.freeze(["events", "worlds"]);
const EVENT_KEYS = Object.freeze([
  "content",
  "sourceHash",
  "sourceTaskRef",
  "templateRef",
]);
const WORLD_KEYS = Object.freeze(["assignments", "boardRef", "levelRef"]);
const ASSIGNMENT_KEYS = Object.freeze(["eventRef", "mode"]);
const CONTENT_KEYS = new Set(["challenge", "instruction", "target", "title"]);
const LOCKED_NODE_ROLES = new Set(["goal", "portal", "transport"]);
const SHA256_INITIAL = Object.freeze([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);
const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class ClassroomEventProgramValidationError extends Error {
  constructor(message, {
    code = "classroom_event_program_invalid",
    statusCode = 422,
  } = {}) {
    super(message);
    this.name = "ClassroomEventProgramValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function invalid(message, options) {
  throw new ClassroomEventProgramValidationError(message, options);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function hasOnlyKeys(value, allowedKeys) {
  return isPlainRecord(value)
    && Object.keys(value).every((key) => allowedKeys.has(key));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function exactRef(value, label) {
  const normalized = String(value || "");
  if (!/^[a-z0-9][a-z0-9._-]*@[0-9]+\.[0-9]+\.[0-9]+$/i.test(normalized)) {
    invalid(`${label} 无效`);
  }
  return normalized;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(value) {
  const source = new TextEncoder().encode(String(value));
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const bitLength = BigInt(source.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    bytes[paddedLength - 1 - index] = Number(
      (bitLength >> BigInt(index * 8)) & 0xffn,
    );
  }

  const hash = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + (index * 4), false);
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15];
      const word2 = words[index - 2];
      const sigma0 = (
        rotateRight(word15, 7)
        ^ rotateRight(word15, 18)
        ^ (word15 >>> 3)
      );
      const sigma1 = (
        rotateRight(word2, 17)
        ^ rotateRight(word2, 19)
        ^ (word2 >>> 10)
      );
      words[index] = (
        words[index - 16]
        + sigma0
        + words[index - 7]
        + sigma1
      ) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (
        h
        + sum1
        + choice
        + SHA256_CONSTANTS[index]
        + words[index]
      ) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function normalizedText(value, label, { maximum, required = true } = {}) {
  if (typeof value !== "string") invalid(`${label} 必须是字符串`);
  const normalized = value.normalize("NFC").trim();
  const length = [...normalized].length;
  if ((required && !length) || length > maximum) {
    invalid(`${label} 必须是 ${required ? "1" : "0"}–${maximum} 个字符`);
  }
  return normalized;
}

function canonicalContent(input, label) {
  if (
    !hasOnlyKeys(input, CONTENT_KEYS)
    || !Object.hasOwn(input, "title")
    || !Object.hasOwn(input, "instruction")
    || !Object.hasOwn(input, "target")
  ) {
    invalid(`${label} 的活动内容字段无效`);
  }
  return {
    title: normalizedText(input.title, `${label}.title`, { maximum: 100 }),
    instruction: normalizedText(
      input.instruction,
      `${label}.instruction`,
      { maximum: 500 },
    ),
    ...(Object.hasOwn(input, "challenge")
      ? {
          challenge: normalizedText(
            input.challenge,
            `${label}.challenge`,
            { maximum: 500, required: false },
          ),
        }
      : {}),
    target: normalizedText(input.target, `${label}.target`, { maximum: 500 }),
  };
}

function sourceTaskRefFor(learningRef, taskId) {
  return `${learningRef}#${taskId}`;
}

function eventRefFor(sourceTaskRef, bindingIndex) {
  return `${sourceTaskRef}:activity:${bindingIndex}`;
}

function compiledEvent(learningRef, task, binding, bindingIndex) {
  const templateRef = String(binding?.templateRef || "");
  if (!Object.hasOwn(ACTIVITY_TEMPLATES, templateRef)) {
    invalid(`${learningRef}#${task.id} 引用了未注册的活动模板`);
  }
  const sourceTaskRef = sourceTaskRefFor(learningRef, task.id);
  const content = canonicalContent(
    binding?.content,
    `${sourceTaskRef}.activityBindings[${bindingIndex}].content`,
  );
  const sourceHash = `sha256:${sha256(stableJson({
    content,
    sourceTaskRef,
    templateRef,
  }))}`;
  return deepFreeze({
    sourceTaskRef,
    sourceHash,
    templateRef,
    content,
  });
}

function packRef(pack) {
  return exactRef(`${pack?.id || ""}@${pack?.version || ""}`, "LearningPack ref");
}

const LEARNING_PACK_BY_REF = new Map(
  Object.values(LEARNING_PACKS).map((pack) => [packRef(pack), pack]),
);

export const CLASSROOM_EVENT_PROGRAM_LEARNING_REFS = Object.freeze([
  ...LEARNING_PACK_BY_REF.keys(),
]);

export function learningPackRefFor(packOrId, version = undefined) {
  let candidate;
  if (packOrId && typeof packOrId === "object") {
    candidate = `${packOrId.id || ""}@${packOrId.version || ""}`;
  } else if (version !== undefined) {
    candidate = `${String(packOrId || "")}@${String(version || "")}`;
  } else if (typeof packOrId === "string" && packOrId.includes("@")) {
    candidate = packOrId;
  } else {
    const matches = [...LEARNING_PACK_BY_REF.keys()].filter((ref) => (
      ref.slice(0, ref.lastIndexOf("@")) === String(packOrId || "")
    ));
    if (matches.length !== 1) invalid("LearningPack id 无法唯一解析");
    [candidate] = matches;
  }
  const normalized = exactRef(candidate, "LearningPack ref");
  if (!LEARNING_PACK_BY_REF.has(normalized)) {
    invalid(`未知 LearningPack：${normalized}`);
  }
  return normalized;
}

function lockReasonFor(node, definition) {
  if (node.spaceRole === "transport" || definition?.kind === "transport") {
    return "传送节点会把真实最终落点移到目标节点，不能在这里绑定课堂事件。";
  }
  if (
    node.spaceRole === "portal"
    || node.spaceRole === "goal"
    || definition?.kind === "world-transition"
    || definition?.worldTransition
    || node.worldExitRef
    || node.exitDirection === "forward"
  ) {
    return "世界门会把真实最终落点移到下一世界，不能在这里绑定课堂事件。";
  }
  return "";
}

function createWorldCatalog() {
  return Object.fromEntries(CLASSROOM_EVENT_PROGRAM_WORLD_REFS.map((worldRef) => {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const worldPack = WORLD_REGISTRIES.worldPacks[worldRef];
    const nodes = composition.board.nodes.map((node) => {
      const landingRef = composition.level.nodeBindings?.[node.id]?.rewardRef
        || node.landingProfileRef
        || "";
      const definition = composition.level.landingProfiles?.[landingRef]
        || WORLD_REWARD_DEFINITIONS[landingRef]
        || null;
      const lockReason = lockReasonFor(node, definition);
      const authoredZone = composition.board.zones.find(({ bounds }) => (
        node.x >= bounds.x
        && node.x < bounds.x + bounds.width
        && node.y >= bounds.y
        && node.y < bounds.y + bounds.height
      ));
      return deepFreeze({
        worldRef,
        nodeId: node.id,
        zoneId: node.zoneId || authoredZone?.id || "",
        spaceRole: node.spaceRole || "learning",
        editable: !lockReason && !LOCKED_NODE_ROLES.has(node.spaceRole),
        lockReason,
      });
    });
    return [worldRef, deepFreeze({
      worldRef,
      boardRef: exactRef(worldPack.boardTemplateRef, `${worldRef}.boardRef`),
      levelRef: exactRef(worldPack.levelPackRef, `${worldRef}.levelRef`),
      nodes,
      nodeById: Object.fromEntries(nodes.map((node) => [node.nodeId, node])),
    })];
  }));
}

const WORLD_CATALOG = deepFreeze(createWorldCatalog());

function createCatalog() {
  return Object.fromEntries(CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.map((learningRef) => {
    const pack = LEARNING_PACK_BY_REF.get(learningRef);
    const events = pack.tasks.flatMap((task) => (
      (task.activityBindings || []).map((binding, bindingIndex) => {
        const event = compiledEvent(learningRef, task, binding, bindingIndex);
        return deepFreeze({
          eventRef: eventRefFor(event.sourceTaskRef, bindingIndex),
          ...event,
        });
      })
    ));
    return [learningRef, deepFreeze({
      learningRef,
      learningPackId: pack.id,
      learningPackVersion: pack.version,
      title: pack.title,
      events,
      eventByRef: Object.fromEntries(events.map(({ eventRef, ...event }) => [
        eventRef,
        deepFreeze(event),
      ])),
      worlds: WORLD_CATALOG,
    })];
  }));
}

export const CLASSROOM_EVENT_PROGRAM_CATALOG = deepFreeze(createCatalog());

function sameKeys(input, expected, message) {
  const actualKeys = isPlainRecord(input) ? Object.keys(input).sort() : [];
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    invalid(message);
  }
}

function canonicalEvent(input, catalogEvent, eventRef) {
  if (!catalogEvent || !hasExactKeys(input, EVENT_KEYS)) {
    invalid(`${eventRef} 的冻结事件字段无效`);
  }
  const normalized = {
    sourceTaskRef: String(input.sourceTaskRef || ""),
    sourceHash: String(input.sourceHash || ""),
    templateRef: String(input.templateRef || ""),
    content: canonicalContent(input.content, `${eventRef}.content`),
  };
  if (stableJson(normalized) !== stableJson(catalogEvent)) {
    invalid(`${eventRef} 必须与当前精确 LearningPack 的冻结活动一致`);
  }
  return normalized;
}

function canonicalAssignment(input, catalogNode, eventByRef) {
  if (!catalogNode || !hasExactKeys(input, ASSIGNMENT_KEYS)) {
    invalid(`${catalogNode?.nodeId || "未知节点"} 的课堂事件绑定字段无效`);
  }
  const mode = String(input.mode || "");
  const eventRef = String(input.eventRef ?? "");
  if (!CLASSROOM_EVENT_PROGRAM_MODES.includes(mode)) {
    invalid(`${catalogNode.nodeId} 使用了不支持的课堂事件模式`);
  }
  if (!catalogNode.editable && mode !== "inherit") {
    invalid(`${catalogNode.nodeId} 的最终落点会转移，必须保持 inherit`);
  }
  if (mode === "event") {
    if (!eventRef || !Object.hasOwn(eventByRef, eventRef)) {
      invalid(`${catalogNode.nodeId} 必须引用当前 LearningPack 的已知事件`);
    }
  } else if (eventRef !== "") {
    invalid(`${catalogNode.nodeId} 的 ${mode} 模式必须使用空 eventRef`);
  }
  return { mode, eventRef };
}

export function normalizeClassroomEventProgram(input) {
  if (!hasExactKeys(input, PACK_KEYS)) {
    invalid("课堂事件方案必须只包含规定字段");
  }
  if (
    input.schemaVersion !== CLASSROOM_EVENT_PROGRAM_SCHEMA_VERSION
    || input.contractRef !== CLASSROOM_EVENT_PROGRAM_CONTRACT_REF
    || !isPlainRecord(input.learningPacks)
  ) {
    invalid("课堂事件方案与当前契约不匹配");
  }
  sameKeys(
    input.learningPacks,
    CLASSROOM_EVENT_PROGRAM_LEARNING_REFS,
    "课堂事件方案必须完整保留当前全部精确 LearningPack",
  );

  const learningPacks = {};
  CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.forEach((learningRef) => {
    const candidate = input.learningPacks[learningRef];
    const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef];
    if (!hasExactKeys(candidate, LEARNING_PACK_KEYS)) {
      invalid(`${learningRef} 的课堂事件池结构无效`);
    }
    sameKeys(
      candidate.events,
      catalog.events.map(({ eventRef }) => eventRef),
      `${learningRef} 必须完整保留全部冻结题目事件`,
    );
    sameKeys(
      candidate.worlds,
      CLASSROOM_EVENT_PROGRAM_WORLD_REFS,
      `${learningRef} 必须完整保留当前两个世界`,
    );

    const events = Object.fromEntries(catalog.events.map(({ eventRef }) => [
      eventRef,
      canonicalEvent(candidate.events[eventRef], catalog.eventByRef[eventRef], eventRef),
    ]));
    const worlds = {};
    CLASSROOM_EVENT_PROGRAM_WORLD_REFS.forEach((worldRef) => {
      const world = candidate.worlds[worldRef];
      const catalogWorld = catalog.worlds[worldRef];
      if (!hasExactKeys(world, WORLD_KEYS)) {
        invalid(`${learningRef}/${worldRef} 的节点绑定结构无效`);
      }
      if (
        world.boardRef !== catalogWorld.boardRef
        || world.levelRef !== catalogWorld.levelRef
      ) {
        invalid(`${learningRef}/${worldRef} 与当前地图或关卡版本不匹配`);
      }
      sameKeys(
        world.assignments,
        catalogWorld.nodes.map(({ nodeId }) => nodeId),
        `${learningRef}/${worldRef} 必须为每个节点提供且只提供一个课堂事件绑定`,
      );
      worlds[worldRef] = {
        boardRef: catalogWorld.boardRef,
        levelRef: catalogWorld.levelRef,
        assignments: Object.fromEntries(catalogWorld.nodes.map((catalogNode) => [
          catalogNode.nodeId,
          canonicalAssignment(
            world.assignments[catalogNode.nodeId],
            catalogNode,
            catalog.eventByRef,
          ),
        ])),
      };
    });
    learningPacks[learningRef] = { events, worlds };
  });

  return {
    schemaVersion: CLASSROOM_EVENT_PROGRAM_SCHEMA_VERSION,
    contractRef: CLASSROOM_EVENT_PROGRAM_CONTRACT_REF,
    learningPacks,
  };
}

function inheritedAssignment() {
  return { mode: "inherit", eventRef: "" };
}

export const DEFAULT_CLASSROOM_EVENT_PROGRAM = deepFreeze(
  normalizeClassroomEventProgram({
    schemaVersion: CLASSROOM_EVENT_PROGRAM_SCHEMA_VERSION,
    contractRef: CLASSROOM_EVENT_PROGRAM_CONTRACT_REF,
    learningPacks: Object.fromEntries(
      CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.map((learningRef) => {
        const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef];
        return [learningRef, {
          events: Object.fromEntries(catalog.events.map(({ eventRef, ...event }) => [
            eventRef,
            structuredClone(event),
          ])),
          worlds: Object.fromEntries(CLASSROOM_EVENT_PROGRAM_WORLD_REFS.map((worldRef) => {
            const catalogWorld = catalog.worlds[worldRef];
            return [worldRef, {
              boardRef: catalogWorld.boardRef,
              levelRef: catalogWorld.levelRef,
              assignments: Object.fromEntries(
                catalogWorld.nodes.map(({ nodeId }) => [nodeId, inheritedAssignment()]),
              ),
            }];
          })),
        }];
      }),
    ),
  }),
);

export function cloneClassroomEventProgram(
  program = DEFAULT_CLASSROOM_EVENT_PROGRAM,
) {
  return normalizeClassroomEventProgram(structuredClone(program));
}

export function classroomEventProgramsEqual(left, right) {
  try {
    return JSON.stringify(normalizeClassroomEventProgram(left))
      === JSON.stringify(normalizeClassroomEventProgram(right));
  } catch {
    return false;
  }
}

function knownLearningRef(value) {
  return learningPackRefFor(value);
}

export function classroomEvent(program, learningRef, eventRef) {
  const normalizedLearningRef = knownLearningRef(learningRef);
  const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[normalizedLearningRef];
  const catalogEvent = catalog.eventByRef[eventRef];
  if (!catalogEvent) invalid(`未知课堂事件：${normalizedLearningRef}#${eventRef}`);
  return canonicalEvent(
    program?.learningPacks?.[normalizedLearningRef]?.events?.[eventRef],
    catalogEvent,
    eventRef,
  );
}

export function classroomEventAssignment(program, learningRef, worldRef, nodeId) {
  const normalizedLearningRef = knownLearningRef(learningRef);
  const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[normalizedLearningRef];
  const catalogNode = catalog.worlds[worldRef]?.nodeById?.[nodeId];
  if (!catalogNode) invalid(`未知地图节点：${worldRef}#${nodeId}`);
  return canonicalAssignment(
    program?.learningPacks?.[normalizedLearningRef]
      ?.worlds?.[worldRef]?.assignments?.[nodeId],
    catalogNode,
    catalog.eventByRef,
  );
}

export function updateClassroomEventAssignment(
  program,
  learningRef,
  worldRef,
  nodeId,
  update = {},
) {
  const normalized = normalizeClassroomEventProgram(program);
  const normalizedLearningRef = knownLearningRef(learningRef);
  const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[normalizedLearningRef];
  const catalogNode = catalog.worlds[worldRef]?.nodeById?.[nodeId];
  if (!catalogNode) invalid(`未知地图节点：${worldRef}#${nodeId}`);
  const current = normalized.learningPacks[normalizedLearningRef]
    .worlds[worldRef].assignments[nodeId];
  const mode = update.mode ?? current.mode;
  const eventRef = mode === "event"
    ? (update.eventRef ?? current.eventRef)
    : "";
  normalized.learningPacks[normalizedLearningRef]
    .worlds[worldRef].assignments[nodeId] = canonicalAssignment(
      { mode, eventRef },
      catalogNode,
      catalog.eventByRef,
    );
  return normalizeClassroomEventProgram(normalized);
}

export function classroomEventChangedCount(program) {
  const normalized = normalizeClassroomEventProgram(program);
  return CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.reduce((learningTotal, learningRef) => (
    learningTotal + CLASSROOM_EVENT_PROGRAM_WORLD_REFS.reduce((worldTotal, worldRef) => (
      worldTotal + CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef]
        .worlds[worldRef].nodes.filter(({ nodeId }) => (
          normalized.learningPacks[learningRef]
            .worlds[worldRef].assignments[nodeId].mode !== "inherit"
        )).length
    ), 0)
  ), 0);
}
