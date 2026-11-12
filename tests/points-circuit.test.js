import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { createPointsWorld, planPointsMove } from '../standalone/points-movement.mjs';
import { CURRENT_POINTS_RULE_VERSION, pointsRuleRouteRef } from '../standalone/points-rule-versions.mjs';
import {
  WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF, CIRCUIT_WORLD_ROUTE_REF,
} from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const studentA = '22222222-2222-4222-8222-222222222222';
const studentB = '33333333-3333-4333-8333-333333333333';

function rule(revision = CURRENT_POINTS_RULE_VERSION) {
  const basePoints = revision === 'monopoly-final-landing-v3' ? 1000 : 200;
  return {
    kind: 'server_verified_final_landing', enabled: true, revision,
    currency: 'wordattack-points', worlds: [CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
      const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: basePoints })) };
    }),
  };
}

async function fixture(t, { face = 0, students = [studentA, studentB], failFirstBonus = false } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'monopoly-circuit-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const file = join(dataDir, 'authoritative-turns.json');
  const baseReceipts = new Map(), bonusReceipts = new Map();
  const balances = new Map(students.map(id => [id, 0]));
  const baseCalls = [], bonusCalls = [], registrations = [];
  let failBonus = failFirstBonus;
  const platform = {
    register: async fields => {
      registrations.push(structuredClone(fields));
      return { session: { id: '44444444-4444-4444-8444-444444444444', externalSessionId: fields.externalSessionId,
        studentIds: [...fields.studentIds], rule: rule(), landingCount: 0 } };
    },
    claim: async (sessionId, event) => {
      baseCalls.push(structuredClone(event));
      if (!baseReceipts.has(event.turnId)) {
        balances.set(event.studentId, balances.get(event.studentId) + 1000);
        baseReceipts.set(event.turnId, {
          landing: { ...event, amount: 1000, ruleVersion: CURRENT_POINTS_RULE_VERSION,
            currency: 'wordattack-points', status: 'awarded' },
          wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: balances.get(event.studentId), revision: baseReceipts.size + 1 },
        });
      }
      return structuredClone(baseReceipts.get(event.turnId));
    },
    claimSpecialCellBonus: async (sessionId, bonus) => {
      bonusCalls.push(structuredClone(bonus));
      if (!bonusReceipts.has(bonus.bonusId)) bonusReceipts.set(bonus.bonusId, { bonus: { ...bonus, status: 'awarded' } });
      if (failBonus) { failBonus = false; throw new Error('bonus response lost after credit'); }
      return structuredClone(bonusReceipts.get(bonus.bonusId));
    },
  };
  const store = new PointsTurnStore({ dataDir, platform, random: () => face });
  const registration = { actor, externalSessionId: 'circuit-fixture', studentIds: students,
    mode: 'teacher-led', idempotencyKey: 'register-circuit' };
  const { session } = await store.register(registration);
  const mutate = async callback => {
    const state = JSON.parse(await readFile(file, 'utf8'));
    callback(state.sessions[session.id]);
    await writeFile(file, JSON.stringify(state));
  };
  const get = async () => (await store.get({ actor, sessionId: session.id })).session;
  const roll = (attemptId, studentId = studentA) => store.roll({ actor, sessionId: session.id,
    attemptId, studentId, idempotencyKey: `${attemptId}:roll` });
  const plan = async attemptId => {
    const routeChoicesByWorldInstance = {};
    for (let i = 0; i < 10; i++) {
      try {
        return await store.plan({ actor, sessionId: session.id, attemptId,
          routeChoicesByWorldInstance, idempotencyKey: `${attemptId}:plan` });
      } catch (error) {
        if (error.code !== 'points_route_choice_required') throw error;
        const { worldInstanceId, junctionNodeId, options } = error.details;
        (routeChoicesByWorldInstance[worldInstanceId] ||= {})[junctionNodeId] = options[0].edgeId;
      }
    }
    throw new Error('too many forks');
  };
  const claim = attemptId => store.claim({ actor, sessionId: session.id, attemptId, idempotencyKey: `${attemptId}:claim` });
  const resolve = (instanceId, decision = 'confirm', key = `${instanceId}:${decision}`) => store.resolveGroupMove({ actor,
    sessionId: session.id, instanceId, decision, idempotencyKey: key });
  const claimGroup = (instanceId, key = `${instanceId}:claim`) => store.claimGroupMove({ actor,
    sessionId: session.id, instanceId, idempotencyKey: key });
  const draw = () => store.drawSpecialCells({ actor, sessionId: session.id, density: 'few', multipliersEnabled: true,
    previousDrawNumber: 0, idempotencyKey: 'draw-first' });
  return { store, platform, session, registration, dataDir, file, mutate, get, roll, plan, claim, resolve, claimGroup, draw,
    baseCalls, bonusCalls, bonusReceipts, registrations };
}

