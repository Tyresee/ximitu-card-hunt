import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASSROOM_EVENT_PROGRAM_CATALOG,
  CLASSROOM_EVENT_PROGRAM_LEARNING_REFS,
  CLASSROOM_EVENT_PROGRAM_WORLD_REFS,
  ClassroomEventProgramValidationError,
  DEFAULT_CLASSROOM_EVENT_PROGRAM,
  classroomEvent,
  classroomEventAssignment,
  classroomEventChangedCount,
  classroomEventProgramsEqual,
  cloneClassroomEventProgram,
  learningPackRefFor,
  normalizeClassroomEventProgram,
  updateClassroomEventAssignment,
} from "../public/prototypes/universal-board/classroom-event-program-core.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  CLOUD_HARBOR_WORLD_REF,
} from "../public/prototypes/universal-board/world-packs.js";

function firstEventRef(learningRef) {
  return CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef].events[0].eventRef;
}

test("the default ClassroomEventProgram freezes all task activities and all 492 assignments", () => {
  const normalized = normalizeClassroomEventProgram(
    DEFAULT_CLASSROOM_EVENT_PROGRAM,
  );
  assert.deepEqual(
    Object.keys(normalized.learningPacks),
    CLASSROOM_EVENT_PROGRAM_LEARNING_REFS,
  );
  assert.deepEqual(CLASSROOM_EVENT_PROGRAM_WORLD_REFS, [
    CLOUD_HARBOR_WORLD_REF,
    BEYOND_CLOUD_WORLD_REF,
  ]);

  const expectedEventCounts = [12, 2, 2, 2];
  let assignmentCount = 0;
  CLASSROOM_EVENT_PROGRAM_LEARNING_REFS.forEach((learningRef, learningIndex) => {
    const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef];
    assert.equal(catalog.events.length, expectedEventCounts[learningIndex]);
    assert.deepEqual(
      Object.keys(normalized.learningPacks[learningRef].events),
      catalog.events.map(({ eventRef }) => eventRef),
    );
    catalog.events.forEach((event) => {
      assert.match(event.eventRef, new RegExp(`^${learningRef.replaceAll(".", "\\.")}#`));
      assert.match(event.sourceTaskRef, new RegExp(`^${learningRef.replaceAll(".", "\\.")}#`));
      assert.match(event.sourceHash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(typeof event.templateRef, "string");
      assert.equal(typeof event.content.title, "string");
      assert.equal(typeof event.content.instruction, "string");
      assert.equal(typeof event.content.target, "string");
    });

    assert.deepEqual(
      Object.keys(normalized.learningPacks[learningRef].worlds),
      CLASSROOM_EVENT_PROGRAM_WORLD_REFS,
    );
    CLASSROOM_EVENT_PROGRAM_WORLD_REFS.forEach((worldRef) => {
      const catalogWorld = catalog.worlds[worldRef];
      const assignments = normalized.learningPacks[learningRef]
        .worlds[worldRef].assignments;
      assignmentCount += Object.keys(assignments).length;
      assert.deepEqual(
        Object.keys(assignments),
        catalogWorld.nodes.map(({ nodeId }) => nodeId),
      );
      catalogWorld.nodes.forEach(({ nodeId }) => {
        assert.deepEqual(assignments[nodeId], {
          mode: "inherit",
          eventRef: "",
        });
      });
    });
  });
  assert.equal(assignmentCount, 4 * (61 + 62));
  assert.equal(classroomEventChangedCount(normalized), 0);
});

test("catalog locks only transport and world-transition landings", () => {
  const learningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
  const catalog = CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef];
  assert.deepEqual(
    catalog.worlds[CLOUD_HARBOR_WORLD_REF].nodes
      .filter(({ editable }) => !editable)
      .map(({ nodeId }) => nodeId),
    ["n49"],
  );
  assert.deepEqual(
    catalog.worlds[BEYOND_CLOUD_WORLD_REF].nodes
      .filter(({ editable }) => !editable)
      .map(({ nodeId }) => nodeId),
    ["w2n06a", "w2n20a", "w2n52"],
  );
  for (const worldRef of CLASSROOM_EVENT_PROGRAM_WORLD_REFS) {
    for (const node of catalog.worlds[worldRef].nodes) {
      assert.equal(node.editable, node.lockReason === "");
      if (!node.editable) assert.ok(node.lockReason.length > 0);
    }
  }
});

