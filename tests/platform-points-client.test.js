import test from "node:test";
import assert from "node:assert/strict";
import { createMonopolyPointsClient, platformPointsCopy } from "../public/prototypes/universal-board/platform-points-client.js";

const STUDENTS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const EXTERNAL = "local-session-33333333-3333-4333-8333-333333333333";
const BASE = "/api/game-points/v1/monopoly/sessions";

function fixture({ enabled = false } = {}) {
  const storageData = new Map();
  const calls = [];
  const sessions = new Map();
  const balances = new Map(STUDENTS.map((id) => [id, 0]));
  let userId = "fixture-teacher";
  let rule = { kind: "teacher_confirmed_session", enabled, points: enabled ? 7 : null, revision: enabled ? "fixture-7" : "disabled-v1" };
  let fail = null;
  let storageFail = false;
  let responseHook = null;
  const storage = {
    getItem: (key) => storageData.get(key) || null,
    setItem: (key, value) => { if (storageFail) throw new Error("quota"); storageData.set(key, value); },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : null });
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    if (fail) return fail(url, options);
    const body = options.body ? JSON.parse(options.body) : {};
    let payload;
    if (url === BASE && options.method === "POST") {
      assert.deepEqual(Object.keys(body).sort(), ["expectedUserId", "externalSessionId", "studentIds"]);
      if (!sessions.has(body.externalSessionId)) sessions.set(body.externalSessionId, {
        id: `session-${sessions.size}`, externalSessionId: body.externalSessionId,
        sourceGameId: "ximitu-card-hunt", studentIds: [...body.studentIds], status: "open",
        rule: structuredClone(rule), settlement: null,
      });
      payload = { session: sessions.get(body.externalSessionId), duplicate: false };
    } else if (url.startsWith(`${BASE}/by-external/`)) {
      const session = sessions.get(decodeURIComponent(url.split("/").at(-1)));
      if (!session) return Response.json({ message: "not registered" }, { status: 404 });
      payload = { session };
    } else if (url.startsWith(`${BASE}/`)) {
      const session = [...sessions.values()].find((item) => url.split("/").includes(item.id));
      if (!session) return Response.json({ message: "not registered" }, { status: 404 });
      if (options.method === "POST") {
        assert.ok(url.endsWith("/complete"));
        assert.deepEqual(Object.keys(body), ["expectedUserId"], "browser never submits score, amount or sourceGameId");
        const duplicate = Boolean(session.settlement);
        if (!session.settlement) {
          const awards = session.rule.enabled ? session.studentIds.map((studentId) => {
            balances.set(studentId, balances.get(studentId) + session.rule.points);
            return { studentId, amount: session.rule.points, ledgerEntryId: `entry-${session.id}-${studentId}` };
          }) : [];
          session.status = "completed";
          session.settlement = { status: session.rule.enabled ? "awarded" : "disabled", awards };
        }
        payload = { session, ...session.settlement, duplicate };
      } else payload = { session };
    } else {
      const studentId = url.split("/").at(-2);
      payload = { wallet: { studentId, balance: balances.get(studentId) } };
    }
    if (responseHook) await responseHook(url, payload);
    return Response.json(payload);
  };
  const create = () => createMonopolyPointsClient({ getUserId: () => userId, storage, fetchImpl });
  return {
    client: create(), create, calls, sessions, balances, storageData,
    setRule: (value) => { rule = value; }, setFail: (value) => { fail = value; },
    setStorageFail: (value) => { storageFail = value; }, setUser: (value) => { userId = value; },
    setResponseHook: (value) => { responseHook = value; },
    begin(client) { return (client || this.client).registerNewGame({ externalSessionId: EXTERNAL, studentIds: STUDENTS }); },
  };
}

test("disabled rule is frozen at start; teacher end records disabled rather than +0 or future backpay", async () => {
  const f = fixture();
  await f.begin();
  f.setRule({ kind: "teacher_confirmed_session", enabled: true, points: 77, revision: "future" });
  await f.client.confirmCompletion(EXTERNAL);
  const record = f.client.get(EXTERNAL);
  assert.equal(record.status, "disabled");
  assert.equal(record.session.rule.revision, "disabled-v1");
  assert.match(platformPointsCopy(record), /未配置.*未到账/);
  assert.doesNotMatch(platformPointsCopy(record), /成功|\+0/);
  assert.deepEqual([...f.balances.values()], [0, 0]);
  await f.client.confirmCompletion(EXTERNAL);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/complete")).length, 1);
});

test("enabled fixture rule credits once and reads platform balances, never game score", async () => {
  const f = fixture({ enabled: true });
  await f.begin();
  await Promise.all([f.client.confirmCompletion(EXTERNAL), f.client.confirmCompletion(EXTERNAL)]);
  assert.equal(f.client.get(EXTERNAL).status, "awarded");
  assert.deepEqual([...f.balances.values()], [7, 7]);
  assert.equal(f.client.wallet(STUDENTS[0]).balance, 7);
  assert.equal(f.calls.filter((call) => call.url === BASE).length, 1);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/complete")).length, 1);
});

test("lost registration response recovers by external id without registering again", async () => {
  const f = fixture({ enabled: true });
  f.setResponseHook((url) => { if (url === BASE) throw new TypeError("lost response"); });
  await f.begin();
  assert.equal(f.client.get(EXTERNAL).session, null);
  f.setResponseHook(null);
  await f.client.confirmCompletion(EXTERNAL);
  assert.ok(f.calls.some((call) => call.url === `${BASE}/by-external/${EXTERNAL}`));
  assert.equal(f.client.get(EXTERNAL).status, "awarded");
  assert.equal(f.calls.filter((call) => call.url === BASE).length, 1);
});

