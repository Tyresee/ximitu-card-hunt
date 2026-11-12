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

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function htmlOpeningTagSource(tagName, id) {
  const idIndex = htmlSource.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `missing #${id}`);
  const start = htmlSource.lastIndexOf(`<${tagName}`, idIndex);
  assert.notEqual(start, -1, `missing opening <${tagName}> for #${id}`);
  const end = htmlSource.indexOf(">", idIndex);
  assert.notEqual(end, -1, `unterminated opening tag for #${id}`);
  return htmlSource.slice(start, end + 1);
}

function htmlElementSource(tagName, id) {
  const opening = htmlOpeningTagSource(tagName, id);
  const start = htmlSource.indexOf(opening);
  const endMarker = `</${tagName}>`;
  const end = htmlSource.indexOf(endMarker, start + opening.length);
  assert.notEqual(end, -1, `unterminated <${tagName}> for #${id}`);
  return htmlSource.slice(start, end + endMarker.length);
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1;
}

test("the owner authoring entry remains visible from an active game without replacing the setup entry", () => {
  const gameEntry = htmlElementSource("a", "game-authoring-open");
  assert.match(gameEntry, /\shidden(?:\s|>)/);
  assert.match(gameEntry, /target="_blank"/);
  assert.match(gameEntry, /rel="noopener"/);
  assert.match(gameEntry, /layoutEditor=1/);

  const setupEntry = htmlOpeningTagSource("button", "layout-editor-open");
  assert.match(setupEntry, /\shidden(?:\s|>)/);

  const renderControls = topLevelFunctionSource("renderSpeechControls");
  const setupVisibility = sourceBetween(
    renderControls,
    "if (nodes.layoutEditorOpen)",
    "if (nodes.gameAuthoringOpen)",
  );
  assert.match(
    setupVisibility,
    /layoutEditorAuthorized[\s\S]*&& !gameSession[\s\S]*&& !layoutEditor\.active/,
  );

  const gameVisibility = sourceBetween(
    renderControls,
    "if (nodes.gameAuthoringOpen)",
    'if (speechStatus === "listening")',
  );
  assert.match(gameVisibility, /searchParams\.set\("layoutEditor", "1"\)/);
  assert.match(
    gameVisibility,
    /gameAuthoringOpen\.hidden = !\([\s\S]*layoutEditorAuthorized[\s\S]*&& !layoutEditor\.active/,
  );
  assert.doesNotMatch(gameVisibility, /!gameSession/);
});

test("Codex remains accessible while retired card and classroom tabs stay hidden", () => {
  assert.ok(
    htmlSource.indexOf('id="layout-editor-codex-tab"')
      > htmlSource.indexOf('id="layout-editor-card-tab"'),
    "the Codex tab must follow the card library",
  );

  const cardTab = htmlElementSource("button", "layout-editor-card-tab");
  assert.match(cardTab, /role="tab"/);
  assert.match(cardTab, /aria-controls="layout-editor-card-section"/);
  assert.match(cardTab, /\shidden(?:\s|>)/);
  assert.match(cardTab, />历史卡片库<\/button>/);

  const eventTab = htmlOpeningTagSource("button", "layout-editor-event-tab");
  assert.match(eventTab, /\shidden(?:\s|>)/);

  const tab = htmlElementSource("button", "layout-editor-codex-tab");
  assert.match(tab, /role="tab"/);
  assert.match(tab, /aria-selected="false"/);
  assert.match(tab, /aria-controls="layout-editor-codex-section"/);
  assert.match(tab, />Codex JSON<\/button>/);

  const panel = htmlOpeningTagSource("section", "layout-editor-codex-section");
  assert.match(panel, /role="tabpanel"/);
  assert.match(panel, /aria-labelledby="layout-editor-codex-tab"/);
  assert.match(panel, /\shidden(?:\s|>)/);

  const setTab = topLevelFunctionSource("setLayoutEditorTab");
  assert.match(setTab, /\["nodes", "dice", "codex"\]/);
  assert.match(setTab, /const showCards = false/);
  assert.match(setTab, /const showRewards = false/);
  assert.match(htmlOpeningTagSource("button", "layout-editor-reward-tab"), /data-retired-economy="true"[\s\S]*inert/);
  assert.match(setTab, /const showCodex = pane === "codex"/);
  assert.match(
    setTab,
    /layoutEditorCodexTab\.setAttribute\("aria-selected", String\(showCodex\)\)/,
  );
  assert.match(setTab, /layoutEditorCodexTab\.tabIndex = showCodex \? 0 : -1/);
  assert.match(setTab, /layoutEditorEventTab\.tabIndex = -1/);
  assert.match(setTab, /layoutEditorEventSection\.hidden = true/);
  assert.match(setTab, /layoutEditorCardSection\.hidden = !showCards/);
  assert.match(setTab, /layoutEditorCodexSection\.hidden = !showCodex/);

  assert.match(
    appSource,
    /layoutEditorCardTab\.addEventListener\("click", \(\) => setLayoutEditorTab\("cards"\)\)/,
  );
  assert.match(
    appSource,
    /layoutEditorCodexTab\.addEventListener\("click", \(\) => setLayoutEditorTab\("codex"\)\)/,
  );
  const keyboardWiring = sourceBetween(
    appSource,
    "const layoutEditorTabs = [",
    'nodes.dicePackEditorSave.addEventListener("click"',
  );
  for (const entry of [
    '["nodes", nodes.layoutEditorNodeTab]',
    '["dice", nodes.layoutEditorDiceTab]',
    '["rewards", nodes.layoutEditorRewardTab]',
    '["codex", nodes.layoutEditorCodexTab]',
  ]) {
    assert.ok(keyboardWiring.includes(entry), `missing keyboard tab entry ${entry}`);
  }
  assert.match(keyboardWiring, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.doesNotMatch(keyboardWiring, /layoutEditorCardTab/);
  assert.match(keyboardWiring, /layoutEditorTabs\.length - 1/);
  assert.match(keyboardWiring, /setLayoutEditorTab\(nextTabId\)/);
  assert.match(keyboardWiring, /nextTab\.focus\(\{ preventScroll: true \}\)/);
});

test("Cmd or Ctrl plus S cannot save or publish while the Codex pane is active", () => {
  const keyboard = topLevelFunctionSource("handleLayoutEditorGlobalKeydown");
  assert.match(keyboard, /const modifier = event\.metaKey \|\| event\.ctrlKey/);
  assert.match(keyboard, /modifier && event\.key\.toLowerCase\(\) === "s"/);
  assert.match(keyboard, /event\.preventDefault\(\)/);

  const codexBranch = sourceBetween(
    keyboard,
    'if (layoutEditor.activePane === "codex")',
    '} else if (layoutEditor.activePane === "dice")',
  );
  assert.match(codexBranch, /setNodeAuthoringExchangeStatus\(/);
  assert.match(codexBranch, /不会通过快捷键直接发布/);
  assert.doesNotMatch(
    codexBranch,
    /\b(?:save|publish)[A-Z][A-Za-z0-9_$]*\s*\(|fetch\(|method:\s*"PUT"/,
  );
});

test("preview parses, normalizes, diffs, and projects without mutating or publishing application state", () => {
  const preview = topLevelFunctionSource("previewNodeAuthoringExchange");
  assert.match(preview, /parseNodeAuthoringExchangeText\(/);
  assert.match(preview, /const baseline = currentNodeAuthoringExchange\(\)/);
  assert.match(preview, /normalizeNodeAuthoringExchange\(parsed\.value, \{/);
  assert.match(preview, /diffNodeAuthoringExchanges\(baseline, candidate, \{/);
  assert.match(preview, /projectNodeAuthoringExchange\(candidate, \{/);
  assert.equal(occurrenceCount(preview, "expectedBase: baseline.base"), 3);
  assert.doesNotMatch(
    preview,
    /localStorage|fetch\(|method:\s*"PUT"|persist[A-Z]|\b(?:save|publish)[A-Z][A-Za-z0-9_$]*\s*\(/,
  );
  assert.doesNotMatch(
    preview,
    /(?:layoutEditor|nodeRewardEditor|classroomEventEditor)\.draft|\bruntime\b|\bgameSession\b/,
  );
});

test("the selected modification focus is snapshot-bound at generation or first direct preview", () => {
  const generate = topLevelFunctionSource("generateNodeAuthoringExchange");
  assert.match(generate, /const scopeSnapshot = captureNodeAuthoringExchangeScope\(\)/);
  assert.match(generate, /nodeAuthoringExchangeEditor\.scopeSnapshot = scopeSnapshot/);

  const instruction = topLevelFunctionSource("nodeAuthoringExchangeScopeInstruction");
  assert.match(instruction, /snapshot = nodeAuthoringExchangeEditor\.scopeSnapshot/);
  assert.match(instruction, /snapshot\?\.scope/);
  assert.doesNotMatch(instruction, /nodeAuthoringExchangeScope\.value/);

  const preview = topLevelFunctionSource("previewNodeAuthoringExchange");
  assert.match(
    preview,
    /const scopeSnapshot = nodeAuthoringExchangeEditor\.scopeSnapshot\s*\|\| captureNodeAuthoringExchangeScope\(\)/,
  );
  assert.ok(
    preview.indexOf("nodeAuthoringExchangeEditor.scopeSnapshot = scopeSnapshot")
      < preview.indexOf("parseNodeAuthoringExchangeText("),
    "a direct paste must lock the selected focus at the start of its first preview",
  );
  assert.match(preview, /assertNodeAuthoringExchangeScope\(diff, scopeSnapshot\)/);
  assert.match(preview, /nodeAuthoringExchangeEditor\.scopeSnapshot = scopeSnapshot/);

  const apply = topLevelFunctionSource("applyNodeAuthoringExchangeToDrafts");
  assert.match(
    apply,
    /assertNodeAuthoringExchangeScope\(\s*diff,\s*nodeAuthoringExchangeEditor\.scopeSnapshot,\s*\)/,
  );

  const guard = topLevelFunctionSource("assertNodeAuthoringExchangeScope");
  assert.match(guard, /snapshot\.scope === "all-worlds"/);
  assert.match(guard, /snapshot\.scope === "current-node"/);
  assert.match(guard, /超出当前节点修改焦点/);
  assert.match(guard, /超出当前世界修改焦点/);
});

test("changing modification focus invalidates generated output and preview before reuse", () => {
  const change = topLevelFunctionSource("handleNodeAuthoringExchangeScopeChange");
  assert.match(change, /baseline = null/);
  assert.match(change, /generatedText = ""/);
  assert.match(change, /scopeSnapshot = null/);
  assert.match(change, /nodeAuthoringExchangeOutput\.value = ""/);
  assert.match(change, /resetNodeAuthoringExchangePreview\(\)/);
  assert.match(change, /此前生成内容已失效，请重新生成交换 JSON/);
  assert.match(
    appSource,
    /nodeAuthoringExchangeScope\.addEventListener\(\s*"change",\s*handleNodeAuthoringExchangeScopeChange,\s*\)/,
  );
});

test("diff preview renders every changed group without a hidden truncation path", () => {
  const render = topLevelFunctionSource("renderNodeAuthoringExchangeDiff");
  assert.match(render, /\[\.\.\.groups\.values\(\)\]\.map\(/);
  assert.match(render, /nodeAuthoringExchangeDiffList\.replaceChildren\(\.\.\.rows\)/);
  assert.doesNotMatch(render, /\.slice\(|另有|hiddenGroups|remainder/);
  assert.match(render, /应用 \$\{diff\.changes\.length\} 项到编辑草稿/);
});

test("apply is revision-strict, persists the complete draft bundle first, and touches no formal game systems", () => {
  const records = topLevelFunctionSource("nodeAuthoringDraftStorageRecords");
  assert.match(records, /NODE_AUTHORING_WORLD_REFS\.map/);
  assert.match(records, /projected\.boardLayoutDrafts\[worldRef\]/);
  assert.match(records, /LOCAL_NODE_REWARD_PACK_DRAFT_KEY/);
  assert.match(records, /projected\.nodeRewardPack/);
  assert.doesNotMatch(records, /CLASSROOM_EVENT|classroomEvent/);
  assert.equal(occurrenceCount(records, "createAuthoringDraftEnvelope("), 2);
  assert.equal(occurrenceCount(records, "sourceRevision:"), 2);
  assert.equal(occurrenceCount(records, "sourceValue:"), 2);
  assert.doesNotMatch(
    records,
    /LOCAL_SESSION_KEY|LOCAL_DICE_PACK|_APPLIED_|gameSession|runtime/,
  );

  const apply = topLevelFunctionSource("applyNodeAuthoringExchangeToDrafts");
  assert.match(apply, /normalizeNodeAuthoringExchange\(/);
  assert.match(apply, /diffNodeAuthoringExchanges\(baseline, candidate, \{/);
  assert.match(apply, /projectNodeAuthoringExchange\(candidate, \{/);
  assert.equal(occurrenceCount(apply, "expectedBase: baseline.base"), 3);
  assert.match(
    apply,
    /diff\.candidateFingerprint !== nodeAuthoringExchangeEditor\.diff\.candidateFingerprint/,
  );

  const persistIndex = apply.indexOf("persistNodeAuthoringDraftBundle(projected);");
  assert.notEqual(persistIndex, -1, "the projected bundle must be persisted");
  for (const mutation of [
    "layoutEditor.draft = afterLayout;",
    "nodeRewardEditor.draft = cloneNodeRewardPack(projected.nodeRewardPack);",
  ]) {
    const mutationIndex = apply.indexOf(mutation);
    assert.ok(
      mutationIndex > persistIndex,
      `${mutation} must occur only after the complete bundle is persisted`,
    );
  }

  assert.doesNotMatch(
    apply,
    /localStorage|fetch\(|method:\s*"PUT"|\b(?:save|publish)[A-Z][A-Za-z0-9_$]*\s*\(/,
  );
  assert.doesNotMatch(
    apply,
    /publishedRevision\s*=|layoutEditorOwnerUserId\s*=|\bgameSession\s*=|\bruntime\s*=|dicePackEditor|pendingDiceChoice|score|assessment|speech|walkBoardPlan|playPawnStep|movePawn|runAcceptedTurn|acceptAnswer/,
  );
});

test("imports enforce the 512 KB byte limit, accept a complete code fence, and invalidate stale previews on input", () => {
  assert.match(
    appSource,
    /const NODE_AUTHORING_EXCHANGE_MAX_BYTES = 512 \* 1024;/,
  );
  const parse = topLevelFunctionSource("parseNodeAuthoringExchangeText");
  assert.match(
    parse,
    /new TextEncoder\(\)\.encode\(trimmed\)\.byteLength > NODE_AUTHORING_EXCHANGE_MAX_BYTES/,
  );
  assert.match(parse, /交换 JSON 超过 512 KB/);
  assert.match(parse, /source\.startsWith\("```"\)/);
  assert.ok(parse.includes("const fenced = /^```(?:json)?"));
  assert.match(parse, /source = fenced\[1\]\.trim\(\)/);
  assert.match(parse, /JSON 代码围栏没有完整闭合/);

  const reset = topLevelFunctionSource("resetNodeAuthoringExchangePreview");
  assert.match(reset, /candidate = null/);
  assert.match(reset, /diff = null/);
  assert.match(reset, /projected = null/);
  assert.match(reset, /inputFingerprint = ""/);
  assert.match(reset, /nodeAuthoringExchangeDiff\.hidden = true/);
  assert.match(reset, /nodeAuthoringExchangeApply\.disabled = true/);

  const input = topLevelFunctionSource("handleNodeAuthoringExchangeInput");
  assert.match(input, /^function[\s\S]*resetNodeAuthoringExchangePreview\(\)/);
  assert.match(input, /粘贴内容已变化，请点击“解析并预览”/);
  assert.match(
    appSource,
    /nodeAuthoringExchangeInput\.addEventListener\(\s*"input",\s*handleNodeAuthoringExchangeInput,\s*\)/,
  );

  const apply = topLevelFunctionSource("applyNodeAuthoringExchangeToDrafts");
  assert.match(
    apply,
    /parsed\.source !== nodeAuthoringExchangeEditor\.inputFingerprint/,
  );
  assert.match(apply, /粘贴内容在预览后发生了变化，请重新解析并预览/);
});

test("applying an exchange clearly remains unpublished", () => {
  const codexPanel = htmlSource.slice(
    htmlSource.indexOf('id="layout-editor-codex-section"'),
    htmlSource.indexOf('id="layout-editor-status"'),
  );
  assert.match(codexPanel, /应用后不会自动发布/);
  assert.match(codexPanel, /有修改的标签页会显示“未发布”/);

  const apply = topLevelFunctionSource("applyNodeAuthoringExchangeToDrafts");
  assert.match(apply, /已应用 \$\{appliedCount\} 个字段 · 尚未发布/);
  assert.match(apply, /修改已写入本地编辑草稿，尚未进入正式游戏/);
  assert.match(apply, /点击各页顶部发布按钮/);
});