function injectedCell(nodeId, type = 'star') {
  return { cellId: 'sc1-01', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId, type, basePoints: 1000, routeOrder: 5 };
}

test('new teacher sessions use a single circuit while keeping the complete approved monetary snapshot', async t => {
  const f = await fixture(t);
  assert.equal(f.session.movementPolicy, 'individual-laps-v1');
  assert.equal(f.session.world.routeRef, CIRCUIT_WORLD_ROUTE_REF);
  assert.equal(f.session.lapRound, 1);
  assert.deepEqual(f.session.teams.map(team => [team.nodeId, team.completedLaps]), [['n01', 0], ['n01', 0]]);
  assert.deepEqual(f.session.rule, rule());
  assert.equal(f.session.rule.worlds.reduce((sum, world) => sum + world.nodes.length, 0), 123);
  assert.equal(f.registrations[0].ruleVersion, 'monopoly-final-landing-v3');
  const drawn = (await f.draw()).session.specialCells;
  assert.ok(drawn.cells.length > 0);
  assert.ok(drawn.cells.every(cell => cell.worldRef === CLOUD_HARBOR_WORLD_REF));
  assert.deepEqual((await f.store.register(f.registration)).session, (await f.get()));
});

test('all six dice values retain every step through the finish, and only the acting student completes a lap', async t => {
  const expected = ['n49', 'n02', 'n03', 'n04', 'n05a', 'n06a'];
  for (let face = 0; face < 6; face++) {
    const f = await fixture(t, { face });
    await f.mutate(session => { session.teams[0].nodeId = 'n48'; session.teams[1].nodeId = 'n07b'; });
    const initialWorld = structuredClone((await f.get()).world);
    await f.roll('cross-finish');
    const planned = await f.plan('cross-finish');
    assert.equal(planned.turn.finalLocation.nodeId, expected[face]);
    assert.equal(planned.turn.plan.stepsConsumed, face + 1);
    assert.equal(planned.turn.plan.effects.filter(effect => effect.type === 'pawn_step').length, face + 1);
    assert.equal(planned.turn.plan.lapCompletions.length, 1, 'arriving at the finish counts the lap immediately');
    assert.equal(planned.turn.plan.lapReturns.length, face === 0 ? 0 : 1);
    if (face > 0) assert.equal(planned.turn.plan.lapReturns[0].zeroStepCost, true);
    assert.equal(planned.turn.plan.transitions.length, 0);
    assert.equal(planned.turn.plan.effects.some(effect => effect.type === 'world_transition'), false);
    assert.deepEqual(planned.session.teams.map(team => [team.nodeId, team.completedLaps]), [[expected[face], 1], ['n07b', 0]]);
    assert.equal(planned.session.world.active.instanceId, initialWorld.active.instanceId);
    assert.equal(planned.session.world.active.worldPackRef, initialWorld.active.worldPackRef);
    assert.equal(planned.session.world.active.ordinal, 1);
    assert.equal(planned.session.world.completed.length, 0);
    const awarded = await f.claim('cross-finish');
    assert.equal(awarded.receipt.landing.nodeId, expected[face]);
    assert.deepEqual(Object.keys(f.baseCalls[0]).sort(), ['turnId', 'studentId', 'worldRef', 'boardRef', 'levelRef', 'worldInstanceId', 'nodeId'].sort());
    assert.equal(awarded.session.lapRound, 1, 'one runner cannot refresh the class bonus layout');
    const replay = await f.store.plan({ actor, sessionId: f.session.id, attemptId: 'cross-finish',
      routeChoicesByWorldInstance: planned.turn.routeChoicesByWorldInstance, idempotencyKey: 'cross-finish:plan' });
    assert.equal(replay.session.teams[0].completedLaps, 1, 'plan replay cannot add a lap');
  }
});