test("editable ordinary and fixed-map nodes can append or suppress a frozen classroom event", () => {
  const learningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
  const eventRef = firstEventRef(learningRef);
  const appended = updateClassroomEventAssignment(
    DEFAULT_CLASSROOM_EVENT_PROGRAM,
    learningRef,
    CLOUD_HARBOR_WORLD_REF,
    "n05b",
    { mode: "event", eventRef },
  );
  assert.deepEqual(
    classroomEventAssignment(
      appended,
      learningRef,
      CLOUD_HARBOR_WORLD_REF,
      "n05b",
    ),
    { mode: "event", eventRef },
  );
  assert.deepEqual(
    classroomEvent(appended, learningRef, eventRef),
    CLASSROOM_EVENT_PROGRAM_CATALOG[learningRef].eventByRef[eventRef],
  );
  assert.equal(classroomEventChangedCount(appended), 1);

  const suppressed = updateClassroomEventAssignment(
    appended,
    learningRef,
    BEYOND_CLOUD_WORLD_REF,
    "w2n03",
    { mode: "none" },
  );
  assert.deepEqual(
    classroomEventAssignment(
      suppressed,
      learningRef,
      BEYOND_CLOUD_WORLD_REF,
      "w2n03",
    ),
    { mode: "none", eventRef: "" },
  );
  assert.equal(classroomEventChangedCount(suppressed), 2);
});

test("transport, portal, goal, and world-transition assignments must stay inherited", () => {
  const learningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
  const eventRef = firstEventRef(learningRef);
  const lockedNodes = [
    [CLOUD_HARBOR_WORLD_REF, "n49"],
    [BEYOND_CLOUD_WORLD_REF, "w2n06a"],
    [BEYOND_CLOUD_WORLD_REF, "w2n20a"],
    [BEYOND_CLOUD_WORLD_REF, "w2n52"],
  ];
  for (const [worldRef, nodeId] of lockedNodes) {
    assert.throws(
      () => updateClassroomEventAssignment(
        DEFAULT_CLASSROOM_EVENT_PROGRAM,
        learningRef,
        worldRef,
        nodeId,
        { mode: "event", eventRef },
      ),
      (error) => (
        error instanceof ClassroomEventProgramValidationError
        && error.code === "classroom_event_program_invalid"
        && error.statusCode === 422
      ),
    );
  }
});

test("strict validation rejects altered pools, incomplete coverage, unsafe fields, and cross-pack refs", () => {
  const learningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[0];
  const otherLearningRef = CLASSROOM_EVENT_PROGRAM_LEARNING_REFS[1];
  const eventRef = firstEventRef(learningRef);
  const otherEventRef = firstEventRef(otherLearningRef);
  const invalidCases = [];

  const omittedLearning = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  delete omittedLearning.learningPacks[learningRef];
  invalidCases.push(omittedLearning);

  const omittedEvent = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  delete omittedEvent.learningPacks[learningRef].events[eventRef];
  invalidCases.push(omittedEvent);

  const alteredEvent = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  alteredEvent.learningPacks[learningRef].events[eventRef].content.title = "伪造活动";
  invalidCases.push(alteredEvent);

  const unsafeEvent = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  unsafeEvent.learningPacks[learningRef].events[eventRef].score = 100;
  invalidCases.push(unsafeEvent);

  const unsafeContent = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  unsafeContent.learningPacks[learningRef].events[eventRef].content.html = "<b>x</b>";
  invalidCases.push(unsafeContent);

  const omittedNode = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  delete omittedNode.learningPacks[learningRef]
    .worlds[CLOUD_HARBOR_WORLD_REF].assignments.n01;
  invalidCases.push(omittedNode);

  const crossPackRef = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  crossPackRef.learningPacks[learningRef]
    .worlds[CLOUD_HARBOR_WORLD_REF].assignments.n01 = {
      mode: "event",
      eventRef: otherEventRef,
    };
  invalidCases.push(crossPackRef);

  const staleRef = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  staleRef.learningPacks[learningRef]
    .worlds[CLOUD_HARBOR_WORLD_REF].assignments.n01 = {
      mode: "inherit",
      eventRef,
    };
  invalidCases.push(staleRef);

  const movement = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  movement.learningPacks[learningRef]
    .worlds[CLOUD_HARBOR_WORLD_REF].assignments.n01 = {
      mode: "none",
      eventRef: "",
      steps: 6,
    };
  invalidCases.push(movement);

  const scoreThreshold = structuredClone(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  scoreThreshold.scoreThreshold = 60;
  invalidCases.push(scoreThreshold);

  invalidCases.forEach((candidate) => {
    assert.throws(
      () => normalizeClassroomEventProgram(candidate),
      (error) => (
        error.code === "classroom_event_program_invalid"
        && error.statusCode === 422
      ),
    );
  });
});

test("clone, equality, and LearningPack ref helpers stay canonical", () => {
  const cloned = cloneClassroomEventProgram(DEFAULT_CLASSROOM_EVENT_PROGRAM);
  assert.notEqual(cloned, DEFAULT_CLASSROOM_EVENT_PROGRAM);
  assert.ok(classroomEventProgramsEqual(cloned, DEFAULT_CLASSROOM_EVENT_PROGRAM));
  assert.equal(learningPackRefFor("family-have-has", "0.1.0"), (
    "family-have-has@0.1.0"
  ));
  assert.equal(learningPackRefFor({ id: "science", version: "0.1.0" }), (
    "science@0.1.0"
  ));
  assert.throws(
    () => learningPackRefFor("family-have-has", "latest"),
    /LearningPack ref/,
  );
});
