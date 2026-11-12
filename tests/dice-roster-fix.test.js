import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boardDir = new URL("../public/prototypes/universal-board/", import.meta.url);
const read = (name) => readFileSync(new URL(name, boardDir), "utf8");
const app = read("app.js");
const html = read("index.html");
const gameFeel = read("game-feel.css");
const specialCss = read("special-cells.css");
const boardUiCss = read("board-ui.css");
const rosterCss = read("setup-roster.css");
const fnBody = (source, header) => {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${header} exists`);
  const next = source.indexOf("\nfunction ", start + header.length);
  const nextAsync = source.indexOf("\nasync function ", start + header.length);
  const end = Math.min(...[next, nextAsync].filter((n) => n > 0));
  return source.slice(start, end);
};
const rulesOf = (css, selectorPart) => css.split("}").filter((rule) => rule.includes(selectorPart));

// ---- dice perf ------------------------------------------------------------------
test("board SVG decorations carry no CSS filter (they re-raster on every board repaint)", () => {
  for (const rule of rulesOf(boardUiCss, "{")) assert.doesNotMatch(rule, /filter\s*:/, rule.trim());
  for (const rule of rulesOf(specialCss, ".special-cell-marker")) {
    if (rule.includes(".is-exhausted")) continue; // static grayscale for spent markers only
    assert.doesNotMatch(rule, /filter\s*:/, rule.trim());
  }
});

test("special-cell markers have no infinite loops inside the board SVG", () => {
  assert.doesNotMatch(specialCss, /animation:[^;]*(sc-bob|sc-twinkle|sc-spin)/);
  assert.doesNotMatch(specialCss, /\.special-cell-marker[^{]*\{[^}]*animation:[^;}]*infinite/);
  assert.match(specialCss, /animation: sc-pop/); // one-shot landing pop kept
});

test("dice theatre never hides or fades what is under it (2026-10-21 look regression)", () => {
  // 23841ba hid the map/HUD/dock under the spinning die; Tyrese saw a broken,
  // partly transparent die. The die path is locked to 8cb82a5 (dice-look-lock.test.js).
  assert.doesNotMatch(app, /diceUnderlay|DiceUnderlay/);
  assert.doesNotMatch(gameFeel, /data-dice-underlay/);
  assert.doesNotMatch(gameFeel, /\[data-dice-overlay="true"\][^{]*\{[^}]*(visibility|opacity)\s*:/);
});

// ---- one tap to roll -----------------------------------------------------------------
test("one tap: the grant button saves the one-time chance, then starts the server roll", () => {
  const grant = fnBody(app, "function giveTeacherOpportunity(");
  const save = grant.indexOf("persistStableSession(nextRuntime, next");
  const roll = grant.indexOf("void runTeacherTurn();");
  assert.ok(save > 0 && roll > save, "persist first, then roll");
  assert.match(grant, /catch \(error\) \{[\s\S]*?return;\s*\}/, "a failed save never rolls");
  assert.match(grant, /specialCellsBlockingDice\(\)\) return;/, "never grants a chance the dice gate would block");
  // server authority unchanged: the roll still goes through landingPoints.roll
  assert.match(fnBody(app, "async function runTeacherTurn("), /landingPoints\.roll\(landingGameId\(\)/);
});

test("one tap: grant button is the roll button; the old roll button is only a resume", () => {
  const panel = fnBody(app, "function renderTeacherPanel(");
  assert.match(panel, /selectedDouble \? "🎲🎲 掷双骰" : "🎲 掷骰子"/);
  assert.match(panel, /奖励 \$\{selected\.displayName\} 一次机会并立即/);
  assert.match(panel, /nodes\.teacherGrant\.disabled = !waiting \|\| !selected \|\| Boolean\(specialCellsGate\)/);
  assert.match(panel, /nodes\.teacherRoll\.hidden = !ready;/);
  assert.match(panel, /继续/);
  assert.match(app, /nodes\.teacherGrant\.addEventListener\("click", giveTeacherOpportunity\);/);
});

// ---- roster / character modal ----------------------------------------------------
test("setup sheet: two columns that fit the screen, buddies on the wide side, no nested scroll", () => {
  assert.match(html, /setup-roster\.css/);
  assert.ok(html.indexOf("setup-roster.css") > html.indexOf("board-ui.css"), "loaded last");
  assert.match(rosterCss, /@media \(min-width: 1000px\) and \(min-height: 620px\)/);
  assert.match(rosterCss, /\.setup-stage \{[^}]*overflow: hidden/);
  assert.match(rosterCss, /grid-template-columns: clamp\(330px, 26vw, 420px\) minmax\(0, 1fr\)/);
  assert.match(rosterCss, /#setup-form > \.character-selection \{ grid-column: 2; grid-row: 1 \/ -1; \}/);
  assert.match(rosterCss, /grid-template-rows: repeat\(var\(--co-rows\), minmax\(0, 1fr\)\)/);
  assert.match(rosterCss, /\.player-character-tabs \{ flex-wrap: wrap;[^}]*overflow: visible/);
  assert.match(rosterCss, /\.student-profile-list \{[^}]*overflow-y: auto/);
  assert.doesNotMatch(rosterCss, /教学|teaching/i);
});