test('an early finisher keeps running while the shared bonus layout waits for every participant', async t => {
  const f = await fixture(t);
  await f.draw();
  await f.mutate(session => { session.teams[0].nodeId = 'n48'; session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n20'; });
  const original = (await f.get()).specialCells;
  await f.roll('early-second-lap'); await f.plan('early-second-lap');
  const result = await f.claim('early-second-lap');
  assert.equal(result.session.teams[0].completedLaps, 2);
  assert.equal(result.session.teams[1].completedLaps, 0);
  assert.equal(result.session.lapRound, 1);
  assert.equal(result.session.specialCells.drawNumber, 1);
  assert.deepEqual(result.session.specialCells.cells, original.cells);
});

test('a single student refreshes once per finished lap, including concurrent claim retries', async t => {
  const f = await fixture(t, { students: [studentA] });
  await f.draw();
  for (let lap = 1; lap <= 2; lap++) {
    await f.mutate(session => { session.teams[0].nodeId = 'n48'; });
    const attemptId = `solo-lap-${lap}`;
    await f.roll(attemptId); await f.plan(attemptId);
    const claimed = await Promise.all([f.claim(attemptId), f.claim(attemptId)]);
    for (const result of claimed) {
      assert.equal(result.session.specialCells.drawNumber, lap + 1);
      assert.equal(result.session.lapRound, lap + 1);
      assert.equal(result.session.teams[0].completedLaps, lap);
    }
  }
  assert.equal(f.baseCalls.length, 2);
  assert.equal((await f.get()).specialCells.drawHistory.length, 2);
});

test('exactly reaching the finish earns its own price and refreshes once; leaving it costs one step without another lap', async t => {
  const f = await fixture(t);
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [];
  });
  const worldInstance = (await f.get()).world.active.instanceId;
  await f.roll('stop-on-finish', studentB);
  const planned = await f.plan('stop-on-finish');
  assert.equal(planned.turn.finalLocation.nodeId, 'n49');
  assert.deepEqual(planned.turn.plan.effects.filter(effect => effect.type === 'pawn_step').map(effect => effect.nodeId), ['n49']);
  assert.equal(planned.turn.plan.lapCompletions.length, 1);
  assert.deepEqual(planned.turn.plan.lapReturns, []);
  assert.equal(planned.session.teams[1].completedLaps, 1);
  assert.equal(planned.session.specialCells.drawNumber, 1, 'refresh waits for the finish landing claim');
  const awarded = await f.claim('stop-on-finish');
  assert.equal(awarded.receipt.landing.nodeId, 'n49');
  assert.equal(awarded.receipt.landing.amount, 1000);
  assert.equal(awarded.session.specialCells.drawNumber, 2);
  assert.equal(awarded.session.lapRound, 2);

  await f.roll('leave-finish', studentB);
  const resumed = await f.plan('leave-finish');
  assert.equal(resumed.turn.finalLocation.nodeId, 'n02');
  assert.deepEqual(resumed.turn.plan.effects.filter(effect => effect.type === 'pawn_step').map(effect => effect.nodeId), ['n02']);
  assert.deepEqual(resumed.turn.plan.lapCompletions, []);
  assert.equal(resumed.turn.plan.lapReturns.length, 1);
  assert.equal(resumed.session.teams[1].completedLaps, 1);
  const continued = await f.claim('leave-finish');
  assert.equal(continued.receipt.landing.nodeId, 'n02');
  assert.equal(continued.session.specialCells.drawNumber, 2);
  assert.equal(continued.session.lapRound, 2);
  assert.equal(continued.session.world.active.instanceId, worldInstance);
  assert.deepEqual(f.baseCalls.map(event => event.nodeId), ['n49', 'n02']);
});

