import test from "node:test";
import assert from "node:assert/strict";
import { createLandingPointsClient } from "../public/prototypes/universal-board/landing-points-client.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GAME = "group-game", GROUP = "gm-source", WORLD = "world-instance";
const API = "/games/monopoly/api/points/v1/sessions";
const clone = value => structuredClone(value);

function fixture({ revision = "monopoly-final-landing-v3" } = {}) {
  const scale = revision === "monopoly-final-landing-v3" ? 5 : 1;
  let user = USER, sequence = 0, failStudent = null, loseReply = false, tamper = null, storageFailure = false;
  const data = new Map(), calls = [], balances = new Map([[A, 0], [B, 0]]), revisions = new Map([[A, 0], [B, 0]]);
  const session = { id: "session-one", externalSessionId: GAME, createdBy: USER, studentIds: [A, B],
    mode: "teacher-led", status: "open", turns: {}, teams: [{ id: A, nodeId: "n02" }, { id: B, nodeId: "n03" }],
    rule: { kind: "server_verified_final_landing", enabled: true, revision, worlds: [{
      worldRef: "world-one@1", boardRef: "board-one@1", levelRef: "level-one@1",
      nodes: [{ nodeId: "n03", points: 100 * scale }, { nodeId: "n04", points: 500 * scale }],
    }] }, world: { active: { instanceId: WORLD, worldPackRef: "world-one@1" } },
    specialCells: { groupMoves: { [GROUP]: { instanceId: GROUP, sourceTurnId: "source", status: "pending", steps: 1, moves: [] } } } };
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => {
    if (storageFailure) throw new Error("quota"); data.set(key, value);
  } };
  const wallet = studentId => ({ studentId, currency: "wordattack-points", balance: balances.get(studentId), revision: revisions.get(studentId) });
  function confirm() {
    const move = session.specialCells.groupMoves[GROUP];
    move.status = "confirmed"; move.worldInstanceId = WORLD; move.rewardPolicy = "group-final-landing-v1";
    move.moves = [{ studentId: A, fromNodeId: "n02", toNodeId: "n03", path: ["n03"] },
      { studentId: B, fromNodeId: "n03", toNodeId: "n04", path: ["n04"] }];
    move.awards = move.moves.map((entry, index) => ({ studentId: entry.studentId,
      attemptId: `group-landing:award-${index}`, points: (index ? 500 : 100) * scale, ruleVersion: revision, status: "planned", receipt: null,
      event: { turnId: `group-landing:award-${index}`, studentId: entry.studentId, worldRef: "world-one@1",
        worldInstanceId: WORLD, boardRef: "board-one@1", levelRef: "level-one@1", nodeId: entry.toNodeId } }));
    session.teams = move.moves.map(entry => ({ id: entry.studentId, nodeId: entry.toNodeId }));
  }
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, key: options.headers["Idempotency-Key"] });
    if (options.method === "POST" && url.endsWith("/claim")) {
      assert.deepEqual(body, { expectedUserId: USER }, "browser cannot submit amounts, nodes or student IDs");
      const saved = JSON.parse(data.get(`ximitu-card-hunt.landing-points.v1:${USER}`));
      assert.equal(saved[GAME].operations[`group-claim:${GROUP}`].idempotencyKey, options.headers["Idempotency-Key"], "claim identity must already be durable");
      for (const award of session.specialCells.groupMoves[GROUP].awards) {
        if (award.status === "awarded" || award.studentId === failStudent) continue;
        balances.set(award.studentId, balances.get(award.studentId) + award.points);
        revisions.set(award.studentId, revisions.get(award.studentId) + 1);
        award.status = "awarded";
        award.receipt = { landing: { ...award.event, amount: award.points, status: "awarded",
          ruleVersion: award.ruleVersion || session.initialRuleVersion || session.rule.revision, currency: "wordattack-points" }, wallet: wallet(award.studentId) };
      }
    } else if (options.method === "POST" && url.endsWith("/resolve")) {
      assert.deepEqual(body, { expectedUserId: USER, decision: "confirm" }); confirm();
    }
    const payload = { session: clone(session), ...(url.includes("/group-moves/") ? { groupMove: clone(session.specialCells.groupMoves[GROUP]) } : {}) };
    tamper?.(payload, url);
    if (loseReply && url.endsWith("/claim")) { loseReply = false; throw new TypeError("lost reply"); }
    return Response.json(payload);
  };
  const create = () => createLandingPointsClient({ getUserId: () => user, storage, fetchImpl, createId: () => `request-${++sequence}` });
  const client = create();
  const begin = async () => { await client.registerNewGame({ externalSessionId: GAME, studentIds: [A, B] }); await client.resolveGroupMove(GAME, GROUP, "confirm"); };
  return { client, create, begin, session, calls, balances, data, confirm,
    fail: value => { failStudent = value; }, lose: () => { loseReply = true; },
    tamper: hook => { tamper = hook; }, user: value => { user = value; }, storageFailure: () => { storageFailure = true; } };
}

test("group claims use a separate durable identity; partial success stays pending and retries only unpaid pupils", async () => {
  const f = fixture(); await f.begin();
  assert.deepEqual([...f.balances.values()], [0, 0], "resolve only freezes movement and rewards");
  f.fail(B); await f.client.claimGroupMove(GAME, GROUP);
  assert.deepEqual([...f.balances.values()], [500, 0]);
  assert.equal(f.client.get(GAME).operations[`group-claim:${GROUP}`].status, "pending");
  assert.equal(f.client.wallet(A).balance, 500);
  assert.equal(f.client.wallet(B), null);
  const restored = f.create(); await restored.refresh(GAME, { wallets: false });
  assert.equal(f.calls.filter(call => call.url.endsWith("/claim")).length, 1, "refresh does not claim unshown movement");
  f.fail(null); await restored.claimGroupMove(GAME, GROUP);
  assert.deepEqual([...f.balances.values()], [500, 2500]);
  assert.equal(restored.wallet(B).balance, 2500);
  assert.equal(restored.get(GAME).operations[`group-claim:${GROUP}`].status, "done");
  const claims = f.calls.filter(call => call.url.endsWith("/claim"));
  assert.equal(claims[0].key, claims[1].key);
  await restored.claimGroupMove(GAME, GROUP);
  assert.equal(f.calls.filter(call => call.url.endsWith("/claim")).length, 2);
});

