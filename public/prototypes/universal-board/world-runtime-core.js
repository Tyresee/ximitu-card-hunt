import { doubleDiceSteps, hasDoubleDiceFields } from "./double-dice-core.js";

const MAX_WORLD_ZONES = 4;
const MAX_DIE_STEPS = 6;
const MAX_PROCESSED_TRANSITIONS = 128;
const REPEATABLE_TAIL_INSTANCE_POLICY = "append-new-instance-v1";
const CIRCUIT_POLICY = "individual-laps-v1";

const WORLD_PACK_FORBIDDEN_KEYS = new Set([
  "aiscore",
  "assessment",
  "assessmentpolicy",
  "assessmentpolicyref",
  "learningpackid",
  "learningpackref",
  "score",
  "task",
  "taskid",
  "transcript",
]);

const WALK_WORLD_PLAN_KEYS = new Set([
  "dicePolicy",
  "faceIndices",
  "mapStatesByWorldInstance",
  "moveId",
  "nextWorldInstanceId",
  "registries",
  "routeChoicesByWorldInstance",
  "startNodeId",
  "steps",
  "worldInstanceId",
  "worldOrdinal",
  "worldRef",
  "worldRoute",
]);

const SHARED_EXPEDITION_COMMIT_KEYS = new Set([
  "activeTeamId",
  "plan",
  "teams",
  "worldRuntime",
]);