test('the last finisher freezes the old bonus, refreshes only after claim, and recovers its original pending award', async t => {
  const f = await fixture(t, { face: 1, failFirstBonus: true });
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [injectedCell('n02')];
    session.specialCells.groupMoveSuccesses = 2;
  });
  await f.roll('last-finisher', studentB);
  const planned = await f.plan('last-finisher');
  assert.equal(planned.session.specialCells.drawNumber, 1);
  assert.equal(planned.session.lapRound, 1);
  assert.equal(planned.turn.specialCell.cellId, 'sc1-01');
  assert.equal(planned.turn.specialCell.bonus, 500);
  assert.deepEqual(planned.session.specialCells.consumed, ['sc1-01']);
  await assert.rejects(f.roll('before-base-claim'), { code: 'points_turn_pending' });

  const claimed = await f.claim('last-finisher');
  assert.equal(claimed.session.lapRound, 2);
  assert.equal(claimed.session.specialCells.drawNumber, 2);
  assert.equal(claimed.session.specialCells.groupMoveSuccesses, 2);
  assert.deepEqual(claimed.session.specialCells.consumed, []);
  assert.ok(claimed.session.specialCells.cells.every(cell => cell.cellId.startsWith('sc2-')));
  assert.deepEqual(claimed.session.specialCells.drawHistory[0].cells, [injectedCell('n02')]);
  assert.equal(claimed.session.specialCells.bonusAwards['last-finisher:special'].status, 'pending');
  assert.equal(f.bonusReceipts.size, 1, 'the first response was lost after its one wallet credit');

  const replay = await f.claim('last-finisher');
  assert.equal(replay.session.specialCells.bonusAwards['last-finisher:special'].status, 'awarded');
  assert.equal(replay.session.specialCells.drawNumber, 2);
  assert.equal(replay.session.lapRound, 2);
  assert.equal(f.baseCalls.length, 1);
  assert.equal(f.bonusReceipts.size, 1);
  assert.equal(f.bonusCalls[1].cellId, 'sc1-01', 'recovery never claims a new layout cell');
  assert.equal(f.bonusCalls[1].bonusId, 'last-finisher:special');
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform,
    random: () => { throw new Error('restart must not reroll'); } });
  const recovered = await restarted.claim({ actor, sessionId: f.session.id, attemptId: 'last-finisher', idempotencyKey: 'last-finisher:claim' });
  assert.equal(recovered.session.specialCells.drawNumber, 2);
  assert.deepEqual(recovered.session.teams.map(team => team.completedLaps), [1, 1]);
});

test('pending class challenges postpone refresh; their default-route push wraps and counts each student once', async t => {
  const f = await fixture(t);
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [injectedCell('n02', 'move3')];
    session.specialCells.groupMoveSuccesses = 2;
  });
  await f.roll('group-push'); await f.plan('group-push');
  const claimed = await f.claim('group-push');
  assert.equal(claimed.session.specialCells.drawNumber, 1);
  const confirmed = await f.resolve('gm-group-push');
  assert.deepEqual(confirmed.session.teams.map(team => [team.nodeId, team.completedLaps]), [['n05a', 1], ['n03', 1]]);
  assert.equal(confirmed.groupMove.moves[1].path.length, 3);
  assert.deepEqual(confirmed.groupMove.moves[1].path, ['n49', 'n02', 'n03']);
  assert.equal(confirmed.groupMove.moves[1].lapReturns.length, 1);
  assert.equal(confirmed.session.specialCells.groupMoveSuccesses, 3, 'the lesson cap survives a new lap layout');
  assert.equal(confirmed.session.specialCells.drawNumber, 1, 'new group landings are frozen but have not arrived');
  assert.equal(confirmed.session.lapRound, 1);
  assert.equal(f.baseCalls.length, 1, 'confirm only moves and freezes; it does not claim before presentation');
  assert.equal(f.bonusCalls.length, 0);
  const paid = await f.claimGroup('gm-group-push');
  assert.equal(paid.session.specialCells.drawNumber, 2);
  assert.equal(paid.session.lapRound, 2);
  assert.deepEqual(f.baseCalls.slice(1).map(event => [event.studentId, event.nodeId]), [[studentA, 'n05a'], [studentB, 'n03']]);
  assert.ok(paid.groupMove.awards.every(award => award.points === 1000 && award.status === 'awarded'));
  const replay = await f.resolve('gm-group-push', 'confirm', 'fresh-confirm-key');
  assert.equal(replay.duplicate, true);
  assert.equal(replay.session.specialCells.drawNumber, 2);
  assert.deepEqual(replay.session.teams.map(team => team.completedLaps), [1, 1]);
});

