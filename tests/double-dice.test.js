import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { CURRENT_POINTS_RULE_VERSION } from '../standalone/points-rule-versions.mjs';
import { createRuntime, rollTeacherMove, rollTeacherWorldMove, acceptWorldAnswer } from '../public/prototypes/universal-board/engine-core.js';
import { WORLD_REGISTRIES, WORLD_ROUTES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF, CIRCUIT_WORLD_ROUTE_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition, walkWorldPlan } from '../public/prototypes/universal-board/world-runtime-core.js';
import { drawSpecialCells, SPECIAL_CELLS_SCHEMA, LEGACY_SPECIAL_CELLS_SCHEMA, specialCellLandingCopy } from '../public/prototypes/universal-board/special-cells-core.js';
import { DOUBLE_DICE_POLICY, doubleDiceSteps, validTeacherDiceRoll } from '../public/prototypes/universal-board/double-dice-core.js';
import { assertLandingRoll } from '../public/prototypes/universal-board/landing-points-game.js';
import { LEARNING_PACKS } from '../public/prototypes/universal-board/packs.js';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const A = '22222222-2222-4222-8222-222222222222', B = '33333333-3333-4333-8333-333333333333';
const composition = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
const worlds = (basePoints = 1000) => [CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
  const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  return { worldRef, board, level, valueScale: basePoints / 200, points: new Map(board.nodes.map(node => [node.id, basePoints])) };
});
function rule() {
  return { kind: 'server_verified_final_landing', enabled: true, revision: CURRENT_POINTS_RULE_VERSION, currency: 'wordattack-points',
    worlds: worlds().map(({ worldRef, board, level }) => ({ worldRef, boardRef: `${board.id}@${board.version}`,
      levelRef: `${level.id}@${level.version}`, nodes: board.nodes.map(node => ({ nodeId: node.id, points: 1000 })) })) };
}
const cell = (nodeId, type = 'double_dice', number = 1) => ({ cellId: `sc1-${number}`, worldRef: CLOUD_HARBOR_WORLD_REF,
  nodeId, type, routeOrder: 5, basePoints: 1000 });