test("lost group claim replies recover all receipts through refresh without another payout", async () => {
  const f = fixture(); await f.begin(); f.lose();
  await assert.rejects(f.client.claimGroupMove(GAME, GROUP), { code: "points_network_unavailable" });
  const restored = f.create(); await restored.refresh(GAME, { wallets: false });
  assert.equal(restored.get(GAME).operations[`group-claim:${GROUP}`].status, "done");
  assert.deepEqual([restored.wallet(A).balance, restored.wallet(B).balance], [500, 2500]);
  await restored.claimGroupMove(GAME, GROUP);
  assert.equal(f.calls.filter(call => call.url.endsWith("/claim")).length, 1);
});

test("settled v2 group receipts retain their original prices after v3 rules become active", async () => {
  const f = fixture({ revision: "monopoly-final-landing-v2" });
  await f.begin(); await f.client.claimGroupMove(GAME, GROUP);
  assert.deepEqual([...f.balances.values()], [100, 500]);
  const legacyRule = clone(f.session.rule);
  f.session.initialRuleVersion = legacyRule.revision;
  f.session.ruleHistory = { [legacyRule.revision]: legacyRule };
  f.session.rule = { ...clone(legacyRule), revision: "monopoly-final-landing-v3",
    worlds: legacyRule.worlds.map(world => ({ ...clone(world), nodes: world.nodes.map(node => ({ ...node, points: node.points * 5 })) })) };
  const restored = f.create(); await restored.refresh(GAME, { wallets: false });
  const awards = restored.get(GAME).session.specialCells.groupMoves[GROUP].awards;
  assert.deepEqual(awards.map(award => [award.ruleVersion, award.points, award.receipt.landing.amount]),
    [["monopoly-final-landing-v2", 100, 100], ["monopoly-final-landing-v2", 500, 500]]);
  const calls = f.calls.filter(call => call.url.endsWith("/claim")).length;
  await restored.claimGroupMove(GAME, GROUP);
  assert.equal(f.calls.filter(call => call.url.endsWith("/claim")).length, calls, "historical receipts never create a new credit");
  assert.deepEqual([restored.wallet(A).balance, restored.wallet(B).balance], [100, 500]);
  f.tamper(payload => {
    payload.session.specialCells.groupMoves[GROUP].awards[0].ruleVersion = "monopoly-final-landing-v3";
  });
  await assert.rejects(restored.refresh(GAME, { wallets: false }), { code: "points_group_awards_invalid" });
});

test("legacy confirmed moves cannot acquire retroactive rewards; pending moves cannot claim", async () => {
  const f = fixture(); await f.client.registerNewGame({ externalSessionId: GAME, studentIds: [A, B] });
  await assert.rejects(f.client.claimGroupMove(GAME, GROUP), { code: "special_cells_group_move_unconfirmed" });
  f.session.specialCells.groupMoves[GROUP].status = "confirmed";
  await f.client.refresh(GAME, { wallets: false });
  await f.client.claimGroupMove(GAME, GROUP);
  assert.equal(f.calls.some(call => call.url.endsWith("/claim")), false);
});

test("every group award is bound to its exact student, movement, immutable price and signed landing", async () => {
  for (const change of [
    award => { award.studentId = B; }, award => { award.attemptId = "other"; },
    award => { award.points = 200; }, award => { award.event.nodeId = "n04"; },
    award => { award.event.worldInstanceId = "other-world"; }, award => { award.event.boardRef = "other-board"; },
    award => { award.receipt.wallet.studentId = B; }, award => { award.receipt.landing.turnId = "other"; },
    award => { award.receipt.landing.ruleVersion = "other-rule"; }, award => { award.receipt.landing.currency = "other"; },
    award => { award.receipt.landing.nodeId = "other-node"; },
  ]) {
    const f = fixture(); await f.begin();
    f.tamper((payload, url) => { if (!url.endsWith("/claim")) return;
      change(payload.session.specialCells.groupMoves[GROUP].awards[0]);
      payload.groupMove = clone(payload.session.specialCells.groupMoves[GROUP]);
    });
    await assert.rejects(f.client.claimGroupMove(GAME, GROUP));
    assert.equal(f.client.get(GAME).session.specialCells.groupMoves[GROUP].awards[0].status, "planned");
    assert.equal(f.client.wallet(A), null);
  }
});

test("group payout errors cannot cross accounts or bypass durable outbox writes", async () => {
  const f = fixture(); await f.begin();
  f.tamper((_payload, url) => { if (url.endsWith("/claim")) f.user(OTHER); });
  await assert.rejects(f.client.claimGroupMove(GAME, GROUP), { code: "auth_context_changed" });
  assert.equal(f.client.wallet(A), null); assert.deepEqual(f.client.records(), []);
  const g = fixture(); await g.begin(); g.storageFailure();
  await assert.rejects(g.client.claimGroupMove(GAME, GROUP), { code: "points_storage_unavailable" });
  assert.equal(g.calls.some(call => call.url.endsWith("/claim")), false);
});
