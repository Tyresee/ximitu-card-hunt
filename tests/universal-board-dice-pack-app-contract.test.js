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
const dicePackSource = readFileSync(new URL(
  "../public/prototypes/universal-board/dice-pack-core.js",
  import.meta.url,
), "utf8");

function namedFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

test("the map editor exposes a separate, explicit DicePack authoring surface", () => {
  [
    "layout-editor-dice-tab",
    "layout-editor-dice-section",
    "dice-pack-editor-save",
    "dice-pack-editor-save-state",
    "dice-pack-editor-family",
    "dice-pack-editor-faces",
    "dice-pack-editor-reset-family",
    "dice-pack-editor-reset-all",
  ].forEach((id) => assert.match(htmlSource, new RegExp(`id="${id}"`)));
  assert.match(htmlSource, /六个实体骰面始终等概率随机抽取/);
  assert.match(htmlSource, /只决定移动步数/);
  assert.match(htmlSource, /评分档位与逐格移动顺序保持原规则/);
  const editor = namedFunctionSource(appSource, "renderDicePackEditorFaces");
  assert.match(editor, /dice-pack-face-steps/);
  assert.doesNotMatch(editor, /dice-pack-face-reward|dice-pack-face-amount/);
  assert.match(htmlSource, /骰子配置与节点布局独立保存/);
});

test("DicePack rules cannot contain scoring thresholds, weights, arbitrary effects, or a selected roll", () => {
  assert.doesNotMatch(dicePackSource, /minScore|scoreThreshold|knowledgeStatus|transcript/);
  assert.doesNotMatch(dicePackSource, /\bweight\b|probability\s*:/);
  assert.match(dicePackSource, /faces\.length !== 6/);
  assert.match(dicePackSource, /steps < 1 \|\| steps > 6/);
  assert.match(dicePackSource, /DICE_REWARD_LIMITS/);
});

test("published dice faces feed the legal random roll and existing movement transaction", () => {
  const choose = namedFunctionSource(appSource, "chooseDieForProfile");
  assert.match(choose, /const turnDicePack = cloneDicePack\(currentDicePack\(\)\)/);
  assert.match(choose, /generateLegendaryDiceFamilies\(turnDicePack\)/);
  assert.match(choose, /rollDicePackFamily\(turnDicePack, option\.id\)/);
  assert.match(choose, /runtimeDiceFaces\(turnDicePack, profile\.diceTier\)/);
  assert.match(choose, /sampledDiceFace\(faces\)/);
  assert.doesNotMatch(choose, /faceIndex\s*=\s*profile\.score|steps\s*=\s*profile\.score/);

  assert.match(choose, /roll = pointsOnlyDiceRoll\(roll\)/);
  assert.match(choose, /faces = faces\.map\(pointsOnlyDiceFace\)/);
  assert.doesNotMatch(appSource, /function rewardEntriesForTurn\(/);
  const display = namedFunctionSource(appSource, "appendDiceFaceContent");
  assert.match(display, /pointsOnlyDiceFace\(face\)/);
  assert.doesNotMatch(display, /dice-face-bonus/);
});

test("new sessions pin a full DicePack snapshot while hot publication leaves the current session alone", () => {
  const current = namedFunctionSource(appSource, "currentDicePack");
  assert.ok(
    current.indexOf("sessionDicePackSnapshot?.pack")
      < current.indexOf("effectivePublishedDicePackPublication().pack"),
  );
  assert.match(
    appSource,
    /function startLocalSession\([\s\S]*?sessionDicePackSnapshot = createSessionDicePackSnapshot\(\)/,
  );
  const saved = namedFunctionSource(appSource, "savedSessionPayload");
  assert.match(saved, /dicePackSnapshot: sessionDicePackSnapshot/);
  const restore = namedFunctionSource(appSource, "restoreLocalSession");
  assert.match(restore, /normalizeSessionDicePackSnapshot\(payload\.dicePackSnapshot\)/);

  const publish = namedFunctionSource(appSource, "publishDicePackEditorDraft");
  assert.match(publish, /\/api\/admin\/dice-packs\/v1/);
  assert.doesNotMatch(publish, /sessionDicePackSnapshot\s*=/);
});

test("DicePack local drafts are attributed to an exact published source", () => {
  const load = namedFunctionSource(appSource, "loadDicePackEditorDraft");
  assert.match(load, /loadLocalAuthoringDraft\(\{/);
  assert.match(load, /storageKey: LOCAL_DICE_PACK_DRAFT_KEY/);
  assert.match(load, /sourceRevision: publication\.revision/);
  assert.match(load, /sourceValue: publication\.pack/);

  const persist = namedFunctionSource(appSource, "persistDicePackEditorDraft");
  assert.match(persist, /persistLocalAuthoringDraft\(\{/);
  assert.match(persist, /sourceRevision: dicePackEditor\.publishedRevision/);
  assert.match(persist, /sourceValue: dicePackEditor\.publishedPack/);

  const save = namedFunctionSource(appSource, "saveDicePackEditorDraft");
  assert.match(save, /bindEditorDraftSource\(\s*dicePackEditor,/);
  assert.match(save, /persistDicePackEditorDraft\(\)/);
});
