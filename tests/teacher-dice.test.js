import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEACHER_DICE_REF, initializeTeacherSession, validTeacherSession } from "../public/js/lib/teacher-board-session.js";
import { teacherDiceFaces, teacherDiceRoll, sampleTeacherDice } from "../public/prototypes/universal-board/teacher-dice.js";
import { DEFAULT_DICE_PACK, normalizeDicePack, runtimeDiceFaces } from "../public/prototypes/universal-board/dice-pack-core.js";
import { createPlayerAssetsLedger, settlePlayerAssetTurn, starAccountAfterEvents } from "../public/prototypes/universal-board/session-star-assets.js";
import { buildCollectionPresentationEvents } from "../public/prototypes/universal-board/collection-presentation.js";
import { StudentProfileStore } from "./platform-contract-fixtures/student-profile-store.js";

const session = () => initializeTeacherSession({});

test("dice overlay pauses only covered decoration and removes live backdrop blur", async () => {
  const css = await readFile(new URL("../public/prototypes/universal-board/game-feel.css", import.meta.url), "utf8");
  assert.match(css, /data-dice-overlay="true"[\s\S]*animation-play-state: paused !important/);
  assert.match(css, /:is\(\.dice-roll-stage, \.dice-choice-stage\)\s*\{\s*backdrop-filter: none/);
  const app = await readFile(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  assert.match(app, /finally\s*\{[\s\S]*setDiceOverlayActive\(false\)/);
  assert.match(app, /roll = pointsOnlyDiceRoll\(roll\)/);
  assert.match(app, /faces = faces\.map\(pointsOnlyDiceFace\)/);
  assert.doesNotMatch(app, /function rewardEntriesForTurn\(/);
});

test("new teacher die is six equally sampled 1–6 faces with strictly decreasing reward value", () => {
  const faces = teacherDiceFaces(session(), DEFAULT_DICE_PACK);
  assert.deepEqual(faces.map(f => f.steps), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(faces.map(f => f.bonus.coins + 5 * f.bonus.stars), [5, 4, 3, 2, 1, 0]);
  const counts = Array(6).fill(0);
  for (let i = 0; i < 6000; i++) counts[sampleTeacherDice(session(), DEFAULT_DICE_PACK, () => (i + .5) / 6000).faceIndex]++;
  assert.deepEqual(counts, Array(6).fill(1000));
  for (const n of [-1, 1, NaN, Infinity]) assert.throws(() => sampleTeacherDice(session(), DEFAULT_DICE_PACK, () => n));
  faces[1].bonus.coins = 99;
  assert.equal(teacherDiceFaces(session(), DEFAULT_DICE_PACK)[1].bonus.coins, 4);
  assert.equal(session().teacherDiceRef, TEACHER_DICE_REF);
});

test("old teacher games and already sampled faces preserve the original locked pack", () => {
  const pack = structuredClone(DEFAULT_DICE_PACK);
  pack.families.treasure[4] = { steps: 5, reward: { type: "coin", amount: 3 } };
  const old = { mode: "teacher-led", teacherOpportunity: { faceIndex: 4 } };
  assert.deepEqual(teacherDiceFaces(old, pack), runtimeDiceFaces(pack, "treasure"));
  const restored = JSON.parse(JSON.stringify(old));
  const roll = teacherDiceRoll(restored, pack, restored.teacherOpportunity.faceIndex);
  assert.equal(roll.steps, 5);
  assert.equal(roll.bonus.coins, 3);
  assert.equal(roll.rewardSource, "dice");
  const fresh = JSON.parse(JSON.stringify({ ...session(), teacherOpportunity: { faceIndex: 1 } }));
  assert.equal(teacherDiceRoll(fresh, pack, fresh.teacherOpportunity.faceIndex).bonus.coins, 4);
  assert.throws(() => teacherDiceFaces({ mode: "voice" }, pack));
  assert.throws(() => teacherDiceFaces({ ...session(), teacherDiceRef: "unknown" }, pack));
  assert.equal(validTeacherSession({ ...session(), teacherDiceRef: "unknown" }, {}), false);
  assert.throws(() => teacherDiceRoll(session(), pack, 6));
  assert.throws(() => teacherDiceRoll(session(), pack, 1.5));
});

test("new teacher rewards settle once; voice and board reward caps stay unchanged", () => {
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const roll = teacherDiceRoll(session(), DEFAULT_DICE_PACK, faceIndex);
    const rewards = [
      { resource: "coin", amount: roll.bonus.coins, source: roll.rewardSource },
      { resource: "star", amount: roll.bonus.stars, source: roll.rewardSource },
    ].filter(r => r.amount > 0);
    const options = { ownerId: "a", settlementId: `face-${faceIndex}`, rewards };
    const result = settlePlayerAssetTurn(createPlayerAssetsLedger({ playerIds: ["a", "b"] }), options);
    assert.equal(result.ledger.playerAssetsById.a.coins, roll.bonus.coins);
    assert.equal(result.ledger.playerAssetsById.a.stars, roll.bonus.stars);
    assert.equal(result.ledger.playerAssetsById.a.acceptedTurns, 0);
    assert.equal(result.ledger.playerAssetsById.b.coins, 0);
    assert.equal(settlePlayerAssetTurn(result.ledger, options).duplicate, true);
    const cues = buildCollectionPresentationEvents({ events: result.events, landingNodeId: "n03" });
    assert.ok(cues.every(c => c.source === "dice" && c.originNodeId === null));
  }
  for (const source of ["dice", "board_node", "answer", undefined]) {
    assert.throws(() => starAccountAfterEvents({}, [{ type: "resource_awarded", resource: "coin", amount: 4, source }]));
  }
  assert.throws(() => starAccountAfterEvents({}, [{ type: "resource_awarded", resource: "coin", amount: 5, source: "teacher_dice" }]));
  assert.throws(() => starAccountAfterEvents({}, [{ type: "resource_awarded", resource: "star", amount: 2, source: "teacher_dice" }]));
  const pack = structuredClone(DEFAULT_DICE_PACK);
  pack.families.treasure[0].reward = { type: "coin", amount: 4 };
  assert.throws(() => normalizeDicePack(pack));
  assert.deepEqual(runtimeDiceFaces(DEFAULT_DICE_PACK, "treasure").map(f => f.steps), [3, 3, 3, 4, 4, 4]);
});

test("server replays teacher +4 coins once, persists across restart, and does not credit speech or Growth", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "teacher-dice-ledger-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let store = new StudentProfileStore({ dataDir });
  const student = await store.create({ tenantId: "test-owner", actorUserId: "test-teacher", displayName: "模拟学生" });
  const earned = settlePlayerAssetTurn(createPlayerAssetsLedger({ playerIds: [student.id] }), {
    ownerId: student.id, settlementId: "teacher-2", rewards: [{ resource: "coin", amount: 4, source: "teacher_dice" }],
  });
  const args = { tenantId: "test-owner", actorUserId: "test-teacher", studentId: student.id, sessionId: "test-game",
    settlementId: "teacher-2", expectedRevision: student.revision, acceptedAnswer: false,
    account: earned.ledger.playerAssetsById[student.id], events: earned.events };
  const saved = (await store.applyAssetSettlement(args)).student;
  assert.equal(saved.latestGame.account.coins, 4);
  assert.equal(saved.latestGame.account.acceptedTurns, 0);
  assert.equal(saved.assetAccount.coins, 0);
  assert.equal((await store.applyAssetSettlement(args)).duplicate, true);
  store = new StudentProfileStore({ dataDir });
  assert.equal((await store.list({ tenantId: "test-owner" })).students[0].latestGame.account.coins, 4);
});
