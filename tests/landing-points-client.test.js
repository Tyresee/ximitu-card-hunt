import test from "node:test";
import assert from "node:assert/strict";
import { createLandingPointsClient } from "../public/prototypes/universal-board/landing-points-client.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const STUDENT_B = "22222222-2222-4222-8222-222222222222";
const EXTERNAL = "fixture-new-game";
const BASE = "/games/monopoly/api/points/v1";
const WORLD = "fixture-world-instance";
const CHOICES = { [WORLD]: { n04: "e04a" } };
const clone = (value) => structuredClone(value);

function fixture() {
  let userId = USER, sequence = 0, storageFailure = false, silentStorageFailure = false;
  const data = new Map(), sessions = new Map(), calls = [], balances = new Map([[STUDENT, 0], [STUDENT_B, 0]]);
  let before = null, after = null;
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, raw) => { if (storageFailure) throw new Error("quota"); if (!silentStorageFailure) data.set(key, raw); },
  };
  const wallet = (studentId) => ({ studentId, currency: "wordattack-points", balance: balances.get(studentId), revision: balances.get(studentId) / 200 });
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const call = { url, ...options, body };
    calls.push(call);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    if (body) { assert.equal(body.expectedUserId, userId); assert.match(options.headers["Idempotency-Key"], /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/); }
    const early = await before?.(call);
    if (early) return early;
    let payload;
    if (url === `${BASE}/context`) payload = { enabled: true, supportedModes: ["teacher-led"], ruleVersion: "monopoly-final-landing-v1" };
    else if (url.startsWith("/api/game-points/v1/students/")) payload = { wallet: wallet(url.split("/").at(-2)) };
    else if (url === `${BASE}/sessions`) {
      assert.deepEqual(Object.keys(body).sort(), ["expectedUserId", "externalSessionId", "mode", "studentIds"]);
      const index = `${userId}:${body.externalSessionId}`;
      if (!sessions.has(index)) sessions.set(index, {
        id: `session-${++sequence}`, externalSessionId: body.externalSessionId, createdBy: userId,
        studentIds: [...body.studentIds], mode: body.mode, status: "open", activeTurnId: null,
        rule: { kind: "server_verified_final_landing", enabled: true, revision: "fixture-rule-v1" },
        world: { active: { instanceId: WORLD, ordinal: 1, worldPackRef: "fixture-world@1" } },
        teams: body.studentIds.map((id) => ({ id, nodeId: "n01" })), turns: {},
      });
      payload = { session: sessions.get(index) };
    } else if (url.startsWith(`${BASE}/sessions/by-external/`)) {
      const session = sessions.get(`${userId}:${decodeURIComponent(url.split("/").at(-1))}`);
      if (!session) return Response.json({ error: "points_session_not_found", message: "not registered" }, { status: 404 });
      payload = { session };
    } else {
      const session = [...sessions.values()].find((item) => url.split("/").includes(item.id));
      if (!session) return Response.json({ error: "points_session_not_found" }, { status: 404 });
      if (options.method === "GET") payload = { session };
      else if (url.endsWith("/roll")) {
        assert.deepEqual(Object.keys(body).sort(), ["attemptId", "expectedUserId", "studentId"]);
        let turn = session.turns[body.attemptId];
        const duplicate = !!turn;
        if (!turn) {
          if (session.activeTurnId) return Response.json({ error: "points_turn_pending" }, { status: 409 });
          turn = session.turns[body.attemptId] = { attemptId: body.attemptId, studentId: body.studentId, status: "rolled", faceIndex: 3, steps: 4,
            startLocation: { worldInstanceId: WORLD, nodeId: "n01" }, receipt: null };
          session.activeTurnId = turn.attemptId;
        }
        payload = { session, turn, duplicate };
      } else if (url.endsWith("/close")) {
        assert.deepEqual(Object.keys(body), ["expectedUserId"]);
        const turn = session.turns[session.activeTurnId];
        if (turn?.status === "rolled") { turn.status = "abandoned"; session.activeTurnId = null; }
        session.status = "closed";
        payload = { session };
      } else {
        const attemptId = decodeURIComponent(url.split("/").at(-2));
        const turn = session.turns[attemptId];
        if (url.endsWith("/plan")) {
          assert.deepEqual(Object.keys(body).sort(), ["expectedUserId", "routeChoicesByWorldInstance"]);
          if (!body.routeChoicesByWorldInstance[WORLD]?.n04) return Response.json({ error: "points_route_choice_required", details: { nodeId: "n04" } }, { status: 409 });
          turn.status = "planned"; turn.routeChoicesByWorldInstance = clone(body.routeChoicesByWorldInstance);
          turn.plan = { effects: [{ type: "pawn_step", nodeId: "n05a" }], segments: [] };
          turn.finalLocation = { worldInstanceId: WORLD, nodeId: "n05a" }; turn.points = 200;
          session.teams.find((team) => team.id === turn.studentId).nodeId = "n05a";
          payload = { session, turn };
        } else {
          assert.ok(url.endsWith("/claim"));
          assert.deepEqual(Object.keys(body), ["expectedUserId"], "claim never carries client price, node or dice");
          const duplicate = !!turn.receipt;
          if (!turn.receipt) {
            balances.set(turn.studentId, balances.get(turn.studentId) + 200);
            turn.receipt = { landing: { turnId: attemptId, studentId: turn.studentId, amount: 200 }, wallet: wallet(turn.studentId), duplicate: false };
            turn.status = "awarded"; session.activeTurnId = null;
          }
          payload = { session, turn, receipt: turn.receipt, duplicate };
        }
      }
    }
    payload = clone(payload);
    await after?.(call, payload);
    return Response.json(payload);
  };
  const create = (extra = {}) => createLandingPointsClient({ getUserId: () => userId, storage, fetchImpl, createId: () => `request-${++sequence}`, ...extra });
  const client = create();
  const begin = (target = client, extras = {}) => target.registerNewGame({ externalSessionId: EXTERNAL, studentIds: [STUDENT, STUDENT_B], ...extras });
  const roll = (target = client) => target.roll(EXTERNAL, { studentId: STUDENT, attemptId: "turn-1" });
  const plan = (target = client, choices = CHOICES) => target.plan(EXTERNAL, { attemptId: "turn-1", routeChoicesByWorldInstance: choices });
  return { client, create, begin, roll, plan, data, calls, sessions, balances,
    setUser: (value) => { userId = value; }, setBefore: (hook) => { before = hook; }, setAfter: (hook) => { after = hook; },
    setStorageFailure: (value) => { storageFailure = value; }, setSilentStorageFailure: (value) => { silentStorageFailure = value; } };
}