async function fixture(t, random = () => 0) {
  const dataDir = await mkdtemp(join(tmpdir(), 'monopoly-double-dice-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const receipts = new Map(), calls = [], bonusCalls = [];
  const platform = {
    register: async fields => ({ session: { id: '44444444-4444-4444-8444-444444444444', externalSessionId: fields.externalSessionId,
      studentIds: fields.studentIds, rule: rule(), landingCount: 0 } }),
    claim: async (sessionId, event) => {
      calls.push(structuredClone(event));
      if (!receipts.has(event.turnId)) receipts.set(event.turnId, {
        landing: { ...event, amount: 1000, ruleVersion: CURRENT_POINTS_RULE_VERSION, status: 'awarded', currency: 'wordattack-points' },
        wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: (receipts.size + 1) * 1000, revision: receipts.size + 1 },
      });
      return receipts.get(event.turnId);
    },
    claimSpecialCellBonus: async (_, event) => { bonusCalls.push(event); return { bonus: { ...event, status: 'awarded' } }; },
  };
  const store = new PointsTurnStore({ dataDir, platform, random });
  const { session } = await store.register({ actor, externalSessionId: 'double-dice-game', studentIds: [A, B], mode: 'teacher-led', idempotencyKey: 'register' });
  const mutate = async fn => {
    const path = join(dataDir, 'authoritative-turns.json');
    const state = JSON.parse(await readFile(path, 'utf8')); fn(state.sessions[session.id]); await writeFile(path, JSON.stringify(state));
  };
  const get = async () => (await store.get({ actor, sessionId: session.id })).session;
  const roll = (attemptId, studentId = A, target = store, key = `${attemptId}:roll`) => target.roll({ actor, sessionId: session.id, studentId, attemptId, idempotencyKey: key });
  const forks = [];
  const plan = async attemptId => {
    const routeChoicesByWorldInstance = {};
    for (let i = 0; i < 8; i++) {
      try { return await store.plan({ actor, sessionId: session.id, attemptId, routeChoicesByWorldInstance, idempotencyKey: `${attemptId}:plan` }); }
      catch (error) {
        if (error.code !== 'points_route_choice_required') throw error;
        const { worldInstanceId, junctionNodeId, options } = error.details; forks.push(junctionNodeId);
        (routeChoicesByWorldInstance[worldInstanceId] ||= {})[junctionNodeId] = options[0].edgeId;
      }
    }
    throw new Error('too many forks');
  };
  const claim = attemptId => store.claim({ actor, sessionId: session.id, attemptId, idempotencyKey: `${attemptId}:claim` });
  const turn = async (attemptId, studentId = A) => { await roll(attemptId, studentId); await plan(attemptId); return claim(attemptId); };
  const inject = cells => mutate(s => Object.assign(s.specialCells, { drawNumber: 1, cells, consumed: [] }));
  const hold = (s, studentId = A) => { s.specialCells.heldDoubleDiceByStudent[studentId] = { sourceTurnId: 'source-turn', cellId: 'source-cell' }; };
  return { store, session, platform, dataDir, mutate, get, roll, plan, claim, turn, inject, hold, forks, receipts, calls, bonusCalls };
}

test('v1 draw pool is byte-identical to the pre-double-dice golden; v2 always draws 1–2 chances', () => {
  const w = worlds(), legacyWorlds = worlds(200);
  const golden = Array.from({ length: 24 }, (_, i) => drawSpecialCells({ sessionId: `legacy-${i}`, drawNumber: 1 + i % 3,
    studentCount: i % 8 + 1, density: ['few', 'normal', 'many'][i % 3], multipliersEnabled: i % 4 !== 0, worlds: legacyWorlds, layoutVersion: LEGACY_SPECIAL_CELLS_SCHEMA }));
  assert.equal(createHash('sha256').update(JSON.stringify(golden)).digest('hex'), '3399d50cbe8e928a7d273abc6b6953281c4035d443571df2cd8e79950bf32810');
  assert.ok(golden.every(layout => layout.cells.every(entry => entry.type !== 'double_dice')));
  for (let i = 0; i < 120; i++) {
    const layout = drawSpecialCells({ sessionId: `v2-${i}`, drawNumber: 1, studentCount: 1 + i % 8,
      density: ['few', 'normal', 'many'][i % 3], multipliersEnabled: i % 2 === 0, worlds: w });
    assert.equal(layout.schemaVersion, SPECIAL_CELLS_SCHEMA);
    assert.ok([1, 2].includes(layout.cells.filter(entry => entry.type === 'double_dice').length));
  }
});

test('landing grants one chance without changing the base claim; another pupil does not spend it; next roll consumes it once', async t => {
  let samples = [0, 0, 5, 4], randomCalls = 0;
  const f = await fixture(t, sides => { assert.equal(sides, 6); randomCalls++; return samples.shift() ?? 0; });
  await f.inject([cell('n02')]);
  const first = await f.turn('grant');
  assert.equal(first.turn.specialCell.doubleDiceGranted, true);
  assert.equal(first.turn.points, 1000); assert.equal(first.turn.specialCell.bonus, 0); assert.equal(first.receipt.landing.amount, 1000);
  assert.deepEqual(first.session.specialCells.consumed, ['sc1-1']);
  assert.equal(first.session.specialCells.heldDoubleDiceByStudent[A].sourceTurnId, 'grant');
  await f.turn('other', B);
  assert.equal((await f.get()).specialCells.heldDoubleDiceByStudent[A].sourceTurnId, 'grant');
  const dual = await f.roll('dual');
  assert.deepEqual(dual.turn.faceIndices, [5, 4]); assert.equal(dual.turn.faceIndex, 5); assert.equal(dual.turn.steps, 11);
  assert.equal(dual.turn.dicePolicy, DOUBLE_DICE_POLICY); assert.equal(dual.turn.doubleDiceOf, 'grant');
  assert.equal(dual.session.specialCells.heldDoubleDiceByStudent[A], undefined);
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform, random: () => { throw new Error('must not sample again'); } });
  assert.deepEqual((await f.roll('dual', A, restarted, 'lost-response-retry')).turn, dual.turn);
  assert.equal(randomCalls, 4);
  await f.plan('dual'); await f.claim('dual'); await f.claim('dual');
  assert.equal(f.receipts.size, 3); assert.equal(f.calls.length, 3); assert.equal(f.bonusCalls.length, 0);
  const single = await f.roll('normal');
  assert.equal(Object.hasOwn(single.turn, 'dicePolicy'), false); assert.equal(Object.hasOwn(single.turn, 'faceIndices'), false);
});

