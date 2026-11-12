import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coinCountForAmount, coinDingPitch, isBigCoinGain, coinBurstOffset, coinFlightControl, quadraticPoint,
  confirmedCoinGains, confirmedGroupCoinGains, createCoinGainFx, COIN_FX_MAX_PITCH,
} from "../public/prototypes/universal-board/coin-gain-fx.js";
import { homePointsSummary } from "../public/prototypes/universal-board/points-only-presentation.js";

const boardDir = new URL("../public/prototypes/universal-board/", import.meta.url);
const appSource = readFileSync(new URL("app.js", boardDir), "utf8");

// ---- tiny DOM + synchronous GSAP fakes -------------------------------------
class Node {
  constructor(doc, tag) { Object.assign(this, { doc, tag, children: [], style: {}, attrs: {}, className: "", textContent: "", parent: null }); this.classList = {
    add: (c) => { if (!this.className.split(" ").includes(c)) this.className = `${this.className} ${c}`.trim(); },
    remove: (c) => { this.className = this.className.split(" ").filter((x) => x !== c).join(" "); },
  }; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...kids) { for (const kid of kids) { kid.parent = this; this.children.push(kid); this.doc.created.push(kid); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 0, height: 0 }; }
}
function makeDoc() {
  const doc = { created: [], byId: {} };
  doc.createElement = (tag) => new Node(doc, tag);
  doc.body = new Node(doc, "body");
  doc.getElementById = (id) => doc.body.children.find((c) => c.id === id) || null;
  return doc;
}
function makeChip(doc, x, y) {
  const strong = new Node(doc, "strong");
  const badge = new Node(doc, "span"); badge.rect = { left: x - 10, top: y - 10, width: 20, height: 20 };
  const chip = new Node(doc, "article"); chip.rect = { left: x - 50, top: y - 20, width: 100, height: 40 };
  chip.querySelector = (selector) => (selector.endsWith("strong") ? strong : badge);
  chip.strong = strong;
  return chip;
}
function makeGsap() {
  const calls = { set: 0, tweens: 0 };
  const apply = (target, vars) => {
    calls.tweens += 1;
    for (const [k, v] of Object.entries(vars)) if (typeof v === "number" && target && typeof target === "object" && k in target) target[k] = v;
    vars.onStart?.(); vars.onUpdate?.(); vars.onComplete?.();
  };
  const timeline = (opts = {}) => {
    const tl = {
      fromTo: (t, _from, to) => { apply(t, to); return tl; },
      to: (t, vars) => { apply(t, vars); return tl; },
      add: (fn) => { fn(); return tl; },
    };
    queueMicrotask(() => opts.onComplete?.());
    return tl;
  };
  return { calls, timeline, fromTo: (t, _f, to) => apply(t, to), to: (t, vars) => apply(t, vars), set: () => { calls.set += 1; } };
}
function setup({ reduced = false, gsap = true, values = {} } = {}) {
  const doc = makeDoc();
  const played = [];
  const win = { innerWidth: 1600, innerHeight: 900, setTimeout: (fn) => { fn(); return 0; }, gsap: gsap ? makeGsap() : undefined };
  const chips = { a: makeChip(doc, 100, 100), b: makeChip(doc, 1500, 100), c: makeChip(doc, 1500, 800) };
  const real = { ...values };
  const fx = createCoinGainFx({
    doc, win, reduced: () => reduced,
    sounds: { play: (cue, detail) => { played.push({ cue, ...detail }); return true; } },
    chipFor: (id) => chips[id] || null,
    valueFor: (id) => real[id],
  });
  const created = (className) => doc.created.filter((n) => n.className.split(" ").includes(className));
  return { doc, win, chips, real, fx, played, created };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---- pure helpers -----------------------------------------------------------
test("coin count scales 8 → 16 with the point tiers", () => {
  assert.deepEqual([50, 100, 200, 300, 500, 1000, 3000].map(coinCountForAmount), [8, 8, 10, 12, 14, 16, 16]);
  assert.equal(coinCountForAmount(undefined), 8);
});

test("ding pitch rises per coin and is capped", () => {
  const pitches = Array.from({ length: 20 }, (_, i) => coinDingPitch(i));
  for (let i = 1; i < pitches.length; i += 1) assert.ok(pitches[i] >= pitches[i - 1]);
  assert.ok(pitches[1] > pitches[0]);
  assert.equal(Math.max(...pitches), COIN_FX_MAX_PITCH);
});

test("big gains are ≥500 or multiplied", () => {
  assert.equal(isBigCoinGain({ amount: 300 }), false);
  assert.equal(isBigCoinGain({ amount: 500 }), true);
  assert.equal(isBigCoinGain({ amount: 150, multiplied: true }), true);
});

test("burst fans upward and flight curves end exactly on the chip", () => {
  for (let i = 0; i < 12; i += 1) assert.ok(coinBurstOffset(i, 12).y < 0, "coins pop up out of the cell");
  const from = { x: 0, y: 0 }, to = { x: 400, y: -300 };
  const control = coinFlightControl(from, to, 3);
  assert.deepEqual(quadraticPoint(from, control, to, 0), from);
  assert.deepEqual(quadraticPoint(from, control, to, 1), to);
  assert.notDeepEqual(coinFlightControl(from, to, 0), coinFlightControl(from, to, 1), "staggered coins take different curves");
});

// ---- server-confirmed gating ------------------------------------------------
const receipt = { landing: { studentId: "a", turnId: "t1", amount: 100, nodeId: "n07a" } };
test("an unconfirmed landing is pending: no fly-in amount", () => {
  const { landing } = confirmedCoinGains({ attemptId: "t1", turn: { studentId: "a", points: 100, status: "planned" } });
  assert.equal(landing.pending, true);
  assert.equal(landing.credited, false);
  assert.equal(landing.big, false);
});

test("a confirmed plain landing flies its base amount", () => {
  const { landing, redPacket } = confirmedCoinGains({ attemptId: "t1", turn: { studentId: "a", points: 100, status: "awarded", receipt } });
  assert.deepEqual([landing.amount, landing.pending, landing.afterBanner, landing.formula, redPacket], [100, false, false, null, null]);
});

test("a multiplier flies the total only after its bonus award is confirmed", () => {
  const turn = { studentId: "a", points: 100, status: "awarded", receipt,
    specialCell: { type: "star", category: "points", amount: 150, bonus: 50, formula: "100 × 1.5 = 150！" } };
  const pending = confirmedCoinGains({ attemptId: "t1", turn, snapshot: { bonusAwards: { "t1:special": { status: "awaiting_platform" } } } }).landing;
  assert.deepEqual([pending.amount, pending.bonusPending, pending.big, pending.afterBanner], [100, 50, false, true]);
  const awarded = confirmedCoinGains({ attemptId: "t1", turn, snapshot: { bonusAwards: { "t1:special": { status: "awarded" } } } }).landing;
  assert.deepEqual([awarded.amount, awarded.bonusPending, awarded.big, awarded.formula], [150, 0, true, "100 × 1.5 = 150！"]);
});

test("red packet coins go only to students whose award receipt matches", () => {
  const turn = { studentId: "a", points: 100, status: "awarded", receipt,
    specialCell: { type: "redpack", category: "points", cellId: "c1", eachStudent: 50, amount: 100, bonus: 0 } };
  const award = (studentId, status, receiptAmount = 50) => ({ type: "redpack", turnId: "t1", cellId: "c1", studentId, amount: 50, status,
    receipt: status === "awarded" ? { bonus: { studentId, amount: receiptAmount } } : null });
  const { redPacket } = confirmedCoinGains({ attemptId: "t1", turn, snapshot: { bonusAwards: {
    "c1:a": award("a", "awarded"), "c1:b": award("b", "pending"), "c1:c": award("c", "awarded", 999) } } });
  assert.deepEqual(redPacket, { each: 50, studentIds: ["a"], pendingCount: 2 });
  const none = confirmedCoinGains({ attemptId: "t1", turn, snapshot: { bonusAwards: {} } }).redPacket;
  assert.deepEqual(none, { each: 50, studentIds: [], pendingCount: 1 });
});

test("HUD earned total adds only awarded, receipt-matching bonuses", () => {
  const local = { landingPoints: { kind: "final-landing-v1" }, seats: [{ id: "a", opportunityCount: 1 }] };
  const server = { studentIds: ["a"], turns: { t1: { studentId: "a", attemptId: "t1", points: 100, status: "awarded",
    receipt: { landing: { studentId: "a", turnId: "t1", amount: 100 } } } },
  specialCells: { bonusAwards: {
    "t1:special": { studentId: "a", amount: 50, status: "awarded", receipt: { bonus: { studentId: "a", amount: 50 } } },
    "c1:a": { studentId: "a", amount: 50, status: "awaiting_platform", receipt: null },
    "c2:a": { studentId: "a", amount: 50, status: "awarded", receipt: { bonus: { studentId: "a", amount: 60 } } },
  } } };
  assert.equal(homePointsSummary(local, server, "a").earned, 150);
});

// ---- DOM controller ---------------------------------------------------------
test("a confirmed gain bursts tiered coins, dings with rising pitch and counts up without jumping", async () => {
  const env = setup({ values: { a: 200 } });
  env.fx.hold("a", 200);
  env.real.a = 350; // the server credit lands while the chip is held
  assert.equal(env.fx.displayed("a"), 200, "held value hides the jump");
  const shown = [];
  const original = env.chips.a.strong;
  Object.defineProperty(original, "textContent", { set(v) { shown.push(Number(v)); this._t = v; }, get() { return this._t; } });
  await env.fx.playGain({ studentId: "a", amount: 150, from: { x: 800, y: 500 } });
  await flush();
  assert.equal(env.created("coin-fx-coin").length, coinCountForAmount(150));
  const dings = env.played.filter((p) => p.cue === "coin-ding");
  assert.equal(dings.length, coinCountForAmount(150));
  for (let i = 1; i < dings.length; i += 1) assert.ok(dings[i].pitch >= dings[i - 1].pitch);
  assert.ok(dings.every((d) => d.pitch <= COIN_FX_MAX_PITCH));
  for (let i = 1; i < shown.length; i += 1) assert.ok(shown[i] >= shown[i - 1], "the balance only rolls upward");
  assert.ok(shown.length > 3, "the balance rolls through intermediate values");
  assert.ok(shown.every((v) => v >= 200 && v <= 350));
  assert.equal(shown.at(-1), 350);
  assert.equal(env.fx.displayed("a"), null, "released back to the real value");
  assert.equal(env.created("coin-fx-ring").length, 0, "small gains have no golden ring");
  assert.equal(env.created("coin-fx-number")[0].textContent, "+150");
});

test("big gains add the golden ring and screen-edge glow", async () => {
  const env = setup({ values: { a: 0 } });
  await env.fx.playGain({ studentId: "a", amount: 1000, from: { x: 800, y: 500 }, big: true });
  assert.equal(env.created("coin-fx-coin").length, 16);
  assert.equal(env.created("coin-fx-ring").length, 1);
  assert.equal(env.created("coin-fx-edge-glow").length, 1);
  assert.ok(env.played.some((p) => p.cue === "coin-jackpot"));
});

test("reduced motion (or missing GSAP) is a simple number pop with no coins or dings", async () => {
  for (const options of [{ reduced: true }, { gsap: false }]) {
    const env = setup({ ...options, values: { a: 100 } });
    env.fx.hold("a", 100); env.real.a = 300;
    await env.fx.playGain({ studentId: "a", amount: 200, from: { x: 800, y: 500 } });
    assert.equal(env.created("coin-fx-coin").length, 0);
    assert.equal(env.played.filter((p) => p.cue === "coin-ding").length, 0);
    const pop = env.created("coin-fx-number")[0];
    assert.equal(pop.textContent, "+200");
    assert.ok(pop.className.includes("is-reduced"));
    assert.equal(env.chips.a.strong.textContent, "300");
  }
});

test("全班小红包 streams coins to every credited chip and adds +50 on top of a concurrent landing gain", async () => {
  const env = setup({ values: { a: 0, b: 40, c: 70 } });
  for (const id of ["a", "b", "c"]) env.fx.hold(id, env.real[id]);
  env.real.a = 150; env.real.b = 90; env.real.c = 120;
  const landing = env.fx.playGain({ studentId: "a", amount: 100, from: { x: 800, y: 500 } });
  const packet = env.fx.playRedPacket({ studentIds: ["a", "b", "c"], each: 50 });
  await Promise.all([landing, packet]);
  await flush();
  assert.equal(env.created("coin-fx-red-packet").length, 1);
  const plusFifty = env.created("coin-fx-number").filter((n) => n.textContent === "+50");
  assert.equal(plusFifty.length, 3, "+50 pops on every chip");
  assert.deepEqual(["a", "b", "c"].map((id) => env.chips[id].strong.textContent), ["150", "90", "120"]);
  assert.deepEqual(["a", "b", "c"].map((id) => env.fx.displayed(id)), [null, null, null]);
});

test("pending labels never fly coins and idle holds are released", () => {
  const env = setup({ values: { a: 10 } });
  env.fx.hold("a", 10);
  env.fx.pendingLabel({ x: 10, y: 10 }, "+100 积分待确认");
  env.fx.unholdIdle();
  assert.equal(env.created("coin-fx-coin").length, 0);
  assert.equal(env.created("coin-fx-pending")[0].textContent, "+100 积分待确认");
  assert.equal(env.fx.displayed("a"), null);
});

test("the board fires coin FX only after the claim, formula banners first", () => {
  const start = appSource.indexOf("holdCoinFxDisplays();\n        try {");
  assert.ok(start > 0);
  const block = appSource.slice(start, appSource.indexOf("await playWorldNodeReveal(", start));
  const claim = block.indexOf("await landingPoints.claim(");
  const gains = block.indexOf("confirmedCoinGains(");
  const banner = block.indexOf("await presentSpecialCellLanding(attemptId)");
  assert.ok(claim >= 0 && claim < gains && gains < banner);
  assert.ok(block.indexOf("!coinGains.landing.afterBanner) playLandingCoinGain") < banner);
  assert.ok(block.indexOf("coinGains.landing?.afterBanner) playLandingCoinGain") > banner);
  assert.ok(block.indexOf("playRedPacketCoinGain") > banner);
  assert.doesNotMatch(block, /await coinFx\.|await playLandingCoinGain|await playRedPacketCoinGain/, "coin FX never block the turn");
  const pending = appSource.slice(appSource.indexOf("function playLandingCoinGain("), appSource.indexOf("function playRedPacketCoinGain("));
  assert.match(pending, /if \(gain\.pending\) \{\s+coinFx\.pendingLabel\([^;]+积分待确认`\);\s+return;/);
  assert.match(appSource, /coinFx\.displayed\(ownerId\) \?\? assets\.earned/);
  assert.match(readFileSync(new URL("index.html", boardDir), "utf8"), /coin-gain-fx\.css/);
  assert.match(readFileSync(new URL("sound-cues.js", boardDir), "utf8"), /"coin-ding": Object\.freeze/);
});


// ---- group landing receipts / independent source cells ----------------------
function groupAward(studentId, nodeId, points, status = "awarded") {
  const attemptId = `group-landing:${studentId}-${nodeId}`;
  const event = { turnId: attemptId, studentId, nodeId, worldRef: "world@1", worldInstanceId: "world-instance",
    boardRef: "board@1", levelRef: "level@1" };
  return { attemptId, studentId, points, status, event, ruleVersion: "monopoly-final-landing-v3",
    receipt: status === "awarded" ? { landing: { ...event, amount: points, status, currency: "wordattack-points",
      ruleVersion: "monopoly-final-landing-v3" }, wallet: { studentId, currency: "wordattack-points", balance: points } } : null };
}
function groupMove(awards) {
  return { instanceId: "group-move-1", status: "confirmed", rewardPolicy: "group-final-landing-v1",
    landingEffectsPolicy: "group-landing-effects-v1", worldInstanceId: "world-instance", awards,
    moves: awards.map((award) => ({ studentId: award.studentId, fromNodeId: "previous",
      toNodeId: award.event.nodeId, path: [award.event.nodeId] })) };
}
function groupBonus(award, { type = "star", amount = 500, studentId = award.studentId, cellId = "cell-one", status = "awarded" } = {}) {
  const key = type === "redpack" ? `${cellId}:${studentId}` : `${award.attemptId}:special`;
  return { key, turnId: award.attemptId, studentId, cellId, type, amount, status,
    receipt: status === "awarded" ? { bonus: { bonusId: key, turnId: award.attemptId, studentId, cellId, type, amount,
      status, currency: "wordattack-points", policy: "points-only-v2-special-cells", ruleVersion: "monopoly-final-landing-v3" },
      wallet: { studentId, currency: "wordattack-points", balance: 9999 } } : null };
}

test("each moved student including the trigger flies only their own confirmed new-cell price", () => {
  const awards = [groupAward("a", "n11", 500), groupAward("b", "n22", 2500), groupAward("c", "n33", 1000, "planned")];
  const { gains, pending } = confirmedGroupCoinGains({ move: groupMove(awards) });
  assert.deepEqual(gains.map(({studentId,nodeId,amount}) => ({studentId,nodeId,amount})), [
    { studentId: "a", nodeId: "n11", amount: 500 }, { studentId: "b", nodeId: "n22", amount: 2500 }]);
  assert.equal(new Set(gains.map(gain => gain.gainId)).size,2);
  assert.deepEqual(pending.map(({studentId,amount}) => ({studentId,amount})), [{studentId:"c",amount:1000}]);
  assert.ok(gains.every(gain=>gain.credited && !gain.pending));
});

test("group FX rejects changed identity, money, location, currency, status and recipient wallet", () => {
  const changes = [
    award=>{award.receipt.landing.turnId="another"}, award=>{award.receipt.landing.studentId="b"},
    award=>{award.receipt.landing.amount=9999}, award=>{award.receipt.landing.nodeId="other"},
    award=>{award.receipt.landing.worldInstanceId="other-world"}, award=>{award.receipt.landing.currency="other"},
    award=>{award.receipt.landing.status="planned"}, award=>{award.receipt.landing.ruleVersion="unknown"},
    award=>{award.receipt.wallet.studentId="b"}, award=>{award.receipt.wallet.currency="other"},
    award=>{award.receipt.wallet.balance=-1}, award=>{award.points=award.receipt.landing.amount=999},
  ];
  for (const change of changes) {
    const award=groupAward("a","n11",500);change(award);
    assert.equal(confirmedGroupCoinGains({move:groupMove([award])}).gains.length,0);
  }
  const move=groupMove([groupAward("a","n11",500)]);move.moves[0].toNodeId="another";
  assert.equal(confirmedGroupCoinGains({move}).gains.length,0);
  assert.deepEqual(confirmedGroupCoinGains({move:{...move,awards:[null]}}),{gains:[],pending:[]});
});

test("confirmed group multiplier merges with its base; a pending bonus never increases the flown amount", () => {
  const award=groupAward("a","n11",1000);
  award.specialCell={type:"star",category:"points",cellId:"cell-one",baseAmount:1000,amount:1500,bonus:500};
  const move=groupMove([award]), pending=groupBonus(award,{status:"pending"});
  const before=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[pending.key]:pending}}});
  assert.equal(before.gains[0].amount,1000);assert.equal(before.gains[0].bonusPending,500);
  assert.deepEqual(before.gains[0].receiptIds,[`landing:${award.attemptId}`]);
  const paid=groupBonus(award), after=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[paid.key]:paid}}});
  assert.equal(after.gains[0].amount,1500);assert.equal(after.gains[0].baseAmount,1000);
  assert.equal(after.gains[0].receiptIds.length,2);assert.equal(after.pending.length,0);
  const legacy={...move};delete legacy.landingEffectsPolicy;
  assert.equal(confirmedGroupCoinGains({move:legacy,snapshot:{bonusAwards:{[paid.key]:paid}}}).gains[0].amount,1000);
});

test("retrying group gains plays only newly confirmed receipt components, never an earlier base twice", () => {
  const award=groupAward("a","n11",1000);
  award.specialCell={type:"star",category:"points",cellId:"cell-one",baseAmount:1000,amount:1500,bonus:500};
  const move=groupMove([award]), paid=groupBonus(award), seen=[`landing:${award.attemptId}`];
  const result=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[paid.key]:paid}},seenReceiptIds:seen});
  assert.equal(result.gains.length,1);assert.equal(result.gains[0].amount,500);assert.equal(result.gains[0].baseAmount,0);
  assert.deepEqual(seen,[`landing:${award.attemptId}`],"helper never mutates durable caller state");
  assert.equal(confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[paid.key]:paid}},
    seenReceiptIds:[...seen,...result.gains[0].receiptIds]}).gains.length,0);
  const duplicate=groupMove([award,structuredClone(award)]);
  assert.equal(confirmedGroupCoinGains({move:duplicate,snapshot:{bonusAwards:{[paid.key]:paid}}}).gains[0].amount,1500);
  assert.equal(confirmedGroupCoinGains({move:duplicate,snapshot:{bonusAwards:{[paid.key]:paid}}}).gains.length,1);
});

test("a group red packet flies every confirmed recipient from the source landing, with no double alias receipts", () => {
  const award=groupAward("a","n11",500);
  award.specialCell={type:"redpack",category:"points",cellId:"red-cell",baseAmount:500,amount:500,bonus:0,eachStudent:50};
  const move=groupMove([award]);move.moves.push({studentId:"b",fromNodeId:"n49",toNodeId:"n49",path:[]});
  const a=groupBonus(award,{type:"redpack",amount:50,cellId:"red-cell"});
  const b=groupBonus(award,{type:"redpack",amount:50,cellId:"red-cell",studentId:"b"});
  const unknown=groupBonus(award,{type:"redpack",amount:50,cellId:"red-cell",studentId:"stranger"});
  const result=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[a.key]:a,[b.key]:b,alias:structuredClone(b),[unknown.key]:unknown}}});
  assert.deepEqual(result.gains.map(g=>[g.studentId,g.amount,g.nodeId]),[["a",550,"n11"],["b",50,"n11"]]);
  assert.equal(new Set(result.gains.flatMap(g=>g.receiptIds)).size,3);
  const waiting=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{}}});
  assert.deepEqual(waiting.gains.map(g=>[g.studentId,g.amount]),[["a",500]]);
  assert.deepEqual(waiting.pending.map(g=>[g.studentId,g.amount]),[["a",50],["b",50]],"missing red-packet receipts stay honest pending");
  b.receipt.bonus.amount=100;
  const bad=confirmedGroupCoinGains({move,snapshot:{bonusAwards:{[a.key]:a,[b.key]:b}}});
  assert.deepEqual(bad.gains.map(g=>g.studentId),["a"]);assert.equal(bad.pending[0].studentId,"b");
});

test("historical movements without awards, cancelled moves and nonmoving pupils never create group FX", () => {
  const old=groupAward("a","n10",100);delete old.ruleVersion;
  old.receipt.landing.ruleVersion="monopoly-final-landing-v2";
  assert.equal(confirmedGroupCoinGains({move:groupMove([old])}).gains[0].amount,100,"a legacy pending award retains its original price");
  const move=groupMove([groupAward("a","n11",500)]);
  for (const changed of [{...move,status:"cancelled"},{...move,awards:undefined},{...move,rewardPolicy:"unknown"}]) {
    assert.deepEqual(confirmedGroupCoinGains({move:changed}),{gains:[],pending:[]});
  }
  move.moves[0].path=[];assert.deepEqual(confirmedGroupCoinGains({move}),{gains:[],pending:[]});
});

// ---- async board origins / presentation identities --------------------------
test("an async source reserves the balance before waiting for the camera and gainId prevents duplicate FX", async () => {
  const env=setup({values:{a:100}});env.fx.hold("a",100);env.real.a=600;
  let resolveOrigin;
  const origin=new Promise(resolve=>{resolveOrigin=resolve;});
  const first=env.fx.playGain({studentId:"a",amount:500,gainId:"award-a",from:()=>origin});
  env.fx.unholdIdle();assert.equal(env.fx.displayed("a"),100,"queued camera must retain this hold");
  assert.equal(await env.fx.playGain({studentId:"a",amount:500,gainId:"award-a",from:{x:1,y:1}}),false);
  assert.equal(env.created("coin-fx-coin").length,0);
  resolveOrigin({x:320,y:400});assert.equal(await first,true);await flush();
  assert.equal(env.created("coin-fx-coin").length,coinCountForAmount(500));
  assert.ok(env.created("coin-fx-coin").every(coin=>coin.style.left==="320px"&&coin.style.top==="400px"));
  assert.equal(env.chips.a.strong.textContent,"600");assert.equal(env.fx.displayed("a"),null);
});

test("a missing or failed async cell source releases the hold and can retry the same presentation identity", async () => {
  for (const from of [async()=>null,async()=>{throw new Error("camera cancelled")},async()=>({x:NaN,y:1})]) {
    const env=setup({values:{a:100}});env.fx.hold("a",100);env.real.a=600;
    assert.equal(await env.fx.playGain({studentId:"a",amount:500,gainId:"award-a",from}),false);
    assert.equal(env.fx.displayed("a"),null);assert.equal(env.created("coin-fx-coin").length,0);
    assert.equal(env.created("coin-fx-number").length,0,"no fake centre/chip pop after a missing source");
    assert.equal(await env.fx.playGain({studentId:"a",amount:500,gainId:"award-a",from:async()=>({x:10,y:20})}),true);
    assert.equal(env.created("coin-fx-coin").length,coinCountForAmount(500));
  }
});