test('a finish-line class challenge refreshes only after its landed child challenge and receipts finish', async t => {
  const f = await fixture(t, { face: 1 });
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [injectedCell('n02', 'move1')];
  });
  await f.roll('resolve-before-claim', studentB); await f.plan('resolve-before-claim');
  await assert.rejects(f.resolve('gm-resolve-before-claim'), { code: 'points_turn_pending' });
  const claimed = await f.claim('resolve-before-claim');
  assert.equal(claimed.session.specialCells.drawNumber, 1);
  assert.equal(claimed.session.lapRound, 1);
  const confirmed = await f.resolve('gm-resolve-before-claim');
  assert.equal(confirmed.session.specialCells.drawNumber, 1);
  assert.equal(confirmed.session.lapRound, 1);
  const paid = await f.claimGroup('gm-resolve-before-claim');
  // The other pupil was pushed onto n02's move1, so that new landed effect
  // must finish before a whole-class lap refresh can replace the layout.
  assert.equal(paid.session.specialCells.drawNumber, 1);
  assert.equal(paid.session.lapRound, 1);
  const child = Object.values(paid.session.specialCells.groupMoves).find(move => move.status === 'pending');
  assert.ok(child && child.sourceTurnId === paid.groupMove.awards[0].attemptId);
  await f.resolve(child.instanceId);
  const complete = await f.claimGroup(child.instanceId);
  assert.equal(complete.session.specialCells.drawNumber, 2);
  assert.equal(complete.session.lapRound, 2);
  const replay = await f.claimGroup(child.instanceId, 'child:claim-replay');
  assert.equal(replay.session.specialCells.drawNumber, 2);
  assert.equal(replay.session.lapRound, 2);
});

test('one-step class pushes stop at the finish and cannot recount that lap when the student leaves', async t => {
  const f = await fixture(t);
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [injectedCell('n02', 'move1')];
  });
  await f.roll('push-to-finish'); await f.plan('push-to-finish'); await f.claim('push-to-finish');
  const confirmed = await f.resolve('gm-push-to-finish');
  const pushed = confirmed.groupMove.moves.find(move => move.studentId === studentB);
  assert.equal(pushed.toNodeId, 'n49');
  assert.deepEqual(pushed.path, ['n49']);
  assert.equal(pushed.lapCompletions.length, 1);
  assert.deepEqual(pushed.lapReturns, []);
  assert.equal(confirmed.session.teams[1].completedLaps, 1);
  assert.equal(confirmed.session.specialCells.drawNumber, 1);
  assert.equal(confirmed.session.lapRound, 1);
  assert.equal(f.baseCalls.length, 1, 'confirm does not pay the pushed finish before its presentation');
  const replay = await f.resolve('gm-push-to-finish', 'confirm', 'same-finish-new-key');
  assert.equal(replay.session.teams[1].completedLaps, 1);
  assert.equal(replay.session.specialCells.drawNumber, 1);
  const paid = await f.claimGroup('gm-push-to-finish');
  assert.equal(paid.session.specialCells.drawNumber, 2);
  assert.equal(paid.session.lapRound, 2);
  assert.deepEqual(f.baseCalls.slice(1).map(event => [event.studentId, event.nodeId]), [[studentA, 'n03'], [studentB, 'n49']]);

  await f.roll('leave-pushed-finish', studentB);
  const planned = await f.plan('leave-pushed-finish');
  assert.equal(planned.turn.finalLocation.nodeId, 'n02');
  assert.deepEqual(planned.turn.plan.lapCompletions, []);
  const awarded = await f.claim('leave-pushed-finish');
  assert.equal(awarded.session.teams[1].completedLaps, 1);
  assert.equal(awarded.session.specialCells.drawNumber, 2);
  assert.equal(awarded.session.lapRound, 2);
});