test('a failed second sample preserves the original held chance and does not persist a partial roll', async t => {
  let invalid = false, index = 0;
  const f = await fixture(t, () => invalid && ++index === 2 ? 9 : 0);
  await f.inject([cell('n02')]); await f.turn('grant'); invalid = true; index = 0;
  await assert.rejects(f.roll('failed'), { code: 'points_random_invalid' });
  const saved = await f.get(); assert.equal(saved.activeTurnId, null); assert.equal(saved.turns.failed, undefined);
  assert.equal(saved.specialCells.heldDoubleDiceByStudent[A].sourceTurnId, 'grant');
  invalid = false;
  assert.deepEqual((await f.roll('failed')).turn.faceIndices, [0, 0]);
});

test('a dual landing on a fresh dual cell grants the following roll, with at most one held chance', async t => {
  const f = await fixture(t); await f.inject([cell('n02'), cell('n04', 'double_dice', 2)]);
  await f.turn('grant'); const second = await f.turn('dual-and-grant');
  assert.equal(second.turn.steps, 2); assert.equal(second.turn.finalLocation.nodeId, 'n04');
  assert.equal(second.session.specialCells.heldDoubleDiceByStudent[A].sourceTurnId, 'dual-and-grant');
  assert.equal(Object.keys(second.session.specialCells.heldDoubleDiceByStudent).length, 1);
  assert.deepEqual((await f.roll('again')).turn.faceIndices, [0, 0]);
});

test('historical unmarked group push pays its tile without retroactively granting dual dice', async t => {
  const f = await fixture(t); await f.inject([cell('n02', 'move1'), cell('n03', 'double_dice', 2)]);
  await f.mutate(s => { s.teams[1].nodeId = 'n02'; });
  const source = await f.turn('challenge'), instanceId = source.turn.specialCell.groupMoveInstanceId;
  await f.store.resolveGroupMove({ actor, sessionId: f.session.id, instanceId, decision: 'confirm', idempotencyKey: 'confirm' });
  await f.mutate(s => { delete s.specialCells.groupMoves[instanceId].landingEffectsPolicy; });
  const paid = await f.store.claimGroupMove({ actor, sessionId: f.session.id, instanceId, idempotencyKey: 'group-claim' });
  assert.ok(paid.groupMove.awards.every(award => award.event.nodeId === 'n03' && award.status === 'awarded'));
  assert.deepEqual(paid.session.specialCells.heldDoubleDiceByStudent, {});
  assert.equal(paid.session.specialCells.consumed.includes('sc1-2'), false);
});

test('lap refresh retains unused dual chances; locked v1 snapshots stay v1 and retain their old field format', async t => {
  for (const legacy of [false, true]) {
    const f = await fixture(t); await f.inject([cell('n02')]); await f.turn('grant');
    await f.mutate(s => {
      s.teams[0].completedLaps = 1; s.teams[1].nodeId = 'n48';
      if (legacy) { delete s.specialCells.layoutVersion; delete s.specialCells.heldDoubleDiceByStudent; }
    });
    const before = await f.get(); const result = await f.turn('finish', B);
    assert.equal(result.session.lapRound, 2);
    if (legacy) {
      assert.equal(Object.hasOwn(result.session.specialCells, 'layoutVersion'), false);
      assert.equal(Object.hasOwn(result.session.specialCells, 'heldDoubleDiceByStudent'), false);
      const expected = drawSpecialCells({ sessionId: f.session.id, drawNumber: 2, studentCount: 2, worlds: [worlds()[0]], layoutVersion: LEGACY_SPECIAL_CELLS_SCHEMA });
      assert.deepEqual(result.session.specialCells.cells, expected.cells);
    } else assert.deepEqual(result.session.specialCells.heldDoubleDiceByStudent, before.specialCells.heldDoubleDiceByStudent);
  }
});

