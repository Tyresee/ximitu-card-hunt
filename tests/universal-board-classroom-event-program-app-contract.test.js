import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL(
  "../public/prototypes/universal-board/app.js",
  import.meta.url,
), "utf8");
const htmlSource = readFileSync(new URL(
  "../public/prototypes/universal-board/index.html",
  import.meta.url,
), "utf8");

function topLevelFunctionSource(functionName) {
  const declaration = new RegExp(
    `^(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
    "m",
  );
  const match = declaration.exec(appSource);
  assert.ok(match, `expected app.js to declare ${functionName}()`);
  const remainder = appSource.slice(match.index);
  const nextLine = remainder.indexOf("\n") + 1;
  const nextDeclaration = remainder.slice(nextLine).search(
    /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m,
  );
  return nextDeclaration < 0
    ? remainder
    : remainder.slice(0, nextLine + nextDeclaration);
}

function elementOpeningTag(id) {
  const match = new RegExp(`<[^>]+id="${id}"[^>]*>`, "m").exec(htmlSource);
  assert.ok(match, `expected #${id}`);
  return match[0];
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

test("the legacy classroom-event editor tab and panel are permanently hidden", () => {
  assert.match(elementOpeningTag("layout-editor-event-tab"), /\shidden(?:\s|>)/);
  assert.match(elementOpeningTag("layout-editor-event-section"), /\shidden(?:\s|>)/);
  assert.match(elementOpeningTag("classroom-event-editor-save"), /\sdisabled(?:\s|>)/);

  const tabs = topLevelFunctionSource("setLayoutEditorTab");
  assert.match(tabs, /\["nodes", "dice", "codex"\]/);
  assert.doesNotMatch(tabs, /pane === "events"/);
  assert.match(tabs, /layoutEditorEventTab\.setAttribute\("aria-selected", "false"\)/);
  assert.match(tabs, /layoutEditorEventTab\.tabIndex = -1/);
  assert.match(tabs, /layoutEditorEventSection\.hidden = true/);
  assert.doesNotMatch(appSource, /layoutEditorEventTab\.addEventListener/);
});

test("the app may read the historical registry but has no classroom-event publication path", () => {
  const load = topLevelFunctionSource("loadPublishedClassroomEventProgram");
  assert.match(load, /fetch\("\/api\/classroom-event-programs\/v1", \{/);
  assert.match(load, /cache: "no-store"/);
  assert.match(load, /applyClassroomEventProgramRegistryPayload/);

  assert.doesNotMatch(appSource, /\/api\/admin\/classroom-event-programs\/v1/);
  assert.doesNotMatch(appSource, /publishClassroomEventEditorDraft/);
});

test("new sessions never create or persist a classroom-event snapshot", () => {
  const start = topLevelFunctionSource("startLocalSession");
  assert.match(start, /sessionClassroomEventProgramSnapshot = null/);
  assert.doesNotMatch(start, /createSessionClassroomEventProgramSnapshot/);

  const continueSession = topLevelFunctionSource("continueExpeditionSession");
  assert.doesNotMatch(continueSession, /createSessionClassroomEventProgramSnapshot/);

  const saved = topLevelFunctionSource("savedSessionPayload");
  assert.match(saved, /\.\.\.\(sessionClassroomEventProgramSnapshot/);
  assert.doesNotMatch(saved, /createSessionClassroomEventProgramSnapshot/);

  const restore = topLevelFunctionSource("restoreLocalSession");
  assert.match(
    restore,
    /sessionClassroomEventProgramSnapshot = normalizeSessionClassroomEventProgramSnapshot\(/,
  );
  assert.doesNotMatch(
    restore,
    /normalizeSessionClassroomEventProgramSnapshot\([\s\S]*?\)\s*\|\|\s*createSessionClassroomEventProgramSnapshot/,
  );
});

test("ordinary and cross-world answer paths never receive a landing activity policy", () => {
  const acceptedTurn = topLevelFunctionSource("runBoardTurn");
  assert.equal(occurrenceCount(acceptedTurn, "(teacherMove ? rollTeacherWorldMove : acceptWorldAnswer)({"), 1);
  assert.equal(occurrenceCount(acceptedTurn, "(teacherMove ? rollTeacherMove : acceptAnswer)({"), 1);
  assert.doesNotMatch(
    acceptedTurn,
    /landingActivityPolicy|classroomEventLandingPolicy|currentClassroomEventProgram/,
  );
  assert.doesNotMatch(appSource, /function classroomEventLandingPolicy\s*\(/);
});
