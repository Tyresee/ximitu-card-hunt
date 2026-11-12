import test from "node:test";
import assert from "node:assert/strict";
import { createLandingPointsClient } from "../public/prototypes/universal-board/landing-points-client.js";
import { specialCellsIntroTiming } from "../public/prototypes/universal-board/special-cells-intro.js";
import { SPECIAL_CELL_TYPES } from "../public/prototypes/universal-board/special-cells-core.js";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const EXTERNAL = "fixture-special-game";
const BASE = "/games/monopoly/api/points/v1";
const clone = (value) => structuredClone(value);

function fixture() {
  const data = new Map(), calls = [];
  let session = null, sequence = 0, loseNextReply = false;
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, raw) => data.set(key, raw) };
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, key: options.headers?.["Idempotency-Key"] });
    let payload;
    if (url === `${BASE}/context`) payload = { enabled: true, supportedModes: ["teacher-led"], ruleVersion: "fixture" };
    else if (url.startsWith("/api/game-points/v1/students/")) payload = { wallet: { studentId: STUDENT, currency: "wordattack-points", balance: 0, revision: 0 } };
    else if (url === `${BASE}/sessions`) {
      session ||= { id: "session-1", externalSessionId: body.externalSessionId, createdBy: USER, studentIds: body.studentIds, mode: body.mode,
        status: "open", activeTurnId: null, rule: { kind: "server_verified_final_landing", enabled: true, revision: "fixture" },
        world: { active: { instanceId: "w1", ordinal: 1, worldPackRef: "fixture@1" } }, teams: [{ id: STUDENT, nodeId: "n01" }], turns: {},
        rewardPolicy: "points-only-v2-special-cells",
        specialCells: { drawNumber: 0, cells: [], consumed: [], locked: false, groupMoves: {}, groupMoveSuccesses: 0, bonusAwards: {} } };
      payload = { session };
    } else if (url.startsWith(`${BASE}/sessions/by-external/`)) payload = { session };
    else if (url.endsWith("/special-cells/draw")) {
      assert.deepEqual(Object.keys(body).sort(), ["density", "expectedUserId", "multipliersEnabled", "previousDrawNumber"]);
      const state = session.specialCells;
      if (state.locked) return Response.json({ error: "special_cells_locked" }, { status: 409 });
      if (body.previousDrawNumber === state.drawNumber) {
        state.drawNumber += 1; state.density = body.density; state.multipliersEnabled = body.multipliersEnabled;
        state.cells = [{ cellId: `sc${state.drawNumber}-01`, worldRef: "fixture@1", nodeId: "n07a", type: "star" }];
      }
      payload = { session, specialCells: state };
      if (loseNextReply) { loseNextReply = false; throw new TypeError("lost reply"); }
    } else if (url.includes("/group-moves/")) {
      assert.deepEqual(Object.keys(body).sort(), ["decision", "expectedUserId"]);
      const move = session.specialCells.groupMoves[decodeURIComponent(url.split("/").at(-2))];
      move.status = body.decision === "confirm" ? "confirmed" : "cancelled";
      payload = { session, groupMove: move, duplicate: false };
    } else if (options.method === "GET") payload = { session };
    else throw new Error(`unexpected ${url}`);
    return Response.json(clone(payload));
  };
  const client = createLandingPointsClient({ getUserId: () => USER, storage, fetchImpl, createId: () => `request-${++sequence}` });
  return { client, calls, get session() { return session; }, loseReply: () => { loseNextReply = true; } };
}

test("intro timing: the full opening stays within 9s even for 16 cells of every type; short ≈3s", () => {
  const all = SPECIAL_CELL_TYPES.flatMap((type) => [{ type: type.id }, { type: type.id }]).slice(0, 16);
  const full = specialCellsIntroTiming(all);
  assert.ok(full.total <= 9.0001, `full ${full.total}`);
  assert.ok(full.total >= 6, "still a real show, not a flash");
  assert.ok(Math.abs(full.short - 3) < 0.2, `short ${full.short}`);
  assert.ok(full.reduced < 2, `reduced ${full.reduced}`);
  const few = specialCellsIntroTiming([{ type: "star" }, { type: "bag" }, { type: "move1" }, { type: "double" }, { type: "crown" }]);
  assert.ok(few.total <= full.total);
});

test("client draw: strict body, previousDrawNumber fencing, lost reply retries the same key", async () => {
  const f = fixture();
  await f.client.ready();
  await f.client.registerNewGame({ externalSessionId: EXTERNAL, studentIds: [STUDENT] });
  await f.client.drawSpecialCells(EXTERNAL, { density: "normal", multipliersEnabled: true });
  assert.equal(f.client.getSpecialCells(EXTERNAL).drawNumber, 1);
  assert.equal(f.calls.at(-1).body.previousDrawNumber, 0);
  f.loseReply();
  await assert.rejects(f.client.drawSpecialCells(EXTERNAL, { density: "many", multipliersEnabled: false }));
  const lostKey = f.calls.at(-1).key;
  assert.equal(f.session.specialCells.drawNumber, 2, "server applied the redraw");
  await f.client.drawSpecialCells(EXTERNAL, { density: "many", multipliersEnabled: false });
  assert.equal(f.calls.at(-1).key, lostKey, "the retry reuses the original idempotency key");
  assert.equal(f.calls.at(-1).body.previousDrawNumber, 1);
  assert.equal(f.client.getSpecialCells(EXTERNAL).drawNumber, 2, "no third draw");
  await assert.rejects(f.client.drawSpecialCells(EXTERNAL, { density: "lots", multipliersEnabled: true }));
  f.session.specialCells.locked = true;
  await f.client.refresh(EXTERNAL, { wallets: false });
  await assert.rejects(f.client.drawSpecialCells(EXTERNAL, { density: "normal", multipliersEnabled: true }), { code: "special_cells_locked" });
});

test("client group move: confirm once; an already-resolved move never calls the server again", async () => {
  const f = fixture();
  await f.client.ready();
  await f.client.registerNewGame({ externalSessionId: EXTERNAL, studentIds: [STUDENT] });
  f.session.specialCells.groupMoves["gm-turn-1"] = { instanceId: "gm-turn-1", type: "move1", steps: 1, status: "pending", moves: [] };
  await f.client.refresh(EXTERNAL, { wallets: false });
  await f.client.resolveGroupMove(EXTERNAL, "gm-turn-1", "confirm");
  assert.equal(f.client.getSpecialCells(EXTERNAL).groupMoves["gm-turn-1"].status, "confirmed");
  const before = f.calls.length;
  const again = await f.client.resolveGroupMove(EXTERNAL, "gm-turn-1", "confirm");
  assert.equal(again.duplicate, true);
  assert.equal(f.calls.length, before);
  await assert.rejects(f.client.resolveGroupMove(EXTERNAL, "gm-missing", "confirm"), { code: "special_cells_group_move_not_found" });
  await assert.rejects(f.client.resolveGroupMove(EXTERNAL, "gm-turn-1", "maybe"));
});
