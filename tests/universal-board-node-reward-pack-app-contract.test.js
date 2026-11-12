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

function namedFunctionSource(functionName) {
  const marker = `function ${functionName}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = /\)\s*\{/.exec(appSource.slice(start));
  assert.ok(signatureEnd, `missing body for function ${functionName}`);
  const bodyStart = start + signatureEnd.index + signatureEnd[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

function stringConstant(name) {
  const match = new RegExp(`const ${name} = "([^"]+)";`).exec(appSource);
  assert.ok(match, `missing string constant ${name}`);
  return match[1];
}

test("historical NodeRewardPack controls stay isolated behind the retired editor surface", () => {
  [
    "layout-editor-reward-tab",
    "layout-editor-reward-section",
    "node-reward-editor-save",
    "node-reward-editor-save-state",
    "node-reward-editor-world",
    "node-reward-editor-node",
    "node-reward-editor-reward",
    "node-reward-editor-amount",
    "node-reward-editor-reset-node",
    "node-reward-editor-reset-world",
    "node-reward-editor-reset-all",
  ].forEach((id) => assert.match(htmlSource, new RegExp(`id="${id}"`)));
  assert.match(htmlSource, /id="layout-editor-reward-tab"[^>]*data-retired-economy="true"[^>]*inert[^>]*hidden/);
  const tabs = namedFunctionSource("setLayoutEditorTab");
  assert.match(tabs, /const showRewards = false/);
  assert.match(tabs, /layoutEditorRewardSection\.hidden = !showRewards/);
  assert.match(htmlSource, /所有节点都可查看。纯资源节点可调整到账奖励/);
  assert.match(htmlSource, /固定机制不会被改写/);
  assert.match(htmlSource, /节点奖励与坐标、骰子分别发布/);

  const options = namedFunctionSource("renderNodeRewardEditorOptions");
  assert.match(options, /NODE_REWARD_CATALOG\[nodeRewardEditor\.worldRef\]/);
  assert.match(options, /catalogWorld\.nodes\.map/);
  assert.match(options, /entry\.editable \? "" : " · 固定"/);

  const controls = namedFunctionSource("syncNodeRewardEditorControls");
  assert.match(
    controls,
    /nodeRewardEditorReward\.disabled = \([\s\S]*!entry\.editable[\s\S]*!nodeRewardEditor\.storageAvailable[\s\S]*\);/,
  );
  assert.match(controls, /entry\.lockReason/);
});

