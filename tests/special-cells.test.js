import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { CURRENT_POINTS_RULE_VERSION } from '../standalone/points-rule-versions.mjs';
import {
  SPECIAL_CELL_TYPES, SPECIAL_CELL_TYPE_BY_ID, SPECIAL_CELLS_POLICY, drawSpecialCells, specialCellAmount, roundToTen,
  specialCellCount, specialCellEligibleNodes, specialCellBoardFacts, advanceAlongDefaultRoute, groupSpecialCells,
  specialCellLandingCopy,
} from '../public/prototypes/universal-board/special-cells-core.js';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const studentA = '22222222-2222-4222-8222-222222222222', studentB = '33333333-3333-4333-8333-333333333333';
const studentC = '55555555-5555-4555-8555-555555555555';
// Approved tiers spread over the board so the 金皇冠 tier restriction is exercised.
const tier = (id, scale = 5) => [100, 200, 300, 500, 1000][[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5] * scale;
function rule(revision = CURRENT_POINTS_RULE_VERSION) {
  const scale = revision === 'monopoly-final-landing-v3' ? 5 : 1;
  return { kind: 'server_verified_final_landing', enabled: true, revision, currency: 'wordattack-points',
    worlds: [CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
      const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: node.id === 'n02' ? 200 * scale : tier(node.id, scale) })) };
    }) };
}
const worlds = (valueScale = 5) => rule().worlds.map(world => {
  const { board, level } = resolveWorldComposition(world.worldRef, WORLD_REGISTRIES);
  return { worldRef: world.worldRef, board, level, valueScale, points: new Map(world.nodes.map(node => [node.nodeId, node.points / 5 * valueScale])) };
});

test('same sessionId + drawNumber always yields the same layout; redraw changes it', () => {
  const w = worlds();
  const a = drawSpecialCells({ sessionId: 'session-x', drawNumber: 1, studentCount: 4, worlds: w });
  const b = drawSpecialCells({ sessionId: 'session-x', drawNumber: 1, studentCount: 4, worlds: worlds() });
  assert.deepEqual(a, b);
  assert.equal(a.cells.length, 10);
  assert.equal(a.policy, SPECIAL_CELLS_POLICY);
  const c = drawSpecialCells({ sessionId: 'session-x', drawNumber: 2, studentCount: 4, worlds: w });
  assert.notEqual(a.layoutSeed, c.layoutSeed);
  assert.notDeepEqual(a.cells.map(cell => cell.nodeId + cell.type), c.cells.map(cell => cell.nodeId + cell.type));
});

test('v3 fivefold bases preserve the v2 placement and weighted type stream, including crowns', () => {
  let crowns = 0;
  for (let i = 0; i < 120; i++) {
    const input = { sessionId: `fivefold-${i}`, drawNumber: 1 + i % 3, studentCount: 1 + i % 8,
      density: ['few', 'normal', 'many'][i % 3], multipliersEnabled: i % 4 !== 0 };
    const legacy = drawSpecialCells({ ...input, worlds: worlds(1) });
    const scaled = drawSpecialCells({ ...input, worlds: worlds(5) });
    assert.deepEqual(scaled, { ...legacy, cells: legacy.cells.map(cell => ({ ...cell, basePoints: cell.basePoints * 5 })) });
    crowns += scaled.cells.filter(cell => cell.type === 'crown').length;
  }
  assert.ok(crowns > 0, 'scaled values cannot silently remove crowns from the pool');
});

test('counts follow roster size × density', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 8].map(n => specialCellCount(n)), [12, 12, 10, 10, 8, 8]);
  assert.deepEqual(['few', 'normal', 'many'].map(d => specialCellCount(4, d)), [6, 10, 14]);
  assert.throws(() => specialCellCount(9));
});