test('a granted reroll survives the whole-class refresh and remains non-chainable', async t => {
  const f = await fixture(t, { face: 1 });
  await f.draw();
  await f.mutate(session => {
    session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
    session.specialCells.cells = [injectedCell('n02', 'reroll')];
  });
  await f.roll('finish-with-reroll', studentB); await f.plan('finish-with-reroll');
  const claimed = await f.claim('finish-with-reroll');
  assert.equal(claimed.session.specialCells.drawNumber, 2);
  assert.deepEqual(claimed.session.specialCells.pendingReroll, { studentId: studentB, sourceTurnId: 'finish-with-reroll' });
  assert.equal((await f.roll('extra-on-new-layout', studentB)).turn.rerollOf, 'finish-with-reroll');
  await assert.rejects(f.store.drawSpecialCells({ actor, sessionId: f.session.id, density: 'few', multipliersEnabled: true,
    previousDrawNumber: 2, idempotencyKey: 'cannot-redraw-mid-game' }), { code: 'special_cells_locked' });
});

test('red packets in successive lap layouts have distinct wallet identities and keep old receipts', async t => {
  const f = await fixture(t, { face: 1 });
  await f.draw();
  for (let lap = 1; lap <= 2; lap++) {
    await f.mutate(session => {
      session.teams[0].completedLaps = lap;
      session.teams[1].completedLaps = lap - 1; session.teams[1].nodeId = 'n48';
      session.specialCells.cells = [{ ...injectedCell('n02', 'redpack'), cellId: `sc${lap}-01` }];
    });
    const attemptId = `redpack-lap-${lap}`;
    await f.roll(attemptId, studentB); await f.plan(attemptId); await f.claim(attemptId); await f.claim(attemptId);
    assert.equal((await f.get()).specialCells.drawNumber, lap + 1);
  }
  assert.equal(f.bonusReceipts.size, 4);
  const awards = (await f.get()).specialCells.bonusAwards;
  for (const draw of [1, 2]) for (const student of [studentA, studentB]) {
    assert.equal(awards[`sc${draw}-01:${student}`].status, 'awarded');
    assert.equal(awards[`sc${draw}-01:${student}`].amount, 50);
  }
});

test('legacy sessions retain shared expedition movement and no inferred lap counters', () => {
  const session = { studentIds: [studentA, studentB], rule: rule('monopoly-final-landing-v2'), completedTurns: 0,
    ...createPointsWorld([studentA, studentB], undefined, pointsRuleRouteRef('monopoly-final-landing-v2')) };
  session.teams[0].nodeId = 'n48'; session.teams[1].nodeId = 'n07b';
  const original = structuredClone(session);
  const result = planPointsMove(session, { attemptId: 'legacy-world-crossing', studentId: studentA, steps: 1,
    nextWorldInstanceId: 'next-world-instance', startLocation: { nodeId: 'n48', worldInstanceId: session.world.active.instanceId } });
  assert.equal(result.world.active.worldPackRef, BEYOND_CLOUD_WORLD_REF);
  assert.equal(result.world.active.ordinal, 2);
  assert.equal(result.points, 200, 'a locked legacy plan keeps its original table');
  assert.deepEqual(result.teams.map(team => team.nodeId), ['w2n01', 'w2n01']);
  assert.ok(result.teams.every(team => team.completedLaps === undefined));
  assert.deepEqual(session, original, 'legacy input snapshots remain untouched');
});
