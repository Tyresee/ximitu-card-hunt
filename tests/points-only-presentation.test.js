import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  homePointsSummary, pointsOnlyNodeOutcome, pointsOnlyNodeKind, pointsOnlyNodePresentation,
} from "../public/prototypes/universal-board/points-only-presentation.js";
import { nodeOutcomePresentation } from "../public/prototypes/universal-board/node-outcome-presentation.js";
import { NODE_REWARD_CATALOG } from "../public/prototypes/universal-board/node-reward-pack-core.js";
import { WORLD_REGISTRIES, isCloudHarborWorldRef } from "../public/prototypes/universal-board/world-packs.js";
import { resolveWorldComposition } from "../public/prototypes/universal-board/world-runtime-core.js";
import { REWARD_DEFINITIONS } from "../public/prototypes/universal-board/level-one.js";
import { presentationForLevelOneNode } from "../public/prototypes/universal-board/level-one-presentations.js";
import { presentationForExpansionNode } from "../public/prototypes/universal-board/expansion-world-presentations.js";

const student = "student-one";
const local = { landingPoints: { kind: "final-landing-v1" }, seats: [{ id: student, opportunityCount: 4 }] };
const awarded = { attemptId: "turn-one", studentId: student, status: "awarded", points: 200,
  receipt: { landing: { turnId: "turn-one", studentId: student, amount: 200 } } };
const server = { studentIds: [student], turns: {
  awarded, pending: { ...awarded, status: "planned", receipt: null, points: 1000 },
  someoneElse: { ...awarded, studentId: "student-two" },
} };

test("home display totals only the matching student's received final-landings", () => {
  assert.deepEqual(homePointsSummary(local, server, student), { registered: true, earned: 200, actions: 4 });
  const mismatched = structuredClone(server);
  mismatched.turns.awarded.receipt.landing.amount = 300;
  assert.equal(homePointsSummary(local, mismatched, student).earned, 0);
  mismatched.turns.awarded = { ...awarded, receipt: { landing: { ...awarded.receipt.landing, turnId: "other-turn" } } };
  assert.equal(homePointsSummary(local, mismatched, student).earned, 0);
});

test("home totals add only received group landings and deduplicate their stable event identities", () => {
  const paid = { ...awarded, attemptId: 'group-landing:one', points: 500,
    receipt: { landing: { turnId: 'group-landing:one', studentId: student, amount: 500 } } };
  const move = { status: 'confirmed', rewardPolicy: 'group-final-landing-v1', awards: [paid,
    { ...paid, attemptId: 'group-landing:pending', status: 'planned', receipt: null },
    { ...paid, studentId: 'other-student' }, { ...paid, points: 100 },
  ] };
  const session = { ...server, specialCells: { groupMoves: { one: move, duplicate: move,
    legacy: { status: 'confirmed', awards: [paid] } } } };
  assert.equal(homePointsSummary(local, session, student).earned, 700);
  session.specialCells.groupMoves.one.awards[0] = { ...paid, receipt: { landing: { ...paid.receipt.landing, turnId: 'wrong-event' } } };
  assert.equal(homePointsSummary(local, session, student).earned, 200);
});

test("old or unregistered games cannot turn local stars or a wallet balance into claimed session points", () => {
  const history = { seats: local.seats, assets: { coins: 900, stars: 800 }, score: 50000 };
  const before = structuredClone(history);
  assert.deepEqual(homePointsSummary(history, server, student), { registered: false, earned: null, actions: 4 });
  assert.deepEqual(homePointsSummary(local, null, student), { registered: false, earned: null, actions: 4 });
  assert.deepEqual(homePointsSummary(local, { ...server, studentIds: ["other"] }, student), { registered: false, earned: null, actions: 4 });
  assert.deepEqual(history, before);
});

