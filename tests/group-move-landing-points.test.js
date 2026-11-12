import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { GROUP_MOVE_REWARD_POLICY, hasPendingGroupMoveAwards } from '../standalone/points-special-cells.mjs';
import { createPointsHandler, POINTS_API_BASE } from '../standalone/points-api.mjs';
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const studentId = index => `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`;
const students = Array.from({ length: 8 }, (_, index) => studentId(index + 1));
const origin = 'https://wordattack.timclass.cn';
const revision = 'monopoly-final-landing-v3';
const amountOverrides = { n02: 200, n03: 100, n04: 500, n05a: 300, n06a: 1000, n15: 200, n18: 300, n48: 500, n49: 1000 };
function rule() {
  return { kind: 'server_verified_final_landing', enabled: true, revision, currency: 'wordattack-points',
    worlds: [CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
      const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map((node, index) => ({ nodeId: node.id, points: (amountOverrides[node.id] || [100, 200, 300, 500, 1000][index % 5]) * 5 })) };
    }) };
}
const expectedAttempt = (sessionId, instanceId, student) => `group-landing:${createHash('sha256')
  .update(JSON.stringify([sessionId, instanceId, student])).digest('hex')}`;
const pointsFor = (worldRef, nodeId) => rule().worlds.find(world => world.worldRef === worldRef).nodes.find(node => node.nodeId === nodeId).points;

async function fixture(t, { count = 2, type = 'move1' } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'group-landing-points-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const file = join(dataDir, 'authoritative-turns.json'), roster = students.slice(0, count);
  const calls = [], bonusCalls = [], credits = new Map(), balances = new Map(roster.map(id => [id, 0]));
  let beforeClaim = null, afterClaim = null, transformReceipt = null;
  const context = { actor, cookie: 'sid=isolated-fixture' };
  const platform = {
    configured: true,
    register: async fields => ({ session: { id: '44444444-4444-4444-8444-444444444444', externalSessionId: fields.externalSessionId,
      studentIds: [...fields.studentIds], rule: rule(), landingCount: 0 } }),
    claim: async (sessionId, event, receivedContext) => {
      calls.push(structuredClone(event));
      await beforeClaim?.(event, receivedContext);
      if (!credits.has(event.turnId)) {
        const amount = pointsFor(event.worldRef, event.nodeId);
        balances.set(event.studentId, balances.get(event.studentId) + amount);
        credits.set(event.turnId, { landing: { ...event, amount, ruleVersion: revision, currency: 'wordattack-points', status: 'awarded' },
          wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: balances.get(event.studentId), revision: credits.size + 1 } });
      }
      await afterClaim?.(event);
      const receipt = structuredClone(credits.get(event.turnId));
      return transformReceipt ? transformReceipt(receipt, event) : receipt;
    },
    claimSpecialCellBonus: async (sessionId, bonus) => {
      bonusCalls.push(structuredClone(bonus));
      return { bonus: { ...bonus, status: 'awarded' } };
    },
  };
  const store = new PointsTurnStore({ dataDir, platform, random: () => 0 });
  const { session } = await store.register({ actor, externalSessionId: 'group-fixture', studentIds: roster,
    mode: 'teacher-led', idempotencyKey: 'register-group', context });
  const mutate = async callback => {
    const state = JSON.parse(await readFile(file, 'utf8'));
    callback(state.sessions[session.id]); await writeFile(file, JSON.stringify(state));
  };
  await mutate(saved => Object.assign(saved.specialCells, { drawNumber: 1, density: 'few',
    cells: [{ cellId: 'sc1-01', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId: 'n02', type, basePoints: 1000, routeOrder: 1 }] }));
  const get = async () => (await store.get({ actor, sessionId: session.id })).session;
  const roll = (attemptId = 'source-turn', student = roster[0], target = store) => target.roll({ actor,
    sessionId: session.id, studentId: student, attemptId, idempotencyKey: `${attemptId}:roll` });
  const begin = async ({ claimSource = true } = {}) => {
    await roll();
    await store.plan({ actor, sessionId: session.id, attemptId: 'source-turn', routeChoicesByWorldInstance: {}, idempotencyKey: 'source:plan' });
    if (claimSource) await store.claim({ actor, sessionId: session.id, attemptId: 'source-turn', idempotencyKey: 'source:claim', context });
    return 'gm-source-turn';
  };
  const resolve = (decision = 'confirm', key = `group:${decision}`, target = store) => target.resolveGroupMove({ actor,
    sessionId: session.id, instanceId: 'gm-source-turn', decision, idempotencyKey: key });
  const claim = (key = 'group:claim', target = store, acting = actor) => target.claimGroupMove({ actor: acting,
    sessionId: session.id, instanceId: 'gm-source-turn', idempotencyKey: key, context });
  const groupCalls = () => calls.filter(event => event.turnId.startsWith('group-landing:'));
  const restart = () => new PointsTurnStore({ dataDir, platform, random: () => { throw new Error('recovery cannot resample dice'); } });
  return { store, session, platform, roster, file, context, mutate, get, begin, resolve, claim, roll, calls, groupCalls,
    bonusCalls, credits, balances, restart, before: callback => { beforeClaim = callback; },
    after: callback => { afterClaim = callback; }, transform: callback => { transformReceipt = callback; } };
}

