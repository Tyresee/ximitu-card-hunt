import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL(
  "../public/prototypes/universal-board/app.js",
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

test("stale or unattributed drafts are backed up before a safe latest-source envelope replaces them", () => {
  const quarantine = topLevelFunctionSource("quarantineLocalAuthoringDraft");
  const backupWrite = quarantine.indexOf("localStorage.setItem(staleKey, raw);");
  const backupVerify = quarantine.indexOf("localStorage.getItem(staleKey) !== raw");
  const safeReplacement = quarantine.indexOf(
    "localStorage.setItem(storageKey, JSON.stringify(safeEnvelope));",
  );
  assert.ok(backupWrite >= 0, "the raw stale draft must be archived");
  assert.ok(backupVerify > backupWrite, "the archive must be verified after writing");
  assert.ok(
    safeReplacement > backupVerify,
    "the current draft key may only be replaced after archive verification",
  );
  assert.match(quarantine, /authoringDraftStaleStorageKey\(storageKey, raw\)/);

  const load = topLevelFunctionSource("loadLocalAuthoringDraft");
  assert.match(load, /createAuthoringDraftEnvelope\(normalizedSource/);
  assert.match(load, /resolveAuthoringDraftRecord\(JSON\.parse\(raw\), \{/);
  assert.match(load, /quarantineLocalAuthoringDraft\(storageKey, raw, safeEnvelope\)/);
  assert.match(load, /draft: cloneDraft\(normalizedSource\)/);
  assert.match(load, /storageAvailable: false,[\s\S]*staleDraft: true,[\s\S]*staleDraftRaw: raw/);
  assert.match(load, /已阻止编辑、导出与发布/);
});

test("all three local-draft authoring surfaces retain revision and source-content attribution", () => {
  const surfaces = [
    {
      load: "loadLayoutEditorDraft",
      persist: "persistLayoutEditorDraft",
      revision: "layoutEditor.publishedRevision",
      source: "layoutEditor.publishedDraft",
    },
    {
      load: "loadDicePackEditorDraft",
      persist: "persistDicePackEditorDraft",
      revision: "dicePackEditor.publishedRevision",
      source: "dicePackEditor.publishedPack",
    },
    {
      load: "loadNodeRewardEditorDraft",
      persist: "persistNodeRewardEditorDraft",
      revision: "nodeRewardEditor.publishedRevision",
      source: "nodeRewardEditor.publishedPack",
    },
  ];
  surfaces.forEach((surface) => {
    const load = topLevelFunctionSource(surface.load);
    assert.match(load, /loadLocalAuthoringDraft\(\{/);
    const persist = topLevelFunctionSource(surface.persist);
    assert.match(persist, /persistLocalAuthoringDraft\(\{/);
    assert.ok(persist.includes(`sourceRevision: ${surface.revision}`));
    assert.ok(persist.includes(`sourceValue: ${surface.source}`));
  });

  const persist = topLevelFunctionSource("persistLocalAuthoringDraft");
  assert.match(persist, /editorDraftSourceMatches\(editor, sourceRevision, sourceValue\)/);
  assert.match(persist, /editor\.storageAvailable = false;[\s\S]*return false;/);
  assert.match(persist, /createAuthoringDraftEnvelope\(normalized, \{/);
  assert.doesNotMatch(
    appSource,
    /async function saveClassroomEventEditorDraft\s*\(/,
    "classroom events are read-only compatibility data, not a writable authoring surface",
  );
});

test("successful publication rebinds every surviving local draft before it is persisted again", () => {
  const saves = [
    ["saveLayoutEditorDraft", "layoutEditor", "persistLayoutEditorDraft();"],
    ["saveDicePackEditorDraft", "dicePackEditor", "persistDicePackEditorDraft();"],
    ["saveNodeRewardEditorDraft", "nodeRewardEditor", "persistNodeRewardEditorDraft();"],
  ];
  saves.forEach(([functionName, editor, persistCall]) => {
    const save = topLevelFunctionSource(functionName);
    const bindIndex = save.indexOf(`bindEditorDraftSource(\n      ${editor},`);
    const finalPersistIndex = save.lastIndexOf(persistCall);
    assert.ok(bindIndex >= 0, `${functionName} must bind the returned publication`);
    assert.ok(
      finalPersistIndex > bindIndex,
      `${functionName} must persist the newly attributed envelope after binding`,
    );
  });
});