test("registration that never arrived is never created at end under a new rule", async () => {
  const f = fixture();
  f.setFail(() => { throw new TypeError("offline"); });
  await f.begin();
  f.setFail(null);
  f.setRule({ kind: "teacher_confirmed_session", enabled: true, points: 700, revision: "future" });
  await f.client.confirmCompletion(EXTERNAL);
  await f.client.confirmCompletion(EXTERNAL);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
  assert.match(platformPointsCopy(f.client.get(EXTERNAL)), /未找到.*未到账/);
});

test("lost completion receipt is recovered after reload, not credited a second time", async () => {
  const f = fixture({ enabled: true });
  await f.begin();
  f.setResponseHook((url) => { if (url.endsWith("/complete")) throw new TypeError("response lost"); });
  await f.client.confirmCompletion(EXTERNAL);
  const originalKey = f.calls.find((call) => call.url.endsWith("/complete")).headers["Idempotency-Key"];
  assert.equal(f.client.get(EXTERNAL).completionRequested, true);
  f.setResponseHook(null);
  const restored = f.create();
  await restored.confirmCompletion(EXTERNAL);
  assert.equal(restored.get(EXTERNAL).status, "awarded");
  assert.equal(restored.get(EXTERNAL).completeKey, originalKey);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/complete")).length, 1);
  assert.deepEqual([...f.balances.values()], [7, 7]);
});

test("a completion not delivered retries the exact original command key", async () => {
  const f = fixture({ enabled: true });
  await f.begin();
  f.setFail((url) => url.endsWith("/complete")
    ? Promise.reject(new TypeError("offline"))
    : Response.json({ session: f.sessions.get(EXTERNAL) }));
  await f.client.confirmCompletion(EXTERNAL);
  f.setFail(null);
  await f.create().confirmCompletion(EXTERNAL);
  const writes = f.calls.filter((call) => call.url.endsWith("/complete"));
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].body, writes[1].body);
  assert.equal(writes[0].headers["Idempotency-Key"], writes[1].headers["Idempotency-Key"]);
  assert.deepEqual([...f.balances.values()], [7, 7]);
});

test("old saved games, anonymous users and local seat identities cannot register or backfill points", async () => {
  const f = fixture();
  await f.client.confirmCompletion("old-game");
  await f.client.refresh("old-game");
  await f.client.registerNewGame({ externalSessionId: EXTERNAL, studentIds: ["seat-1"] });
  f.setUser(null);
  await f.begin();
  assert.equal(f.calls.length, 0);
});

test("local outbox failure fails closed for writes without affecting the game", async () => {
  const f = fixture();
  f.setStorageFail(true);
  await f.begin();
  assert.equal(f.calls.length, 0);
  assert.match(f.client.error(), /无法保存/);
  f.setStorageFail(false);
  await f.begin();
  f.setStorageFail(true);
  const callsBefore = f.calls.length;
  await f.client.confirmCompletion(EXTERNAL);
  assert.equal(f.calls.length, callsBefore);
});

test("account switch hides the prior teacher's outbox and discards late responses", async () => {
  const f = fixture();
  f.setResponseHook(() => { f.setUser("another-teacher"); });
  await f.begin();
  assert.equal(f.client.records().length, 0);
  assert.equal(f.client.get(EXTERNAL), null);
  f.setUser("fixture-teacher");
  assert.equal(f.client.get(EXTERNAL).session, null);
});

test("server source or roster mismatch fails closed; malformed receipt is not success", async () => {
  for (const change of [
    (payload) => { payload.session.studentIds = [STUDENTS[0]]; },
    (payload) => { payload.session.sourceGameId = "some-other-game"; },
  ]) {
    const f = fixture();
    f.setResponseHook((url, payload) => { if (url === BASE) change(payload); });
    await f.begin();
    assert.match(f.client.get(EXTERNAL).error, /不一致/);
    assert.equal(f.client.get(EXTERNAL).session, null);
  }
  const f = fixture({ enabled: true });
  await f.begin();
  f.setResponseHook((url, payload) => { if (url.endsWith("/complete")) payload.awards = []; });
  await f.client.confirmCompletion(EXTERNAL);
  assert.notEqual(f.client.get(EXTERNAL).status, "awarded");
  assert.match(f.client.get(EXTERNAL).error, /不完整/);
});

test("login expiry and unavailable wallets are explicit, not zero balances", async () => {
  const f = fixture();
  await f.begin();
  f.setFail(() => Response.json({ error: "unauthorized" }, { status: 401 }));
  await f.client.confirmCompletion(EXTERNAL);
  assert.match(f.client.get(EXTERNAL).error, /登录已失效/);
  assert.equal(f.client.wallet(STUDENTS[0]), null);
  f.setFail(null);
  f.setResponseHook((url, payload) => { if (url.endsWith("/wallet")) payload.wallet.balance = null; });
  await f.client.confirmCompletion(EXTERNAL);
  assert.equal(f.client.wallet(STUDENTS[0]).balance, undefined);
  assert.match(f.client.wallet(STUDENTS[0]).error, /未读取/);
});

test("teacher ending while registration is pending retains the explicit completion request", async () => {
  const f = fixture();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  f.setResponseHook((url) => url === BASE ? wait : undefined);
  const begin = f.begin();
  await new Promise((resolve) => setImmediate(resolve));
  const finish = f.client.confirmCompletion(EXTERNAL);
  release();
  await Promise.all([begin, finish]);
  assert.equal(f.client.get(EXTERNAL).completionRequested, true);
  assert.equal(f.client.get(EXTERNAL).status, "disabled");
});