test('1000 simulated draws never violate placement, spacing, spread or caps', () => {
  const w = worlds();
  const facts = w.map(world => specialCellBoardFacts(world.board));
  const eligible = w.map(world => new Set(specialCellEligibleNodes(world).map(c => c.nodeId)));
  const forbidden = ['n01', 'n02', 'n03', 'n04', 'n18', 'n10', 'n21', 'n29', 'n49'];
  for (const id of forbidden) assert.equal(eligible[0].has(id), false, `${id} must never hold a special cell`);
  const zoneOf = node => w[0].board.zones.find(({ bounds: b }) => node.x >= b.x && node.x < b.x + b.width && node.y >= b.y && node.y < b.y + b.height).id;
  for (let i = 0; i < 1000; i++) {
    const studentCount = 1 + (i % 8), density = ['few', 'normal', 'many'][i % 3];
    const multipliersEnabled = i % 10 !== 0;
    const layout = drawSpecialCells({ sessionId: `sim-${i}`, drawNumber: 1 + (i % 3), studentCount, density, multipliersEnabled, worlds: w });
    const count = n => layout.cells.filter(cell => cell.type === n).length;
    assert.ok(layout.cells.length <= specialCellCount(studentCount, density));
    if (multipliersEnabled) assert.equal(layout.cells.length, specialCellCount(studentCount, density), `full count for sim-${i}`);
    for (const type of SPECIAL_CELL_TYPES) assert.ok(count(type.id) <= type.cap, `${type.id} cap`);
    assert.ok(count('move1') + count('move2') + count('move3') <= 4, 'move types ≤ 4');
    if (!multipliersEnabled) assert.ok(layout.cells.every(cell => SPECIAL_CELL_TYPE_BY_ID[cell.type].category !== 'points'));
    for (const [index, world] of w.entries()) {
      const cells = layout.cells.filter(cell => cell.worldRef === world.worldRef);
      for (const cell of cells) {
        assert.ok(eligible[index].has(cell.nodeId), `${cell.nodeId} eligible`);
        if (cell.type === 'crown') assert.ok(world.points.get(cell.nodeId) <= 1500, 'crown only on scaled 500/1000/1500');
        if (cell.type === 'move3') assert.ok(facts[index].toEnd.get(cell.nodeId) >= 10, 'move3 not in last 10');
      }
      for (const a of cells) for (const b of cells) {
        if (a === b) continue;
        const distance = (() => { const seen = new Map([[a.nodeId, 0]]), queue = [a.nodeId];
          while (queue.length) { const id = queue.shift(); for (const next of facts[index].undirected.get(id) || []) if (!seen.has(next)) { seen.set(next, seen.get(id) + 1); queue.push(next); } }
          return seen.get(b.nodeId); })();
        assert.ok(distance >= 4, `spacing ${a.nodeId}-${b.nodeId} = ${distance}`);
      }
    }
    if (layout.cells.length >= 4 && multipliersEnabled) {
      const zones = new Set(layout.cells.filter(cell => cell.worldRef === w[0].worldRef)
        .map(cell => zoneOf(w[0].board.nodes.find(node => node.id === cell.nodeId))));
      assert.equal(zones.size, 4, `each 晶港 zone has a cell (sim-${i})`);
    }
  }
});

test('multipliers round to the nearest 10 and a single claim is capped at 3000', () => {
  assert.deepEqual([100, 200, 300, 500, 1000].map(base => specialCellAmount('star', base).amount), [150, 300, 450, 750, 1500]);
  assert.deepEqual([100, 200, 300, 500, 1000].map(base => specialCellAmount('bag', base).amount), [200, 300, 400, 600, 1100]);
  assert.deepEqual([100, 200, 300, 500, 1000].map(base => specialCellAmount('double', base).amount), [200, 400, 600, 1000, 2000]);
  assert.deepEqual([100, 200, 300].map(base => specialCellAmount('crown', base).amount), [300, 600, 900]);
  assert.equal(specialCellAmount('crown', 1000).amount, 3000);
  assert.equal(specialCellAmount('crown', 1500).amount, 3000, 'cap');
  assert.equal(specialCellAmount('star', 1990).amount, 2990);
  assert.equal(specialCellAmount('star', 2500).amount, 3000, 'cap');
  assert.equal(specialCellAmount('star', 130).amount, 200, '195 rounds to 200');
  assert.equal(roundToTen(144), 140); assert.equal(roundToTen(145), 150);
  assert.equal(specialCellAmount('double', 200).formula, '200 × 2 = 400！');
  assert.deepEqual(specialCellAmount('redpack', 300), { amount: 300, bonus: 0, formula: '全班每人 +50！' });
  assert.equal(specialCellAmount('move2', 300).amount, 300, 'move cells do not change the landing amount');
});