for (const count of [1, 2, 8]) test(`${count} students receive exactly their own frozen landing price after confirm, reload and claim`, async t => {
  const f = await fixture(t, { count });
  const starts = ['n01', 'n02', 'n03', 'n05a', 'n14', 'n17', 'n47', 'n48'];
  await f.mutate(session => session.teams.forEach((team, index) => { team.nodeId = starts[index]; }));
  await f.begin();
  const callsBefore = f.calls.length;
  const confirmed = await f.resolve();
  const move = confirmed.groupMove;
  assert.equal(GROUP_MOVE_REWARD_POLICY, 'group-final-landing-v1');
  assert.equal(move.rewardPolicy, GROUP_MOVE_REWARD_POLICY);
  assert.equal(move.status, 'confirmed');
  assert.equal(move.awards.length, count);
  assert.equal(f.calls.length, callsBefore, 'confirm persists positions and awards before any additional wallet request');
  assert.equal(hasPendingGroupMoveAwards(confirmed.session), true);
  assert.deepEqual(move.awards.map(award => award.studentId), f.roster);
  const expectedNodes = ['n03', 'n03', 'n04', 'n06a', 'n15', 'n18', 'n48', 'n49'].slice(0, count);
  for (const [index, award] of move.awards.entries()) {
    assert.equal(award.attemptId, expectedAttempt(f.session.id, move.instanceId, f.roster[index]));
    assert.equal(award.event.turnId, award.attemptId);
    assert.equal(award.event.studentId, f.roster[index]);
    assert.equal(award.event.nodeId, expectedNodes[index]);
    assert.equal(award.event.worldInstanceId, confirmed.session.world.active.instanceId);
    assert.equal(award.points, pointsFor(CLOUD_HARBOR_WORLD_REF, expectedNodes[index]));
    assert.equal(award.ruleVersion, revision, 'each new award freezes its monetary rule version');
    assert.equal(award.status, 'planned'); assert.equal(award.receipt, null);
    assert.deepEqual(Object.keys(award.event).sort(), ['turnId', 'studentId', 'worldRef', 'boardRef', 'levelRef', 'worldInstanceId', 'nodeId'].sort());
  }
  const disk = JSON.parse(await readFile(f.file, 'utf8')).sessions[f.session.id];
  assert.deepEqual(disk.specialCells.groupMoves[move.instanceId].awards, move.awards);
  const positions = confirmed.session.teams.map(team => team.nodeId);
  assert.deepEqual((await f.resolve()).groupMove, move, 'exact-key confirmation replay includes its frozen groupMove');
  assert.deepEqual((await f.resolve('confirm', 'fresh-confirm')).session.teams.map(team => team.nodeId), positions);
  await assert.rejects(f.roll('blocked-before-group-awards'), { code: 'special_cells_group_awards_pending' });
  const restarted = f.restart();
  const results = await Promise.all([f.claim('group:claim', restarted), f.claim('group:claim', restarted)]);
  for (const result of results) assert.ok(result.groupMove.awards.every(award => award.status === 'awarded' && award.receipt));
  assert.equal(f.groupCalls().length, count);
  assert.equal(new Set(f.groupCalls().map(event => event.turnId)).size, count);
  assert.equal(hasPendingGroupMoveAwards(results.at(-1).session), false);
  for (const [index, student] of f.roster.entries()) {
    assert.equal(f.balances.get(student), pointsFor(CLOUD_HARBOR_WORLD_REF, expectedNodes[index]) + (index === 0 ? 1000 : 0));
  }
  await f.claim('fresh-claim-after-reload', f.restart());
  assert.equal(f.groupCalls().length, count, 'new request keys cannot duplicate per-student rewards');
  assert.deepEqual((await f.get()).teams.map(team => team.nodeId), positions);
  assert.equal((await f.roll('next-legal-turn')).turn.status, 'rolled');
});

