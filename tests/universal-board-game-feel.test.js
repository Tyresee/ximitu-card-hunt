import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diceBevelPlanes, diceThrowProgress, diceThrowKeyframes, DICE_THROW_DURATION, DICE_THROW_TURNS, DICE_FACE_ROTATIONS, DICE_RESULT_HOLD_DURATION, DICE_STAGE_RESULT_DURATION, DICE_STAGE_EXIT_DURATION, DICE_RESULT_VIEW, rewardReceiptCopy, startDiceFrameProbe } from "../public/prototypes/universal-board/game-feel.js";

test("dice bevel geometry closes all twelve edges and eight corners", () => {
  const planes = diceBevelPlanes();
  assert.equal(planes.length, 20);
  assert.equal(planes.filter((p) => p.vertices.length === 4).length, 12);
  assert.equal(planes.filter((p) => p.vertices.length === 3).length, 8);
  for (const plane of planes) {
    assert.ok(Math.abs(Math.hypot(...plane.normal) - 1) < 1e-8);
    assert.doesNotMatch(plane.transform + plane.clipPath, /NaN|Infinity/);
    for (const point of plane.vertices) for (const value of point) assert.ok(Math.abs(value) <= .5);
  }
  // Every bevel edge pairs with another bevel or a main-face boundary.
  const edges = new Map();
  const pointKey = (v) => v.map((n) => n.toFixed(4)).join(",");
  for (const { vertices } of planes) for (let i = 0; i < vertices.length; i++) {
    const key = [pointKey(vertices[i]), pointKey(vertices[(i + 1) % vertices.length])].sort().join("|");
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.equal([...edges.values()].filter((count) => count === 1).length, 24);
  assert.ok([...edges.values()].every((count) => count <= 2));
});

test("throw ends on each authoritative face, with no randomness or rule changes", () => {
  const targets = DICE_FACE_ROTATIONS;
  for (const target of targets) {
    const before = structuredClone(target);
    const frames = diceThrowKeyframes(target);
    assert.deepEqual(target, before);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames[0].transform, "translate3d(0px, 0px, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg)");
    assert.equal(frames.at(-1).offset, 1);
    assert.equal(frames.at(-1).transform, `translate3d(0px, 0px, 0) rotateX(${360 * DICE_THROW_TURNS.x + target.x}deg) rotateY(${360 * DICE_THROW_TURNS.y + target.y}deg) rotateZ(0deg)`);
    assert.ok(frames.every((frame, i) => i === 0 || frame.offset > frames[i - 1].offset));
    const heights = frames.map((frame) => Number(frame.transform.match(/translate3d\([^,]+, ([^p]+)px/)[1]));
    assert.ok(heights.every((height) => height === 0), "the spotlight die never bounces or leaves centre stage");
    assert.ok(frames.every(({ transform }) => transform.startsWith("translate3d(0px, 0px, 0)")));
    assert.ok(frames.every((frame) => !frame.easing), "segments must not independently restart easing");
  }
  assert.ok(DICE_THROW_DURATION < 2350);
});

test("each sampled result is the upward face, with upright lettering under the overhead view", () => {
  const normals = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0]];
  const textRight = [[1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0]];
  const rotate = ([vx, vy, vz], { x, y }) => {
    const rx = x * Math.PI / 180, ry = y * Math.PI / 180;
    const afterY = [vx * Math.cos(ry) + vz * Math.sin(ry), vy, -vx * Math.sin(ry) + vz * Math.cos(ry)];
    return [afterY[0], afterY[1] * Math.cos(rx) - afterY[2] * Math.sin(rx), afterY[1] * Math.sin(rx) + afterY[2] * Math.cos(rx)];
  };
  const close = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-8));
  DICE_FACE_ROTATIONS.forEach((rotation, index) => {
    close(rotate(normals[index], rotation), [0, -1, 0]);
    close(rotate(textRight[index], rotation), [1, 0, 0]);
    const frames = diceThrowKeyframes(rotation);
    const endAngles = [...frames.at(-1).transform.matchAll(/rotate[XY]\(([-\d.]+)deg\)/g)].map(match => Number(match[1]));
    close(rotate(normals[index], { x: endAngles[0], y: endAngles[1] }), [0, -1, 0]);
  });
  const view = [...DICE_RESULT_VIEW.matchAll(/rotate[XY]\(([-\d.]+)deg\)/g)].map(match => Number(match[1]));
  const visibleTop = rotate([0, -1, 0], { x: view[0], y: view[1] });
  assert.ok(visibleTop[1] < -.6 && visibleTop[2] > .6, "result stays above the centre and has a readable projected area");
});