test('v3 multipliers use fivefold bases and a scaled cap while fixed additions stay fixed', () => {
  assert.equal(specialCellAmount('star', 5000, 5).amount, 7500);
  assert.equal(specialCellAmount('crown', 5000, 5).amount, 15000);
  assert.equal(specialCellAmount('crown', 7500, 5).amount, 15000, 'scaled claim cap');
  assert.equal(specialCellAmount('bag', 5000, 5).amount, 5100, '+100 stays +100');
  assert.deepEqual(specialCellAmount('redpack', 1000, 5), { amount: 1000, bonus: 0, formula: '全班每人 +50！' });
});

test('group push follows the default branch and stops at a world end', () => {
  const { board } = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  assert.deepEqual(advanceAlongDefaultRoute(board, 'n03', 2), { nodeId: 'n05a', path: ['n04', 'n05a'] });
  assert.equal(advanceAlongDefaultRoute(board, 'n05a', 1).nodeId, 'n06a', 'group push follows the default route');
  assert.equal(advanceAlongDefaultRoute(board, 'n48', 3).nodeId, 'n49');
  assert.equal(groupSpecialCells([{ type: 'crown' }, { type: 'star' }, { type: 'star' }])[0].type.id, 'star');
});

async function fixture(t, { random = () => 0, students = [studentA, studentB], bonusPlatform = true } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'monopoly-special-cells-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const receipts = new Map(), bonuses = new Map(), balances = new Map(students.map(id => [id, 0]));
  let claimCalls = 0, bonusCalls = 0;
  const platform = {
    register: async fields => ({ session: { id: '44444444-4444-4444-8444-444444444444', externalSessionId: fields.externalSessionId,
      studentIds: fields.studentIds, rule: rule(), landingCount: 0 } }),
    claim: async (sessionId, event) => {
      claimCalls++;
      if (!receipts.has(event.turnId)) {
        const amount = rule().worlds.find(w => w.worldRef === event.worldRef).nodes.find(n => n.nodeId === event.nodeId).points;
        balances.set(event.studentId, balances.get(event.studentId) + amount);
        receipts.set(event.turnId, { landing: { ...event, amount, ruleVersion: CURRENT_POINTS_RULE_VERSION, status: 'awarded', currency: 'wordattack-points' },
          wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: balances.get(event.studentId), revision: receipts.size + 1 } });
      }
      return receipts.get(event.turnId);
    },
    ...(bonusPlatform ? { claimSpecialCellBonus: async (sessionId, bonus) => {
      bonusCalls++;
      if (!bonuses.has(bonus.bonusId)) bonuses.set(bonus.bonusId, { bonus: { ...bonus, status: 'awarded' } });
      return bonuses.get(bonus.bonusId);
    } } : {}),
  };
  const store = new PointsTurnStore({ dataDir, platform, random });
  const { session } = await store.register({ actor, externalSessionId: 'game-special', studentIds: students, mode: 'teacher-led', idempotencyKey: 'register-key' });
  const file = join(dataDir, 'authoritative-turns.json');
  const inject = async cells => {
    const state = JSON.parse(await readFile(file, 'utf8'));
    Object.assign(state.sessions[session.id].specialCells, { drawNumber: 1, cells, consumed: [] });
    await writeFile(file, JSON.stringify(state));
  };
  return { store, session, inject, bonuses, claimCalls: () => claimCalls, bonusCalls: () => bonusCalls };
}
const draw = (f, previousDrawNumber, key, extra = {}) => f.store.drawSpecialCells({ actor, sessionId: f.session.id, density: 'normal',
  multipliersEnabled: true, previousDrawNumber, idempotencyKey: key, ...extra });