test('12 steps require every encountered fork and credit only the final tile; finish returns cost zero and count one lap', async t => {
  for (const start of ['n03', 'n48']) {
    const f = await fixture(t, () => 5);
    await f.mutate(s => { s.teams[0].nodeId = start; f.hold(s); });
    const rolled = await f.roll('twelve'); assert.equal(rolled.turn.steps, 12);
    const result = await f.plan('twelve');
    assert.equal(result.turn.plan.effects.filter(e => e.type === 'pawn_step').length, 12);
    assert.deepEqual(f.forks, ['n04', 'n10']);
    if (start === 'n48') {
      assert.equal(result.turn.plan.lapCompletions.length, 1); assert.equal(result.turn.plan.lapReturns.length, 1);
      assert.equal(result.turn.plan.lapReturns[0].zeroStepCost, true); assert.equal(result.session.teams[0].completedLaps, 1);
    }
    await f.claim('twelve'); await f.claim('twelve');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].nodeId, result.turn.finalLocation.nodeId);
  }
});

test('strict dual metadata is required by planners and teacher engine; voice rejects dual even when total is below six', () => {
  const make = (faceIndices = [5, 5]) => {
    const dice = { dicePolicy: DOUBLE_DICE_POLICY, faceIndices };
    const plan = walkWorldPlan({ moveId: 'dual-engine', worldInstanceId: 'double-world', worldOrdinal: 1,
      worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: 'n48', steps: doubleDiceSteps(dice), ...dice,
      worldRoute: WORLD_ROUTES[CIRCUIT_WORLD_ROUTE_REF], registries: WORLD_REGISTRIES });
    const runtime = createRuntime({ mode: 'teacher-led', board: composition.board, theme: composition.theme,
      teams: [{ id: `player-${A}`, label: 'A', members: ['A'] }] });
    runtime.teams[0].nodeId = 'n48';
    runtime.world = { schemaVersion: 'world-runtime.v1', routeRef: CIRCUIT_WORLD_ROUTE_REF,
      active: { instanceId: 'double-world', ordinal: 1, worldPackRef: CLOUD_HARBOR_WORLD_REF, mapState: {}, levelState: {} },
      completed: [], processedTransitionIds: [] };
    return { attemptId: plan.id, worldPlan: plan, runtime, finalBoard: composition.board, activityTemplates: {} };
  };
  const input = make(); const result = rollTeacherWorldMove(input);
  assert.equal(result.runtime.lastDie, 12); assert.deepEqual(result.runtime.lastDoubleDice, { dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [5, 5] });
  const changed = structuredClone(input); delete changed.worldPlan.dicePolicy; delete changed.worldPlan.faceIndices;
  assert.throws(() => rollTeacherWorldMove(changed), /legal die/);
  for (const faces of [[0, 0], [5, 5]]) {
    const voice = make(faces); voice.runtime.mode = 'voice'; voice.learningPack = LEARNING_PACKS.family;
    assert.throws(() => acceptWorldAnswer(voice), /double dice plans require a teacher/);
  }
  const turn = { attemptId: 'dual-engine', studentId: A, teacherDiceRef: 'teacher-dice.v1', dicePolicy: DOUBLE_DICE_POLICY,
    faceIndices: [5, 5], faceIndex: 5, steps: 12, startLocation: { worldRef: CLOUD_HARBOR_WORLD_REF, worldInstanceId: 'double-world', nodeId: 'n48' } };
  assert.equal(assertLandingRoll({ turn, attemptId: turn.attemptId, studentId: A, runtime: input.runtime }), turn);
  for (const change of [{ steps: 11 }, { faceIndex: 4 }, { dicePolicy: 'unknown' }, { faceIndices: [6, 5] }, { faceIndices: [5] }]) {
    assert.equal(validTeacherDiceRoll({ ...turn, ...change }), false);
    assert.throws(() => assertLandingRoll({ turn: { ...turn, ...change }, attemptId: turn.attemptId, studentId: A, runtime: input.runtime }));
  }
  assert.deepEqual(specialCellLandingCopy({ type: 'double_dice', category: 'double_dice' }),
    { text: '双骰机会！下次掷两颗骰子', sub: '下一次行动自动使用 · 最多持有 1 次' });
});