test("the locked result returns to the normal board for most of its reading time", () => {
  const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const presenter = app.slice(app.indexOf("async function presentDiceRoll("), app.indexOf("function chooseDieForProfile("));
  assert.equal(DICE_RESULT_HOLD_DURATION, 2800);
  assert.equal(DICE_STAGE_RESULT_DURATION, 550);
  assert.equal(DICE_STAGE_EXIT_DURATION, 180);
  assert.match(presenter, /if \(die.rotor\) die.rotor.style.transform = DICE_RESULT_VIEW/);
  assert.match(presenter, /settledFace\?\.classList.add\("is-result"\)/);
  const settled = presenter.indexOf('nodes.diceRollResult.classList.add("is-visible")');
  const stageHold = presenter.indexOf("await sleep(DICE_STAGE_RESULT_DURATION)");
  const hideStage = presenter.indexOf("nodes.diceRollStage.hidden = true", stageHold);
  const normalBoard = presenter.indexOf("setDiceOverlayActive(false)", hideStage);
  const boardResult = presenter.indexOf("nodes.diceBoardResult.hidden = false", normalBoard);
  const boardHold = presenter.indexOf("await sleep(DICE_RESULT_HOLD_DURATION - DICE_STAGE_RESULT_DURATION)", boardResult);
  assert.ok(settled < stageHold && stageHold < hideStage && hideStage < normalBoard && normalBoard < boardResult && boardResult < boardHold);
  assert.match(presenter, /nodes.diceBoardResultNumber.textContent = String\(roll.steps\)/);
  assert.match(presenter, /nodes.diceBoardResult.dataset.faceIndex = String\(faceIndex\)/);
  assert.doesNotMatch(presenter, /sampleTeacherDice|Math.random|rollDice|settlePlayerAssetTurn/);
});