const roll = (f, attemptId, studentId = studentA) => f.store.roll({ actor, sessionId: f.session.id, studentId, attemptId, idempotencyKey: `${attemptId}-roll` });
async function plan(f, attemptId) {
  const routeChoicesByWorldInstance = {};
  for (let branch = 0; branch < 6; branch++) {
    try { return await f.store.plan({ actor, sessionId: f.session.id, attemptId, routeChoicesByWorldInstance, idempotencyKey: `${attemptId}-plan-${branch}` }); }
    catch (error) {
      if (error.code !== 'points_route_choice_required') throw error;
      const { worldInstanceId, junctionNodeId, options } = error.details;
      (routeChoicesByWorldInstance[worldInstanceId] ||= {})[junctionNodeId] = options[0].edgeId;
    }
  }
  throw new Error('too many branches');
}
const claim = (f, attemptId, key = `${attemptId}-claim`) => f.store.claim({ actor, sessionId: f.session.id, attemptId, idempotencyKey: key });
const turn = async (f, attemptId, studentId) => { await roll(f, attemptId, studentId); await plan(f, attemptId); return claim(f, attemptId); };
const resolve = (f, instanceId, decision, key = `${instanceId}-${decision}`) => f.store.resolveGroupMove({ actor, sessionId: f.session.id, instanceId, decision, idempotencyKey: key });
const claimGroup = (f, instanceId, key = `${instanceId}-claim`) => f.store.claimGroupMove({ actor, sessionId: f.session.id, instanceId, idempotencyKey: key });
const cell = (nodeId, type, n = 1) => ({ cellId: `sc1-${String(n).padStart(2, '0')}`, worldRef: CLOUD_HARBOR_WORLD_REF, nodeId, type, routeOrder: 1, basePoints: 500 });

test('server draw is stored in the session snapshot, idempotent, re-drawable and locked by the first roll', async t => {
  const f = await fixture(t);
  assert.equal(f.session.rewardPolicy, SPECIAL_CELLS_POLICY);
  assert.equal(f.session.specialCells.drawNumber, 0);
  const first = await draw(f, 0, 'draw-key-1');
  const snapshot = first.session.specialCells;
  assert.equal(snapshot.drawNumber, 1); assert.equal(snapshot.cells.length, 12, '2 students → 12');
  assert.ok(Number.isSafeInteger(snapshot.layoutSeed)); assert.deepEqual(snapshot.consumed, []);
  const replay = await draw(f, 0, 'draw-key-1');
  assert.equal(replay.duplicate, true); assert.deepEqual(replay.session.specialCells.cells, snapshot.cells);
  const lostResponse = await draw(f, 0, 'draw-key-fresh');
  assert.equal(lostResponse.duplicate, true); assert.equal(lostResponse.session.specialCells.drawNumber, 1, 'double click does not redraw');
  await assert.rejects(draw(f, 0, 'draw-key-1', { density: 'many' }), { code: 'points_idempotency_conflict' });
  const second = await draw(f, 1, 'draw-key-2');
  assert.equal(second.session.specialCells.drawNumber, 2);
  assert.notDeepEqual(second.session.specialCells.cells, snapshot.cells);
  await assert.rejects(draw(f, 0, 'draw-key-stale'), { code: 'special_cells_draw_conflict' }, 'a stale screen cannot redraw');
  const few = await draw(f, 2, 'draw-key-3', { density: 'few', multipliersEnabled: false });
  assert.ok(few.session.specialCells.cells.every(c => SPECIAL_CELL_TYPE_BY_ID[c.type].category !== 'points'));
  await roll(f, 'turn-one');
  await assert.rejects(draw(f, 3, 'draw-after-roll'), { code: 'special_cells_locked' });
  const reread = await f.store.get({ actor, sessionId: f.session.id });
  assert.equal(reread.session.specialCells.locked, true);
});

test('final landing on 双星 1000 pays 2000 once; passing a cell pays nothing; retry does not double', async t => {
  const f = await fixture(t);
  await f.inject([cell('n02', 'double')]);
  const result = await turn(f, 'turn-one');
  assert.equal(result.turn.points, 1000, 'base landing still matches the platform schedule');
  assert.deepEqual({ type: result.turn.specialCell.type, amount: result.turn.specialCell.amount, bonus: result.turn.specialCell.bonus },
    { type: 'double', amount: 2000, bonus: 1000 });
  assert.equal(result.turn.specialCell.formula, '1000 × 2 = 2000！');
  assert.deepEqual(result.session.specialCells.consumed, ['sc1-01']);
  assert.equal(result.session.specialCells.bonusAwards['turn-one:special'].status, 'awarded');
  await claim(f, 'turn-one'); await claim(f, 'turn-one', 'turn-one-claim-retry');
  assert.equal(f.bonusCalls(), 1); assert.equal(f.bonuses.size, 1);
  // studentB lands on the same, now consumed cell: ordinary price, no bonus.
  const again = await turn(f, 'turn-two', studentB);
  assert.equal(again.turn.specialCell, undefined); assert.equal(f.bonuses.size, 1);
});