test('teacher snapshots restore a saved dual opportunity and completed 12-step die; malformed metadata and voice state fail closed', async () => {
  const { createBoardSession, isRestorableBoardSessionSnapshot } = await import('../public/js/lib/voice-board-session-core.js');
  const { initializeTeacherSession, grantTeacherOpportunity } = await import('../public/js/lib/teacher-board-session.js');
  const runtime = createRuntime({ mode: 'teacher-led', board: composition.board, theme: composition.theme,
    teams: [{ id: `player-${A}`, label: 'A', members: ['A'] }] });
  const session = initializeTeacherSession(createBoardSession({ players: [{ id: A, displayName: 'A', teamId: `player-${A}` }], teams: runtime.teams }));
  const check = (s = session, r = runtime) => isRestorableBoardSessionSnapshot({ session: s, runtime: r, playerCount: 1, boardNodeIds: composition.board.nodes.map(n => n.id) });
  assert.equal(check(), true);
  const ready = grantTeacherOpportunity(session, { seatId: A, opportunityId: 'saved-dual' });
  Object.assign(ready.teacherOpportunity, { faceIndex: 5, dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [5, 5] });
  assert.equal(check(ready), true);
  assert.equal(check({ ...ready, teacherOpportunity: { ...ready.teacherOpportunity, faceIndices: [5, 6] } }), false);
  const completed = { ...runtime, lastDie: 12, lastDoubleDice: { dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [5, 5] } };
  assert.equal(check(session, JSON.parse(JSON.stringify(completed))), true);
  assert.equal(check(session, { ...completed, lastDoubleDice: { ...completed.lastDoubleDice, faceIndices: [5, 4] } }), false);
  assert.equal(check(session, { ...completed, lastDoubleDice: undefined }), false);
  assert.equal(check({ ...session, mode: 'voice' }, completed), false);
});