test("server dice and route survive a refresh; refresh never claims an unshown landing", async () => {
  const f = fixture();
  assert.equal((await f.client.ready()).enabled, true);
  await f.begin();
  assert.equal((await f.roll()).turn.steps, 4);
  await f.plan();
  const restored = f.create();
  await restored.ready(EXTERNAL);
  assert.equal(restored.getTurn(EXTERNAL, "turn-1").finalLocation.nodeId, "n05a");
  assert.deepEqual(restored.getRouteChoices(EXTERNAL, "turn-1"), CHOICES);
  assert.equal(restored.pendingTurns(EXTERNAL).length, 1);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/claim")).length, 0);
  assert.equal(restored.wallet(STUDENT).balance, 0);
  await restored.claim(EXTERNAL, "turn-1");
  assert.equal(f.balances.get(STUDENT), 200);
  assert.equal(restored.getTurn(EXTERNAL, "turn-1").status, "awarded");
});

test("turn recovery can omit wallet requests while manual refresh still reads them", async () => {
  const f = fixture(); await f.begin(); await f.roll();
  await f.client.refresh(EXTERNAL, { wallets: false });
  assert.equal(f.calls.filter((call) => call.url.includes('/students/')).length, 0);
  await f.client.refresh(EXTERNAL);
  assert.equal(f.calls.filter((call) => call.url.includes('/students/')).length, 2);
});

