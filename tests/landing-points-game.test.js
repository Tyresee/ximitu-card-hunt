import { doubleDiceSteps } from "../public/prototypes/universal-board/double-dice-core.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { assertLandingRoll, assertLandingPlan, landingNodePoints, recoverableLandingTurns } from '../public/prototypes/universal-board/landing-points-game.js';
const studentId = '11111111-1111-4111-8111-111111111111';
const world = { instanceId: 'world-instance', worldPackRef: 'world.current@1', ordinal: 1 };
const initial = { world: { active: world }, teams: [{ id: `player-${studentId}`, nodeId: 'n01' }] };
const turn = { attemptId: 'teacher-one', studentId, teacherDiceRef: 'teacher-dice.v1', faceIndex: 2, steps: 3,
  startLocation: { worldRef: world.worldPackRef, worldInstanceId: world.instanceId, nodeId: 'n01' } };

test('server roll must match the original actor, dice and starting world instance', () => {
  const input = { turn, studentId, attemptId: turn.attemptId, runtime: initial };
  assert.equal(assertLandingRoll(input), turn);
  for (const change of [{ studentId: 'someone-else' }, { steps: 6 }, { faceIndex: -1 },
    { startLocation: { ...turn.startLocation, worldInstanceId: 'other-instance' } },
    { startLocation: { ...turn.startLocation, nodeId: 'n02' } }]) {
    assert.throws(() => assertLandingRoll({ ...input, turn: { ...turn, ...change } }), /不一致/);
  }
});

test('landing compares the full traversed path and actual transport destination', () => {
  const effects = ['n02', 'n03', 'n04'].map(nodeId => ({ type: 'pawn_step', nodeId }));
  const moved = { ...initial, teams: [{ id: `player-${studentId}`, nodeId: 'n09' }] };
  const planned = { ...turn, points: 200, plan: { effects }, finalLocation: {
    worldRef: world.worldPackRef, worldInstanceId: world.instanceId, nodeId: 'n09' } };
  const input = { turn: planned, studentId, attemptId: turn.attemptId, runtime: moved, effects, landingNodeId: 'n09' };
  assert.equal(assertLandingPlan(input), planned);
  assert.throws(() => assertLandingPlan({ ...input, landingNodeId: 'n04' }), /落点/);
  assert.throws(() => assertLandingPlan({ ...input, effects: effects.slice(0, 2) }), /路线/);
  assert.throws(() => assertLandingPlan({ ...input, turn: { ...planned, finalLocation: { ...planned.finalLocation, worldInstanceId: 'old-instance' } } }), /落点/);
});

test('only exact frozen enabled world rules display amounts; old worlds have no inferred award', () => {
  const rule = { kind: 'server_verified_final_landing', enabled: true, worlds: [{ worldRef: world.worldPackRef, nodes: [{ nodeId: 'n01', points: 100 }] }] };
  assert.equal(landingNodePoints(rule, world.worldPackRef, 'n01'), 100);
  assert.equal(landingNodePoints(rule, 'world.current@0', 'n01'), null);
  assert.equal(landingNodePoints({ ...rule, enabled: false }, world.worldPackRef, 'n01'), null);
});

test('refresh may recover committed landings but cannot credit unpresented server plans or rolled dice', () => {
  const session = { turns: { a: { attemptId: 'a', status: 'planned' }, b: { attemptId: 'b', status: 'planned' },
    c: { attemptId: 'c', status: 'rolled' }, d: { attemptId: 'd', status: 'awarded', receipt: {} } } };
  assert.deepEqual(recoverableLandingTurns(session, ['a', 'c', 'd']).map(item => item.attemptId), ['a']);
});

const source = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
const teacherTurnSource = source.slice(source.indexOf('async function runTeacherTurn()'), source.indexOf('async function rollTeacherDie()'));
function teacherFixture(roll) {
  const calls = [];
  const context = { doubleDiceSteps, currentSpecialCells: () => null, busy: false, runtime: structuredClone(initial),
    gameSession: { phase: 'TEACHER_ROLL_READY', inputGate: 'open', teacherOpportunity: { id: turn.attemptId, seatId: studentId } },
    isTeacherSession: () => true, voiceBoardAsrAuthenticated: true, qaHarnessEnabled: false,
    currentSessionSeat: () => ({ id: studentId }), usesLandingPoints: () => true, landingGameId: () => 'game-one',
    ensureLandingRegistration: async () => calls.push('registration'), recoverLandingPoints: async () => calls.push('recovery'),
    landingPoints: { roll: async (...args) => { calls.push('server-roll'); return roll(...args); } }, assertLandingRoll,
    beginTeacherDiceWait: () => () => {}, needsLandingRecovery: () => true,
    renderTeacherPanel() {}, showLandingError(error) { calls.push(`error:${error.message}`); },
    sampleTeacherDice: () => assert.fail('new points games must never roll in the browser'), currentDicePack: () => null,
    persistStableSession: () => calls.push('saved-before-animation'), playerAssetsLedger: {}, fairyState: {},
    boardSounds: { unlock() {} }, runBoardTurn: async () => calls.push('animation'),
    nodes: { teacherStatus: {} }, console: { warn() {} },
  };
  runInNewContext(teacherTurnSource, context);
  return { context, calls };
}

test('actual teacher entry persists the server die before animation; service failure never falls back to local RNG', async () => {
  const good = teacherFixture(async () => ({ turn }));
  await good.context.runTeacherTurn();
  assert.deepEqual(good.calls, ['registration', 'recovery', 'server-roll', 'saved-before-animation', 'animation']);
  assert.equal(good.context.gameSession.teacherOpportunity.faceIndex, 2);
  const offline = teacherFixture(async () => { throw new Error('offline'); });
  await offline.context.runTeacherTurn();
  assert.ok(offline.calls.includes('error:offline'));
  assert.ok(!offline.calls.includes('animation'));
  assert.equal(offline.context.busy, false);
});

test('double teacher click during server lock cannot start a second animation', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = teacherFixture(async () => { await pending; return { turn }; });
  const first = f.context.runTeacherTurn();
  await f.context.runTeacherTurn();
  finish(); await first;
  assert.equal(f.calls.filter(call => call === 'server-roll').length, 1);
  assert.equal(f.calls.filter(call => call === 'animation').length, 1);
});
