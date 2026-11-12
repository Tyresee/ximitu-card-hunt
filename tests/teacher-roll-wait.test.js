import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const app = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
function fn(name) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf('\n}\n', start);
  return app.slice(start, end + 2);
}
const needsRecovery = runInNewContext(`${fn('needsLandingRecovery')}\nneedsLandingRecovery;`, { pendingGroupLandingAwards: session =>
  Object.values(session.specialCells?.groupMoves || {}).flatMap(move => (move.awards || []).filter(award => award.status !== 'awarded')) });
const settled = () => ({ operations: { roll: { status: 'done' } }, session: {
  turns: { first: { status: 'awarded' } }, specialCells: { bonusAwards: {}, groupMoves: {} },
} });
test('settled outbox skips recovery, while every uncertain operation or reward keeps the recovery barrier', () => {
  assert.equal(needsRecovery(settled()), false);
  assert.equal(needsRecovery({}), true);
  for (const edit of [
    r => { r.error = { message: 'offline' }; },
    r => { r.operations.roll.status = 'pending'; },
    r => { r.session.turns.first.status = 'rolled'; },
    r => { r.session.turns.first.status = 'planned'; },
    r => { r.session.specialCells.bonusAwards.a = { status: 'pending' }; },
    r => { r.session.specialCells.groupMoves.a = { status: 'pending' }; },
    r => { r.session.specialCells.groupMoves.a = { status: 'confirmed', awards: [{ status: 'planned' }] }; },
  ]) { const record = settled(); edit(record); assert.equal(needsRecovery(record), true); }
});
test('waiting uses only neutral faces and viewport transforms, and cleans up on request failure', () => {
  const faces = Array.from({ length: 6 }, () => ({ number: { textContent: '6' }, setAttribute(k,v) { this[k] = v; }, querySelector() { return this.number; } }));
  let canceled = 0, removed = 0, reduced = false;
  const viewport = { animate(frames, options) {
    assert.ok(frames.every(frame => Object.keys(frame).every(k => k === 'transform')));
    assert.equal(options.iterations, Infinity); return { cancel() { canceled++; } };
  }, remove() { removed++; } };
  const die = { viewport, cube: { querySelectorAll: () => faces }, rotor: { style: {} } };
  const node = () => ({ hidden: true, dataset: {}, classList: { remove() {} }, replaceChildren() {} });
  const nodes = Object.fromEntries(['diceBoardResult','diceChoiceStage','diceRollStage','diceRollCard','diceRollName','diceRollStatus','diceRollResult','diceRollFaces','diceRollCubeSlot'].map(k => [k,node()]));
  const overlays = [];
  const start = runInNewContext(`${fn('beginTeacherDiceWait')}\nbeginTeacherDiceWait;`, { nodes, gameSession: {}, TEACHER_DICE: 'teacher',
    teacherDiceFaces: () => [1,2,3,4,5,6], currentDicePack: () => null, pointsOnlyDiceFace: x => x,
    createPhysicalDie: () => die, setDiceOverlayActive: x => overlays.push(x), reducedMotionRequested: () => reduced });
  const stop = start();
  assert.equal(nodes.diceRollStage.hidden, false);
  assert.ok(faces.every(face => face.number.textContent === '?' && face['aria-label'] === '点数待揭晓'));
  stop();
  assert.equal(nodes.diceRollStage.hidden, true);
  assert.deepEqual(overlays, [true, false]);
  assert.equal(canceled, 1); assert.equal(removed, 1);
  reduced = true;
  assert.doesNotThrow(() => start()());
  assert.equal(canceled, 1, "reduced motion has no waiting animation to cancel");
});