test('HTTP/client lost-roll response recovers the same two faces and never accepts client dice or malformed server faces', async t => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { createPointsHandler, POINTS_API_BASE } = await import('../standalone/points-api.mjs');
  const { createLandingPointsClient } = await import('../public/prototypes/universal-board/landing-points-client.js');
  let randomCalls = 0;
  const f = await fixture(t, () => { randomCalls++; return 5; });
  await f.mutate(s => { f.hold(s); });
  const origin = 'https://isolated-monopoly.example';
  const handler = createPointsHandler({ pointsStore: f.store, pointsPlatform: { configured: true }, publicOrigin: origin,
    platformOrigin: 'http://isolated-platform.example', fetchSession: async url => url.endsWith('/api/auth/me')
      ? Response.json({ authenticated: true, user: actor }) : Response.json({ students: [A, B].map(id => ({ id, status: 'active' })) }) });
  const server = createServer(async (req, res) => {
    const send = (_, status, body, headers) => { res.writeHead(status, headers); res.end(body); };
    if (!await handler(req, res, new URL(req.url, origin).pathname, send)) send(res, 404, '{}', {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(done => server.close(done)));
  const host = `http://127.0.0.1:${server.address().port}`;
  const badBody = await fetch(`${host}${POINTS_API_BASE}/sessions/${f.session.id}/roll`, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'idempotency-key': 'client-cannot-set' },
    body: JSON.stringify({ expectedUserId: actor.id, studentId: A, attemptId: 'bad', faceIndices: [5, 5] }) });
  assert.equal(badBody.status, 422); assert.equal(randomCalls, 0);
  const data = new Map(), storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  let loseResponse = true, corrupt = false, sequence = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('/api/game-points/')) return Response.json({ wallet: { studentId: url.split('/').at(-2), currency: 'wordattack-points', balance: 0, revision: 0 } });
    const response = await fetch(host + url, { ...options, headers: { ...options.headers, ...(options.method === 'POST' ? { origin } : {}) } });
    if (url.endsWith('/roll') && loseResponse) { loseResponse = false; await response.arrayBuffer(); throw new Error('isolated response lost after server save'); }
    if (corrupt && url.includes('/sessions/')) {
      const payload = await response.json(); payload.session.turns['http-dual'].faceIndices = [5, 6];
      return Response.json(payload);
    }
    return response;
  };
  const create = () => createLandingPointsClient({ getUserId: () => actor.id, storage, fetchImpl, createId: () => `dual-request-${++sequence}` });
  const client = create(); await client.ready();
  await client.registerNewGame({ externalSessionId: 'double-dice-game', studentIds: [A, B] });
  await assert.rejects(client.roll('double-dice-game', { studentId: A, attemptId: 'http-dual' }));
  assert.equal(randomCalls, 2); assert.equal((await f.get()).specialCells.heldDoubleDiceByStudent[A], undefined);
  const restored = create(); await restored.ready('double-dice-game');
  const recovered = await restored.roll('double-dice-game', { studentId: A, attemptId: 'http-dual' });
  assert.deepEqual(recovered.turn.faceIndices, [5, 5]); assert.equal(recovered.turn.steps, 12); assert.equal(randomCalls, 2);
  for (const key of ['http-replay-key', 'http-replay-key', 'http-fresh-key']) {
    const response = await fetch(`${host}${POINTS_API_BASE}/sessions/${f.session.id}/roll`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ expectedUserId: actor.id, studentId: A, attemptId: 'http-dual' }) });
    assert.equal(response.status, 200);
    const replay = await response.json();
    assert.equal(replay.duplicate, true); assert.deepEqual(replay.turn, recovered.turn);
    assert.equal(randomCalls, 2);
  }
  corrupt = true;
  await assert.rejects(restored.refresh('double-dice-game', { wallets: false }), { code: 'points_turn_invalid' });
  assert.deepEqual(restored.getTurn('double-dice-game', 'http-dual').faceIndices, [5, 5]);
  const storageKey = [...data.keys()][0], validRaw = data.get(storageKey), forged = JSON.parse(validRaw);
  forged['double-dice-game'].session.turns['http-dual'].faceIndex = 4;
  data.set(storageKey, JSON.stringify(forged));
  const invalidRestore = create();
  assert.equal(invalidRestore.getTurn('double-dice-game', 'http-dual'), null);
  assert.match(invalidRestore.error(), /恢复记录无法读取/);
  await assert.rejects(invalidRestore.roll('double-dice-game', { studentId: A, attemptId: 'http-dual' }));
  assert.equal(randomCalls, 2); assert.equal(data.get(storageKey), JSON.stringify(forged), 'bad outbox is preserved for recovery');
  data.set(storageKey, validRaw);
  assert.deepEqual(create().getTurn('double-dice-game', 'http-dual').faceIndices, [5, 5]);
});

test('an explicit fresh unlocked draw upgrades to v2; an existing locked v1 layout cannot be redrawn', async t => {
  for (const locked of [false, true]) {
    const f = await fixture(t);
    await f.mutate(s => {
      delete s.specialCells.layoutVersion; delete s.specialCells.heldDoubleDiceByStudent;
      s.specialCells.drawNumber = 1; s.specialCells.locked = locked; s.specialCells.cells = [cell('n08', 'bag')];
    });
    const request = { actor, sessionId: f.session.id, density: 'normal', multipliersEnabled: true, previousDrawNumber: 1, idempotencyKey: 'explicit-draw' };
    if (locked) {
      await assert.rejects(f.store.drawSpecialCells(request), { code: 'special_cells_locked' });
      assert.equal(Object.hasOwn((await f.get()).specialCells, 'layoutVersion'), false);
    } else {
      const next = (await f.store.drawSpecialCells(request)).session.specialCells;
      assert.equal(next.layoutVersion, SPECIAL_CELLS_SCHEMA);
      assert.deepEqual(next.heldDoubleDiceByStudent, {});
      assert.ok(next.cells.some(entry => entry.type === 'double_dice'));
    }
  }
});

