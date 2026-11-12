import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStarAccount, createPlayerAssetsLedger, settlePlayerAssetTurn, starAccountAfterEvents }
  from "../public/prototypes/universal-board/session-star-assets.js";
import { StudentProfileStore } from "./platform-contract-fixtures/student-profile-store.js";
import { createPlayerAssetsLedger as legacyLedger, settlePlayerAssetTurn as legacyTurn }
  from "../public/prototypes/universal-board/player-assets-core.js";
import { createBoardSession, endBoardGame } from "../public/js/lib/voice-board-session-core.js";
import { DEFAULT_DICE_PACK, normalizeDicePack } from "../public/prototypes/universal-board/dice-pack-core.js";
import { DEFAULT_NODE_REWARD_PACK, normalizeNodeRewardPack } from "../public/prototypes/universal-board/node-reward-pack-core.js";

test("v2 published dice and node card rewards migrate 1:1 without changing movement or other nodes", () => {
  const dice = structuredClone(DEFAULT_DICE_PACK);
  dice.schemaVersion = "voice-board-dice-pack.v2";
  dice.families.treasure[2].reward = { type: "card", amount: 1 };
  dice.families.treasure[5].reward = { type: "card_case", amount: 1 };
  assert.deepEqual(normalizeDicePack(dice), DEFAULT_DICE_PACK);
  const nodes = structuredClone(DEFAULT_NODE_REWARD_PACK);
  nodes.schemaVersion = "voice-board-node-reward-pack.v2";
  for (const world of Object.values(nodes.worlds)) {
    for (const reward of Object.values(world.nodes)) if (reward.type === "star") reward.type = "card";
  }
  assert.deepEqual(normalizeNodeRewardPack(nodes), DEFAULT_NODE_REWARD_PACK);
});

test("every old card including duplicates and unnumbered cards becomes one star exactly once", () => {
  const migrated = createStarAccount({ coins: 7, stars: 50, keys: 2,
    collectedCardIds: ["a", "b"], cardCountsById: { a: 3, b: 1 }, uncataloguedCards: 2 });
  assert.deepEqual(migrated, { economyVersion: "session-stars.v1", coins: 7,
    stars: 6, acceptedTurns: 0, migratedCards: 6 });
  assert.deepEqual(createStarAccount(JSON.parse(JSON.stringify(migrated))), migrated);
});

test("new game is zero; stars and coins are personal, restored and idempotent", () => {
  let ledger = createPlayerAssetsLedger({ playerIds: ["a", "b"] });
  const options = { ownerId: "a", settlementId: "turn-a", acceptedAnswer: true,
    rewards: [{ resource: "coin", amount: 3 }, { resource: "star", amount: 1 }] };
  ledger = settlePlayerAssetTurn(ledger, options).ledger;
  assert.equal(ledger.playerAssetsById.a.stars, 1);
  assert.equal(ledger.playerAssetsById.b.stars, 0);
  assert.equal(ledger.playerAssetsById.b.coins, 0);
  const restored = createPlayerAssetsLedger({ ...JSON.parse(JSON.stringify(ledger)), playerIds: ledger.playerOrder });
  assert.deepEqual(restored, ledger);
  assert.deepEqual(settlePlayerAssetTurn(restored, options).ledger, ledger);
  const newGame = createPlayerAssetsLedger({ playerIds: ["a", "b"] });
  assert.equal(newGame.playerAssetsById.a.coins, 0);
  assert.equal(newGame.playerAssetsById.a.stars, 0);
});

test("five coins buy exactly one star without a card catalog; insufficient coins cannot exchange", () => {
  const ledger = createPlayerAssetsLedger({ playerIds: ["a"], playerAssetsById: { a: { coins: 5 } } });
  const options = { settlementId: "exchange", ownerId: "a", exchangeCoinsForStar: true };
  const result = settlePlayerAssetTurn(ledger, options);
  assert.equal(result.ledger.playerAssetsById.a.coins, 0);
  assert.equal(result.ledger.playerAssetsById.a.stars, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].to, "star");
  assert.deepEqual(result.openedCards, []);
  assert.deepEqual(settlePlayerAssetTurn(result.ledger, options).ledger, result.ledger);
  assert.throws(() => settlePlayerAssetTurn(result.ledger, { ...options, settlementId: "again" }), /exchange/);
  assert.equal(ledger.playerAssetsById.a.coins, 5);
  assert.throws(() => starAccountAfterEvents({}, [{ type: "resource_awarded", resource: "card", amount: 1 }]));
});