test("lost roll response retries the same attempt and idempotency key without rerolling", async () => {
  const f = fixture(); await f.begin();
  f.setAfter((call) => { if (call.url.endsWith("/roll")) throw new TypeError("lost reply"); });
  await assert.rejects(f.roll(), { code: "points_network_unavailable" });
  const pending = f.client.get(EXTERNAL).operations["roll:turn-1"];
  assert.equal(pending.status, "pending");
  f.setAfter(null);
  const restored = f.create();
  const result = await f.roll(restored);
  assert.equal(result.turn.faceIndex, 3);
  const calls = f.calls.filter((call) => call.url.endsWith("/roll"));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(Object.keys(f.sessions.get(`${USER}:${EXTERNAL}`).turns).length, 1);
});

test("concurrent identical turn calls coalesce and changing a pending attempt is rejected", async () => {
  const f = fixture(); await f.begin();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  f.setBefore((call) => call.url.endsWith("/roll") ? wait : undefined);
  const first = f.roll(); const second = f.roll();
  assert.equal(f.client.isBusy(EXTERNAL), true);
  await assert.rejects(f.client.roll(EXTERNAL, { studentId: STUDENT_B, attemptId: "turn-1" }), { code: "points_client_busy" });
  release(); await Promise.all([first, second]);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/roll")).length, 1);
  await assert.rejects(f.client.roll(EXTERNAL, { studentId: STUDENT_B, attemptId: "turn-1" }), { code: "points_request_conflict" });
});

test("a duplicate new-game action shares the pending registration instead of querying too early", async () => {
  const f = fixture();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  f.setBefore((call) => call.url === `${BASE}/sessions` ? wait : undefined);
  const first = f.begin(); const second = f.begin();
  release(); await Promise.all([first, second]);
  assert.equal(f.calls.filter((call) => call.url === `${BASE}/sessions`).length, 1);
  assert.equal(f.calls.filter((call) => call.url.includes('/by-external/')).length, 0);
});

test("a lost plan is recovered with its original route, without choosing or posting a new plan", async () => {
  const f = fixture(); await f.begin(); await f.roll();
  f.setAfter((call) => { if (call.url.endsWith("/plan")) throw new TypeError("lost reply"); });
  await assert.rejects(f.plan(), { code: "points_network_unavailable" });
  await assert.rejects(f.plan(f.client, { [WORLD]: { n04: "e04b" } }), { code: "points_request_conflict" });
  f.setAfter(null);
  const restored = f.create(); await restored.refresh(EXTERNAL);
  assert.deepEqual(restored.getRouteChoices(EXTERNAL, "turn-1"), CHOICES);
  const replay = await restored.plan(EXTERNAL, { attemptId: "turn-1", routeChoicesByWorldInstance: {} });
  assert.deepEqual(replay.turn.routeChoicesByWorldInstance, CHOICES);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/plan")).length, 1);
});

test("a known missing route rejection allows another choice with a new key", async () => {
  const f = fixture(); await f.begin(); await f.roll();
  await assert.rejects(f.plan(f.client, {}), (error) => error.code === "points_route_choice_required" && error.details.nodeId === "n04");
  await f.plan();
  const plans = f.calls.filter((call) => call.url.endsWith("/plan"));
  assert.notEqual(plans[0].headers["Idempotency-Key"], plans[1].headers["Idempotency-Key"]);
  assert.equal(f.client.getTurn(EXTERNAL, "turn-1").status, "planned");
});