test('passing over a multiplier cell does not trigger it', async t => {
  const f = await fixture(t, { random: () => 1 }); // 2 steps: n01 → n02 → n03
  await f.inject([cell('n02', 'crown')]);
  const result = await turn(f, 'turn-one');
  assert.equal(result.turn.finalLocation.nodeId, 'n03');
  assert.equal(result.turn.specialCell, undefined);
  assert.deepEqual(result.session.specialCells.consumed, []);
});

test('bonus credits wait (no fake success) while the platform bridge has no bonus endpoint', async t => {
  const f = await fixture(t, { bonusPlatform: false });
  await f.inject([cell('n02', 'star')]);
  const result = await turn(f, 'turn-one');
  assert.equal(result.turn.specialCell.amount, 1500);
  assert.equal(result.receipt.landing.amount, 1000);
  assert.equal(result.session.specialCells.bonusAwards['turn-one:special'].status, 'awaiting_platform');
});

test('red packet: trigger keeps own landing, every present student gets one +50', async t => {
  const f = await fixture(t, { students: [studentA, studentB, studentC] });
  await f.inject([cell('n02', 'redpack')]);
  const result = await turn(f, 'turn-one');
  const awards = Object.values(result.session.specialCells.bonusAwards);
  assert.deepEqual(awards.map(a => [a.studentId, a.amount]).sort(), [[studentA, 50], [studentB, 50], [studentC, 50]].sort());
  assert.ok(awards.every(a => a.key === `sc1-01:${a.studentId}`), 'idempotency key = instance + student');
  assert.equal(result.receipt.landing.amount, 1000);
  assert.deepEqual(result.session.specialCells.consumed, ['sc1-01']);
});

test('group move: cancel keeps positions; confirm freezes everyone once and claim awards each new tile', async t => {
  const f = await fixture(t);
  await f.inject([cell('n02', 'move2')]);
  const first = await turn(f, 'turn-one');
  const instance = first.turn.specialCell.groupMoveInstanceId;
  assert.equal(instance, 'gm-turn-one');
  await assert.rejects(roll(f, 'turn-blocked', studentB), { code: 'special_cells_group_move_pending' });
  const cancelled = await resolve(f, instance, 'cancel');
  assert.deepEqual(cancelled.session.teams.map(team => team.nodeId), ['n02', 'n01']);
  await assert.rejects(resolve(f, instance, 'confirm'), { code: 'special_cells_group_move_conflict' });

  await turn(f, 'turn-two', studentB); // studentB lands on the persistent cell
  const confirmed = await resolve(f, 'gm-turn-two', 'confirm');
  assert.deepEqual(confirmed.session.teams.map(team => team.nodeId), ['n04', 'n04'], 'trigger included, default route');
  assert.equal(confirmed.groupMove.moves.length, 2);
  const replay = await resolve(f, 'gm-turn-two', 'confirm', 'fresh-key-after-refresh');
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.session.teams.map(team => team.nodeId), ['n04', 'n04'], 'confirm moves only once');
  assert.equal(confirmed.session.turns['turn-two'].points, 1000, 'the original source turn retains its original price');
  assert.equal(f.claimCalls(), 2, 'confirm cannot credit wallets before the movement presentation');
  assert.deepEqual(confirmed.groupMove.awards.map(award => [award.studentId, award.points, award.event.nodeId, award.status]),
    [[studentA, tier('n04'), 'n04', 'planned'], [studentB, tier('n04'), 'n04', 'planned']]);
  await assert.rejects(roll(f, 'waiting-for-group-claims'), { code: 'special_cells_group_awards_pending' });
  const paid = await claimGroup(f, 'gm-turn-two');
  assert.ok(paid.groupMove.awards.every(award => award.status === 'awarded'));
  assert.equal(f.claimCalls(), 4, 'both students claim their own frozen new tile once');
  await claimGroup(f, 'gm-turn-two'); await claimGroup(f, 'gm-turn-two', 'fresh-group-claim');
  assert.equal(f.claimCalls(), 4);
});