test('a dual ending exactly at n49 stops there; the next dual leaves through n01 without counting another completed lap', async t => {
  const f = await fixture(t);
  await f.mutate(s => { s.teams[0].nodeId = 'n47'; f.hold(s); });
  await f.roll('exact-dual'); const exact = await f.plan('exact-dual'); await f.claim('exact-dual');
  assert.equal(exact.turn.steps, 2); assert.equal(exact.turn.finalLocation.nodeId, 'n49');
  assert.equal(exact.turn.plan.lapReturns.length, 0); assert.equal(exact.session.teams[0].completedLaps, 1);
  await f.mutate(s => f.hold(s));
  await f.roll('leave-dual'); const leaving = await f.plan('leave-dual');
  assert.equal(leaving.turn.finalLocation.nodeId, 'n03'); assert.equal(leaving.turn.plan.lapReturns.length, 1);
  assert.equal(leaving.turn.plan.lapCompletions.length, 0); assert.equal(leaving.session.teams[0].completedLaps, 1);
});

test('a same-world dual uses a strict plan without an exit; its following local single die clears stale dual snapshot metadata', () => {
  const runtime = createRuntime({ mode: 'teacher-led', board: composition.board, theme: composition.theme,
    teams: [{ id: `player-${A}`, label: 'A', members: ['A'] }] });
  runtime.teams[0].nodeId = 'n02';
  runtime.world = { schemaVersion: 'world-runtime.v1', routeRef: CIRCUIT_WORLD_ROUTE_REF,
    active: { instanceId: 'same-world-dual', ordinal: 1, worldPackRef: CLOUD_HARBOR_WORLD_REF, mapState: {}, levelState: {} },
    completed: [], processedTransitionIds: [] };
  const plan = walkWorldPlan({ moveId: 'no-exit-dual', worldInstanceId: 'same-world-dual', worldOrdinal: 1,
    worldRef: CLOUD_HARBOR_WORLD_REF, startNodeId: 'n02', steps: 12, dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [5, 5],
    worldRoute: WORLD_ROUTES[CIRCUIT_WORLD_ROUTE_REF], registries: WORLD_REGISTRIES });
  assert.equal(plan.transitions.length, 0); assert.equal(plan.lapReturns.length, 0);
  const moved = rollTeacherWorldMove({ attemptId: plan.id, runtime, worldPlan: plan, finalBoard: composition.board, activityTemplates: {} });
  assert.equal(moved.runtime.lastDie, 12); assert.equal(moved.runtime.teams[0].nodeId, plan.finalLocation.nodeId);
  const single = rollTeacherMove({ attemptId: 'following-single', runtime: moved.runtime, board: composition.board,
    dieValue: 1, activityTemplates: {} });
  assert.equal(single.runtime.lastDie, 1); assert.equal(Object.hasOwn(single.runtime, 'lastDoubleDice'), false);
});

test('corrupt dual holdings fail closed before RNG and cannot become an ordinary replacement turn', async t => {
  let randomCalls = 0;
  const f = await fixture(t, () => { randomCalls++; return 0; });
  for (const holding of [null, [], { sourceTurnId: 123, cellId: 'x' }, { sourceTurnId: 'x' }, false]) {
    await f.mutate(s => { s.specialCells.heldDoubleDiceByStudent[A] = holding; });
    await assert.rejects(f.roll('corrupt-holding'), { code: 'points_state_conflict' });
    assert.equal(randomCalls, 0); assert.equal((await f.get()).turns['corrupt-holding'], undefined);
    assert.deepEqual((await f.get()).specialCells.heldDoubleDiceByStudent[A], holding);
  }
});

