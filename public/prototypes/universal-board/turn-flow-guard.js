const TURN_CONTEXT_FIELDS = Object.freeze([
  "gameSessionId",
  "turnId",
  "learningPackId",
  "learningPackVersion",
  "taskId",
]);

const DEFAULT_SCORED_SOURCES = Object.freeze(["aliyun-ssecp"]);
const DEFAULT_TEACHER_REVIEW_SOURCES = Object.freeze([
  "aliyun-ssecp",
  "browser-speech-teacher-review",
]);

function nonEmptyString(value, label) {
  if (
    typeof value !== "string"
    || !value
    || value !== value.trim()
    || value.length > 128
  ) {
    throw new Error(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function sourceSet(value, fallback, label) {
  const input = value === undefined ? fallback : value;
  if (
    !input
    || typeof input === "string"
    || typeof input[Symbol.iterator] !== "function"
  ) {
    throw new Error(`${label} must be an iterable of source names`);
  }
  const sources = new Set();
  for (const source of input) {
    sources.add(nonEmptyString(source, `${label} source`));
  }
  if (!sources.size) {
    throw new Error(`${label} must contain at least one source`);
  }
  return sources;
}

function boundContext(value) {
  if (!value || typeof value !== "object") {
    throw new Error("turn context is required");
  }
  return Object.freeze(Object.fromEntries(
    TURN_CONTEXT_FIELDS.map((field) => [
      field,
      nonEmptyString(value[field], `turn context ${field}`),
    ]),
  ));
}

function assertDecisionContext(decision, context) {
  for (const field of TURN_CONTEXT_FIELDS) {
    if (decision?.[field] !== context[field]) {
      throw new Error(`assessment decision ${field} does not match the turn context`);
    }
  }
}

function contextsMatch(left, right) {
  return TURN_CONTEXT_FIELDS.every((field) => left[field] === right[field]);
}

function assertAllowedSource({
  source,
  allowedSources,
  qaSource,
  allowQa,
  label,
}) {
  const normalizedSource = nonEmptyString(source, `${label} source`);
  if (normalizedSource === qaSource) {
    if (allowQa !== true) {
      throw new Error(`${label} QA source is not enabled`);
    }
    return;
  }
  if (!allowedSources.has(normalizedSource)) {
    throw new Error(`${label} source is not allowed`);
  }
}

function cloneAndFreeze(value) {
  let cloned;
  try {
    cloned = structuredClone(value);
  } catch {
    throw new Error("assessment decision must be cloneable");
  }

  const visited = new WeakSet();
  function freezeRecursively(item) {
    if (!item || typeof item !== "object" || visited.has(item)) return item;
    visited.add(item);
    for (const key of Reflect.ownKeys(item)) {
      freezeRecursively(item[key]);
    }
    return Object.freeze(item);
  }
  return freezeRecursively(cloned);
}

/**
 * Creates an isolated issuer/consumer pair for formal board-turn commands.
 *
 * The object returned by either issue method is deliberately opaque. Only this
 * guard instance can consume it, and a command is invalidated on its first
 * consume attempt.
 */
export function createTurnFlowGuard({
  scoredSources,
  teacherReviewSources,
  qaSource = "qa-harness",
} = {}) {
  const allowedScoredSources = sourceSet(
    scoredSources,
    DEFAULT_SCORED_SOURCES,
    "scoredSources",
  );
  const allowedTeacherReviewSources = sourceSet(
    teacherReviewSources,
    DEFAULT_TEACHER_REVIEW_SOURCES,
    "teacherReviewSources",
  );
  const normalizedQaSource = nonEmptyString(qaSource, "qaSource");
  const issuedCommands = new WeakSet();
  const commandRecords = new WeakMap();

  function issueCommand(context, payload) {
    const command = Object.freeze(Object.create(null));
    issuedCommands.add(command);
    commandRecords.set(command, { context, payload });
    return command;
  }

  function issueScoredTurnCommand({
    context: contextValue,
    decision,
    allowQa = false,
  } = {}) {
    const context = boundContext(contextValue);
    if (!decision || typeof decision !== "object") {
      throw new Error("accepted assessment decision is required");
    }
    assertDecisionContext(decision, context);
    if (decision.result !== "accepted") {
      throw new Error("scored turn requires an accepted assessment result");
    }
    if (decision.valid !== true) {
      throw new Error("scored turn requires a valid assessment result");
    }
    const attemptId = nonEmptyString(
      decision.attemptId,
      "assessment decision attemptId",
    );
    if (
      typeof decision.score !== "number"
      || !Number.isFinite(decision.score)
      || decision.score < 0
      || decision.score > 100
    ) {
      throw new Error("scored turn requires a finite score from 0 to 100");
    }
    assertAllowedSource({
      source: decision.source,
      allowedSources: allowedScoredSources,
      qaSource: normalizedQaSource,
      allowQa,
      label: "scored turn",
    });

    if (
      decision.assessmentPolicy
      && decision.resultContractVersion !== "voice-board-assessment-result.v3"
    ) {
      throw new Error("policy-scored turns require the current result contract");
    }
    const knowledgeCorrect = (
      decision.primaryAccepted === true
      && decision.knowledgeStatus === "correct"
    );
    const knowledgeWrong = (
      decision.primaryAccepted === false
      && decision.knowledgeStatus === "wrong"
    );
    if (!knowledgeCorrect && !knowledgeWrong) {
      throw new Error(
        "scored turns require a consistent protected knowledge decision",
      );
    }
    if (knowledgeWrong && decision.score !== 45) {
      throw new Error("knowledge-wrong turns require the fixed score of 45");
    }
    const resolution = knowledgeWrong
      ? "knowledge_wrong_low_score"
      : "primary_accepted";
    const triggerReason = knowledgeWrong
      ? "knowledge_wrong_low_score"
      : "aliyun_sentence_score";
    const speechDecision = cloneAndFreeze(decision);
    const payload = Object.freeze({
      kind: "scored",
      context,
      attemptId,
      resolution,
      triggerReason,
      speechDecision,
    });
    return issueCommand(context, payload);
  }

  function issueTeacherTurnCommand({
    context: contextValue,
    decision,
    allowQa = false,
  } = {}) {
    const context = boundContext(contextValue);
    if (!decision || typeof decision !== "object") {
      throw new Error("teacher-review assessment decision is required");
    }
    assertDecisionContext(decision, context);
    if (decision.result !== "teacher_review") {
      throw new Error("teacher turn requires a teacher_review result");
    }
    if (decision.score !== null && decision.score !== undefined) {
      throw new Error("teacher turn cannot contain an assessment score");
    }
    const attemptId = nonEmptyString(
      decision.attemptId,
      "teacher-review decision attemptId",
    );
    assertAllowedSource({
      source: decision.source,
      allowedSources: allowedTeacherReviewSources,
      qaSource: normalizedQaSource,
      allowQa,
      label: "teacher turn",
    });

    const speechDecision = cloneAndFreeze(decision);
    const payload = Object.freeze({
      kind: "teacher",
      context,
      attemptId,
      resolution: "teacher_pass",
      triggerReason: "teacher_pass",
      speechDecision,
    });
    return issueCommand(context, payload);
  }

  function consumeTurnCommand(command, { context: contextValue } = {}) {
    if (
      !command
      || typeof command !== "object"
      || !issuedCommands.has(command)
    ) {
      throw new Error("turn command is forged, foreign, or already consumed");
    }

    const record = commandRecords.get(command);
    issuedCommands.delete(command);
    commandRecords.delete(command);
    const context = boundContext(contextValue);
    if (!record || !contextsMatch(record.context, context)) {
      throw new Error("turn command is stale for the current turn context");
    }
    return record.payload;
  }

  return Object.freeze({
    issueScoredTurnCommand,
    issueTeacherTurnCommand,
    consumeTurnCommand,
  });
}