test("NodeRewardPack drafts, published values, and game snapshots use isolated storage", () => {
  const sessionKey = stringConstant("LOCAL_SESSION_KEY");
  const layoutDraftPrefix = stringConstant("LOCAL_LAYOUT_DRAFT_PREFIX");
  const diceDraftKey = stringConstant("LOCAL_DICE_PACK_DRAFT_KEY");
  const rewardDraftKey = stringConstant("LOCAL_NODE_REWARD_PACK_DRAFT_KEY");
  const rewardAppliedKey = stringConstant("LOCAL_NODE_REWARD_PACK_APPLIED_KEY");
  assert.equal(rewardDraftKey, "tim.voice-board.node-reward-pack-draft.v1");
  assert.equal(rewardAppliedKey, "tim.voice-board.node-reward-pack-applied.v1");
  assert.equal(new Set([
    sessionKey,
    layoutDraftPrefix,
    diceDraftKey,
    rewardDraftKey,
    rewardAppliedKey,
  ]).size, 5);

  const persistDraft = namedFunctionSource("persistNodeRewardEditorDraft");
  assert.match(persistDraft, /persistLocalAuthoringDraft\(\{/);
  assert.match(persistDraft, /storageKey: LOCAL_NODE_REWARD_PACK_DRAFT_KEY/);
  assert.match(persistDraft, /sourceRevision: nodeRewardEditor\.publishedRevision/);
  assert.match(persistDraft, /sourceValue: nodeRewardEditor\.publishedPack/);
  assert.doesNotMatch(persistDraft, /LOCAL_SESSION_KEY|gameSession|sessionNodeRewardPackSnapshot/);

  const publish = namedFunctionSource("publishNodeRewardEditorDraft");
  assert.match(publish, /fetch\("\/api\/admin\/node-reward-packs\/v1"/);
  assert.match(publish, /expectedUserId: layoutEditorOwnerUserId/);
  assert.match(publish, /expectedRevision: nodeRewardEditor\.publishedRevision/);
  assert.match(publish, /pack: retargetNodeRewardPack\(\s*nodeRewardEditor\.draft,\s*publishedNodeRewardPackPublication\.sourceWorldRef \|\| CLOUD_HARBOR_WORLD_REF/);
  assert.doesNotMatch(publish, /sessionNodeRewardPackSnapshot\s*=/);
});

test("pinned NodeRewardPack snapshots remain readable but cannot drive current display or wallet credit", () => {
  const current = namedFunctionSource("currentNodeRewardPack");
  assert.ok(
    current.indexOf("sessionNodeRewardPackSnapshot?.pack")
      < current.indexOf("effectivePublishedNodeRewardPackPublication().pack"),
  );
  assert.match(
    appSource,
    /function startLocalSession\([\s\S]*?sessionNodeRewardPackSnapshot = createSessionNodeRewardPackSnapshot\(\)/,
  );

  const presentationPack = namedFunctionSource("nodeRewardPackForPresentation");
  assert.match(presentationPack, /: currentNodeRewardPack\(\)/);
  assert.match(presentationPack, /if \(pack\.worlds\[worldRef\][^;]+return pack/);
  assert.doesNotMatch(presentationPack, /sessionNodeRewardPackSnapshot\s*=/);
  const outcome = namedFunctionSource("configuredNodeRewardOutcome");
  assert.match(outcome, /return pointsOnlyNodeOutcome\(outcome\)/);
  assert.doesNotMatch(outcome, /nodeRewardPackForPresentation|nodeRewardPolicy|effectiveNodeRewards/);

  const settlement = namedFunctionSource("settlePlayerAssetsForMove");
  assert.match(settlement, /return settlePointsOnlyAssetsForMove\(\{/);
  assert.match(settlement, /resolveWorldComposition\(movedRuntime\.world\.active\.worldPackRef/);
  assert.doesNotMatch(settlement, /nodeRewardPolicy|effectiveNodeRewards|currentNodeRewardPack|settlePlayerAssetTurn/);
  const turn = namedFunctionSource("runBoardTurn");
  const plan = turn.indexOf("await landingPoints.plan(");
  const confirmation = turn.indexOf("await playLandingConfirmation(");
  const claim = turn.indexOf("await landingPoints.claim(");
  assert.ok(plan >= 0 && confirmation > plan && claim > confirmation,
    "only the validated final landing is claimed after the pawn stops");
  assert.match(turn.slice(plan, confirmation), /assertLandingPlan\([\s\S]*landingNodeId: assetSettlement\.landingNodeId/);
  assert.doesNotMatch(turn, /effectiveNodeRewards|nodeRewardPolicy|settlePlayerAssetTurn|coin_card_exchange/);

  const saved = namedFunctionSource("savedSessionPayload");
  assert.match(saved, /nodeRewardPackSnapshot: sessionNodeRewardPackSnapshot/);
  const restore = namedFunctionSource("restoreLocalSession");
  assert.match(
    restore,
    /normalizeSessionNodeRewardPackSnapshot\(\s*payload\.nodeRewardPackSnapshot/,
  );
});

test("node reward publication cannot alter scoring, dice selection, topology, or movement", () => {
  const publish = namedFunctionSource("publishNodeRewardEditorDraft");
  assert.doesNotMatch(
    publish,
    /score|threshold|transcript|diceRoll|pendingDiceChoice|activeBoardTemplate\s*=|walkBoardPlan|movePawn/,
  );
  const update = namedFunctionSource("updateNodeRewardEditorPolicy");
  assert.match(update, /updateNodeRewardPolicy\(/);
  assert.doesNotMatch(
    update,
    /activeBoardTemplate\s*=|visualBoardTemplate\s*=|walkBoardPlan|score|diceRoll/,
  );
});
