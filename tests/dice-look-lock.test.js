// Dice look lock: the die (cube, bevels, faces, theatre, overlay toggle) must stay
// exactly as in 8cb82a5, the look the teacher approved. If you change the die on
// purpose, re-check it frame-by-frame with scripts/qa/dice-look-compare.mjs and
// then update these fingerprints.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const dir = new URL("../public/prototypes/universal-board/", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const app = read("app.js");
const fn = (name) => {
  const m = app.match(new RegExp(`\\n(async )?function ${name}\\(`));
  assert.ok(m, `${name} exists`);
  const i = m.index + 1;
  return app.slice(i, app.indexOf("\n}\n", i) + 2);
};
const DICE_SELECTOR = /physical-die|dice-roll|dice-stage|dice-board-result|dice-overlay/;
const diceRules = (css) => (css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [])
  .filter((rule) => DICE_SELECTOR.test(rule.split("{")[0])).map((rule) => rule.trim()).join("\n");

const LOCK_8CB82A5 = {
  createPhysicalDie: "a8377ac9bc00d2e5",
  presentDiceRoll: "94fb4985dd7b9161",
  diceFaceTransform: "fb5acec0aae1c14b",
  appendDiceFaceContent: "76b7f26771ba8f3a",
  setDiceOverlayActive: "09457b6d67e1db4c",
  animateReducedDice: "8956b84dd9fe2a9e",
  createDiceFaceTray: "2fa36aa9f6864388",
  rollTeacherDie: "0e44336c0985c46e",
};

test("die code is byte-identical to 8cb82a5", () => {
  for (const [name, hash] of Object.entries(LOCK_8CB82A5)) assert.equal(sha(fn(name)), hash, name);
});

test("die CSS (styles.css + game-feel.css) is identical to 8cb82a5", () => {
  assert.equal(sha(diceRules(read("styles.css"))), "e7a03acb6a297d84", "styles.css die rules");
  assert.equal(sha(diceRules(read("game-feel.css"))), "ea51964caa723679", "game-feel.css die rules");
});

test("die geometry/motion module game-feel.js is unchanged from 8cb82a5", () => {
  assert.equal(sha(read("game-feel.js")), "1ed190572e140086");
});

test("no other stylesheet touches the die, its theatre or the dice-overlay state", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css") && !["styles.css", "game-feel.css"].includes(f))) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(css, DICE_SELECTOR, `${file} must not style the die`);
  }
});