test('partial group claims persist successful receipts and block dice and whole-class bonus refresh until all arrive', async t => {
  const f = await fixture(t);
  await f.mutate(session => { session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48'; });
  await f.begin();
  const confirmed = await f.resolve();
  assert.deepEqual(confirmed.session.teams.map(team => team.completedLaps), [1, 1]);
  assert.equal(confirmed.session.specialCells.drawNumber, 1);
  f.before(event => { if (event.turnId.startsWith('group-landing:') && event.studentId === f.roster[1]) throw new Error('student B temporarily offline'); });
  const partial = await f.claim();
  assert.deepEqual(partial.groupMove.awards.map(award => award.status), ['awarded', 'planned']);
  assert.equal(partial.session.specialCells.drawNumber, 1); assert.equal(partial.session.lapRound, 1);
  assert.equal(partial.groupMove.awards[1].receipt, null);
  assert.equal(hasPendingGroupMoveAwards(partial.session), true);
  await assert.rejects(f.roll('blocked-partial'), { code: 'special_cells_group_awards_pending' });
  const firstReceipt = structuredClone(partial.groupMove.awards[0].receipt);
  f.before(null);
  const complete = await f.claim('group:claim', f.restart());
  assert.deepEqual(complete.groupMove.awards[0].receipt, firstReceipt);
  assert.ok(complete.groupMove.awards.every(award => award.status === 'awarded'));
  assert.equal(f.groupCalls().filter(event => event.studentId === f.roster[0]).length, 1);
  assert.equal(complete.session.specialCells.drawNumber, 2); assert.equal(complete.session.lapRound, 2);
  assert.deepEqual(complete.session.teams.map(team => team.nodeId), ['n03', 'n49']);
  await f.claim('another-retry');
  assert.equal((await f.get()).specialCells.drawNumber, 2);
});

test('a platform response lost after credit reuses the exact frozen event after restart without duplicate money', async t => {
  const f = await fixture(t); await f.begin(); await f.resolve();
  let lost = false;
  f.after(event => { if (!lost && event.turnId.startsWith('group-landing:')) { lost = true; throw new Error('lost platform reply'); } });
  const partial = await f.claim();
  assert.equal(partial.groupMove.awards.filter(award => award.status === 'planned').length, 1);
  const balances = [...f.balances], events = f.groupCalls().map(event => structuredClone(event));
  f.after(null);
  const complete = await f.claim('group:claim', f.restart());
  assert.ok(complete.groupMove.awards.every(award => award.status === 'awarded'));
  assert.deepEqual([...f.balances], balances);
  assert.equal(f.credits.size, f.roster.length + 1);
  const retry = f.groupCalls().at(-1);
  assert.deepEqual(retry, events.find(event => event.turnId === retry.turnId));
});

test('invalid per-student receipts keep frozen rewards pending until their original valid receipt is recovered', async t => {
  for (const change of [receipt => { receipt.landing.amount += 100; }, receipt => { receipt.landing.studentId = students[1]; },
    receipt => { receipt.wallet.studentId = students[1]; }, receipt => { receipt.landing.nodeId = 'n49'; },
    receipt => { receipt.landing.ruleVersion = 'another-rule'; }, receipt => { receipt.wallet.currency = 'coins'; }]) {
    const f = await fixture(t, { count: 1 }); await f.begin(); const confirmed = await f.resolve();
    const frozen = structuredClone(confirmed.groupMove.awards[0].event);
    f.transform(receipt => { change(receipt); return receipt; });
    const rejected = await f.claim();
    assert.equal(rejected.groupMove.awards[0].status, 'planned');
    assert.equal(rejected.groupMove.awards[0].receipt, null);
    assert.deepEqual(rejected.groupMove.awards[0].event, frozen);
    const balance = f.balances.get(f.roster[0]);
    f.transform(null);
    const recovered = await f.claim('group:claim', f.restart());
    assert.equal(recovered.groupMove.awards[0].status, 'awarded');
    assert.equal(f.balances.get(f.roster[0]), balance);
  }
});

test('group pushes cross the finish without paying intermediate n49, and leaving an exact finish does not recount its lap', async t => {
  const f = await fixture(t, { type: 'move3' });
  await f.mutate(session => { session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48'; });
  await f.begin();
  const confirmed = await f.resolve();
  assert.deepEqual(confirmed.groupMove.moves[1].path, ['n49', 'n02', 'n03']);
  assert.equal(confirmed.groupMove.moves[1].lapCompletions.length, 1);
  assert.deepEqual(confirmed.groupMove.awards.map(award => award.event.nodeId), ['n05a', 'n03']);
  const complete = await f.claim();
  assert.deepEqual(f.groupCalls().map(event => event.nodeId), ['n05a', 'n03']);
  assert.equal(complete.session.specialCells.drawNumber, 2);
  assert.deepEqual(complete.session.teams.map(team => team.completedLaps), [1, 1]);
  const g = await fixture(t);
  await g.mutate(session => { session.teams[1].nodeId = 'n49'; session.teams[1].completedLaps = 1; });
  await g.begin(); const left = await g.resolve();
  assert.equal(left.groupMove.moves[1].toNodeId, 'n02');
  assert.deepEqual(left.groupMove.moves[1].lapCompletions, []);
  assert.equal(left.session.teams[1].completedLaps, 1);
  assert.equal((await g.claim()).groupMove.awards[1].event.nodeId, 'n02');
});

test('historical unmarked pushed landings pay ordinary prices without retroactive effects', async t => {
  const f = await fixture(t);
  await f.mutate(session => {
    session.teams[1].nodeId = 'n05a';
    session.specialCells.cells.push({ cellId: 'sc1-02', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId: 'n03', type: 'crown' },
      { cellId: 'sc1-03', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId: 'n06a', type: 'move3' });
  });
  await f.begin(); const confirmed = await f.resolve();
  await f.mutate(session => { delete session.specialCells.groupMoves['gm-source-turn'].landingEffectsPolicy; });
  const complete = await f.claim();
  assert.deepEqual(confirmed.session.teams.map(team => team.nodeId), ['n03', 'n06a']);
  assert.deepEqual(complete.groupMove.awards.map(award => award.points), [500, 5000]);
  assert.deepEqual(complete.session.specialCells.bonusAwards, {});
  assert.deepEqual(complete.session.specialCells.consumed, []);
  assert.equal(complete.session.specialCells.pendingReroll, null);
  assert.deepEqual(Object.keys(complete.session.specialCells.groupMoves), ['gm-source-turn']);
  assert.equal(f.bonusCalls.length, 0);
  assert.equal(Object.keys(complete.session.turns).length, 1, 'group reward identities never become extra dice turns');
});

test('confirm requires the source landing receipt and cancellation never freezes or grants group rewards', async t => {
  const f = await fixture(t); await f.begin({ claimSource: false });
  const before = await readFile(f.file, 'utf8');
  await assert.rejects(f.resolve(), { code: 'points_turn_pending' });
  assert.equal(await readFile(f.file, 'utf8'), before);
  await f.store.claim({ actor, sessionId: f.session.id, attemptId: 'source-turn', idempotencyKey: 'source:claim', context: f.context });
  const cancelled = await f.resolve('cancel');
  assert.equal(cancelled.groupMove.status, 'cancelled'); assert.equal(cancelled.groupMove.awards, undefined);
  await assert.rejects(f.claim(), { code: 'special_cells_group_move_unconfirmed' });
  assert.equal(f.groupCalls().length, 0);
  assert.equal((await f.roll('after-cancel')).turn.status, 'rolled');
});

test('lesson cap rejects a fourth successful challenge without creating payable rewards', async t => {
  const f = await fixture(t); await f.begin();
  await f.mutate(session => { session.specialCells.groupMoveSuccesses = 3; });
  const result = await f.resolve();
  assert.equal(result.groupMove.status, 'exhausted'); assert.equal(result.groupMove.awards, undefined);
  assert.equal(result.session.specialCells.groupMoveSuccesses, 3);
  assert.deepEqual(result.session.teams.map(team => team.nodeId), ['n02', 'n01']);
  await assert.rejects(f.claim(), { code: 'special_cells_group_move_unconfirmed' });
  assert.equal(f.groupCalls().length, 0);
});

test('closed sessions can recover already frozen rewards but cannot confirm new movements', async t => {
  const f = await fixture(t); await f.begin(); const confirmed = await f.resolve();
  await f.store.end({ actor, sessionId: f.session.id, idempotencyKey: 'close' });
  const recovered = await f.claim('group:claim', f.restart());
  assert.ok(recovered.groupMove.awards.every(award => award.status === 'awarded'));
  assert.deepEqual(recovered.session.teams.map(team => team.nodeId), confirmed.session.teams.map(team => team.nodeId));
  const g = await fixture(t); await g.begin(); await g.store.end({ actor, sessionId: g.session.id, idempotencyKey: 'close-pending' });
  await assert.rejects(g.resolve(), { code: 'points_session_closed' });
  assert.equal(g.groupCalls().length, 0);
});

test('historical confirmed moves without frozen awards never receive retroactive credits', async t => {
  const f = await fixture(t); await f.begin(); await f.resolve();
  await f.mutate(session => { const move = session.specialCells.groupMoves['gm-source-turn']; delete move.awards; delete move.rewardPolicy; });
  const before = (await f.get()).specialCells.groupMoves['gm-source-turn'];
  const replay = await f.resolve('confirm', 'old-confirm-replay');
  assert.deepEqual(replay.groupMove, before);
  const claimed = await f.claim();
  assert.deepEqual(claimed.groupMove, before); assert.equal(f.groupCalls().length, 0);
  assert.equal(hasPendingGroupMoveAwards(claimed.session), false);
});

test('group claims enforce ownership, registered students and reserved server landing identities', async t => {
  const f = await fixture(t); await f.begin(); await f.resolve();
  await assert.rejects(f.claim('other-member', f.store, { id: '55555555-5555-4555-8555-555555555555', role: 'member' }), { code: 'points_forbidden' });
  await assert.rejects(f.roll(expectedAttempt(f.session.id, 'gm-source-turn', f.roster[0])), { statusCode: 422 });
  assert.equal(f.groupCalls().length, 0);
  const g = await fixture(t); await g.begin();
  await g.mutate(session => { session.teams.push({ id: students[7], nodeId: 'n01', completedLaps: 0 }); });
  const before = await readFile(g.file, 'utf8');
  await assert.rejects(g.resolve(), { code: 'points_rule_unavailable' });
  assert.equal(await readFile(g.file, 'utf8'), before, 'a roster mismatch cannot partially move or freeze the class');
});

test('HTTP group claim accepts only the account, returns partial 200 and rejects forged fields, origin and roster', async t => {
  const f = await fixture(t); await f.begin(); await f.resolve();
  let inactive = false;
  const handle = createPointsHandler({ pointsStore: f.store, pointsPlatform: f.platform, publicOrigin: origin,
    platformOrigin: 'http://isolated-platform.test', fetchSession: async url => url.endsWith('/api/auth/me')
      ? Response.json({ authenticated: true, user: actor })
      : Response.json({ students: f.roster.map((id, index) => ({ id, status: inactive && index === 1 ? 'archived' : 'active' })) }) });
  const server = createServer(async (req, res) => {
    const send = (response, status, body, headers) => { response.writeHead(status, headers); response.end(body); };
    if (!await handle(req, res, new URL(req.url, 'http://isolated').pathname, send)) send(res, 404, '{}', {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}${POINTS_API_BASE}/sessions/${f.session.id}/group-moves/gm-source-turn/claim`;
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { origin, cookie: 'sid=isolated-fixture',
    'content-type': 'application/json', 'idempotency-key': 'http-group-claim', ...headers }, body: JSON.stringify(body) });
  for (const extra of [{ amount: 1000 }, { studentId: f.roster[0] }, { nodeId: 'n49' }, { awards: [] }, { points: 100 }]) {
    assert.equal((await post({ expectedUserId: actor.id, ...extra })).status, 422);
  }
  assert.equal((await post({ expectedUserId: actor.id }, { origin: 'https://wrong.test' })).status, 403);
  assert.equal((await post({ expectedUserId: 'another-account' })).status, 409);
  inactive = true; assert.equal((await post({ expectedUserId: actor.id })).status, 403);
  assert.equal(f.groupCalls().length, 0);
  inactive = false;
  f.before(event => { if (event.studentId === f.roster[1]) throw new Error('isolated partial failure'); });
  const partial = await post({ expectedUserId: actor.id });
  assert.equal(partial.status, 200);
  assert.deepEqual((await partial.json()).groupMove.awards.map(award => award.status), ['awarded', 'planned']);
  f.before(null);
  const complete = await post({ expectedUserId: actor.id });
  assert.equal(complete.status, 200);
  assert.ok((await complete.json()).groupMove.awards.every(award => award.status === 'awarded'));
  assert.equal(f.credits.size, 3);
});
