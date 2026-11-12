export const AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION = (
  "voice-board-authoring-draft-envelope.v1"
);

const ENVELOPE_KEYS = Object.freeze([
  "draft",
  "schemaVersion",
  "sourceFingerprint",
  "sourceRevision",
]);

export class AuthoringDraftEnvelopeError extends Error {
  constructor(message, {
    code = "authoring_draft_envelope_invalid",
  } = {}) {
    super(message);
    this.name = "AuthoringDraftEnvelopeError";
    this.code = code;
  }
}

function invalid(message, options) {
  throw new AuthoringDraftEnvelopeError(message, options);
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalRevision(value) {
  if (value === null) return null;
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || !/^[a-zA-Z0-9._:-]+$/.test(value)
  ) {
    invalid("草稿来源 revision 无效");
  }
  return value;
}

function normalizedDraft(normalizeDraft, input) {
  let normalized;
  try {
    normalized = normalizeDraft(input);
  } catch (error) {
    invalid(error?.message || "本地编辑草稿无效");
  }
  if (!normalized) invalid("本地编辑草稿无效");
  return normalized;
}

export function authoringDraftFingerprint(value) {
  return `fnv1a64:${fnv1a64(stableJson(value))}`;
}

export function createAuthoringDraftEnvelope(draft, {
  sourceRevision = null,
  sourceValue,
} = {}) {
  return {
    schemaVersion: AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION,
    sourceRevision: canonicalRevision(sourceRevision),
    sourceFingerprint: authoringDraftFingerprint(sourceValue),
    draft: structuredClone(draft),
  };
}

export function looksLikeAuthoringDraftEnvelope(input) {
  return isPlainRecord(input) && (
    input.schemaVersion === AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION
    || Object.hasOwn(input, "sourceRevision")
    || Object.hasOwn(input, "sourceFingerprint")
    || Object.hasOwn(input, "draft")
  );
}

export function resolveAuthoringDraftRecord(input, {
  normalizeDraft,
  sourceRevision = null,
  sourceValue,
  draftsEqual = (left, right) => stableJson(left) === stableJson(right),
} = {}) {
  if (typeof normalizeDraft !== "function") {
    throw new TypeError("normalizeDraft must be a function");
  }
  const canonicalSourceRevision = canonicalRevision(sourceRevision);
  const canonicalSource = normalizedDraft(normalizeDraft, sourceValue);
  const expectedFingerprint = authoringDraftFingerprint(canonicalSource);

  if (looksLikeAuthoringDraftEnvelope(input)) {
    if (
      !hasExactKeys(input, ENVELOPE_KEYS)
      || input.schemaVersion !== AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION
      || !/^fnv1a64:[a-f0-9]{16}$/.test(String(input.sourceFingerprint || ""))
    ) {
      invalid("本地编辑草稿 envelope 无效");
    }
    const envelopeRevision = canonicalRevision(input.sourceRevision);
    if (
      envelopeRevision !== canonicalSourceRevision
      || input.sourceFingerprint !== expectedFingerprint
    ) {
      invalid("本地编辑草稿的来源发布版本已过期", {
        code: "authoring_draft_source_conflict",
      });
    }
    const draft = normalizedDraft(normalizeDraft, input.draft);
    return {
      draft,
      envelope: createAuthoringDraftEnvelope(draft, {
        sourceRevision: canonicalSourceRevision,
        sourceValue: canonicalSource,
      }),
      migratedLegacy: false,
    };
  }

  const legacyDraft = normalizedDraft(normalizeDraft, input);
  if (!draftsEqual(legacyDraft, canonicalSource)) {
    invalid("旧格式草稿没有来源 revision，不能自动归属当前发布版", {
      code: "authoring_draft_legacy_unattributed",
    });
  }
  return {
    draft: legacyDraft,
    envelope: createAuthoringDraftEnvelope(legacyDraft, {
      sourceRevision: canonicalSourceRevision,
      sourceValue: canonicalSource,
    }),
    migratedLegacy: true,
  };
}

export function authoringDraftEnvelopeMatchesSource(envelope, {
  sourceRevision = null,
  sourceValue,
} = {}) {
  try {
    if (!hasExactKeys(envelope, ENVELOPE_KEYS)) return false;
    return (
      envelope.schemaVersion === AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION
      && canonicalRevision(envelope.sourceRevision) === canonicalRevision(sourceRevision)
      && envelope.sourceFingerprint === authoringDraftFingerprint(sourceValue)
    );
  } catch {
    return false;
  }
}