test("server isolates games, replays from events, retains old results and rejects ended-game writes", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "star-games-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let store = new StudentProfileStore({ dataDir });
  let student = await store.create({ tenantId: "owner", actorUserId: "teacher", displayName: "测试学生" });
  const ownerId = student.id;
  let ledger = createPlayerAssetsLedger({ playerIds: [ownerId] });
  const earned = settlePlayerAssetTurn(ledger, { ownerId, settlementId: "turn-1", acceptedAnswer: true,
    rewards: [{ resource: "coin", amount: 3 }, { resource: "star", amount: 1 }] });
  const args = { tenantId: "owner", actorUserId: "teacher", studentId: ownerId, sessionId: "game-one",
    settlementId: "turn-1", expectedRevision: student.revision, acceptedAnswer: true,
    account: earned.ledger.playerAssetsById[ownerId], events: earned.events };
  for (const sessionId of ["__proto__", "constructor", "prototype"]) {
    await assert.rejects(store.applyAssetSettlement({ ...args, sessionId }), { code: "student_profile_invalid" });
  }
  student = (await store.applyAssetSettlement(args)).student;
  assert.equal(student.latestGame.account.stars, 1);
  assert.equal(student.assetAccount.coins, 0, "legacy permanent balance is not changed");
  assert.equal((await store.applyAssetSettlement(args)).duplicate, true);
  await assert.rejects(store.applyAssetSettlement({ ...args, settlementId: "bad", expectedRevision: student.revision,
    acceptedAnswer: false, account: { ...args.account, stars: 99 }, events: [] }), { code: "student_asset_settlement_mismatch" });
  student = (await store.applyAssetSettlement({ ...args, settlementId: "end", expectedRevision: student.revision,
    acceptedAnswer: false, events: [{ type: "game_ended" }] })).student;
  assert.ok(student.latestGame.endedAt);
  await assert.rejects(store.applyAssetSettlement({ ...args, settlementId: "late", expectedRevision: student.revision }),
    { code: "student_game_ended" });
  const second = settlePlayerAssetTurn(createPlayerAssetsLedger({ playerIds: [ownerId] }), {
    ownerId, settlementId: "new-turn", rewards: [{ resource: "coin", amount: 1 }] });
  student = (await store.applyAssetSettlement({ ...args, sessionId: "game-two", settlementId: "new-turn",
    expectedRevision: student.revision, acceptedAnswer: false,
    account: second.ledger.playerAssetsById[ownerId], events: second.events })).student;
  assert.equal(student.latestGame.account.coins, 1);
  assert.equal(student.latestGame.account.stars, 0);
  store = new StudentProfileStore({ dataDir });
  const restored = (await store.list({ tenantId: "owner" })).students[0];
  assert.deepEqual(restored.latestGame.account, second.ledger.playerAssetsById[ownerId]);
});

test("existing permanent cards migrate to only one restored game, never to a fresh game", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "star-migration-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const store = new StudentProfileStore({ dataDir });
  let student = await store.create({ tenantId: "owner", actorUserId: "teacher", displayName: "旧局学生" });
  const old = legacyTurn(legacyLedger({ playerIds: [student.id] }), { ownerId: student.id,
    settlementId: "old-card", rewards: [{ resource: "card", amount: 1 }], cardCatalogIds: ["card.a"] });
  const base = { tenantId: "owner", actorUserId: "teacher", studentId: student.id, sessionId: "old-game" };
  student = (await store.applyAssetSettlement({ ...base, settlementId: "old-card", expectedRevision: student.revision,
    account: old.ledger.playerAssetsById[student.id], events: old.events })).student;
  const migrated = createStarAccount(student.assetAccount);
  student = (await store.applyAssetSettlement({ ...base, settlementId: "migrate", expectedRevision: student.revision,
    account: migrated, events: [], legacyMigration: true })).student;
  assert.equal(student.latestGame.account.stars, 1);
  await assert.rejects(store.applyAssetSettlement({ ...base, sessionId: "another-game", settlementId: "duplicate-migration",
    expectedRevision: student.revision, account: migrated, events: [], legacyMigration: true }),
  { code: "student_legacy_already_migrated" });
});

test("teacher can end the whole game between turns, without waiting for chapter requirements", () => {
  const session = createBoardSession({ players: ["学生"], teams: [{ id: "a", members: ["学生"] }] });
  const ended = endBoardGame(session);
  assert.equal(ended.assetGameEnded, true);
  assert.equal(ended.phase, "COMPLETED");
  assert.equal(ended.completedTurns, 0);
  assert.throws(() => endBoardGame({ ...session, inputGate: "settlement_pending" }), /committed turn/);
});
