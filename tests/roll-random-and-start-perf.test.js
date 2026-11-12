// 2026-10-21: (1) the isolated lab rolled a fixed 3 for everyone because its
// fixture die defaulted to face index 2; (2) the roll start stalled because each
// board redraw re-parsed and deep-cloned the whole points outbox once per node.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLandingPointsClient } from "../public/prototypes/universal-board/landing-points-client.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("public/prototypes/universal-board/app.js");
const lab = read("scripts/qa/landing-points-lab.mjs");
const fnBody = (source, head) => { const i = source.indexOf(head); assert.ok(i >= 0, head); return source.slice(i, source.indexOf("\n}\n", i) + 2); };

test("lab: server dice are random unless a test run opts in with MONOPOLY_LAB_FACE_INDEX", () => {
  assert.doesNotMatch(lab, /MONOPOLY_LAB_FACE_INDEX\s*\?\?\s*\d/, "no silent fixed default face");
  assert.match(lab, /random:\s*fixedFaceIndex===null\s*\?\s*randomInt\s*:/, "default is crypto randomInt, like production");
  assert.match(lab, /import \{[^}]*randomInt[^}]*\} from 'node:crypto'/);
});

test("production store still rolls with crypto randomInt(6) by default", () => {
  const store = read("standalone/points-store.mjs");
  assert.match(store, /random = randomInt/);
  assert.match(store, /const faceIndex = this\.random\(6\);/);
  assert.match(read("standalone/points-api.mjs"), /new PointsTurnStore\(\{ dataDir: resolve\(dataDir, 'points'\), platform \}\)/, "no random override in production");
});

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const KEY = `ximitu-card-hunt.landing-points.v1:${encodeURIComponent(USER)}`;
const record = (turns) => ({ externalSessionId: "game-1", expectedUserId: USER, studentIds: [STUDENT], operations: {},
  createdAt: "2026-10-21T00:00:00.000Z", session: { id: "s1", turns, specialCells: { drawNumber: 1, cells: [] } } });

test("points client parses the stored outbox once per stored text and still hands out clones", () => {
  const data = new Map([[KEY, JSON.stringify({ "game-1": record({ t1: { status: "rolled", faceIndex: 3 } }) })]]);
  const client = createLandingPointsClient({ getUserId: () => USER, storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) } });
  const parse = JSON.parse; let parses = 0;
  JSON.parse = (...args) => { parses += 1; return parse(...args); };
  try {
    const first = client.get("game-1");
    for (let i = 0; i < 50; i += 1) client.get("game-1");
    assert.equal(parses, 1, "one parse for 51 reads of the same text");
    first.session.turns.t1.faceIndex = 0; // a caller mutating its copy changes nothing stored
    assert.equal(client.getTurn("game-1", "t1").faceIndex, 3);
    // Another tab (or a save) changes the text: the next read sees it.
    data.set(KEY, JSON.stringify({ "game-1": record({ t1: { status: "rolled", faceIndex: 5 } }) }));
    assert.equal(client.getTurn("game-1", "t1").faceIndex, 5);
    assert.equal(parses, 2);
  } finally { JSON.parse = parse; }
});

test("board redraw reads the special-cells snapshot once per task, dropped on any points change", () => {
  const body = fnBody(app, "function currentSpecialCells()");
  assert.match(body, /if \(specialCellsRead\?\.id === id\) return specialCellsRead\.value;/);
  assert.match(body, /queueMicrotask\(\(\) => \{ specialCellsRead = null; \}\);/);
  assert.match(app, /onChange: \(\) => \{ specialCellsRead = null; renderPlatformPoints\(\); renderTeacherPanel\(\); \},/);
  assert.ok(app.indexOf("let specialCellsRead = null;") < app.indexOf("const landingPoints = createLandingPointsClient("), "declared before the client can notify");
});

test("one tap (points games): the server roll is requested before the board redraw", () => {
  const grant = fnBody(app, "function giveTeacherOpportunity(");
  const roll = grant.indexOf("void runTeacherTurn();");
  assert.ok(roll > grant.indexOf("persistStableSession(nextRuntime, next"), "the chance is saved first");
  assert.ok(grant.indexOf("if (serverRoll) renderHud();") > roll, "the HUD updates after the request without redrawing the entire board before the first paint");
  assert.ok(grant.indexOf("if (!serverRoll) render();") < roll, "legacy local dice keep redraw-then-roll");
});