test("network failure preserves a pending claim across reload; retry credits exactly once", async () => {
  const f = fixture(); await f.begin(); await f.roll(); await f.plan();
  f.setAfter((call) => { if (call.url.endsWith("/claim")) throw new TypeError("lost receipt"); });
  await assert.rejects(f.client.claim(EXTERNAL, "turn-1"), { code: "points_network_unavailable" });
  assert.equal(f.balances.get(STUDENT), 200);
  assert.equal(f.client.get(EXTERNAL).operations["claim:turn-1"].status, "pending");
  f.setAfter(null);
  const restored = f.create();
  const result = await restored.claim(EXTERNAL, "turn-1");
  assert.equal(result.duplicate, true);
  assert.equal(f.balances.get(STUDENT), 200);
  const claims = f.calls.filter((call) => call.url.endsWith("/claim"));
  assert.equal(claims[0].headers["Idempotency-Key"], claims[1].headers["Idempotency-Key"]);
  await restored.claim(EXTERNAL, "turn-1");
  assert.equal(f.calls.filter((call) => call.url.endsWith("/claim")).length, 2);
});

test("refresh resolves a lost claim response without resending claim or registration", async () => {
  const f = fixture(); await f.begin(); await f.roll(); await f.plan();
  f.setAfter((call) => { if (call.url.endsWith("/claim")) throw new TypeError("lost receipt"); });
  await assert.rejects(f.client.claim(EXTERNAL, "turn-1"));
  f.setAfter(null);
  const restored = f.create(); await restored.refresh(EXTERNAL);
  assert.equal(restored.get(EXTERNAL).operations["claim:turn-1"].status, "done");
  assert.equal(restored.pendingTurns(EXTERNAL).length, 0);
  assert.equal(restored.wallet(STUDENT).balance, 200);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/claim")).length, 1);
  assert.equal(f.calls.filter((call) => call.url === `${BASE}/sessions`).length, 1);
});

test("accounts cannot see each other's outbox or wallet, and late responses cannot switch ownership", async () => {
  const f = fixture(); await f.begin(); await f.roll(); await f.plan();
  f.setAfter((call) => { if (call.url.endsWith("/claim")) f.setUser(OTHER); });
  await assert.rejects(f.client.claim(EXTERNAL, "turn-1"), { code: "auth_context_changed" });
  assert.equal(f.client.get(EXTERNAL), null);
  assert.deepEqual(f.client.records(), []);
  assert.equal(f.client.wallet(STUDENT), null);
  f.setAfter(null); f.setUser(USER);
  assert.equal(f.client.get(EXTERNAL).operations["claim:turn-1"].status, "pending");
  await f.client.refresh(EXTERNAL);
  assert.equal(f.client.wallet(STUDENT).balance, 200);
});

test("storage failure, including silently discarded writes, prevents remote mutations", async () => {
  for (const silent of [false, true]) {
    const f = fixture();
    if (silent) f.setSilentStorageFailure(true); else f.setStorageFailure(true);
    await assert.rejects(f.begin(), { code: "points_storage_unavailable" });
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(); await f.begin(); f.setStorageFailure(true);
  await assert.rejects(f.roll(), { code: "points_storage_unavailable" });
  assert.equal(f.calls.filter((call) => call.url.endsWith("/roll")).length, 0);
});

test("old or unknown games only query; registration retries require explicit unstarted permission", async () => {
  const f = fixture();
  await assert.rejects(f.client.ready("historical-game"), { status: 404 });
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 0);
  f.setBefore((call) => { if (call.url === `${BASE}/sessions`) throw new TypeError("offline"); });
  await assert.rejects(f.begin()); f.setBefore(null);
  await assert.rejects(f.begin(), { status: 404 });
  assert.equal(f.calls.filter((call) => call.url === `${BASE}/sessions`).length, 1);
  await f.begin(f.client, { retryUnstarted: true });
  const registrations = f.calls.filter((call) => call.url === `${BASE}/sessions`);
  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].headers["Idempotency-Key"], registrations[1].headers["Idempotency-Key"]);
});