test('historical unmarked group lesson cap still stops after three successes', async t => {
  const f = await fixture(t, { random: () => 0 }); // every roll is one step
  await f.inject([cell('n02', 'move1'), cell('n03', 'move1', 2), cell('n05a', 'move1', 3), cell('n07a', 'move1', 4)]);
  for (const [attemptId, student] of [['turn-1', studentA], ['turn-2', studentB], ['turn-3', studentA]]) {
    const result = await turn(f, attemptId, student);
    assert.ok(result.turn.specialCell.groupMoveInstanceId, `${attemptId} may move the class`);
    await resolve(f, result.turn.specialCell.groupMoveInstanceId, 'confirm');
    const file = join(f.store.dataDir, 'authoritative-turns.json');
    const persisted = JSON.parse(await readFile(file, 'utf8'));
    delete persisted.sessions[f.session.id].specialCells.groupMoves[result.turn.specialCell.groupMoveInstanceId].landingEffectsPolicy;
    await writeFile(file, JSON.stringify(persisted));
    await claimGroup(f, result.turn.specialCell.groupMoveInstanceId);
  }
  const state = (await f.store.get({ actor, sessionId: f.session.id })).session;
  assert.equal(state.specialCells.groupMoveSuccesses, 3);
  assert.deepEqual(state.teams.map(team => team.nodeId), ['n06a', 'n05a'], 'everyone moves along the default route');
  const fourth = await turn(f, 'turn-4', studentA);
  assert.equal(fourth.turn.finalLocation.nodeId, 'n07a');
  assert.equal(fourth.turn.specialCell.exhausted, true);
  assert.equal(fourth.turn.specialCell.groupMoveInstanceId, undefined);
  await roll(f, 'turn-5', studentB); // nothing pending blocks the lesson
});

test('全班前进3 is consumed only when confirmed; 再掷一次 grants once and never chains', async t => {
  const f = await fixture(t);
  await f.inject([cell('n02', 'move3'), cell('n03', 'reroll', 2)]);
  const first = await turn(f, 'turn-one');
  await resolve(f, first.turn.specialCell.groupMoveInstanceId, 'cancel');
  assert.deepEqual((await f.store.get({ actor, sessionId: f.session.id })).session.specialCells.consumed, [], 'cancel keeps the cell');
  const second = await turn(f, 'turn-two', studentB);
  const confirmed = await resolve(f, second.turn.specialCell.groupMoveInstanceId, 'confirm');
  assert.deepEqual(confirmed.session.specialCells.consumed, ['sc1-01']);
  assert.deepEqual(confirmed.session.teams.map(t => t.nodeId), ['n05a', 'n05a']);
  const paid = await claimGroup(f, second.turn.specialCell.groupMoveInstanceId);
  assert.ok(paid.groupMove.awards.every(award => award.status === 'awarded' && award.points === tier('n05a')));

  const g = await fixture(t);
  await g.inject([cell('n02', 'reroll'), cell('n03', 'reroll', 2)]);
  const a = await turn(g, 'turn-one');
  assert.equal(a.turn.specialCell.rerollGranted, true);
  const b = await turn(g, 'turn-reroll'); // granted extra roll lands on another 再掷
  assert.equal(b.turn.rerollOf, 'turn-one');
  assert.equal(b.turn.specialCell.rerollGranted, false, 'no chained extra roll');
  assert.equal(b.session.specialCells.pendingReroll, null);
});