const REPEATABLE_TAIL_KEYS = new Set([
  "exitId",
  "instancePolicy",
  "worldRef",
]);
const CIRCUIT_KEYS = new Set(["policy", "worldRef", "exitId"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedText(value, label) {
  if (
    typeof value !== "string"
    || !value.trim()
    || value !== value.trim()
    || value.length > 256
  ) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function exactVersionedRef(value, label) {
  const ref = normalizedText(value, label);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*@[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(ref)
    || /@latest$/i.test(ref)
  ) {
    throw new TypeError(`${label} must be an exact versioned ref and cannot use latest`);
  }
  return ref;
}

function versionedRefFor(value, label) {
  const id = normalizedText(value?.id, `${label}.id`);
  const version = normalizedText(value?.version, `${label}.version`);
  return exactVersionedRef(`${id}@${version}`, `${label} ref`);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return value;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  return Object.freeze(value);
}

function frozenClone(value) {
  return deepFreeze(clone(value));
}

function appendError(errors, operation) {
  try {
    operation();
  } catch (error) {
    errors.push(error.message);
  }
}

function forbiddenKeysIn(value, path = "value", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenKeysIn(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (WORLD_PACK_FORBIDDEN_KEYS.has(key.toLowerCase())) {
      found.push(`${path}.${key}`);
    }
    forbiddenKeysIn(nested, `${path}.${key}`, found);
  }
  return found;
}

function rejectUnknownKeys(value, allowedKeys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length) {
    throw new TypeError(`${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function registryValue(registry, ref, label) {
  if (!isPlainObject(registry)) {
    throw new TypeError(`${label} registry is required`);
  }
  const direct = registry[ref];
  if (direct) {
    if (versionedRefFor(direct, label) !== ref) {
      throw new Error(`${label} registry key does not match its immutable value: ${ref}`);
    }
    return direct;
  }
  const matched = Object.values(registry).find((candidate) => {
    try {
      return versionedRefFor(candidate, label) === ref;
    } catch {
      return false;
    }
  });
  if (!matched) throw new Error(`${label} ref is not registered: ${ref}`);
  return matched;
}

function boardEntryNodeId(board) {
  return normalizedText(
    board?.entry?.nodeId || board?.startNodeId,
    "BoardTemplate entry nodeId",
  );
}

function indexedBoard(board) {
  if (!isPlainObject(board)) throw new TypeError("BoardTemplate must be a plain object");
  if (!Array.isArray(board.nodes) || board.nodes.length < 2) {
    throw new Error("BoardTemplate nodes must contain at least two nodes");
  }
  if (!Array.isArray(board.edges)) {
    throw new Error("BoardTemplate edges must be an array");
  }
  const nodes = new Map();
  for (const node of board.nodes) {
    const nodeId = normalizedText(node?.id, "BoardTemplate node id");
    if (nodes.has(nodeId)) throw new Error(`BoardTemplate contains duplicate node: ${nodeId}`);
    nodes.set(nodeId, node);
  }
  const entryNodeId = boardEntryNodeId(board);
  if (
    board?.entry?.nodeId
    && board?.startNodeId
    && board.entry.nodeId !== board.startNodeId
  ) {
    throw new Error("BoardTemplate entry.nodeId must match startNodeId");
  }
  if (!nodes.has(entryNodeId)) {
    throw new Error(`BoardTemplate entry node does not exist: ${entryNodeId}`);
  }

  const outgoing = new Map([...nodes.keys()].map((nodeId) => [nodeId, []]));
  const edgeIds = new Set();
  for (const edge of board.edges) {
    const edgeId = normalizedText(edge?.id, "BoardTemplate edge id");
    if (edgeIds.has(edgeId)) {
      throw new Error(`BoardTemplate contains duplicate edge: ${edgeId}`);
    }
    edgeIds.add(edgeId);
    if (!nodes.has(edge.from)) {
      throw new Error(`BoardTemplate edge ${edgeId} has unknown from node: ${edge.from}`);
    }
    if (!nodes.has(edge.to)) {
      throw new Error(`BoardTemplate edge ${edgeId} has unknown to node: ${edge.to}`);
    }
    if (
      edge.order !== undefined
      && (!Number.isSafeInteger(edge.order) || edge.order < 0)
    ) {
      throw new Error(`BoardTemplate edge ${edgeId} order must be a non-negative integer`);
    }
    outgoing.get(edge.from).push(edge);
  }
  for (const choices of outgoing.values()) {
    choices.sort((left, right) => (left.order || 0) - (right.order || 0));
  }

  const exits = new Map();
  const exitNodeIds = new Set();
  if (board.exits !== undefined && !Array.isArray(board.exits)) {
    throw new Error("BoardTemplate exits must be an array");
  }
  for (const exit of board.exits || []) {
    const exitId = normalizedText(exit?.id, "BoardTemplate exit id");
    const nodeId = normalizedText(exit?.nodeId, `BoardTemplate exit ${exitId} nodeId`);
    if (exits.has(exitId)) {
      throw new Error(`BoardTemplate contains duplicate exit: ${exitId}`);
    }
    if (exitNodeIds.has(nodeId)) {
      throw new Error(`BoardTemplate contains multiple exits on node: ${nodeId}`);
    }
    if (!nodes.has(nodeId)) {
      throw new Error(`BoardTemplate exit ${exitId} has unknown node: ${nodeId}`);
    }
    if (outgoing.get(nodeId).length) {
      throw new Error(`BoardTemplate exit ${exitId} must have zero outgoing board edges`);
    }
    exitNodeIds.add(nodeId);
    exits.set(exitId, { ...exit, id: exitId, nodeId });
  }

  return { nodes, outgoing, exits, entryNodeId };
}

function validateBoardLoadUnit(board, errors) {
  appendError(errors, () => indexedBoard(board));
  if (!Array.isArray(board?.zones) || board.zones.length < 1) {
    errors.push("BoardTemplate zones must contain at least one zone");
  } else if (board.zones.length > MAX_WORLD_ZONES) {
    errors.push(`BoardTemplate zones cannot exceed ${MAX_WORLD_ZONES}`);
  }
  if (board?.artRegions !== undefined) {
    if (!Array.isArray(board.artRegions)) {
      errors.push("BoardTemplate artRegions must be an array");
    } else if (board.artRegions.length > MAX_WORLD_ZONES) {
      errors.push(`BoardTemplate artRegions cannot exceed ${MAX_WORLD_ZONES}`);
    }
  }
}

function routeTransitionKey(fromWorldRef, exitId) {
  return `${fromWorldRef}\u0000${exitId}`;
}

function normalizedRoute(route) {
  if (!isPlainObject(route)) throw new TypeError("WorldRoute must be a plain object");
  if (route.kind !== "WorldRoute") throw new Error("WorldRoute.kind must be WorldRoute");
  const ref = versionedRefFor(route, "WorldRoute");
  const entryWorldRef = exactVersionedRef(
    route.entryWorldRef,
    "WorldRoute.entryWorldRef",
  );
  if (!Array.isArray(route.transitions)) {
    throw new Error("WorldRoute.transitions must be an array");
  }
  let repeatableTail = null;
  if (route.repeatableTail !== undefined) {
    rejectUnknownKeys(
      route.repeatableTail,
      REPEATABLE_TAIL_KEYS,
      "WorldRoute.repeatableTail",
    );
    repeatableTail = {
      worldRef: exactVersionedRef(
        route.repeatableTail.worldRef,
        "WorldRoute.repeatableTail.worldRef",
      ),
      exitId: normalizedText(
        route.repeatableTail.exitId,
        "WorldRoute.repeatableTail.exitId",
      ),
      instancePolicy: normalizedText(
        route.repeatableTail.instancePolicy,
        "WorldRoute.repeatableTail.instancePolicy",
      ),
    };
    if (repeatableTail.instancePolicy !== REPEATABLE_TAIL_INSTANCE_POLICY) {
      throw new Error(
        "WorldRoute.repeatableTail.instancePolicy must be "
        + REPEATABLE_TAIL_INSTANCE_POLICY,
      );
    }
  }
  let circuit = null;
  if (route.circuit !== undefined) {
    rejectUnknownKeys(route.circuit, CIRCUIT_KEYS, "WorldRoute.circuit");
    circuit = {
      policy: normalizedText(route.circuit.policy, "WorldRoute.circuit.policy"),
      worldRef: exactVersionedRef(route.circuit.worldRef, "WorldRoute.circuit.worldRef"),
      exitId: normalizedText(route.circuit.exitId, "WorldRoute.circuit.exitId"),
    };
    if (circuit.policy !== CIRCUIT_POLICY) {
      throw new Error(`WorldRoute.circuit.policy must be ${CIRCUIT_POLICY}`);
    }
    if (circuit.worldRef !== entryWorldRef || route.transitions.length || repeatableTail) {
      throw new Error("WorldRoute circuit must use only its entry world, with no transitions or repeatable tail");
    }
  }
  return {
    route,
    ref,
    entryWorldRef,
    repeatableTail,
    circuit,
  };
}

function normalizedWorldPack(worldPack) {
  if (!isPlainObject(worldPack)) throw new TypeError("WorldPack must be a plain object");
  if (worldPack.kind !== "WorldPack") throw new Error("WorldPack.kind must be WorldPack");
  const ref = versionedRefFor(worldPack, "WorldPack");
  const boardTemplateRef = exactVersionedRef(
    worldPack.boardTemplateRef,
    "WorldPack.boardTemplateRef",
  );
  const themePackRef = exactVersionedRef(
    worldPack.themePackRef,
    "WorldPack.themePackRef",
  );
  const levelPackRef = exactVersionedRef(
    worldPack.levelPackRef,
    "WorldPack.levelPackRef",
  );
  return {
    ref,
    boardTemplateRef,
    themePackRef,
    levelPackRef,
  };
}

/**
 * Validates one independently loadable world. WorldPack is deliberately
 * map-only: learning, assessment, transcript and score fields are rejected.
 */
export function validateWorldPack(worldPack, registries = {}) {
  const errors = [];
  const forbidden = forbiddenKeysIn(worldPack, "WorldPack");
  if (forbidden.length) {
    errors.push(`WorldPack contains forbidden teaching or score fields: ${forbidden.join(", ")}`);
  }

  let normalized;
  appendError(errors, () => {
    normalized = normalizedWorldPack(worldPack);
  });
  if (!normalized) return errors;

  let board;
  let theme;
  appendError(errors, () => {
    board = registryValue(
      registries.boardTemplates,
      normalized.boardTemplateRef,
      "BoardTemplate",
    );
  });
  appendError(errors, () => {
    theme = registryValue(
      registries.themePacks,
      normalized.themePackRef,
      "ThemePack",
    );
  });
  appendError(errors, () => {
    const level = registryValue(
      registries.levelPacks,
      normalized.levelPackRef,
      "LevelPack",
    );
    const forbiddenStateFields = [
      ...forbiddenKeysIn(level?.initialMapState, "LevelPack.initialMapState"),
      ...forbiddenKeysIn(level?.initialLevelState, "LevelPack.initialLevelState"),
    ];
    if (forbiddenStateFields.length) {
      throw new Error(
        "LevelPack initial world state contains forbidden teaching or score fields: "
        + forbiddenStateFields.join(", "),
      );
    }
  });
  if (board) validateBoardLoadUnit(board, errors);
  if (board && theme?.regionArt) {
    for (const region of board.artRegions || []) {
      const art = theme.regionArt[region.id];
      if (!art?.assetRef) continue;
      if (
        typeof region.layoutContractRef !== "string"
        || !region.layoutContractRef
        || art.layoutContractRef !== region.layoutContractRef
      ) {
        errors.push(
          `ThemePack regionArt ${region.id} must match BoardTemplate `
          + `layoutContractRef ${region.layoutContractRef || "(missing)"}`,
        );
      }
    }
  }

  const maxArtRegions = worldPack?.assetBudget?.maxArtRegions;
  if (
    maxArtRegions !== undefined
    && (
      !Number.isSafeInteger(maxArtRegions)
      || maxArtRegions < 1
      || maxArtRegions > MAX_WORLD_ZONES
    )
  ) {
    errors.push(`WorldPack.assetBudget.maxArtRegions must be from 1 to ${MAX_WORLD_ZONES}`);
  }
  return errors;
}

/**
 * Resolves the exact immutable map/theme/level composition for one WorldPack.
 */
export function resolveWorldComposition(worldRef, registries = {}) {
  const exactWorldRef = exactVersionedRef(worldRef, "worldRef");
  const worldPack = registryValue(registries.worldPacks, exactWorldRef, "WorldPack");
  const errors = validateWorldPack(worldPack, registries);
  if (errors.length) throw new Error(errors.join("; "));
  const normalized = normalizedWorldPack(worldPack);
  return frozenClone({
    worldRef: exactWorldRef,
    worldPack,
    board: registryValue(
      registries.boardTemplates,
      normalized.boardTemplateRef,
      "BoardTemplate",
    ),
    theme: registryValue(registries.themePacks, normalized.themePackRef, "ThemePack"),
    level: registryValue(registries.levelPacks, normalized.levelPackRef, "LevelPack"),
  });
}

/**
 * Validates an exact-version route over registered WorldPacks.
 *
 * Authored transitions remain strictly acyclic. The only reusable template is
 * an explicitly declared terminal `repeatableTail`, which appends a new world
 * instance instead of adding a graph self-edge or revisiting an old instance.
 * An explicit single-world circuit is a separate local-return policy.
 */
export function validateWorldRoute(worldRoute, registries = {}) {
  const errors = [];
  const forbidden = forbiddenKeysIn(worldRoute, "WorldRoute");
  if (forbidden.length) {
    errors.push(`WorldRoute contains forbidden teaching or score fields: ${forbidden.join(", ")}`);
  }

  let normalized;
  appendError(errors, () => {
    normalized = normalizedRoute(worldRoute);
  });
  if (!normalized) return errors;

  appendError(errors, () => {
    resolveWorldComposition(normalized.entryWorldRef, registries);
  });
  if (normalized.circuit) {
    appendError(errors, () => {
      const composition = resolveWorldComposition(normalized.circuit.worldRef, registries);
      const board = indexedBoard(composition.board);
      if (board.exits.size !== 1 || !board.exits.has(normalized.circuit.exitId)) {
        throw new Error("WorldRoute circuit must reference the single authored BoardTemplate exit");
      }
    });
  }

  const transitionKeys = new Set();
  const adjacency = new Map();
  const referencedWorlds = new Set([normalized.entryWorldRef]);
  for (const [index, transition] of worldRoute.transitions.entries()) {
    let fromWorldRef;
    let toWorldRef;
    let exitId;
    appendError(errors, () => {
      fromWorldRef = exactVersionedRef(
        transition?.fromWorldRef,
        `WorldRoute.transitions[${index}].fromWorldRef`,
      );
      toWorldRef = exactVersionedRef(
        transition?.toWorldRef,
        `WorldRoute.transitions[${index}].toWorldRef`,
      );
      exitId = normalizedText(
        transition?.exitId,
        `WorldRoute.transitions[${index}].exitId`,
      );
      if (fromWorldRef === toWorldRef) {
        throw new Error(`WorldRoute transition ${index} cannot target the same world`);
      }
      const key = routeTransitionKey(fromWorldRef, exitId);
      if (transitionKeys.has(key)) {
        throw new Error(
          `WorldRoute has duplicate transition for ${fromWorldRef} exit ${exitId}`,
        );
      }
      transitionKeys.add(key);
    });
    if (!fromWorldRef || !toWorldRef || !exitId) continue;

    let fromComposition;
    appendError(errors, () => {
      fromComposition = resolveWorldComposition(fromWorldRef, registries);
    });
    appendError(errors, () => {
      resolveWorldComposition(toWorldRef, registries);
    });
    if (fromComposition) {
      appendError(errors, () => {
        const board = indexedBoard(fromComposition.board);
        if (!board.exits.has(exitId)) {
          throw new Error(
            `WorldRoute transition ${index} references unknown exit ${exitId} `
            + `on ${fromWorldRef}`,
          );
        }
      });
    }

    if (!adjacency.has(fromWorldRef)) adjacency.set(fromWorldRef, new Set());
    adjacency.get(fromWorldRef).add(toWorldRef);
    referencedWorlds.add(fromWorldRef);
    referencedWorlds.add(toWorldRef);
  }

  if (normalized.repeatableTail) {
    const {
      worldRef: tailWorldRef,
      exitId: tailExitId,
    } = normalized.repeatableTail;
    referencedWorlds.add(tailWorldRef);
    let tailComposition;
    appendError(errors, () => {
      tailComposition = resolveWorldComposition(tailWorldRef, registries);
    });
    if (tailComposition) {
      appendError(errors, () => {
        const tailBoard = indexedBoard(tailComposition.board);
        if (!tailBoard.exits.has(tailExitId)) {
          throw new Error(
            `WorldRoute repeatable tail references unknown exit ${tailExitId} `
            + `on ${tailWorldRef}`,
          );
        }
        if (tailBoard.exits.size !== 1) {
          throw new Error(
            "WorldRoute repeatable tail must use a single-exit BoardTemplate",
          );
        }
      });
    }
    if (
      worldRoute.transitions.some(
        (transition) => transition?.fromWorldRef === tailWorldRef,
      )
    ) {
      errors.push(
        `WorldRoute repeatable tail must be terminal: ${tailWorldRef} `
        + "cannot also have authored outgoing transitions",
      );
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (worldRef) => {
    if (visiting.has(worldRef)) {
      errors.push(`WorldRoute contains a cycle through ${worldRef}`);
      return;
    }
    if (visited.has(worldRef)) return;
    visiting.add(worldRef);
    for (const nextWorldRef of adjacency.get(worldRef) || []) visit(nextWorldRef);
    visiting.delete(worldRef);
    visited.add(worldRef);
  };
  for (const worldRef of referencedWorlds) visit(worldRef);

  const reachable = new Set();
  const queue = [normalized.entryWorldRef];
  while (queue.length) {
    const worldRef = queue.shift();
    if (reachable.has(worldRef)) continue;
    reachable.add(worldRef);
    queue.push(...(adjacency.get(worldRef) || []));
  }
  for (const worldRef of referencedWorlds) {
    if (!reachable.has(worldRef)) {
      errors.push(`WorldRoute contains unreachable world: ${worldRef}`);
    }
  }
  return [...new Set(errors)];
}

function edgeAvailable(edge, mapState) {
  if (edge.availableWhen === undefined) return true;
  return (
    isPlainObject(edge.availableWhen)
    && typeof edge.availableWhen.stateKey === "string"
    && Object.hasOwn(mapState, edge.availableWhen.stateKey)
    && Object.is(mapState[edge.availableWhen.stateKey], edge.availableWhen.equals)
  );
}

function selectedEdge(choices, routeChoice, nodeId) {
  if (!choices.length) return null;
  if (routeChoice === undefined) {
    return choices.find((edge) => edge.availableWhen === undefined) || choices[0];
  }
  if (typeof routeChoice === "string") {
    const matched = choices.find((edge) => edge.id === routeChoice);
    if (!matched) throw new Error(`route choice ${routeChoice} is unavailable from ${nodeId}`);
    return matched;
  }
  if (
    Number.isSafeInteger(routeChoice)
    && routeChoice >= 0
    && routeChoice < choices.length
  ) {
    return choices[routeChoice];
  }
  throw new Error(`route choice for ${nodeId} must be an available edge id or index`);
}

function exitAtNode(boardIndex, nodeId) {
  return [...boardIndex.exits.values()].find((exit) => exit.nodeId === nodeId) || null;
}

function routeTransition(worldRoute, fromWorldRef, exitId) {
  const authored = worldRoute.transitions.find((transition) => (
    transition.fromWorldRef === fromWorldRef && transition.exitId === exitId
  )) || null;
  if (authored) return authored;
  const tail = worldRoute.repeatableTail;
  if (
    tail?.worldRef === fromWorldRef
    && tail.exitId === exitId
    && tail.instancePolicy === REPEATABLE_TAIL_INSTANCE_POLICY
  ) {
    return {
      fromWorldRef,
      exitId,
      toWorldRef: fromWorldRef,
      repeatableTail: true,
      instancePolicy: REPEATABLE_TAIL_INSTANCE_POLICY,
    };
  }
  return null;
}

function reachableWorldRefs(worldRoute) {
  const adjacency = new Map();
  for (const transition of worldRoute.transitions || []) {
    if (!adjacency.has(transition.fromWorldRef)) {
      adjacency.set(transition.fromWorldRef, []);
    }
    adjacency.get(transition.fromWorldRef).push(transition.toWorldRef);
  }
  const reachable = new Set();
  const queue = [worldRoute.entryWorldRef];
  while (queue.length) {
    const worldRef = queue.shift();
    if (reachable.has(worldRef)) continue;
    reachable.add(worldRef);
    queue.push(...(adjacency.get(worldRef) || []));
  }
  return reachable;
}

function stableInstanceHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function nextInstanceId(
  currentInstanceId,
  nextWorldRef,
  nextWorldOrdinal,
  provided,
) {
  let instanceId;
  if (provided !== undefined) {
    instanceId = normalizedText(provided, "nextWorldInstanceId");
  } else {
    const safeWorldRef = nextWorldRef
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 160);
    instanceId = (
      `world-instance:${nextWorldOrdinal}:${stableInstanceHash(currentInstanceId)}:`
      + safeWorldRef
    );
  }
  if (instanceId === currentInstanceId) {
    throw new Error("next world instance must differ from the active world instance");
  }
  return instanceId;
}

/**
 * Plans one complete die move over an immutable WorldRoute.
 *
 * Reaching an authored exit consumes the ordinary edge step. The structural
 * transition consumes zero steps, and remaining die steps continue from the
 * destination world's entry. A legal move may cross at most one world.
 * Explicit circuits return only the acting pawn to the same world's entry.
 */
export function walkWorldPlan(options = {}) {
  rejectUnknownKeys(options, WALK_WORLD_PLAN_KEYS, "walkWorldPlan options");
  const forbiddenMapFields = forbiddenKeysIn(
    options.mapStatesByWorldInstance,
    "mapStatesByWorldInstance",
  );
  if (forbiddenMapFields.length) {
    throw new TypeError(
      `map state contains forbidden teaching or score fields: ${forbiddenMapFields.join(", ")}`,
    );
  }

  const moveId = normalizedText(options.moveId, "moveId");
  const worldInstanceId = normalizedText(options.worldInstanceId, "worldInstanceId");
  const worldRef = exactVersionedRef(options.worldRef, "worldRef");
  const startNodeId = normalizedText(options.startNodeId, "startNodeId");
  const worldOrdinal = Number(options.worldOrdinal ?? 1);
  const steps = Number(options.steps);
  if (!Number.isSafeInteger(worldOrdinal) || worldOrdinal < 1) {
    throw new TypeError("worldOrdinal must be a positive safe integer");
  }
  const doubleSteps = doubleDiceSteps(options);
  if (hasDoubleDiceFields(options) && doubleSteps !== steps) throw new TypeError("double dice faces must match steps");
  if (!Number.isSafeInteger(steps) || steps < 1 || (steps > MAX_DIE_STEPS && doubleSteps !== steps)) {
    throw new TypeError(`steps must be an integer from 1 to ${MAX_DIE_STEPS}`);
  }
  if (!isPlainObject(options.registries)) {
    throw new TypeError("registries must be a plain object");
  }
  if (
    options.routeChoicesByWorldInstance !== undefined
    && !isPlainObject(options.routeChoicesByWorldInstance)
  ) {
    throw new TypeError("routeChoicesByWorldInstance must be a plain object");
  }
  if (
    options.mapStatesByWorldInstance !== undefined
    && !isPlainObject(options.mapStatesByWorldInstance)
  ) {
    throw new TypeError("mapStatesByWorldInstance must be a plain object");
  }

  const routeErrors = validateWorldRoute(options.worldRoute, options.registries);
  if (routeErrors.length) throw new Error(routeErrors.join("; "));
  const route = normalizedRoute(options.worldRoute);
  if (!reachableWorldRefs(options.worldRoute).has(worldRef)) {
    throw new Error(`worldRef is not reachable in WorldRoute: ${worldRef}`);
  }
  const startComposition = resolveWorldComposition(worldRef, options.registries);
  const startBoardIndex = indexedBoard(startComposition.board);
  if (!startBoardIndex.nodes.has(startNodeId)) {
    throw new Error(`start node does not exist in ${worldRef}: ${startNodeId}`);
  }

  const routeChoicesByWorldInstance = options.routeChoicesByWorldInstance || {};
  const mapStatesByWorldInstance = options.mapStatesByWorldInstance || {};
  const segments = [];
  const effects = [];
  const transitions = [];
  const lapReturns = [];
  const lapCompletions = [];
  let currentWorldRef = worldRef;
  let currentWorldInstanceId = worldInstanceId;
  let currentWorldOrdinal = worldOrdinal;
  let currentComposition = startComposition;
  let currentBoard = startBoardIndex;
  let currentNodeId = startNodeId;
  let walkSegment = null;

  const appendWalkStep = (edge, nodeId, stepNumber) => {
    if (
      !walkSegment
      || walkSegment.worldInstanceId !== currentWorldInstanceId
    ) {
      walkSegment = {
        type: "walk",
        worldRef: currentWorldRef,
        worldInstanceId: currentWorldInstanceId,
        nodeIds: [],
        edgeIds: [],
      };
      segments.push(walkSegment);
    }
    walkSegment.nodeIds.push(nodeId);
    walkSegment.edgeIds.push(edge.id);
    effects.push({
      type: "pawn_step",
      effectId: `${moveId}:step:${stepNumber}`,
      stepNumber,
      worldRef: currentWorldRef,
      worldInstanceId: currentWorldInstanceId,
      edgeId: edge.id,
      nodeId,
    });
  };

  const crossExit = (exit) => {
    if (route.circuit) {
      if (currentWorldRef !== route.circuit.worldRef || exit.id !== route.circuit.exitId) {
        throw new Error("circuit exit does not match its registered world and exit");
      }
      const lapReturn = {
        type: "lap_return",
        effectId: `${moveId}:lap-return:${lapReturns.length + 1}`,
        policy: CIRCUIT_POLICY,
        worldRef: currentWorldRef,
        worldInstanceId: currentWorldInstanceId,
        fromNodeId: exit.nodeId,
        toNodeId: currentBoard.entryNodeId,
        toEntryNodeId: currentBoard.entryNodeId,
        zeroStepCost: true,
      };
      lapReturns.push(lapReturn);
      effects.push(lapReturn);
      segments.push(lapReturn);
      walkSegment = null;
      currentNodeId = currentBoard.entryNodeId;
      return;
    }
    if (transitions.length >= 1) {
      throw new Error("one die move cannot cross more than one world");
    }
    const authoredTransition = routeTransition(
      options.worldRoute,
      currentWorldRef,
      exit.id,
    );
    if (!authoredTransition) {
      throw new Error(
        `world exit ${currentWorldRef}#${exit.id} has no WorldRoute transition`,
      );
    }
    const destination = resolveWorldComposition(
      authoredTransition.toWorldRef,
      options.registries,
    );
    const destinationBoard = indexedBoard(destination.board);
    const destinationInstanceId = nextInstanceId(
      currentWorldInstanceId,
      destination.worldRef,
      currentWorldOrdinal + 1,
      options.nextWorldInstanceId,
    );
    const transitionId = `${moveId}:world-transition:1`;
    const transitionEffect = {
      type: "world_transition",
      effectId: transitionId,
      transitionId,
      policy: "shared-expedition-v1",
      zeroStepCost: true,
      fromWorldRef: currentWorldRef,
      fromWorldInstanceId: currentWorldInstanceId,
      fromWorldOrdinal: currentWorldOrdinal,
      exitId: exit.id,
      fromNodeId: exit.nodeId,
      toWorldRef: destination.worldRef,
      toWorldInstanceId: destinationInstanceId,
      toWorldOrdinal: currentWorldOrdinal + 1,
      toEntryNodeId: destinationBoard.entryNodeId,
    };
    transitions.push(transitionEffect);
    segments.push(transitionEffect);
    effects.push(transitionEffect);
    walkSegment = null;
    currentWorldRef = destination.worldRef;
    currentWorldInstanceId = destinationInstanceId;
    currentWorldOrdinal += 1;
    currentComposition = destination;
    currentBoard = destinationBoard;
    currentNodeId = destinationBoard.entryNodeId;
  };

  const startingExit = exitAtNode(currentBoard, currentNodeId);
  if (startingExit) crossExit(startingExit);

  for (let stepNumber = 1; stepNumber <= steps; stepNumber += 1) {
    const mapState = transitions.length
      ? (currentComposition.level?.initialMapState || {})
      : (
        mapStatesByWorldInstance[currentWorldInstanceId]
        || currentComposition.level?.initialMapState
        || {}
      );
    if (!isPlainObject(mapState)) {
      throw new TypeError(`map state for ${currentWorldInstanceId} must be a plain object`);
    }
    const routeChoices = routeChoicesByWorldInstance[currentWorldInstanceId] || {};
    if (!isPlainObject(routeChoices)) {
      throw new TypeError(`route choices for ${currentWorldInstanceId} must be a plain object`);
    }
    const choices = (currentBoard.outgoing.get(currentNodeId) || [])
      .filter((edge) => edgeAvailable(edge, mapState));
    const edge = selectedEdge(choices, routeChoices[currentNodeId], currentNodeId);
    if (!edge) {
      throw new Error(
        `die move cannot consume all ${steps} steps from dead end `
        + `${currentWorldRef}#${currentNodeId}`,
      );
    }
    currentNodeId = edge.to;
    appendWalkStep(edge, currentNodeId, stepNumber);
    const reachedExit = exitAtNode(currentBoard, currentNodeId);
    if (reachedExit) {
      if (route.circuit) {
        // Finishing a lap and returning for the next one are different events.
        // A die ending here stays on the terminal; a later move returns once
        // before its first paid step, without completing this same lap again.
        lapCompletions.push(`${moveId}:step:${stepNumber}`);
        if (stepNumber < steps) crossExit(reachedExit);
      } else crossExit(reachedExit);
    }
  }

  const destinationMapState = transitions.length
    ? (currentComposition.level?.initialMapState || {})
    : (
      mapStatesByWorldInstance[currentWorldInstanceId]
      || currentComposition.level?.initialMapState
      || {}
    );
  const destinationLevelState = currentComposition.level?.initialLevelState || {};
  return frozenClone({
    schemaVersion: "world-move-plan.v1",
    id: moveId,
    policy: "shared-expedition-v1",
    worldRouteRef: route.ref,
    dieValue: steps,
    ...(doubleSteps !== null ? { dicePolicy: options.dicePolicy, faceIndices: [...options.faceIndices] } : {}),
    stepsConsumed: effects.filter((effect) => effect.type === "pawn_step").length,
    startLocation: {
      worldRef,
      worldInstanceId,
      worldOrdinal,
      nodeId: startNodeId,
    },
    segments,
    transitions,
    ...(route.circuit ? { lapReturns, lapCompletions } : {}),
    effects,
    finalLocation: {
      worldRef: currentWorldRef,
      worldInstanceId: currentWorldInstanceId,
      worldOrdinal: currentWorldOrdinal,
      nodeId: currentNodeId,
    },
    arrivalState: {
      mapState: clone(destinationMapState),
      levelState: clone(destinationLevelState),
    },
  });
}

function normalizedTeams(teams) {
  if (!Array.isArray(teams) || teams.length < 1 || teams.length > 8) {
    throw new TypeError("teams must contain between 1 and 8 teams");
  }
  const ids = new Set();
  return teams.map((team, index) => {
    if (!isPlainObject(team)) throw new TypeError(`teams[${index}] must be a plain object`);
    const id = normalizedText(team.id, `teams[${index}].id`);
    const nodeId = normalizedText(team.nodeId, `teams[${index}].nodeId`);
    if (ids.has(id)) throw new Error(`teams contains duplicate id: ${id}`);
    if (team.completedLaps !== undefined && (!Number.isSafeInteger(team.completedLaps) || team.completedLaps < 0)) {
      throw new Error(`teams[${index}].completedLaps must be a non-negative safe integer`);
    }
    ids.add(id);
    return { ...clone(team), id, nodeId };
  });
}

function normalizedWorldRuntime(worldRuntime) {
  if (!isPlainObject(worldRuntime)) {
    throw new TypeError("worldRuntime must be a plain object");
  }
  if (worldRuntime.schemaVersion !== "world-runtime.v1") {
    throw new Error("worldRuntime.schemaVersion must be world-runtime.v1");
  }
  if (!isPlainObject(worldRuntime.active)) {
    throw new Error("worldRuntime.active must be a plain object");
  }
  const active = {
    ...clone(worldRuntime.active),
    instanceId: normalizedText(
      worldRuntime.active.instanceId,
      "worldRuntime.active.instanceId",
    ),
    ordinal: Number(worldRuntime.active.ordinal),
    worldPackRef: exactVersionedRef(
      worldRuntime.active.worldPackRef,
      "worldRuntime.active.worldPackRef",
    ),
    mapState: clone(worldRuntime.active.mapState || {}),
    levelState: clone(worldRuntime.active.levelState || {}),
  };
  if (!Number.isSafeInteger(active.ordinal) || active.ordinal < 1) {
    throw new Error("worldRuntime.active.ordinal must be a positive safe integer");
  }
  if (!isPlainObject(active.mapState) || !isPlainObject(active.levelState)) {
    throw new Error("worldRuntime active mapState and levelState must be plain objects");
  }
  const forbiddenStateFields = [
    ...forbiddenKeysIn(active.mapState, "worldRuntime.active.mapState"),
    ...forbiddenKeysIn(active.levelState, "worldRuntime.active.levelState"),
  ];
  if (forbiddenStateFields.length) {
    throw new Error(
      `worldRuntime contains forbidden teaching or score fields: ${forbiddenStateFields.join(", ")}`,
    );
  }
  if (
    worldRuntime.completed !== undefined
    && !Array.isArray(worldRuntime.completed)
  ) {
    throw new Error("worldRuntime.completed must be an array");
  }
  if (
    worldRuntime.processedTransitionIds !== undefined
    && !Array.isArray(worldRuntime.processedTransitionIds)
  ) {
    throw new Error("worldRuntime.processedTransitionIds must be an array");
  }
  if (worldRuntime.processedLapReturnIds !== undefined && !Array.isArray(worldRuntime.processedLapReturnIds)) {
    throw new Error("worldRuntime.processedLapReturnIds must be an array");
  }
  if (worldRuntime.processedLapCompletionIds !== undefined && !Array.isArray(worldRuntime.processedLapCompletionIds)) {
    throw new Error("worldRuntime.processedLapCompletionIds must be an array");
  }
  return {
    ...clone(worldRuntime),
    schemaVersion: "world-runtime.v1",
    routeRef: exactVersionedRef(worldRuntime.routeRef, "worldRuntime.routeRef"),
    active,
    completed: clone(worldRuntime.completed || []),
    processedTransitionIds: (worldRuntime.processedTransitionIds || [])
      .map((id) => normalizedText(id, "processed transition id"))
      .slice(-MAX_PROCESSED_TRANSITIONS),
    ...(worldRuntime.processedLapReturnIds !== undefined ? {
      processedLapReturnIds: worldRuntime.processedLapReturnIds
        .map((id) => normalizedText(id, "processed lap return id")).slice(-MAX_PROCESSED_TRANSITIONS),
    } : {}),
    ...(worldRuntime.processedLapCompletionIds !== undefined ? {
      processedLapCompletionIds: worldRuntime.processedLapCompletionIds
        .map((id) => normalizedText(id, "processed lap completion id")).slice(-MAX_PROCESSED_TRANSITIONS),
    } : {}),
  };
}

function validateMovePlan(plan) {
  if (!isPlainObject(plan)) throw new TypeError("plan must be a plain object");
  const forbidden = forbiddenKeysIn(plan, "plan");
  if (forbidden.length) {
    throw new Error(`plan contains forbidden teaching or score fields: ${forbidden.join(", ")}`);
  }
  if (
    plan.schemaVersion !== "world-move-plan.v1"
    || plan.policy !== "shared-expedition-v1"
  ) {
    throw new Error("plan must use world-move-plan.v1 and shared-expedition-v1");
  }
  if (
    !Number.isSafeInteger(plan.dieValue)
    || !Number.isSafeInteger(plan.stepsConsumed)
    || plan.stepsConsumed !== plan.dieValue
    || plan.dieValue < 1 || (plan.dieValue > MAX_DIE_STEPS && doubleDiceSteps(plan) !== plan.dieValue)
    || (hasDoubleDiceFields(plan) && doubleDiceSteps(plan) !== plan.dieValue)
  ) {
    throw new Error("plan must consume every die step exactly once");
  }
  if (!Array.isArray(plan.transitions) || plan.transitions.length > 1) {
    throw new Error("plan may contain at most one world transition");
  }
  if (!isPlainObject(plan.startLocation) || !isPlainObject(plan.finalLocation)) {
    throw new Error("plan startLocation and finalLocation are required");
  }
  if (plan.lapReturns !== undefined) {
    const actual = (plan.effects || []).filter((effect) => effect.type === "lap_return");
    if (!Array.isArray(plan.lapReturns) || plan.transitions.length
      || JSON.stringify(actual) !== JSON.stringify(plan.lapReturns)
      || plan.startLocation.worldRef !== plan.finalLocation.worldRef
      || plan.startLocation.worldInstanceId !== plan.finalLocation.worldInstanceId
      || plan.startLocation.worldOrdinal !== plan.finalLocation.worldOrdinal) {
      throw new Error("plan lapReturns must match its local lap_return effects and cannot change worlds");
    }
    const ids = new Set();
    for (const effect of plan.lapReturns) {
      if (effect.policy !== CIRCUIT_POLICY || effect.zeroStepCost !== true
        || effect.worldRef !== plan.startLocation.worldRef
        || effect.worldInstanceId !== plan.startLocation.worldInstanceId
        || !effect.fromNodeId || !effect.toNodeId || effect.toNodeId !== effect.toEntryNodeId
        || typeof effect.effectId !== "string" || !effect.effectId || ids.has(effect.effectId)) {
        throw new Error("plan contains an invalid local lap return");
      }
      ids.add(effect.effectId);
    }
  } else if ((plan.effects || []).some((effect) => effect.type === "lap_return")) {
    throw new Error("local lap returns require a circuit move plan");
  }
  if (plan.lapCompletions !== undefined) {
    if (!Array.isArray(plan.lapCompletions) || !Array.isArray(plan.lapReturns)) {
      throw new Error("lapCompletions require a circuit move plan and must be an array");
    }
    const completionIds = new Set();
    for (const completionId of plan.lapCompletions) {
      normalizedText(completionId, "lap completion effect id");
      const step = (plan.effects || []).find((effect) => effect.effectId === completionId);
      if (completionIds.has(completionId) || step?.type !== "pawn_step"
        || step.worldRef !== plan.startLocation.worldRef
        || step.worldInstanceId !== plan.startLocation.worldInstanceId) {
        throw new Error("lapCompletions must uniquely reference real same-world pawn steps");
      }
      completionIds.add(completionId);
    }
  }
}

/**
 * Commits a precomputed move using shared-expedition semantics.
 *
 * On transition, every non-active pawn is carried to the destination entry;
 * the active pawn continues to the plan's unique final landing node.
 */
export function commitSharedExpedition(options = {}) {
  rejectUnknownKeys(
    options,
    SHARED_EXPEDITION_COMMIT_KEYS,
    "commitSharedExpedition options",
  );
  validateMovePlan(options.plan);
  const worldRuntime = normalizedWorldRuntime(options.worldRuntime);
  const teams = normalizedTeams(options.teams);
  const activeTeamId = normalizedText(options.activeTeamId, "activeTeamId");
  const activeTeam = teams.find((team) => team.id === activeTeamId);
  if (!activeTeam) throw new Error(`active team is not registered: ${activeTeamId}`);

  const transition = options.plan.transitions[0] || null;
  const lapReturns = options.plan.lapReturns || [];
  const lapCompletions = options.plan.lapCompletions;
  const lapMarkers = [
    ...lapReturns.map((effect) => ({ id: effect.effectId, processed: worldRuntime.processedLapReturnIds || [] })),
    ...(lapCompletions || []).map((id) => ({ id, processed: worldRuntime.processedLapCompletionIds || [] })),
  ];
  if (lapMarkers.length) {
    const processed = lapMarkers.filter((marker) => marker.processed.includes(marker.id));
    if (processed.length === lapMarkers.length) {
      return frozenClone({ worldRuntime, teams, effects: [], duplicate: true });
    }
    if (processed.length) throw new Error("a circuit move cannot replay a partially committed lap completion or return");
  }
  if (
    transition
    && worldRuntime.processedTransitionIds.includes(transition.transitionId)
  ) {
    return frozenClone({
      worldRuntime,
      teams,
      effects: [],
      duplicate: true,
    });
  }
  if (
    worldRuntime.routeRef !== options.plan.worldRouteRef
    || worldRuntime.active.instanceId !== options.plan.startLocation.worldInstanceId
    || worldRuntime.active.worldPackRef !== options.plan.startLocation.worldRef
    || worldRuntime.active.ordinal !== options.plan.startLocation.worldOrdinal
    || activeTeam.nodeId !== options.plan.startLocation.nodeId
  ) {
    throw new Error("move plan start does not match the active shared expedition state");
  }

  let nextWorldRuntime = worldRuntime;
  let nextTeams;
  if (!transition) {
    if (
      options.plan.finalLocation.worldInstanceId !== worldRuntime.active.instanceId
      || options.plan.finalLocation.worldRef !== worldRuntime.active.worldPackRef
    ) {
      throw new Error("a no-transition plan cannot change the active world");
    }
    // Old frozen plans counted their local return; preserve that exact contract.
    // New plans count actual terminal arrivals, including a die ending there.
    const completedLaps = (activeTeam.completedLaps || 0)
      + (lapCompletions === undefined ? lapReturns.length : lapCompletions.length);
    if (options.plan.lapReturns !== undefined && !Number.isSafeInteger(completedLaps)) {
      throw new Error("completed lap count exceeds its safe integer range");
    }
    nextTeams = teams.map((team) => (
      team.id === activeTeamId
        ? { ...team, nodeId: options.plan.finalLocation.nodeId,
          ...(options.plan.lapReturns !== undefined ? { completedLaps } : {}) }
        : team
    ));
    if (lapMarkers.length) {
      nextWorldRuntime = {
        ...worldRuntime,
        ...(lapReturns.length ? { processedLapReturnIds:
          [...(worldRuntime.processedLapReturnIds || []), ...lapReturns.map((effect) => effect.effectId)]
            .slice(-MAX_PROCESSED_TRANSITIONS) } : {}),
        ...(lapCompletions?.length ? { processedLapCompletionIds:
          [...(worldRuntime.processedLapCompletionIds || []), ...lapCompletions]
            .slice(-MAX_PROCESSED_TRANSITIONS) } : {}),
      };
    }
  } else {
    if (
      transition.fromWorldInstanceId !== worldRuntime.active.instanceId
      || transition.fromWorldRef !== worldRuntime.active.worldPackRef
      || transition.fromWorldOrdinal !== worldRuntime.active.ordinal
      || transition.toWorldInstanceId !== options.plan.finalLocation.worldInstanceId
      || transition.toWorldRef !== options.plan.finalLocation.worldRef
      || transition.toWorldOrdinal !== options.plan.finalLocation.worldOrdinal
    ) {
      throw new Error("world transition does not match the move plan boundaries");
    }
    if (
      transition.zeroStepCost !== true
      || transition.toWorldOrdinal !== worldRuntime.active.ordinal + 1
      || transition.toWorldInstanceId === worldRuntime.active.instanceId
    ) {
      throw new Error(
        "world transition must append one distinct, zero-cost world instance",
      );
    }
    if (
      worldRuntime.completed.some(
        (completedWorld) => (
          completedWorld?.instanceId === transition.toWorldInstanceId
        ),
      )
    ) {
      throw new Error("world transition cannot revisit a completed world instance");
    }
    nextTeams = teams.map((team) => ({
      ...team,
      nodeId: team.id === activeTeamId
        ? options.plan.finalLocation.nodeId
        : transition.toEntryNodeId,
    }));
    nextWorldRuntime = {
      ...worldRuntime,
      active: {
        instanceId: transition.toWorldInstanceId,
        ordinal: transition.toWorldOrdinal,
        worldPackRef: transition.toWorldRef,
        mapState: clone(options.plan.arrivalState?.mapState || {}),
        levelState: clone(options.plan.arrivalState?.levelState || {}),
      },
      completed: [
        ...worldRuntime.completed,
        {
          instanceId: worldRuntime.active.instanceId,
          ordinal: worldRuntime.active.ordinal,
          worldPackRef: worldRuntime.active.worldPackRef,
          exitId: transition.exitId,
          transitionId: transition.transitionId,
          archivedState: {
            mapState: clone(worldRuntime.active.mapState),
            levelState: clone(worldRuntime.active.levelState),
          },
        },
      ],
      processedTransitionIds: [
        ...worldRuntime.processedTransitionIds,
        transition.transitionId,
      ].slice(-MAX_PROCESSED_TRANSITIONS),
    };
  }

  return frozenClone({
    worldRuntime: nextWorldRuntime,
    teams: nextTeams,
    effects: options.plan.effects,
    duplicate: false,
  });
}

export const commitSharedExpeditionPlan = commitSharedExpedition;