test("every registered world renders resource and exchange nodes neutrally while retaining movement mechanisms", () => {
  let checked = 0;
  for (const worldRef of Object.keys(NODE_REWARD_CATALOG)) {
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    for (const node of composition.board.nodes) {
      const rewardRef = composition.level.nodeBindings[node.id].rewardRef;
      const raw = nodeOutcomePresentation({ nodeId: node.id, rewardRef,
        definition: REWARD_DEFINITIONS[rewardRef], profile: composition.level.landingProfiles?.[rewardRef] });
      const clean = pointsOnlyNodeOutcome(raw);
      const presentation = pointsOnlyNodePresentation(isCloudHarborWorldRef(worldRef)
        ? presentationForLevelOneNode(node.id) : presentationForExpansionNode(node.id), clean);
      assert.doesNotMatch(JSON.stringify([clean, presentation.label, presentation.teaser]), /金币|云币|钥匙|卡匣|兑换|星星立即到账/);
      if (["route-choice", "transport", "map-effect", "region-transition", "world-transition"].includes(raw.category)) {
        assert.equal(clean.category, raw.category, `${worldRef} ${node.id}`);
        assert.equal(clean.trigger, raw.trigger);
      } else {
        assert.equal(pointsOnlyNodeKind(clean, "coin"), "learning");
        assert.equal(clean.hasDirectReward, false);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/prototypes/universal-board/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/prototypes/universal-board/points-only.css", import.meta.url), "utf8");
function appFunction(name) {
  const begin = app.indexOf(`function ${name}(`);
  const end = app.indexOf("\n}\n", begin) + 2;
  assert.ok(begin >= 0 && end > begin, name);
  return app.slice(begin, end);
}
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.textContent = "";
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
}
function uiFixture(gameSession = local, held = null, { clayPreview = false, editorActive = false } = {}) {
  const context = { document: { createElement: tag => new Element(tag) }, gameSession, homePointsSummary,
    CLAY_PREVIEW_REQUESTED: clayPreview, layoutEditor: { active: editorActive },
    coinFx: { displayed: () => held },
    landingPoints: { get: () => ({ session: server }), wallet: () => ({ balance: 50000 }) }, landingGameId: () => "game-one" };
  for (const name of ["textElement", "normalizedVisibleAssets", "playerAssetsAccessibleName", "createPlayerAssetStrip",
    "playerRewardDetailId", "createPlayerRewardMetric", "createPlayerRewardDetail"]) runInNewContext(appFunction(name), context);
  return context;
}
function visibleText(element) { return [element.textContent, ...element.children.map(visibleText)].join(" "); }

test("actual HUD and detail functions render receipt points and actions without old asset reads", () => {
  const current = uiFixture();
  const strip = current.createPlayerAssetStrip(student, "测试学生");
  assert.match(visibleText(strip), /200.*本局家园积分.*4.*行动次数/);
  assert.equal(strip.children[0].dataset.playerAsset, "points");
  assert.doesNotMatch(visibleText(strip), /50000|金币|星星|钥匙|兑换/);
  const old = uiFixture({ seats: local.seats });
  const detail = old.createPlayerRewardDetail(student, "测试学生", local.seats[0], old.normalizedVisibleAssets(student));
  assert.match(visibleText(detail), /未接入.*新开自由记分局/);
  assert.doesNotMatch(visibleText(detail), /已到账.*50000|金币|星星|钥匙|兑换/);
  // While coins are in flight the chip shows the rolling (held) value, not the jumped total.
  assert.match(visibleText(uiFixture(local, 120).createPlayerAssetStrip(student, "测试学生")), /120.*本局家园积分/);
});

test("clay HUD condenses visible copy while retaining receipt-backed full accessible names and editor labels", () => {
  const clay = uiFixture(local, 120, { clayPreview: true });
  const strip = clay.createPlayerAssetStrip(student, "测试学生");
  assert.match(strip.className, /\bis-clay-inline\b/);
  assert.match(visibleText(strip), /120.*积分.*4.*行动.*次/);
  assert.equal(strip.attributes.role, "img");
  assert.equal(strip.attributes["aria-label"], "测试学生：本局家园积分已到账 200，行动 4 次");
  assert.ok(strip.children.every(badge => badge.attributes["aria-hidden"] === "true"), "the accessible total is not duplicated by decorative badge copy");
  assert.doesNotMatch(visibleText(strip), /50000|金币|星星|钥匙|兑换/);
  for (const options of [{ clayPreview: false }, { clayPreview: true, editorActive: true }]) {
    const standard = uiFixture(local, null, options).createPlayerAssetStrip(student, "测试学生");
    assert.doesNotMatch(standard.className, /\bis-clay-inline\b/);
    assert.match(visibleText(standard), /200.*本局家园积分.*4.*行动次数/);
    assert.equal(standard.attributes["aria-label"], strip.attributes["aria-label"]);
  }
});

test("the retired right-side dice dock remains hidden and empty with or without a current game", () => {
  for (const gameSession of [null, local]) {
    const diceDock = { hidden: false };
    const diceDockList = { children: [{ staleDie: true }], replaceChildren(...children) { this.children = children; } };
    const context = { nodes: { diceDock, diceDockList }, gameSession,
      document: { createElement: () => assert.fail("the retired dock must not recreate die controls") } };
    runInNewContext(appFunction("renderDiceDock"), context);
    context.renderDiceDock();
    assert.equal(diceDock.hidden, true);
    assert.deepEqual(diceDockList.children, []);
    diceDock.hidden = false;
    diceDockList.children.push({ staleDie: true });
    context.renderDiceDock();
    assert.equal(diceDock.hidden, true, "subsequent renders cannot revive the dock");
    assert.deepEqual(diceDockList.children, []);
    assert.equal(context.gameSession, gameSession, "removing presentation never changes session or locked dice state");
  }
});

test("retired editor and exchange DOM is inert and cannot be made visible by old initialization hooks", () => {
  for (const id of ["coin-exchange-stage", "card-reveal-stage", "layout-editor-reward-tab", "layout-editor-reward-section", "layout-editor-card-tab", "layout-editor-card-section"]) {
    const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0];
    assert.match(tag, /data-retired-economy="true"/);
    assert.match(tag, /\binert\b/);
    assert.match(tag, /\bhidden\b/);
  }
  assert.match(css, /\[data-retired-economy="true"\]\s*\{\s*display: none !important/);
  assert.doesNotMatch(appFunction("renderDicePackEditorFaces"), /dice-pack-face-reward|dice-pack-face-amount/);
  assert.match(appFunction("setLayoutEditorTab"), /const showRewards = false/);
  assert.match(html, /<title>云港星星大冒险<\/title>/);
});

test("actual JSON UI boundary rejects historical reward edits in every scope and still allows coordinate work", () => {
  const context = {};
  runInNewContext(appFunction("assertNodeAuthoringExchangeScope"), context);
  for (const scope of ["all-worlds", "current-world", "current-node"]) {
    const snapshot = { scope, worldRef: "world-one", nodeId: "n02" };
    const placement = { group: "placement", worldRef: snapshot.worldRef, nodeId: snapshot.nodeId, field: "x", before: 20, after: 22 };
    const reward = { group: "reward", worldRef: snapshot.worldRef, nodeId: snapshot.nodeId, field: "amount", before: 1, after: 2 };
    assert.doesNotThrow(() => context.assertNodeAuthoringExchangeScope({ changes: [placement] }, snapshot));
    assert.throws(() => context.assertNodeAuthoringExchangeScope({ changes: [reward] }, snapshot), /历史 reward 字段只读/);
    assert.throws(() => context.assertNodeAuthoringExchangeScope({ changes: [placement, reward] }, snapshot), /历史 reward 字段只读/);
  }
  assert.throws(() => context.assertNodeAuthoringExchangeScope({ changes: [{ group: "placement", worldRef: "other", nodeId: "n02" }] },
    { scope: "current-world", worldRef: "world-one" }), /范围外修改/);
  for (const name of ["previewNodeAuthoringExchange", "applyNodeAuthoringExchangeToDrafts"]) {
    const fn = appFunction(name);
    assert.ok(fn.indexOf("assertNodeAuthoringExchangeScope(") < fn.indexOf("projectNodeAuthoringExchange("), `${name} must reject before projection or persistence`);
  }
  assert.match(appFunction("nodeAuthoringExchangeCodexPrompt"), /reward 是历史只读字段，必须保留原值/);
});