test("closed sessions retain planned claims while unplanned rolls remain abandoned", async () => {
  const f = fixture(); await f.begin(); await f.roll(); await f.plan();
  await f.client.close(EXTERNAL);
  assert.equal(f.client.getTurn(EXTERNAL, "turn-1").status, "planned");
  await f.client.claim(EXTERNAL, "turn-1");
  assert.equal(f.balances.get(STUDENT), 200);
  const g = fixture(); await g.begin(); await g.roll(); await g.client.close(EXTERNAL);
  await g.client.refresh(EXTERNAL);
  assert.equal(g.client.getTurn(EXTERNAL, "turn-1").status, "abandoned");
  await assert.rejects(g.client.claim(EXTERNAL, "turn-1"), { code: "points_turn_not_planned" });
});

test("a wrong student wallet or altered receipt never marks the landing as paid", async () => {
  const f = fixture(); await f.begin(); await f.roll(); await f.plan();
  f.setAfter((call, payload) => {
    if (call.url.endsWith("/claim")) {
      payload.turn.receipt.wallet.studentId = STUDENT_B;
      payload.session.turns["turn-1"].receipt.wallet.studentId = STUDENT_B;
      payload.receipt.wallet.studentId = STUDENT_B;
    }
  });
  await assert.rejects(f.client.claim(EXTERNAL, "turn-1"), { code: "points_receipt_invalid" });
  assert.equal(f.client.getTurn(EXTERNAL, "turn-1").status, "planned");
  assert.equal(f.client.wallet(STUDENT), null);
});

test("timeout retains the exact pending command, even when fetch ignores abort", async () => {
  const f = fixture(); const client = f.create({ timeoutMs: 10 }); await f.begin(client);
  f.setBefore((call) => call.url.endsWith("/roll") ? new Promise(() => {}) : undefined);
  await assert.rejects(f.roll(client), { code: "points_timeout" });
  assert.equal(client.get(EXTERNAL).operations["roll:turn-1"].status, "pending");
  assert.equal(client.isBusy(EXTERNAL), false);
});


test("awarded special-cell bonus wallets refresh the client cache beyond the base landing receipt", async () => {
  const f = fixture();
  await f.client.ready();
  await f.client.registerNewGame({ externalSessionId: EXTERNAL, studentIds: [STUDENT, STUDENT_B] });
  await f.client.roll(EXTERNAL, { studentId: STUDENT, attemptId: "turn-bonus" });
  await f.client.plan(EXTERNAL, { attemptId: "turn-bonus", routeChoicesByWorldInstance: CHOICES });
  f.setAfter((call, payload) => {
    if (!call.url.endsWith("/claim")) return;
    payload.session.specialCells = {
      bonusAwards: {
        "turn-bonus:special": {
          key: "turn-bonus:special", studentId: STUDENT, amount: 100, status: "awarded",
          receipt: { bonus: { amount: 100, studentId: STUDENT }, wallet: {
            studentId: STUDENT, currency: "wordattack-points", balance: 300, revision: 2,
          } },
        },
        [`sc-red:${STUDENT_B}`]: {
          key: `sc-red:${STUDENT_B}`, studentId: STUDENT_B, amount: 50, status: "awarded",
          receipt: { bonus: { amount: 50, studentId: STUDENT_B }, wallet: {
            studentId: STUDENT_B, currency: "wordattack-points", balance: 50, revision: 1,
          } },
        },
      },
    };
    // Base landing receipt stays at 200; bonus wallets must still win via revision.
    payload.receipt.wallet = { studentId: STUDENT, currency: "wordattack-points", balance: 200, revision: 1 };
    payload.turn.receipt.wallet = payload.receipt.wallet;
    payload.session.turns["turn-bonus"].receipt.wallet = payload.receipt.wallet;
    payload.session.turns["turn-bonus"].specialCell = {
      type: "star", category: "points", bonus: 100, amount: 300, cellId: "sc1-01",
    };
  });
  await f.client.claim(EXTERNAL, "turn-bonus");
  assert.equal(f.client.wallet(STUDENT).balance, 300);
  assert.equal(f.client.wallet(STUDENT_B).balance, 50);
  assert.equal(f.client.getSpecialCells(EXTERNAL).bonusAwards["turn-bonus:special"].status, "awarded");
});
