import { doubleDiceSteps, hasDoubleDiceFields } from "./double-dice-core.js";
import {
  commitSharedExpedition,
} from "./world-runtime-core.js";

const DIE_SIDES = 6;
const MAX_PROCESSED_ATTEMPTS = 64;
const TASK_SCHEDULE_SCHEMA_VERSION = "per-speaker-task-cycle.v1";
const WORLD_ANSWER_KEYS = new Set([
  "activityTemplates",
  "attemptId",
  "finalBoard",
  "finalMapState",
  "landingActivityPolicy",
  "learningPack",
  "runtime",
  "worldPlan",
]);
const WORLD_ANSWER_FORBIDDEN_KEYS = new Set([
  "aiscore",
  "score",
  "transcript",
]);

function indexById(items, label) {
  const index = new Map();
  for (const item of items || []) {
    if (!item?.id) throw new Error(`${label} item is missing id`);
    if (index.has(item.id)) throw new Error(`${label} contains duplicate id: ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}

export function validateBoardTemplate(board) {
  const errors = [];
  if (!board?.id) errors.push("board.id is required");
  if (!Array.isArray(board?.nodes) || board.nodes.length < 8) {
    errors.push("board.nodes must contain at least 8 nodes");
  }
  if (!Array.isArray(board?.edges) || board.edges.length < 7) {
    errors.push("board.edges must contain at least 7 edges");
  }

  const viewBox = board?.viewBox;
  const hasValidViewBox = (
    Array.isArray(viewBox)
    && viewBox.length === 4
    && viewBox.every(Number.isFinite)
    && viewBox[2] > 0
    && viewBox[3] > 0
  );
  if (!hasValidViewBox) {
    errors.push("board.viewBox must be [x, y, width, height] with positive dimensions");
  }

  const worldWidth = board?.worldSize?.width;
  const worldHeight = board?.worldSize?.height;
  const hasValidWorldSize = (
    Number.isFinite(worldWidth)
    && Number.isFinite(worldHeight)
    && worldWidth > 0
    && worldHeight > 0
  );
  if (!hasValidWorldSize) {
    errors.push("board.worldSize must contain positive width and height");
  } else if (hasValidViewBox && (worldWidth < viewBox[2] || worldHeight < viewBox[3])) {
    errors.push("board.worldSize cannot be smaller than the viewport");
  }

  if (!Array.isArray(board?.zones) || board.zones.length < 1) {
    errors.push("board.zones must contain at least one map zone");
  } else {
    const zoneIds = new Set();
    for (const zone of board.zones) {
      if (!zone?.id) {
        errors.push("zone is missing id");
      } else if (zoneIds.has(zone.id)) {
        errors.push(`duplicate zone id: ${zone.id}`);
      } else {
        zoneIds.add(zone.id);
      }
      const bounds = zone?.bounds;
      const validBounds = (
        Number.isFinite(bounds?.x)
        && Number.isFinite(bounds?.y)
        && Number.isFinite(bounds?.width)
        && Number.isFinite(bounds?.height)
        && bounds.width > 0
        && bounds.height > 0
      );
      if (!validBounds) {
        errors.push(`zone ${zone?.id || "unknown"} has invalid bounds`);
      } else if (
        hasValidWorldSize
        && (
          bounds.x < 0
          || bounds.y < 0
          || bounds.x + bounds.width > worldWidth
          || bounds.y + bounds.height > worldHeight
        )
      ) {
        errors.push(`zone ${zone?.id || "unknown"} exceeds world bounds`);
      }
    }
  }

  let nodes;
  try {
    nodes = indexById(board?.nodes || [], "nodes");
  } catch (error) {
    errors.push(error.message);
    nodes = new Map();
  }

  if (board?.startNodeId && !nodes.has(board.startNodeId)) {
    errors.push(`start node does not exist: ${board.startNodeId}`);
  }

  for (const node of board?.nodes || []) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      errors.push(`node ${node.id || "unknown"} has invalid coordinates`);
    } else if (
      hasValidWorldSize
      && (node.x < 0 || node.y < 0 || node.x > worldWidth || node.y > worldHeight)
    ) {
      errors.push(`node ${node.id || "unknown"} exceeds world bounds`);
    }
    if (node.spaceRole === "transport") {
      if (!node.transportTargetId) {
        errors.push(`transport node ${node.id} is missing transportTargetId`);
      } else if (!nodes.has(node.transportTargetId)) {
        errors.push(`transport node ${node.id} has unknown target ${node.transportTargetId}`);
      } else if (node.transportTargetId === node.id) {
        errors.push(`transport node ${node.id} cannot target itself`);
      } else if (nodes.get(node.transportTargetId)?.spaceRole === "transport") {
        errors.push(`transport node ${node.id} cannot target another transport space`);
      }
      if (!node.transportProfileRef) {
        errors.push(`transport node ${node.id} is missing transportProfileRef`);
      }
      if (
        node.transportUnlockAfterCompletedTurns !== undefined
        && (
          !Number.isInteger(node.transportUnlockAfterCompletedTurns)
          || node.transportUnlockAfterCompletedTurns < 0
          || node.transportUnlockAfterCompletedTurns > 96
        )
      ) {
        errors.push(
          `transport node ${node.id} transportUnlockAfterCompletedTurns `
          + "must be an integer from 0 to 96",
        );
      }
      if (node.transportCaptureNodeIds !== undefined) {
        if (!Array.isArray(node.transportCaptureNodeIds)) {
          errors.push(`transport node ${node.id} transportCaptureNodeIds must be an array`);
        } else {
          const captureNodeIds = new Set();
          for (const captureNodeId of node.transportCaptureNodeIds) {
            if (typeof captureNodeId !== "string" || !captureNodeId.trim()) {
              errors.push(
                `transport node ${node.id} transportCaptureNodeIds `
                + "must contain non-empty node ids",
              );
            } else if (!nodes.has(captureNodeId)) {
              errors.push(
                `transport node ${node.id} has unknown capture node ${captureNodeId}`,
              );
            } else if (captureNodeIds.has(captureNodeId)) {
              errors.push(
                `transport node ${node.id} has duplicate capture node ${captureNodeId}`,
              );
            }
            captureNodeIds.add(captureNodeId);
          }
        }
      }
    } else if (
      node.transportTargetId
      || node.transportProfileRef
      || node.transportUnlockAfterCompletedTurns !== undefined
      || node.transportCaptureNodeIds !== undefined
    ) {
      errors.push(`node ${node.id} has transport fields but is not a transport space`);
    }
    if (node.spaceRole === "map-effect") {
      if (typeof node.mapEffectRef !== "string" || !node.mapEffectRef.trim()) {
        errors.push(`map-effect node ${node.id} is missing mapEffectRef`);
      }
    } else if (node.mapEffectRef !== undefined) {
      errors.push(`node ${node.id} has mapEffectRef but is not a map-effect space`);
    }
  }

  const edgeIds = new Set();
  for (const edge of board?.edges || []) {
    if (!edge?.id) errors.push("edge is missing id");
    if (edgeIds.has(edge?.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge?.id);
    if (!nodes.has(edge?.from)) errors.push(`edge ${edge?.id} has unknown from node`);
    if (!nodes.has(edge?.to)) errors.push(`edge ${edge?.id} has unknown to node`);
    if (edge?.availableWhen !== undefined) {
      if (
        !edge.availableWhen
        || typeof edge.availableWhen !== "object"
        || Array.isArray(edge.availableWhen)
      ) {
        errors.push(`edge ${edge?.id} availableWhen must be an object`);
      } else {
        if (
          typeof edge.availableWhen.stateKey !== "string"
          || !edge.availableWhen.stateKey.trim()
        ) {
          errors.push(`edge ${edge?.id} availableWhen.stateKey must be a non-empty string`);
        }
        if (
          !Object.hasOwn(edge.availableWhen, "equals")
          || edge.availableWhen.equals === undefined
        ) {
          errors.push(`edge ${edge?.id} availableWhen.equals is required`);
        }
      }
    }
  }

  return errors;
}

export function validateLearningPack(pack) {
  const errors = [];
  if (!pack?.id) errors.push("learningPack.id is required");
  if (!Array.isArray(pack?.objectives) || !pack.objectives.length) {
    errors.push("learningPack.objectives must not be empty");
  }
  if (!Array.isArray(pack?.tasks) || !pack.tasks.length) {
    errors.push("learningPack.tasks must not be empty");
  }

  const objectiveIds = new Set((pack?.objectives || []).map((item) => item.id));
  for (const task of pack?.tasks || []) {
    if (!task.id) errors.push("task is missing id");
    if (!task.interactionTemplateRef) {
      errors.push(`task ${task.id || "unknown"} is missing interactionTemplateRef`);
    }
    if (!task.evaluatorRef) {
      errors.push(`task ${task.id || "unknown"} is missing evaluatorRef`);
    }
    for (const objectiveId of task.objectiveIds || []) {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(`task ${task.id} references unknown objective ${objectiveId}`);
      }
    }
    if (task?.content?.cueConceptIds !== undefined) {
      const cueConceptIds = task.content.cueConceptIds;
      const requiredConceptIds = task?.evaluatorConfig?.requiredConceptIds;
      if (
        !Array.isArray(cueConceptIds)
        || !cueConceptIds.length
        || cueConceptIds.some((conceptId) => typeof conceptId !== "string" || !conceptId.trim())
        || new Set(cueConceptIds).size !== cueConceptIds.length
      ) {
        errors.push(`task ${task.id || "unknown"} cueConceptIds must be unique non-empty strings`);
      } else if (
        !Array.isArray(requiredConceptIds)
        || requiredConceptIds.length !== cueConceptIds.length
        || requiredConceptIds.some((conceptId) => !cueConceptIds.includes(conceptId))
      ) {
        errors.push(
          `task ${task.id || "unknown"} cueConceptIds must exactly match requiredConceptIds`,
        );
      }
    }
  }
  return errors;
}

function taskSpeaker(runtime) {
  const teamIndex = Number.isSafeInteger(runtime?.activeTeamIndex)
    ? runtime.activeTeamIndex
    : 0;
  const team = runtime?.teams?.[teamIndex];
  if (!team) throw new Error("active team is unavailable for task scheduling");
  const memberCount = Math.max(1, team.members?.length || 1);
  const speakerIndex = Number.isSafeInteger(team.speakerIndex)
    ? ((team.speakerIndex % memberCount) + memberCount) % memberCount
    : 0;
  const ordinal = runtime.teams
    .slice(0, teamIndex)
    .reduce((total, candidate) => total + Math.max(1, candidate.members?.length || 1), 0)
    + speakerIndex;
  return {
    key: `${team.id}:${speakerIndex}`,
    ordinal,
  };
}

function normalizedTaskOffset(value, taskCount) {
  return ((Number(value) || 0) % taskCount + taskCount) % taskCount;
}

function taskScheduleFor(runtime, taskCount) {
  const schedule = runtime?.taskSchedule;
  if (schedule?.schemaVersion === TASK_SCHEDULE_SCHEMA_VERSION) return schedule;
  const speaker = taskSpeaker(runtime);
  return {
    schemaVersion: TASK_SCHEDULE_SCHEMA_VERSION,
    startOffset: normalizedTaskOffset(runtime?.taskIndex - speaker.ordinal, taskCount),
    speakerProgress: {},
  };
}

function advanceTaskSchedule(runtime, task, taskCount) {
  const schedule = taskScheduleFor(runtime, taskCount);
  const speaker = taskSpeaker(runtime);
  const previous = schedule.speakerProgress?.[speaker.key] || {};
  const recentTaskIds = [
    ...(Array.isArray(previous.recentTaskIds) ? previous.recentTaskIds : []),
    task.id,
  ].slice(-Math.max(1, Math.min(8, taskCount)));
  return {
    ...schedule,
    speakerProgress: {
      ...schedule.speakerProgress,
      [speaker.key]: {
        completedCount: (Number(previous.completedCount) || 0) + 1,
        lastTaskId: task.id,
        recentTaskIds,
      },
    },
  };
}

function validateLearningPackRegistries(
  learningPack,
  interactionTemplates,
  evaluatorRegistry,
  interactionRenderers,
) {
  const errors = [];
  if (!interactionTemplates || typeof interactionTemplates !== "object") {
    errors.push("interactionTemplates registry is required");
  }
  if (!evaluatorRegistry || typeof evaluatorRegistry !== "object") {
    errors.push("evaluatorRegistry is required");
  }
  if (!interactionRenderers || typeof interactionRenderers !== "object") {
    errors.push("interactionRenderers registry is required");
  }

  for (const task of learningPack?.tasks || []) {
    const interactionRef = task.interactionTemplateRef;
    const interactionTemplate = interactionTemplates?.[interactionRef];
    if (interactionRef && !interactionTemplate) {
      errors.push(
        `task ${task.id || "unknown"} references unknown interaction template ${interactionRef}`,
      );
    } else if (interactionTemplate && !interactionTemplate.renderer) {
      errors.push(`interaction template ${interactionRef} is missing renderer`);
    } else if (
      interactionTemplate
      && typeof interactionRenderers?.[interactionTemplate.renderer] !== "function"
    ) {
      errors.push(
        `interaction template ${interactionRef} references unsupported renderer `
        + interactionTemplate.renderer,
      );
    }

    const evaluatorRef = task.evaluatorRef;
    if (evaluatorRef && !evaluatorRegistry?.[evaluatorRef]) {
      errors.push(
        `task ${task.id || "unknown"} references unknown evaluator ${evaluatorRef}`,
      );
    }
  }

  return errors;
}

function validateTeams(teams) {
  const errors = [];
  if (!Array.isArray(teams)) return ["teams must be an array"];
  if (teams.length < 1 || teams.length > 8) {
    errors.push("teams must contain between 1 and 8 teams");
  }

  const teamIds = new Set();
  let memberCount = 0;
  for (const team of teams) {
    if (typeof team?.id !== "string" || !team.id.trim()) {
      errors.push("each team must have a non-empty id");
    } else if (teamIds.has(team.id)) {
      errors.push(`teams contains duplicate id: ${team.id}`);
    } else {
      teamIds.add(team.id);
    }

    if (!Array.isArray(team?.members) || team.members.length < 1) {
      errors.push(`team ${team?.id || "unknown"} must contain at least 1 member`);
    } else {
      memberCount += team.members.length;
    }
  }

  if (memberCount < 1 || memberCount > 8) {
    errors.push("teams must contain between 1 and 8 members in total");
  }
  return errors;
}

export function createRuntime({
  mode = "voice",
  board,
  theme,
  learningPack,
  interactionTemplates,
  evaluatorRegistry,
  interactionRenderers,
  taskRandom = Math.random,
  teams = [
    { id: "player-mia", label: "Mia", members: ["Mia"] },
    { id: "player-leo", label: "Leo", members: ["Leo"] },
  ],
}) {
  const errors = [
    ...validateBoardTemplate(board),
    ...(mode === "teacher-led" ? [] : validateLearningPack(learningPack)),
    ...(mode === "teacher-led" ? [] : validateLearningPackRegistries(
      learningPack,
      interactionTemplates,
      evaluatorRegistry,
      interactionRenderers,
    )),
    ...validateTeams(teams),
  ];
  if (!theme?.id) errors.push("theme.id is required");
  for (const node of board?.nodes || []) {
    if (
      node.transportProfileRef
      && !theme?.transportSkins?.[node.transportProfileRef]
    ) {
      errors.push(
        `theme ${theme?.id || "unknown"} is missing transport skin ${node.transportProfileRef}`,
      );
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
  if (typeof taskRandom !== "function") throw new TypeError("taskRandom must be a function");
  const taskSample = Math.max(0, Math.min(0.999999, Number(taskRandom()) || 0));
  const taskStartOffset = mode === "teacher-led" ? 0 : Math.floor(taskSample * learningPack.tasks.length);

  return {
    schemaVersion: "prototype-1",
    boardId: board.id,
    themeId: theme.id,
    mode,
    learningPackId: mode === "teacher-led" ? null : learningPack.id,
    phase: "MISSION_PRESENT",
    round: 1,
    taskIndex: 0,
    taskSchedule: mode === "teacher-led" ? null : {
      schemaVersion: TASK_SCHEDULE_SCHEMA_VERSION,
      startOffset: taskStartOffset,
      speakerProgress: {},
    },
    activeTeamIndex: 0,
    acceptedCount: 0,
    lastDie: null,
    currentActivity: null,
    processedAttemptIds: [],
    mapState: {},
    teams: teams.map((team, index) => ({
      ...team,
      nodeId: board.startNodeId,
      coins: 0,
      speakerIndex: 0,
    })),
  };
}

export function currentTask(runtime, learningPack) {
  if (runtime.mode === "teacher-led") return null;
  if (!learningPack.tasks.length) throw new Error("learning pack has no tasks");
  const schedule = taskScheduleFor(runtime, learningPack.tasks.length);
  const speaker = taskSpeaker(runtime);
  const completedCount = Number(
    schedule.speakerProgress?.[speaker.key]?.completedCount,
  ) || 0;
  const taskIndex = normalizedTaskOffset(
    schedule.startOffset + speaker.ordinal + completedCount,
    learningPack.tasks.length,
  );
  return learningPack.tasks[taskIndex];
}

export function rollDie(random = Math.random) {
  const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return Math.floor(sample * DIE_SIDES) + 1;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function edgeIsAvailable(edge, mapState) {
  if (edge.availableWhen === undefined) return true;
  return (
    Object.hasOwn(mapState, edge.availableWhen.stateKey)
    && Object.is(
      mapState[edge.availableWhen.stateKey],
      edge.availableWhen.equals,
    )
  );
}

function createWalkGraph(board, startNodeId, steps, routeChoices, mapState) {
  if (!board || typeof board !== "object" || Array.isArray(board)) {
    throw new TypeError("board must be an object");
  }
  if (!Array.isArray(board.nodes)) {
    throw new TypeError("board.nodes must be an array");
  }
  if (!Array.isArray(board.edges)) {
    throw new TypeError("board.edges must be an array");
  }
  if (typeof startNodeId !== "string" || !startNodeId.trim()) {
    throw new TypeError("startNodeId must be a non-empty string");
  }
  if (!Number.isSafeInteger(steps) || steps < 0) {
    throw new TypeError("steps must be a non-negative safe integer");
  }
  assertPlainObject(routeChoices, "routeChoices");
  assertPlainObject(mapState, "mapState");

  const nodeIds = new Set();
  for (const node of board.nodes) {
    if (typeof node?.id !== "string" || !node.id.trim()) {
      throw new Error("every board node must have a non-empty string id");
    }
    if (nodeIds.has(node.id)) {
      throw new Error(`board contains duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  if (!nodeIds.has(startNodeId)) {
    throw new Error(`start node does not exist: ${startNodeId}`);
  }

  const edgeIds = new Set();
  const allOutgoingByNodeId = new Map(board.nodes.map((node) => [node.id, []]));
  for (const edge of board.edges) {
    if (typeof edge?.id !== "string" || !edge.id.trim()) {
      throw new Error("every board edge must have a non-empty string id");
    }
    if (edgeIds.has(edge.id)) {
      throw new Error(`board contains duplicate edge id: ${edge.id}`);
    }
    if (!nodeIds.has(edge.from)) {
      throw new Error(`edge ${edge.id} has unknown from node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`edge ${edge.id} has unknown to node: ${edge.to}`);
    }
    if (
      edge.order !== undefined
      && (!Number.isSafeInteger(edge.order) || edge.order < 0)
    ) {
      throw new Error(`edge ${edge.id} order must be a non-negative safe integer`);
    }
    if (edge.availableWhen !== undefined) {
      if (
        !edge.availableWhen
        || typeof edge.availableWhen !== "object"
        || Array.isArray(edge.availableWhen)
      ) {
        throw new Error(`edge ${edge.id} availableWhen must be an object`);
      }
      if (
        typeof edge.availableWhen.stateKey !== "string"
        || !edge.availableWhen.stateKey.trim()
      ) {
        throw new Error(
          `edge ${edge.id} availableWhen.stateKey must be a non-empty string`,
        );
      }
      if (
        !Object.hasOwn(edge.availableWhen, "equals")
        || edge.availableWhen.equals === undefined
      ) {
        throw new Error(`edge ${edge.id} availableWhen.equals is required`);
      }
    }
    edgeIds.add(edge.id);
    allOutgoingByNodeId.get(edge.from).push(edge);
  }
  for (const choices of allOutgoingByNodeId.values()) {
    choices.sort((left, right) => (left.order || 0) - (right.order || 0));
  }
  const outgoingByNodeId = new Map(
    [...allOutgoingByNodeId].map(([nodeId, choices]) => [
      nodeId,
      choices.filter((edge) => edgeIsAvailable(edge, mapState)),
    ]),
  );

  for (const [junctionNodeId, choice] of Object.entries(routeChoices)) {
    if (!nodeIds.has(junctionNodeId)) {
      throw new Error(`route choice references unknown node: ${junctionNodeId}`);
    }
    const allChoices = allOutgoingByNodeId.get(junctionNodeId);
    const choices = outgoingByNodeId.get(junctionNodeId);
    if (allChoices.length < 2) {
      throw new Error(`route choice node is not a junction: ${junctionNodeId}`);
    }
    if (typeof choice === "number") {
      if (
        !Number.isSafeInteger(choice)
        || choice < 0
        || choice >= choices.length
      ) {
        if (!choices.length) {
          throw new Error(`route choice node has no available edges: ${junctionNodeId}`);
        }
        throw new Error(
          `route choice index for ${junctionNodeId} must be between 0 and ${choices.length - 1}`,
        );
      }
    } else if (typeof choice === "string") {
      if (!choice.trim()) {
        throw new Error(`route choice edge id for ${junctionNodeId} must be non-empty`);
      }
      if (!allChoices.some((edge) => edge.id === choice)) {
        throw new Error(
          `route choice edge ${choice} is not outgoing from junction ${junctionNodeId}`,
        );
      }
      if (!choices.some((edge) => edge.id === choice)) {
        throw new Error(
          `route choice edge ${choice} is unavailable from junction ${junctionNodeId}`,
        );
      }
    } else {
      throw new TypeError(
        `route choice for ${junctionNodeId} must be an edge id or numeric index`,
      );
    }
  }

  return { outgoingByNodeId };
}

function selectedOutgoingEdge(choices, choice) {
  if (choice === undefined) {
    return choices.find((edge) => edge.availableWhen === undefined) || choices[0];
  }
  if (typeof choice === "string") {
    return choices.find((edge) => edge.id === choice);
  }
  return choices[choice];
}

export function walkBoardPlan(
  board,
  startNodeId,
  steps,
  routeChoices = {},
  mapState = {},
) {
  const { outgoingByNodeId } = createWalkGraph(
    board,
    startNodeId,
    steps,
    routeChoices,
    mapState,
  );
  const nodeIds = [];
  const edgeIds = [];
  let currentNodeId = startNodeId;
  for (let step = 0; step < steps; step += 1) {
    const choices = outgoingByNodeId.get(currentNodeId);
    if (!choices.length) break;
    const edge = selectedOutgoingEdge(
      choices,
      Object.hasOwn(routeChoices, currentNodeId)
        ? routeChoices[currentNodeId]
        : undefined,
    );
    currentNodeId = edge.to;
    edgeIds.push(edge.id);
    nodeIds.push(currentNodeId);
  }
  return { nodeIds, edgeIds };
}

export function walkBoard(
  board,
  startNodeId,
  steps,
  routeChoices = {},
  mapState = {},
) {
  return walkBoardPlan(
    board,
    startNodeId,
    steps,
    routeChoices,
    mapState,
  ).nodeIds;
}

export function findPendingRouteChoice(
  board,
  startNodeId,
  steps,
  routeChoices = {},
  mapState = {},
) {
  const { outgoingByNodeId } = createWalkGraph(
    board,
    startNodeId,
    steps,
    routeChoices,
    mapState,
  );
  const routeBeforeJunction = [];
  let currentNodeId = startNodeId;

  for (let step = 0; step < steps; step += 1) {
    const choices = outgoingByNodeId.get(currentNodeId);
    if (!choices.length) return null;

    const hasRouteChoice = Object.hasOwn(routeChoices, currentNodeId);
    if (choices.length > 1 && !hasRouteChoice) {
      const remainingSteps = steps - step;
      const options = choices.map((initialEdge, index) => {
        const routeNodeIds = [initialEdge.to];
        const edgeIds = [initialEdge.id];
        let previewNodeId = initialEdge.to;

        for (let previewStep = 1; previewStep < remainingSteps; previewStep += 1) {
          const previewChoices = outgoingByNodeId.get(previewNodeId);
          if (!previewChoices.length) break;
          const previewEdge = selectedOutgoingEdge(
            previewChoices,
            Object.hasOwn(routeChoices, previewNodeId)
              ? routeChoices[previewNodeId]
              : undefined,
          );
          edgeIds.push(previewEdge.id);
          routeNodeIds.push(previewEdge.to);
          previewNodeId = previewEdge.to;
        }

        return {
          edgeId: initialEdge.id,
          order: initialEdge.order ?? index,
          routeNodeIds,
          edgeIds,
          destinationNodeId: routeNodeIds.at(-1),
        };
      });

      return {
        junctionNodeId: currentNodeId,
        stepsBeforeJunction: step,
        remainingSteps,
        routeBeforeJunction: [...routeBeforeJunction],
        options,
      };
    }

    const edge = selectedOutgoingEdge(
      choices,
      hasRouteChoice ? routeChoices[currentNodeId] : undefined,
    );
    currentNodeId = edge.to;
    routeBeforeJunction.push(currentNodeId);
  }

  return null;
}

export function resolveActivity(task, activityTemplates, preferredTemplateId = null) {
  const bindings = task.activityBindings || [];
  const binding = preferredTemplateId
    ? bindings.find((candidate) => candidate.templateRef === preferredTemplateId)
    : bindings[0];
  if (!binding) return null;
  const template = activityTemplates[binding.templateRef];
  if (!template) throw new Error(`unknown activity template: ${binding.templateRef}`);
  return {
    templateId: template.id,
    renderer: template.renderer,
    phases: template.phases,
    materialTags: template.materialTags,
    content: binding.content,
  };
}

function assertExactObjectKeys(value, label, requiredKeys, optionalKeys = []) {
  assertPlainObject(value, label);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new TypeError(`${label} does not accept fields: ${unknownKeys.join(", ")}`);
  }
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (missingKeys.length) {
    throw new TypeError(`${label} is missing fields: ${missingKeys.join(", ")}`);
  }
}

function assertCanonicalString(value, label, { allowEmpty = false, maxLength } = {}) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must be canonical`);
  }
  if (!allowEmpty && !value) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters`);
  }
}

function resolveLandingActivity({
  landingActivityPolicy,
  landingNode,
  task: _task,
  activityTemplates: _activityTemplates,
}) {
  if (landingActivityPolicy === undefined) {
    return null;
  }

  assertExactObjectKeys(
    landingActivityPolicy,
    "landingActivityPolicy",
    ["mode", "nodeId"],
    ["event"],
  );
  if (!["inherit", "none", "event"].includes(landingActivityPolicy.mode)) {
    throw new Error("landingActivityPolicy.mode must be inherit, none, or event");
  }
  assertCanonicalString(landingActivityPolicy.nodeId, "landingActivityPolicy.nodeId");
  if (landingActivityPolicy.nodeId !== landingNode?.id) {
    throw new Error(
      `landingActivityPolicy.nodeId must match final landing: ${landingNode?.id || "unknown"}`,
    );
  }

  if (landingActivityPolicy.mode !== "event") {
    if (Object.hasOwn(landingActivityPolicy, "event")) {
      throw new TypeError(
        `landingActivityPolicy.event is not allowed in ${landingActivityPolicy.mode} mode`,
      );
    }
    return null;
  }

  if (!Object.hasOwn(landingActivityPolicy, "event")) {
    throw new TypeError("landingActivityPolicy is missing fields: event");
  }
  const event = landingActivityPolicy.event;
  assertExactObjectKeys(
    event,
    "landingActivityPolicy.event",
    ["eventId", "sourceTaskRef", "templateRef", "content"],
  );
  assertCanonicalString(event.eventId, "landingActivityPolicy.event.eventId");
  assertCanonicalString(event.sourceTaskRef, "landingActivityPolicy.event.sourceTaskRef");
  assertCanonicalString(event.templateRef, "landingActivityPolicy.event.templateRef");
  assertExactObjectKeys(
    event.content,
    "landingActivityPolicy.event.content",
    ["title", "instruction", "target"],
    ["challenge"],
  );
  assertCanonicalString(
    event.content.title,
    "landingActivityPolicy.event.content.title",
    { maxLength: 100 },
  );
  assertCanonicalString(
    event.content.instruction,
    "landingActivityPolicy.event.content.instruction",
    { maxLength: 500 },
  );
  assertCanonicalString(
    event.content.target,
    "landingActivityPolicy.event.content.target",
    { maxLength: 500 },
  );
  if (Object.hasOwn(event.content, "challenge")) {
    assertCanonicalString(
      event.content.challenge,
      "landingActivityPolicy.event.content.challenge",
      { allowEmpty: true, maxLength: 500 },
    );
  }
  if (!_activityTemplates[event.templateRef]) {
    throw new Error(`unknown activity template: ${event.templateRef}`);
  }

  // 2026-08-06 product decision: legacy event programs may still be read and
  // validated during migration, but final landing never starts a classroom
  // activity or a second voice/scoring flow.
  return null;
}

export function acceptAnswer(options) {
  if (options.runtime?.mode === "teacher-led") throw new Error("teacher mode requires a teacher move");
  return applyBoardMove(options, false);
}
export function rollTeacherMove(options) {
  if (options.runtime?.mode !== "teacher-led") throw new Error("teacher move requires teacher mode");
  return applyBoardMove(options, true);
}
function applyBoardMove({
  attemptId,
  runtime,
  board,
  learningPack,
  activityTemplates,
  landingActivityPolicy,
  dieValue = rollDie(),
  routeChoices = {},
  mapState,
  stopNodeId = null,
}, teacherMove) {
  if (typeof attemptId !== "string" || !attemptId.trim()) {
    throw new Error("attemptId must be a non-empty string");
  }
  const normalizedAttemptId = attemptId.trim();
  if ((runtime.processedAttemptIds || []).includes(normalizedAttemptId)) {
    return {
      runtime,
      effects: [],
      task: null,
      duplicate: true,
    };
  }

  if (runtime.phase !== "MISSION_PRESENT" && runtime.phase !== "LISTENING") {
    throw new Error(`answer cannot be accepted during ${runtime.phase}`);
  }

  const task = teacherMove ? null : currentTask(runtime, learningPack);
  const activeTeam = runtime.teams[runtime.activeTeamIndex];
  const activeMapState = mapState === undefined
    ? (runtime.mapState ?? {})
    : mapState;
  const plannedRoute = walkBoardPlan(
    board,
    activeTeam.nodeId,
    dieValue,
    routeChoices,
    activeMapState,
  );
  let route = plannedRoute.nodeIds;
  if (stopNodeId !== null && stopNodeId !== undefined) {
    if (typeof stopNodeId !== "string" || !stopNodeId.trim()) {
      throw new Error("stopNodeId must be a non-empty string");
    }
    const normalizedStopNodeId = stopNodeId.trim();
    const stopIndex = plannedRoute.nodeIds.indexOf(normalizedStopNodeId);
    if (stopIndex < 0 || stopIndex >= plannedRoute.nodeIds.length - 1) {
      throw new Error(
        `stopNodeId must be an early node in the planned route: ${normalizedStopNodeId}`,
      );
    }
    const stopNode = board.nodes.find((node) => node.id === normalizedStopNodeId);
    if (stopNode?.spaceRole === "transport") {
      throw new Error(`stopNodeId cannot be a transport node: ${normalizedStopNodeId}`);
    }
    route = plannedRoute.nodeIds.slice(0, stopIndex + 1);
  }
  const routeDestinationId = route.at(-1) || activeTeam.nodeId;
  const routeDestination = board.nodes.find((node) => node.id === routeDestinationId);
  const transportUnlocked = (
    routeDestination?.spaceRole === "transport"
    && (runtime.completedMoveCount ?? runtime.acceptedCount) >= (
      routeDestination.transportUnlockAfterCompletedTurns || 0
    )
  );
  const finalDestinationId = transportUnlocked
    ? routeDestination.transportTargetId
    : routeDestinationId;
  const landingNode = board.nodes.find((node) => node.id === finalDestinationId);
  const activity = teacherMove ? null : resolveLandingActivity({
    landingActivityPolicy,
    landingNode,
    task,
    activityTemplates,
  });

  const teams = runtime.teams.map((team, index) => {
    if (index !== runtime.activeTeamIndex) return team;
    return {
      ...team,
      nodeId: finalDestinationId,
      speakerIndex: (team.speakerIndex + 1) % Math.max(1, team.members.length),
    };
  });

  const nextTeamIndex = (runtime.activeTeamIndex + 1) % teams.length;
  const wrappedRound = nextTeamIndex === 0;
  const nextRuntime = {
    ...runtime,
    phase: activity ? "EVENT_ACTIVE" : "MISSION_PRESENT",
    teams,
    round: runtime.round + (wrappedRound ? 1 : 0),
    activeTeamIndex: nextTeamIndex,
    taskIndex: teacherMove ? 0 : (runtime.taskIndex + 1) % learningPack.tasks.length,
    taskSchedule: teacherMove ? null : advanceTaskSchedule(runtime, task, learningPack.tasks.length),
    acceptedCount: runtime.acceptedCount + (teacherMove ? 0 : 1),
    completedMoveCount: (runtime.completedMoveCount ?? runtime.acceptedCount) + 1,
    lastDie: dieValue,
    currentActivity: activity,
    mapState: { ...activeMapState },
    processedAttemptIds: [
      ...(runtime.processedAttemptIds || []),
      normalizedAttemptId,
    ].slice(-MAX_PROCESSED_ATTEMPTS),
  };

  // Local moves are single-die turns. Do not retain a previous dual result in
  // the next snapshot when the ordinary path follows a teacher double roll.
  delete nextRuntime.lastDoubleDice;

  const pendingEffects = [
    { type: teacherMove ? "teacher_move" : "answer_accepted", taskId: task?.id || null },
    { type: "dice_reveal", value: dieValue },
    ...route.map((nodeId, index) => ({ type: "pawn_step", nodeId, index })),
  ];
  if (transportUnlocked) {
    pendingEffects.push({
      type: "transport_move",
      actorTeamId: activeTeam.id,
      transportProfileRef: routeDestination.transportProfileRef,
      fromNodeId: routeDestination.id,
      toNodeId: routeDestination.transportTargetId,
      ...(Array.isArray(routeDestination.transportCaptureNodeIds)
        ? { captureNodeIds: [...routeDestination.transportCaptureNodeIds] }
        : {}),
    });
  }
  if (landingNode?.spaceRole === "map-effect") {
    pendingEffects.push({
      type: "map_effect",
      actorTeamId: activeTeam.id,
      mapEffectRef: landingNode.mapEffectRef,
      nodeId: landingNode.id,
    });
  }
  if (activity) {
    pendingEffects.push({
      type: "activity_open",
      templateId: activity.templateId,
      ...(activity.eventId
        ? {
          eventId: activity.eventId,
          sourceTaskRef: activity.sourceTaskRef,
        }
        : {}),
    });
  }
  const effects = pendingEffects.map((effect, index) => ({
    ...effect,
    effectId: `${normalizedAttemptId}:effect:${index + 1}`,
  }));

  return { runtime: nextRuntime, effects, task, duplicate: false };
}

function rejectUnknownWorldAnswerFields(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("acceptWorldAnswer options must be a plain object");
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("acceptWorldAnswer options must be a plain object");
  }
  const unknown = Object.keys(options).filter((key) => !WORLD_ANSWER_KEYS.has(key));
  if (unknown.length) {
    throw new TypeError(
      `acceptWorldAnswer does not accept fields: ${unknown.join(", ")}`,
    );
  }
}

function forbiddenWorldAnswerFields(value, path = "value", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => (
      forbiddenWorldAnswerFields(item, `${path}[${index}]`, found)
    ));
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (WORLD_ANSWER_FORBIDDEN_KEYS.has(key.toLowerCase())) {
      found.push(`${path}.${key}`);
    }
    forbiddenWorldAnswerFields(nested, `${path}.${key}`, found);
  }
  return found;
}

function validateWorldPlanForAnswer({
  attemptId,
  worldPlan,
  teacherMove = false,
}) {
  if (!worldPlan || typeof worldPlan !== "object" || Array.isArray(worldPlan)) {
    throw new TypeError("worldPlan must be a plain object");
  }
  const forbidden = forbiddenWorldAnswerFields(worldPlan, "worldPlan");
  if (forbidden.length) {
    throw new Error(
      `worldPlan contains forbidden score or transcript fields: ${forbidden.join(", ")}`,
    );
  }
  if (
    worldPlan.schemaVersion !== "world-move-plan.v1"
    || worldPlan.policy !== "shared-expedition-v1"
  ) {
    throw new Error("worldPlan must use world-move-plan.v1 and shared-expedition-v1");
  }
  if (worldPlan.id !== attemptId) {
    throw new Error("worldPlan.id must match attemptId");
  }
  const doubleSteps = doubleDiceSteps(worldPlan);
  if (hasDoubleDiceFields(worldPlan) && (!teacherMove || doubleSteps !== worldPlan.dieValue)) {
    throw new Error("double dice plans require a teacher move and two matching locked faces");
  }
  if (
    !Number.isSafeInteger(worldPlan.dieValue)
    || worldPlan.dieValue < 1
    || (worldPlan.dieValue > DIE_SIDES && (!teacherMove || doubleSteps !== worldPlan.dieValue))
    || worldPlan.stepsConsumed !== worldPlan.dieValue
  ) {
    throw new Error("worldPlan must consume one legal die value exactly");
  }
  if (!Array.isArray(worldPlan.effects)) {
    throw new Error("worldPlan.effects must be an array");
  }
  const pawnSteps = worldPlan.effects.filter((effect) => effect.type === "pawn_step");
  if (pawnSteps.length !== worldPlan.dieValue) {
    throw new Error("worldPlan must contain exactly one pawn_step per die step");
  }
  if (
    worldPlan.effects.some((effect) => (
      !["pawn_step", "world_transition", ...(Array.isArray(worldPlan.lapReturns) ? ["lap_return"] : [])].includes(effect?.type)
    ))
  ) {
    throw new Error("worldPlan may only contain movement and declared lap_return effects");
  }
  if (worldPlan.lapReturns !== undefined) {
    const returns = worldPlan.effects.filter((effect) => effect.type === "lap_return");
    if (!Array.isArray(worldPlan.lapReturns)
      || JSON.stringify(returns) !== JSON.stringify(worldPlan.lapReturns)
      || worldPlan.effects.some((effect) => effect.type === "world_transition")
      || worldPlan.startLocation?.worldRef !== worldPlan.finalLocation?.worldRef
      || worldPlan.startLocation?.worldInstanceId !== worldPlan.finalLocation?.worldInstanceId
      || worldPlan.startLocation?.worldOrdinal !== worldPlan.finalLocation?.worldOrdinal
      || returns.some((effect) => effect.policy !== "individual-laps-v1" || effect.zeroStepCost !== true
        || effect.worldRef !== worldPlan.startLocation?.worldRef
        || effect.worldInstanceId !== worldPlan.startLocation?.worldInstanceId
        || !effect.fromNodeId || !effect.toEntryNodeId || effect.toNodeId !== effect.toEntryNodeId)) {
      throw new Error("worldPlan lap_return effects must match the same-world circuit plan");
    }
  }
  if (
    pawnSteps.some((effect, index) => (
      effect.stepNumber !== index + 1
      || typeof effect.worldRef !== "string"
      || !effect.worldRef
      || typeof effect.worldInstanceId !== "string"
      || !effect.worldInstanceId
      || typeof effect.nodeId !== "string"
      || !effect.nodeId
    ))
  ) {
    throw new Error("worldPlan pawn steps must be ordered and world-scoped");
  }
  const transitions = worldPlan.effects.filter(
    (effect) => effect.type === "world_transition",
  );
  if (
    transitions.length > 1
    || transitions.some((effect) => (
      effect.zeroStepCost !== true
      || typeof effect.fromWorldRef !== "string"
      || !effect.fromWorldRef
      || typeof effect.toWorldRef !== "string"
      || !effect.toWorldRef
      || typeof effect.fromWorldInstanceId !== "string"
      || !effect.fromWorldInstanceId
      || typeof effect.toWorldInstanceId !== "string"
      || !effect.toWorldInstanceId
    ))
  ) {
    throw new Error("worldPlan may contain at most one zero-cost world transition");
  }
  if (
    !Array.isArray(worldPlan.transitions)
    || worldPlan.transitions.length > 1
    || worldPlan.transitions.length !== transitions.length
  ) {
    throw new Error(
      "worldPlan transitions must match its world_transition effects exactly",
    );
  }
  if (transitions.length) {
    const transition = transitions[0];
    const declaredTransition = worldPlan.transitions[0];
    for (const key of [
      "transitionId",
      "fromWorldRef",
      "fromWorldInstanceId",
      "fromWorldOrdinal",
      "fromNodeId",
      "toWorldRef",
      "toWorldInstanceId",
      "toWorldOrdinal",
      "toEntryNodeId",
    ]) {
      if (declaredTransition?.[key] !== transition[key]) {
        throw new Error(
          "worldPlan transitions must match its world_transition effects exactly",
        );
      }
    }
  }
  if (
    !worldPlan.startLocation
    || typeof worldPlan.startLocation.worldRef !== "string"
    || !worldPlan.startLocation.worldRef
    || typeof worldPlan.startLocation.worldInstanceId !== "string"
    || !worldPlan.startLocation.worldInstanceId
    || !Number.isSafeInteger(worldPlan.startLocation.worldOrdinal)
    || worldPlan.startLocation.worldOrdinal < 1
    || typeof worldPlan.startLocation.nodeId !== "string"
    || !worldPlan.startLocation.nodeId
  ) {
    throw new Error("worldPlan must contain one world-scoped startLocation");
  }
  if (
    !worldPlan.finalLocation
    || typeof worldPlan.finalLocation.worldRef !== "string"
    || !worldPlan.finalLocation.worldRef
    || typeof worldPlan.finalLocation.worldInstanceId !== "string"
    || !worldPlan.finalLocation.worldInstanceId
    || !Number.isSafeInteger(worldPlan.finalLocation.worldOrdinal)
    || worldPlan.finalLocation.worldOrdinal < 1
    || typeof worldPlan.finalLocation.nodeId !== "string"
    || !worldPlan.finalLocation.nodeId
  ) {
    throw new Error("worldPlan must contain one world-scoped finalLocation");
  }
}

function validateWorldPlanStartForAnswer({
  runtime,
  worldPlan,
  activeTeam,
}) {
  if (
    !worldPlan.startLocation
    || worldPlan.startLocation.worldRef !== runtime?.world?.active?.worldPackRef
    || worldPlan.startLocation.worldInstanceId !== runtime?.world?.active?.instanceId
    || worldPlan.startLocation.worldOrdinal !== runtime?.world?.active?.ordinal
    || worldPlan.startLocation.nodeId !== activeTeam?.nodeId
  ) {
    throw new Error("worldPlan start does not match the active team and world");
  }
}

function worldScopedEffect(effect, location) {
  return {
    ...effect,
    worldRef: location.worldRef,
    worldInstanceId: location.worldInstanceId,
  };
}

/**
 * Accepts one already-authorized answer against a precommitted WorldPlan.
 *
 * Scoring and transcript evidence are intentionally absent from this API.
 * They must have completed upstream before a legal die produced worldPlan.
 */
export function acceptWorldAnswer(options = {}) {
  if (options.runtime?.mode === "teacher-led") throw new Error("teacher mode requires a teacher world move");
  return applyWorldMove(options, false);
}
export function rollTeacherWorldMove(options) {
  if (options.runtime?.mode !== "teacher-led") throw new Error("teacher world move requires teacher mode");
  return applyWorldMove(options, true);
}
function applyWorldMove(options, teacherMove) {
  rejectUnknownWorldAnswerFields(options);
  const {
    attemptId,
    runtime,
    learningPack,
    activityTemplates,
    landingActivityPolicy,
    worldPlan,
    finalBoard,
    finalMapState = {},
  } = options;
  if (typeof attemptId !== "string" || !attemptId.trim()) {
    throw new Error("attemptId must be a non-empty string");
  }
  const normalizedAttemptId = attemptId.trim();
  if (attemptId !== normalizedAttemptId) {
    throw new Error("attemptId must be canonical");
  }
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new TypeError("runtime must be an object");
  }
  if (!Array.isArray(runtime.teams) || !runtime.teams.length) {
    throw new Error("runtime.teams must not be empty");
  }
  if (
    !Number.isSafeInteger(runtime.activeTeamIndex)
    || runtime.activeTeamIndex < 0
    || runtime.activeTeamIndex >= runtime.teams.length
  ) {
    throw new Error("runtime.activeTeamIndex is invalid");
  }
  if (!runtime.world || typeof runtime.world !== "object") {
    throw new Error("runtime.world is required");
  }
  const activeTeam = runtime.teams[runtime.activeTeamIndex];
  validateWorldPlanForAnswer({
    attemptId: normalizedAttemptId,
    worldPlan,
    teacherMove,
  });

  const forbiddenMapState = forbiddenWorldAnswerFields(
    finalMapState,
    "finalMapState",
  );
  if (forbiddenMapState.length) {
    throw new Error(
      `finalMapState contains forbidden score or transcript fields: `
      + forbiddenMapState.join(", "),
    );
  }
  assertPlainObject(finalMapState, "finalMapState");

  if ((runtime.processedAttemptIds || []).includes(normalizedAttemptId)) {
    return {
      runtime,
      effects: [],
      task: null,
      duplicate: true,
    };
  }
  validateWorldPlanStartForAnswer({
    runtime,
    worldPlan,
    activeTeam,
  });
  if (runtime.phase !== "MISSION_PRESENT" && runtime.phase !== "LISTENING") {
    throw new Error(`answer cannot be accepted during ${runtime.phase}`);
  }
  if (!teacherMove && (!learningPack || !Array.isArray(learningPack.tasks) || !learningPack.tasks.length)) {
    throw new Error("learningPack.tasks must not be empty");
  }
  if (!activityTemplates || typeof activityTemplates !== "object") {
    throw new Error("activityTemplates registry is required");
  }
  const finalBoardErrors = validateBoardTemplate(finalBoard);
  if (finalBoardErrors.length) {
    throw new Error(finalBoardErrors.join("; "));
  }
  const plannedLandingNode = finalBoard.nodes.find(
    (node) => node.id === worldPlan.finalLocation.nodeId,
  );
  if (!plannedLandingNode) {
    throw new Error(
      `worldPlan final node does not exist in finalBoard: `
      + worldPlan.finalLocation.nodeId,
    );
  }

  const committed = commitSharedExpedition({
    worldRuntime: runtime.world,
    teams: runtime.teams,
    activeTeamId: activeTeam.id,
    plan: worldPlan,
  });
  if (committed.duplicate) {
    return {
      runtime,
      effects: [],
      task: null,
      duplicate: true,
    };
  }

  const task = teacherMove ? null : currentTask(runtime, learningPack);
  const transportUnlocked = (
    plannedLandingNode.spaceRole === "transport"
    && (runtime.completedMoveCount ?? runtime.acceptedCount) >= (
      plannedLandingNode.transportUnlockAfterCompletedTurns || 0
    )
  );
  const finalDestinationId = transportUnlocked
    ? plannedLandingNode.transportTargetId
    : plannedLandingNode.id;
  const finalLandingNode = finalBoard.nodes.find(
    (node) => node.id === finalDestinationId,
  );
  if (!finalLandingNode) {
    throw new Error(`final destination does not exist in finalBoard: ${finalDestinationId}`);
  }
  const activity = teacherMove ? null : resolveLandingActivity({
    landingActivityPolicy,
    landingNode: finalLandingNode,
    task,
    activityTemplates,
  });

  const committedTeams = committed.teams.map((team) => {
    if (team.id !== activeTeam.id) return team;
    return {
      ...team,
      nodeId: finalDestinationId,
      speakerIndex: (
        (Number.isSafeInteger(team.speakerIndex) ? team.speakerIndex : 0) + 1
      ) % Math.max(1, team.members?.length || 1),
    };
  });
  const nextTeamIndex = (runtime.activeTeamIndex + 1) % committedTeams.length;
  const wrappedRound = nextTeamIndex === 0;
  const nextWorld = {
    ...committed.worldRuntime,
    active: {
      ...committed.worldRuntime.active,
      mapState: structuredClone(finalMapState),
    },
  };
  const nextRuntime = {
    ...runtime,
    phase: activity ? "EVENT_ACTIVE" : "MISSION_PRESENT",
    teams: committedTeams,
    world: nextWorld,
    round: runtime.round + (wrappedRound ? 1 : 0),
    activeTeamIndex: nextTeamIndex,
    taskIndex: teacherMove ? 0 : (runtime.taskIndex + 1) % learningPack.tasks.length,
    taskSchedule: teacherMove ? null : advanceTaskSchedule(runtime, task, learningPack.tasks.length),
    acceptedCount: runtime.acceptedCount + (teacherMove ? 0 : 1),
    completedMoveCount: (runtime.completedMoveCount ?? runtime.acceptedCount) + 1,
    lastDie: worldPlan.dieValue,
    ...(hasDoubleDiceFields(worldPlan) ? { lastDoubleDice: { dicePolicy: worldPlan.dicePolicy, faceIndices: [...worldPlan.faceIndices] } } : {}),
    currentActivity: activity,
    processedAttemptIds: [
      ...(runtime.processedAttemptIds || []),
      normalizedAttemptId,
    ].slice(-MAX_PROCESSED_ATTEMPTS),
  };

  if (!hasDoubleDiceFields(worldPlan)) delete nextRuntime.lastDoubleDice;

  const finalLocation = worldPlan.finalLocation;
  const effects = [
    {
      type: teacherMove ? "teacher_move" : "answer_accepted",
      effectId: `${normalizedAttemptId}:answer-accepted`,
      taskId: task?.id || null,
    },
    {
      type: "dice_reveal",
      effectId: `${normalizedAttemptId}:dice-reveal`,
      value: worldPlan.dieValue,
    },
    ...worldPlan.effects.map((effect) => structuredClone(effect)),
  ];
  if (transportUnlocked) {
    effects.push(worldScopedEffect({
      type: "transport_move",
      effectId: `${normalizedAttemptId}:final:transport`,
      actorTeamId: activeTeam.id,
      transportProfileRef: plannedLandingNode.transportProfileRef,
      fromNodeId: plannedLandingNode.id,
      toNodeId: finalDestinationId,
      ...(Array.isArray(plannedLandingNode.transportCaptureNodeIds)
        ? { captureNodeIds: [...plannedLandingNode.transportCaptureNodeIds] }
        : {}),
    }, finalLocation));
  }
  if (finalLandingNode.spaceRole === "map-effect") {
    effects.push(worldScopedEffect({
      type: "map_effect",
      effectId: `${normalizedAttemptId}:final:map-effect`,
      actorTeamId: activeTeam.id,
      mapEffectRef: finalLandingNode.mapEffectRef,
      nodeId: finalLandingNode.id,
    }, finalLocation));
  }
  if (activity) {
    effects.push(worldScopedEffect({
      type: "activity_open",
      effectId: `${normalizedAttemptId}:final:activity`,
      templateId: activity.templateId,
      nodeId: finalLandingNode.id,
      ...(activity.eventId
        ? {
          eventId: activity.eventId,
          sourceTaskRef: activity.sourceTaskRef,
        }
        : {}),
    }, finalLocation));
  }

  return { runtime: nextRuntime, effects, task, duplicate: false };
}

export function closeActivity(runtime) {
  return {
    ...runtime,
    phase: "MISSION_PRESENT",
    currentActivity: null,
  };
}