test("low-motion presentation shows only the saved face and cancellation removes both stages", () => {
  const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const reduced = app.slice(app.indexOf("async function animateReducedDice("), app.indexOf("async function presentDiceRoll("));
  assert.match(reduced, /cube.style.transform = diceFaceTransform\(faceIndex\)/);
  assert.doesNotMatch(reduced, /previewIndexes|for \(|animationFinished|\.animate\(/);
  const cancel = app.slice(app.indexOf("function cancelPendingDiceChoice("), app.indexOf("async function retryScoredAnswer("));
  assert.match(cancel, /nodes.diceRollStage.hidden = true/);
  assert.match(cancel, /nodes.diceBoardResult.hidden = true/);
  assert.match(cancel, /choice.animation\?\.cancel\(\)/);
});

test("throw launches at peak speed and continuously decelerates, with no slow wind-up", () => {
  assert.equal(diceThrowProgress(-1), 0);
  assert.equal(diceThrowProgress(2), 1);
  const samples = Array.from({ length: 1001 }, (_, i) => diceThrowProgress(i / 1000));
  const speeds = samples.slice(1).map((p, i) => (p - samples[i]) * 1000);
  assert.ok(speeds.every((speed) => speed > 0), "rotation never reverses or stops mid-throw");
  assert.ok(speeds[0] > 2.99 && speeds.at(-1) < .0001, "launch impulse then zero-speed finish");
  const peak = speeds.indexOf(Math.max(...speeds));
  assert.equal(peak, 0);
  assert.ok(speeds.slice(1).every((speed, i) => speed < speeds[i]));
  const h = .00001;
  for (const t of [.1, .34, .62, .76, .87]) {
    const incoming = (diceThrowProgress(t) - diceThrowProgress(t - h)) / h;
    const outgoing = (diceThrowProgress(t + h) - diceThrowProgress(t)) / h;
    assert.ok(Math.abs(outgoing - incoming) < .0001, `continuous velocity at ${t}`);
  }
});

test("compositor samples preserve smooth angular velocity and have no final-angle overshoot", () => {
  const frames = diceThrowKeyframes({ x: 90, y: 180 });
  assert.equal(frames.length, 181);
  const angles = frames.map((frame) => Number(frame.transform.match(/rotateX\(([^d]+)deg/)[1]));
  const speeds = angles.slice(1).map((angle, i) => (angle - angles[i]) / (DICE_THROW_DURATION / 180));
  assert.ok(speeds.every((speed) => speed > 0));
  assert.ok(speeds[0] > 1.2 && speeds.at(-1) < .001);
  assert.ok(speeds.every((speed, i) => i === 0 || (speed < speeds[i - 1] && Math.abs(speed - speeds[i - 1]) < .03)));
  assert.equal(angles.at(-1), 810);
});

test("all six outcomes rotate smoothly in place and decelerate to their saved face", () => {
  assert.equal(DICE_THROW_DURATION, 2000);
  assert.deepEqual(DICE_THROW_TURNS, { x: 2, y: 3 });
  for (const target of DICE_FACE_ROTATIONS) {
    for (const axis of ["x", "y"]) {
      const turns = DICE_THROW_TURNS[axis] + target[axis] / 360;
      const averageRps = (start, end) => turns * (diceThrowProgress(end / 2000) - diceThrowProgress(start / 2000)) / ((end - start) / 1000);
      const early = averageRps(0, 500);
      const middle = averageRps(500, 1000);
      const late = averageRps(1000, 1500);
      const settling = averageRps(1500, 2000);
      assert.ok(early > 2 && early < 4.1, "a visible central spin without the former violent tumble");
      assert.ok(early > middle * 1.8 && middle > late * 2 && late > settling * 5);
      assert.ok(settling < .15, "last half-second resolves the face, not more full spins");
      assert.ok((1 - diceThrowProgress(.9)) * turns * 360 < 2, "last 200 ms never drags through a big angle");
    }
    const frames = diceThrowKeyframes(target);
    const transforms = frames.map(({ transform }) => [...transform.matchAll(/rotate[XY]\(([-\d.]+)deg\)/g)].map(match => Number(match[1])));
    // Bound interpolation increments so full turns cannot be reduced to a
    // shortest-path matrix spin and 60 Hz sampling stays below a face-width.
    for (let i = 1; i < transforms.length; i++) {
      const angularStep = Math.hypot(...transforms[i].map((angle, axis) => angle - transforms[i - 1][axis]));
      assert.ok(angularStep < 35);
    }
    const heights = frames.map(({ transform }) => Number(transform.match(/translate3d\([^,]+, ([^p]+)px/)[1]));
    assert.ok(heights.every((height) => height === 0), "centre-stage die holds its position");
    assert.equal(heights.at(-1), 0);
  }
});

test("launch is not delayed by a static wait or a serial camera reframe", () => {
  const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const presenter = app.slice(app.indexOf("async function presentDiceRoll("), app.indexOf("function chooseDieForProfile("));
  assert.doesNotMatch(presenter, /await sleep\(220\)/);
  assert.match(presenter, /void animationFinished\(die.rotor/);
  assert.doesNotMatch(presenter, /await animationFinished\(die.rotor/);
  assert.match(presenter, /dataset.phase = "sprint"/);
  assert.match(presenter, /DICE_ROLL_DURATION \* \.45, "slow"/);
  assert.match(presenter, /duration: presentationDuration\(DICE_ROLL_DURATION\),\s*easing: "linear"/);
});

test("receipt uses the committed student's exact resource amount and total", () => {
  const event = { resource: "star", amount: 3, assetsAfter: { stars: 12, coins: 4 } };
  const snapshot = structuredClone(event);
  assert.deepEqual(rewardReceiptCopy(event, "Mia"), { title: "Mia · 获得星星", amount: "+3", total: "本局星星 12" });
  assert.deepEqual(event, snapshot);
  assert.equal(rewardReceiptCopy({ kind: "conversion", resource: "star", amount: 1, assetsAfter: { stars: 5 } }, "Leo").title, "Leo · 换得星星");
  assert.equal(rewardReceiptCopy({ resource: "coin", amount: 2, assetsAfter: { coins: 0 } }, "Ava").total, "本局金币 0");
});

test("presentation changes keep accessible amounts, six actual faces and low-motion output", () => {
  const app = readFileSync(new URL("../public/prototypes/universal-board/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/prototypes/universal-board/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../public/prototypes/universal-board/game-feel.css", import.meta.url), "utf8");
  assert.match(app, /player-asset-label/);
  assert.match(app, /playerAssetsAccessibleName/);
  assert.match(app, /diceThrowKeyframes\(target\)/);
  assert.match(app, /animateReducedDice/);
  assert.match(html, /<details class="dice-roll-face-reference">/);
  assert.match(html, /id="dice-roll-faces"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.doesNotMatch(css, /filter:\s*brightness/);
  assert.equal(startDiceFrameProbe(false)(), null, "production does not start a frame loop");
  assert.match(app, /qaControlsEnabled && QA_PAGE_REQUESTED && PAGE_QUERY.get\("qaMotion"\) === "1"/);
  const finish = app.indexOf("choice.animation = null;", app.indexOf("const keyframes = diceThrowKeyframes(target)"));
  assert.ok(app.indexOf("die.cube.style.transform = diceFaceTransform(faceIndex)", finish) < app.indexOf("animation.cancel()", finish));
});