test('sessions registered before special cells keep their old behaviour', async t => {
  const f = await fixture(t);
  const file = join(f.store.dataDir, 'authoritative-turns.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  delete state.sessions[f.session.id].rewardPolicy; delete state.sessions[f.session.id].specialCells;
  await writeFile(file, JSON.stringify(state));
  await assert.rejects(draw(f, 0, 'old-draw'), { code: 'special_cells_unavailable' });
  const result = await turn(f, 'turn-one');
  assert.equal(result.turn.specialCell, undefined);
  assert.equal(result.receipt.landing.amount, 1000);
});

test('HTTP: draw and group-move resolve accept only strict bodies from the game origin', async t => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { createPointsHandler, POINTS_API_BASE } = await import('../standalone/points-api.mjs');
  const origin = 'https://wordattack.timclass.cn', sessionId = '66666666-6666-4666-8666-666666666666';
  const calls = [];
  const store = Object.fromEntries(['get', 'drawSpecialCells', 'resolveGroupMove'].map(method => [method, async args => {
    calls.push({ method, args }); return { session: { id: sessionId, studentIds: [studentA], createdBy: actor.id } };
  }]));
  const handle = createPointsHandler({ pointsStore: store, pointsPlatform: { configured: true }, publicOrigin: origin,
    platformOrigin: 'http://platform.example', fetchSession: async url => url.endsWith('/api/auth/me')
      ? Response.json({ authenticated: true, user: actor }) : Response.json({ students: [{ id: studentA, status: 'active' }] }) });
  const server = createServer(async (req, res) => {
    const send = (response, status, body, headers) => { response.writeHead(status, headers); response.end(body); };
    if (!await handle(req, res, new URL(req.url, 'http://test').pathname, send)) send(res, 404, '{}', {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(done => server.close(done)));
  const post = (path, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${POINTS_API_BASE}${path}`, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'idempotency-key': 'http-special-key', ...headers }, body: JSON.stringify(body) });
  const drawBody = { expectedUserId: actor.id, density: 'normal', multipliersEnabled: true, previousDrawNumber: 0 };
  assert.equal((await post(`/sessions/${sessionId}/special-cells/draw`, drawBody)).status, 200);
  assert.deepEqual(calls.at(-1), { method: 'drawSpecialCells', args: { actor, sessionId, density: 'normal', multipliersEnabled: true, previousDrawNumber: 0, idempotencyKey: 'http-special-key' } });
  assert.equal((await post(`/sessions/${sessionId}/special-cells/draw`, { ...drawBody, cells: [] })).status, 422, 'browser cannot supply a layout');
  assert.equal((await post(`/sessions/${sessionId}/group-moves/gm-turn-1/resolve`, { expectedUserId: actor.id, decision: 'confirm' })).status, 200);
  assert.equal(calls.at(-1).method, 'resolveGroupMove'); assert.equal(calls.at(-1).args.instanceId, 'gm-turn-1');
  assert.equal((await post(`/sessions/${sessionId}/group-moves/gm-turn-1/resolve`, { expectedUserId: actor.id, decision: 'confirm', steps: 9 })).status, 422);
  assert.equal((await post(`/sessions/${sessionId}/special-cells/draw`, drawBody, { origin: 'https://evil.example' })).status, 403);
});


test('banner copy stays honest for pending bonuses and clears after platform credit', () => {
  const pending = specialCellLandingCopy(
    { type: 'star', category: 'points', bonus: 100, amount: 300, formula: '200 × 1.5 = 300！', turnId: 't1' },
    { bonusAwards: { 't1:special': { status: 'awaiting_platform', amount: 100 } } },
  );
  assert.match(pending.sub, /待平台入账/);
  const awarded = specialCellLandingCopy(
    { type: 'star', category: 'points', bonus: 100, amount: 300, formula: '200 × 1.5 = 300！', turnId: 't1' },
    { bonusAwards: { 't1:special': { status: 'awarded', amount: 100 } } },
  );
  assert.match(awarded.sub, /加成已入账/);
  assert.doesNotMatch(awarded.sub, /待平台/);
  const redPending = specialCellLandingCopy(
    { type: 'redpack', eachStudent: 50, cellId: 'sc1-01', turnId: 't2' },
    { bonusAwards: { 'sc1-01:a': { status: 'awaiting_platform', cellId: 'sc1-01', type: 'redpack', turnId: 't2' } } },
  );
  assert.match(redPending.sub, /待平台入账/);
  const redOk = specialCellLandingCopy(
    { type: 'redpack', eachStudent: 50, cellId: 'sc1-01', turnId: 't2' },
    { bonusAwards: {
      'sc1-01:a': { status: 'awarded', cellId: 'sc1-01', type: 'redpack', turnId: 't2' },
      'sc1-01:b': { status: 'awarded', cellId: 'sc1-01', type: 'redpack', turnId: 't2' },
    } },
  );
  assert.equal(redOk.sub, '全班小红包');
});