test('a failed durable roll write preserves the chance and original disk state without exposing a partial locked result', async t => {
  let samples = 0;
  const f = await fixture(t, () => { samples++; return 5; });
  await f.mutate(s => f.hold(s));
  const file = join(f.dataDir, 'authoritative-turns.json'), before = await readFile(file, 'utf8');
  f.store.createId = () => 'isolated-write-collision';
  await writeFile(`${file}.isolated-write-collision.tmp`, 'isolated failure fixture');
  await assert.rejects(f.roll('disk-failure'), { code: 'EEXIST' });
  assert.equal(samples, 2); assert.equal(await readFile(file, 'utf8'), before);
  const unchanged = await f.get();
  assert.equal(unchanged.turns['disk-failure'], undefined); assert.equal(unchanged.activeTurnId, null);
  assert.equal(unchanged.specialCells.heldDoubleDiceByStudent[A].sourceTurnId, 'source-turn');
  const recovered = await f.roll('disk-failure');
  assert.deepEqual(recovered.turn.faceIndices, [5, 5]);
  assert.equal(recovered.session.specialCells.heldDoubleDiceByStudent[A], undefined);
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform, random: () => { throw new Error('already locked'); } });
  assert.deepEqual((await f.roll('disk-failure', A, restarted, 'durable-retry')).turn, recovered.turn);
});

test('points-only roll and display adapters retain verified dual sums and physical first faces, and reject bare or mixed authority', async () => {
  const { pointsOnlyDiceRoll, pointsOnlyDicePresentation } = await import('../public/prototypes/universal-board/points-only-economy.js');
  const { teacherDiceRoll } = await import('../public/prototypes/universal-board/teacher-dice.js');
  for (const faceIndices of [[0, 0], [0, 2], [1, 4], [5, 5]]) {
    const first = teacherDiceRoll({ mode: 'teacher-led', teacherDiceRef: 'teacher-dice.v1' }, null, faceIndices[0]);
    const source = { ...first, dicePolicy: DOUBLE_DICE_POLICY, faceIndices,
      steps: faceIndices[0] + faceIndices[1] + 2, faceLabel: 'retired coins', faceLabels: ['retired stars'] };
    const before = structuredClone(source);
    Object.freeze(source); Object.freeze(faceIndices);
    const adapted = pointsOnlyDiceRoll(source);
    assert.equal(adapted.steps, source.steps); assert.equal(adapted.face.steps, faceIndices[0] + 1);
    assert.deepEqual(adapted.faceIndices, faceIndices); assert.notStrictEqual(adapted.faceIndices, faceIndices);
    assert.deepEqual(adapted.bonus, { coins: 0, stars: 0 }); assert.deepEqual(adapted.face.bonus, { coins: 0, stars: 0 });
    assert.equal(adapted.rewardSource, undefined); assert.equal(adapted.faceLabels, undefined);
    const display = pointsOnlyDicePresentation(JSON.parse(JSON.stringify({ poolId: 'treasure', label: '双骰机会',
      faceIndex: source.faceIndex, steps: source.steps, faceIndices, dicePolicy: DOUBLE_DICE_POLICY, bonus: source.bonus })));
    assert.equal(display.steps, source.steps); assert.deepEqual(display.faceIndices, faceIndices);
    assert.equal(display.faceLabel, `${faceIndices[0] + 1} + ${faceIndices[1] + 1} = ${source.steps} 步`);
    assert.deepEqual(source, before);
    for (const change of [{ steps: source.steps + 1 }, { dicePolicy: 'unknown' }, { faceIndices: [0, 6] },
      { faceIndex: (source.faceIndex + 1) % 6 }, { poolId: 'starter' }, { face: { steps: (source.faceIndex + 1) % 6 + 1 } }]) {
      assert.throws(() => pointsOnlyDiceRoll({ ...source, ...change }), /double dice/);
    }
  }
  for (const adapter of [pointsOnlyDiceRoll, pointsOnlyDicePresentation]) {
    assert.throws(() => adapter({ poolId: 'treasure', faceIndex: 5, steps: 12 }), /1–6/);
    assert.throws(() => adapter({ poolId: 'treasure', faceIndex: 0, steps: 2, faceIndices: [0, 0] }), /double dice/);
  }
});
