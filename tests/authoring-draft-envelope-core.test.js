import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION,
  AuthoringDraftEnvelopeError,
  authoringDraftEnvelopeMatchesSource,
  authoringDraftFingerprint,
  createAuthoringDraftEnvelope,
  resolveAuthoringDraftRecord,
} from "../public/prototypes/universal-board/authoring-draft-envelope-core.js";

function normalizeDraft(input) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || !Number.isInteger(input.value)
  ) {
    throw new Error("draft invalid");
  }
  return { value: input.value };
}

test("an envelope pins a draft to both the publication revision and content fingerprint", () => {
  const source = { value: 1 };
  const envelope = createAuthoringDraftEnvelope({ value: 2 }, {
    sourceRevision: "revision-1",
    sourceValue: source,
  });

  assert.deepEqual(Object.keys(envelope).sort(), [
    "draft",
    "schemaVersion",
    "sourceFingerprint",
    "sourceRevision",
  ]);
  assert.equal(envelope.schemaVersion, AUTHORING_DRAFT_ENVELOPE_SCHEMA_VERSION);
  assert.equal(envelope.sourceRevision, "revision-1");
  assert.equal(envelope.sourceFingerprint, authoringDraftFingerprint(source));
  assert.equal(authoringDraftEnvelopeMatchesSource(envelope, {
    sourceRevision: "revision-1",
    sourceValue: source,
  }), true);

  const resolved = resolveAuthoringDraftRecord(envelope, {
    normalizeDraft,
    sourceRevision: "revision-1",
    sourceValue: source,
  });
  assert.deepEqual(resolved.draft, { value: 2 });
  assert.equal(resolved.migratedLegacy, false);
});

test("same revision with changed published content still fails closed by fingerprint", () => {
  const envelope = createAuthoringDraftEnvelope({ value: 3 }, {
    sourceRevision: "revision-1",
    sourceValue: { value: 1 },
  });
  assert.throws(
    () => resolveAuthoringDraftRecord(envelope, {
      normalizeDraft,
      sourceRevision: "revision-1",
      sourceValue: { value: 2 },
    }),
    (error) => (
      error instanceof AuthoringDraftEnvelopeError
      && error.code === "authoring_draft_source_conflict"
    ),
  );
});

test("a changed publication revision rejects the complete stale local draft", () => {
  const envelope = createAuthoringDraftEnvelope({ value: 3 }, {
    sourceRevision: "revision-1",
    sourceValue: { value: 1 },
  });
  assert.throws(
    () => resolveAuthoringDraftRecord(envelope, {
      normalizeDraft,
      sourceRevision: "revision-2",
      sourceValue: { value: 1 },
    }),
    (error) => (
      error instanceof AuthoringDraftEnvelopeError
      && error.code === "authoring_draft_source_conflict"
    ),
  );
});

test("legacy records migrate only when their content already equals the publication", () => {
  const source = { value: 4 };
  const resolved = resolveAuthoringDraftRecord({ value: 4 }, {
    normalizeDraft,
    sourceRevision: "revision-4",
    sourceValue: source,
  });
  assert.equal(resolved.migratedLegacy, true);
  assert.equal(resolved.envelope.sourceRevision, "revision-4");
  assert.equal(
    resolved.envelope.sourceFingerprint,
    authoringDraftFingerprint(source),
  );

  assert.throws(
    () => resolveAuthoringDraftRecord({ value: 3 }, {
      normalizeDraft,
      sourceRevision: "revision-4",
      sourceValue: source,
    }),
    (error) => (
      error instanceof AuthoringDraftEnvelopeError
      && error.code === "authoring_draft_legacy_unattributed"
    ),
  );
});

test("unknown envelope fields and malformed drafts never fall back to legacy", () => {
  const envelope = createAuthoringDraftEnvelope({ value: 2 }, {
    sourceRevision: null,
    sourceValue: { value: 1 },
  });
  envelope.extra = true;
  assert.throws(
    () => resolveAuthoringDraftRecord(envelope, {
      normalizeDraft,
      sourceRevision: null,
      sourceValue: { value: 1 },
    }),
    (error) => error instanceof AuthoringDraftEnvelopeError,
  );
  assert.throws(
    () => resolveAuthoringDraftRecord({ nope: true }, {
      normalizeDraft,
      sourceRevision: null,
      sourceValue: { value: 1 },
    }),
    (error) => error instanceof AuthoringDraftEnvelopeError,
  );
});

test("fingerprints are canonical across object-key insertion order", () => {
  assert.equal(
    authoringDraftFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    authoringDraftFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
  );
});
