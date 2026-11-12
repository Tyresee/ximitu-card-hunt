import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createPointsHandler, POINTS_API_BASE } from '../standalone/points-api.mjs';
import { createPointsPlatformClient } from '../standalone/points-platform-client.mjs';
import { canonicalPointsJson } from '../standalone/points-store.mjs';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { createPointsWorld } from '../standalone/points-movement.mjs';
import { CURRENT_POINTS_RULE_VERSION, pointsRuleRouteRef } from '../standalone/points-rule-versions.mjs';
import { createSpecialCellsState, SPECIAL_CELLS_POLICY } from '../standalone/points-special-cells.mjs';
import { WORLD_REGISTRIES, CIRCUIT_WORLD_ROUTE_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { createLandingPointsClient } from '../public/prototypes/universal-board/landing-points-client.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const actor = { id: A, role: 'owner' };
const clone = value => structuredClone(value);
function legacyRule(revision = 'monopoly-final-landing-v2') {
  const refs = [revision === 'monopoly-final-landing-v1' ? 'world.ximitu.cloud-harbor@1.2.1' : 'world.ximitu.cloud-harbor@1.3.0', 'world.ximitu.beyond-cloud@1.0.0'];
  return { kind: 'server_verified_final_landing', enabled: true, revision, currency: 'wordattack-points', worlds: refs.map(worldRef => {
    const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
      nodes: board.nodes.map(node => ({ nodeId: node.id, points: 100 })) };
  }) };
}
function upgrade(rule) {
  return { ...clone(rule), revision: CURRENT_POINTS_RULE_VERSION, baseRevision: rule.revision,
    worlds: rule.worlds.map(world => ({ ...clone(world), nodes: world.nodes.map(node => ({ ...node, points: node.points * 5 })) })) };
}
async function fixture(t, revision = 'monopoly-final-landing-v2') {
  const dataDir = await mkdtemp(join(tmpdir(), 'monopoly-rule-upgrade-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  let samples = 0, upgradeCalls = 0, loseResponse = false, damageReply = null;
  const rule = legacyRule(revision);
  const remote = { id: randomUUID(), externalSessionId: 'existing-game', studentIds: [B], gameMode: 'teacher-led', createdBy: A, rule: clone(rule) };
  const session = { id: randomUUID(), externalSessionId: remote.externalSessionId, studentIds: [B], mode: 'teacher-led', createdBy: A,
    createdAt: new Date().toISOString(), status: 'open', platformSessionId: remote.id, rule: clone(rule),
    rewardPolicy: SPECIAL_CELLS_POLICY, specialCells: createSpecialCellsState(),
    ...createPointsWorld([B], randomUUID, revision === 'monopoly-final-landing-v2' ? CIRCUIT_WORLD_ROUTE_REF : pointsRuleRouteRef(revision)),
    ...(revision === 'monopoly-final-landing-v2' ? { movementPolicy: 'individual-laps-v1', lapRound: 1 } : {}),
    completedTurns: 0, activeTurnId: null, turns: {} };
  const receipts = new Map();
  const platform = {
    upgradeRule: async (id, fields, context) => {
      upgradeCalls++; assert.equal(id, remote.id); assert.deepEqual(fields, { expectedRuleVersion: revision, targetRuleVersion: CURRENT_POINTS_RULE_VERSION });
      assert.equal(context?.actor.id, A);
      if (remote.rule.revision !== CURRENT_POINTS_RULE_VERSION) { remote.ruleHistory = { [revision]: clone(remote.rule) }; remote.rule = upgrade(remote.rule); }
      if (loseResponse) { loseResponse = false; throw new Error('upgrade response lost'); }
      const result = { session: clone(remote) }; if (damageReply) damageReply(result.session); return result;
    },
    claim: async (_, event) => {
      if (!receipts.has(event.turnId)) {
        const amount = remote.rule.worlds.find(w => w.worldRef === event.worldRef).nodes.find(n => n.nodeId === event.nodeId).points;
        receipts.set(event.turnId, { landing: { ...event, amount, ruleVersion: remote.rule.revision, currency: 'wordattack-points', status: 'awarded' },
          wallet: { studentId: B, currency: 'wordattack-points', balance: [...receipts.values()].reduce((sum, value) => sum + value.landing.amount, 0) + amount } });
      }
      return clone(receipts.get(event.turnId));
    },
  };
  const store = new PointsTurnStore({ dataDir, platform, random: bound => { assert.equal(bound, 6); samples++; return 0; } });
  const path = join(dataDir, 'authoritative-turns.json');
  const writeSession = async s => writeFile(path, JSON.stringify({ schemaVersion: 'monopoly-authoritative-turns.v1', sessions: { [s.id]: s }, externalSessions: { [`${A}:${s.externalSessionId}`]: s.id }, receipts: {} }));
  await writeSession(session);
  const mutate = async fn => { const state = JSON.parse(await readFile(path, 'utf8')); fn(state.sessions[session.id]); await writeFile(path, JSON.stringify(state)); };
  const get = async () => (await store.get({ actor, sessionId: session.id })).session;
  const roll = attemptId => store.roll({ actor, sessionId: session.id, studentId: B, attemptId, idempotencyKey: `${attemptId}-roll`, context: { actor } });
  const upgradeNow = () => store.upgradeRule({ actor, sessionId: session.id, idempotencyKey: 'same-upgrade-key', context: { actor } });
  const seedOldRoll = async () => mutate(s => {
    s.turns.old = { attemptId: 'old', studentId: B, status: 'rolled', faceIndex: 0, steps: 1, bonus: { coins: 0, stars: 0 }, teacherDiceRef: 'teacher-dice.v1',
      nextWorldInstanceId: randomUUID(), startLocation: { worldRef: s.world.active.worldPackRef, worldInstanceId: s.world.active.instanceId, worldOrdinal: s.world.active.ordinal, nodeId: s.teams[0].nodeId }, createdAt: new Date().toISOString(), receipt: null };
    s.activeTurnId = 'old';
  });
  const plan = async attemptId => {
    const choices = {};
    for (let i = 0; i < 10; i++) {
      try { return await store.plan({ actor, sessionId: session.id, attemptId, routeChoicesByWorldInstance: choices, idempotencyKey: `${attemptId}-plan` }); }
      catch (error) { if (error.code !== 'points_route_choice_required') throw error; const d = error.details; (choices[d.worldInstanceId] ||= {})[d.junctionNodeId] = d.options[0].edgeId; }
    }
    throw new Error('too many forks');
  };
  const claim = attemptId => store.claim({ actor, sessionId: session.id, attemptId, idempotencyKey: `${attemptId}-claim`, context: { actor } });
  return { store, session, rule, remote, dataDir, platform, get, mutate, roll, upgradeNow, seedOldRoll, plan, claim, receipts,
    samples: () => samples, upgradeCalls: () => upgradeCalls, loseUpgradeResponse: () => { loseResponse = true; }, damageReply: fn => { damageReply = fn; } };
}

test('fivefold upgrade waits for every frozen turn, bonus and group reward without contacting the bridge or drawing dice', async t => {
  const mutations = [
    s => { s.activeTurnId = 'old'; s.turns.old = { status: 'rolled' }; },
    s => { s.turns.old = { status: 'planned' }; },
    s => { s.specialCells.bonusAwards.old = { status: 'pending' }; },
    s => { s.specialCells.bonusAwards.old = { status: 'awaiting_platform' }; },
    s => { s.specialCells.groupMoves.old = { status: 'pending', awards: [] }; },
    s => { s.specialCells.groupMoves.old = { status: 'confirmed', awards: [{ status: 'planned' }] }; },
  ];
  for (const change of mutations) {
    const f = await fixture(t); await f.mutate(change);
    await assert.rejects(f.upgradeNow(), { code: 'points_rule_upgrade_pending' });
    assert.equal(f.upgradeCalls(), 0); assert.equal(f.samples(), 0); assert.deepEqual((await f.get()).rule, f.rule);
  }
});

test('an old locked roll settles at its original amount, then the same game upgrades future turns and preserves old receipts', async t => {
  const f = await fixture(t); await f.seedOldRoll(); const before = await f.get();
  const replay = await f.roll('old'); assert.equal(replay.turn.steps, 1); assert.equal(f.samples(), 0); assert.equal(f.upgradeCalls(), 0);
  await assert.rejects(f.upgradeNow(), { code: 'points_rule_upgrade_pending' });
  await f.plan('old'); await assert.rejects(f.upgradeNow(), { code: 'points_rule_upgrade_pending' });
  const oldPaid = await f.claim('old'); assert.equal(oldPaid.receipt.landing.amount, 100);
  const paidState = await f.get(); const upgraded = await f.upgradeNow();
  assert.equal(upgraded.session.rule.revision, CURRENT_POINTS_RULE_VERSION);
  assert.deepEqual(upgraded.session.ruleHistory[f.rule.revision], f.rule);
  assert.equal(upgraded.session.initialRuleVersion, f.rule.revision);
  for (const key of ['world', 'teams', 'completedTurns', 'specialCells']) assert.deepEqual(upgraded.session[key], paidState[key], key);
  assert.deepEqual(upgraded.session.turns.old, paidState.turns.old);
  assert.deepEqual((await f.claim('old')).receipt, oldPaid.receipt, 'old replay keeps the exact receipt');
  assert.equal((await f.roll('new')).turn.ruleVersion, CURRENT_POINTS_RULE_VERSION);
  const planned = await f.plan('new'); assert.equal(planned.turn.points, 500);
  const newPaid = await f.claim('new'); assert.equal(newPaid.receipt.landing.amount, 500);
  assert.equal(f.samples(), 1); assert.equal(f.upgradeCalls(), 1); assert.equal(f.receipts.size, 2);
  assert.equal(before.rule.revision, 'monopoly-final-landing-v2');
});

test('next roll upgrades an idle old game before randomness, preserving its layout, location and held double dice', async t => {
  const f = await fixture(t);
  await f.mutate(s => { s.specialCells.heldDoubleDiceByStudent[B] = { sourceTurnId: 'old-awarded', cellId: 'sc-held' }; });
  const before = await f.get(); const rolled = await f.roll('new-double');
  assert.equal(rolled.turn.ruleVersion, CURRENT_POINTS_RULE_VERSION);
  assert.deepEqual(rolled.turn.faceIndices, [0, 0]); assert.equal(rolled.turn.steps, 2);
  assert.equal(f.upgradeCalls(), 1); assert.equal(f.samples(), 2);
  assert.deepEqual(rolled.session.world, before.world); assert.deepEqual(rolled.session.teams, before.teams);
  assert.equal(rolled.session.specialCells.drawNumber, before.specialCells.drawNumber);
  assert.deepEqual(rolled.session.specialCells.cells, before.specialCells.cells);
  assert.equal(rolled.turn.doubleDiceOf, 'old-awarded');
  assert.deepEqual((await f.roll('new-double')).turn, rolled.turn); assert.equal(f.samples(), 2);
});

test('lost bridge upgrade response survives restart and cannot multiply an existing session twice', async t => {
  const f = await fixture(t); f.loseUpgradeResponse();
  await assert.rejects(f.upgradeNow(), /response lost/);
  assert.equal((await f.get()).rule.revision, 'monopoly-final-landing-v2'); assert.equal(f.remote.rule.worlds[0].nodes[0].points, 500);
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform, random: () => { throw new Error('not rolling'); } });
  const request = { actor, sessionId: f.session.id, idempotencyKey: 'same-upgrade-key', context: { actor } };
  const result = await restarted.upgradeRule(request);
  assert.equal(result.session.rule.worlds[0].nodes[0].points, 500);
  assert.equal((await restarted.upgradeRule(request)).duplicate, true);
  assert.equal(f.upgradeCalls(), 2); assert.equal(f.samples(), 0);
});

test('legacy v1 money upgrade keeps its exact old world and expedition route', async t => {
  const f = await fixture(t, 'monopoly-final-landing-v1'); const before = await f.get();
  const result = await f.upgradeNow();
  assert.deepEqual(result.session.world, before.world); assert.deepEqual(result.session.teams, before.teams);
  assert.equal(result.session.rule.worlds[0].worldRef, 'world.ximitu.cloud-harbor@1.2.1');
  assert.equal(result.session.rule.baseRevision, 'monopoly-final-landing-v1');
  await f.roll('future'); assert.equal((await f.plan('future')).turn.points, 500);
});

test('unknown rules or a bridge reply that changes identity, topology, history or scale fail closed before randomness', async t => {
  const damage = [
    remote => { remote.studentIds = [A]; },
    remote => { remote.rule.worlds[0].nodes[0].points *= 5; },
    remote => { remote.rule.worlds[0].nodes[0].nodeId = 'forged-node'; },
    remote => { remote.rule.worlds[0].boardRef = 'forged@9'; },
    remote => { remote.ruleHistory = {}; },
  ];
  for (const change of damage) {
    const f = await fixture(t); f.damageReply(change);
    await assert.rejects(f.roll('new'), { code: 'points_receipt_invalid' });
    assert.equal(f.samples(), 0); assert.deepEqual((await f.get()).rule, f.rule);
  }
  const f = await fixture(t); await f.mutate(s => { s.rule.revision = 'unregistered-future'; });
  await assert.rejects(f.roll('new'), { code: 'points_rule_unavailable' }); assert.equal(f.upgradeCalls(), 0); assert.equal(f.samples(), 0);
});

function memoryStorage() { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) }; }
test('browser persists upgrade retry identity, resumes a lost response and keeps old group receipts against history', async t => {
  const f = await fixture(t); const oldRule = f.rule;
  // A settled old group award remains old money after switching to v3.
  await f.mutate(s => {
    const event = { turnId: 'group-landing:old', studentId: B, worldRef: oldRule.worlds[0].worldRef,
      boardRef: oldRule.worlds[0].boardRef, levelRef: oldRule.worlds[0].levelRef, worldInstanceId: s.world.active.instanceId, nodeId: 'n02' };
    s.specialCells.groupMoves.gm = { instanceId: 'gm', status: 'confirmed', rewardPolicy: 'group-final-landing-v1', worldInstanceId: s.world.active.instanceId,
      moves: [{ studentId: B, path: ['n02'], toNodeId: 'n02' }], awards: [{ studentId: B, attemptId: event.turnId, points: 100, status: 'awarded', event,
        receipt: { landing: { ...event, amount: 100, ruleVersion: oldRule.revision, currency: 'wordattack-points', status: 'awarded' }, wallet: { studentId: B, currency: 'wordattack-points', balance: 100 } } }] };
  });
  const storage = memoryStorage(), posts = []; let lose = true;
  const options = { getUserId: () => A, storage, fetchImpl: async (path, request) => {
    if (request.method !== 'POST') return Response.json({ session: await f.get() });
    posts.push({ path, body: JSON.parse(request.body), key: request.headers['Idempotency-Key'] });
    const result = await f.store.upgradeRule({ actor, sessionId: f.session.id, idempotencyKey: posts.at(-1).key, context: { actor } });
    if (lose) { lose = false; throw new TypeError('network response lost'); }
    return Response.json(result);
  } };
  const client = createLandingPointsClient(options); await client.refresh('existing-game', { wallets: false });
  await assert.rejects(client.upgradeRule('existing-game'), /网络/);
  assert.deepEqual(posts[0].body, { expectedUserId: A });
  const restored = createLandingPointsClient(options); const result = await restored.upgradeRule('existing-game');
  assert.equal(result.session.rule.revision, CURRENT_POINTS_RULE_VERSION); assert.equal(posts[0].key, posts[1].key);
  const oldAward = restored.get('existing-game').session.specialCells.groupMoves.gm.awards[0];
  assert.equal(oldAward.points, 100); assert.equal(oldAward.receipt.landing.amount, 100);
  const postsBefore = posts.length; await restored.upgradeRule('existing-game'); assert.equal(posts.length, postsBefore);
});


test('upgrade HTTP entry authenticates the original roster and accepts no amount or map fields', async t => {
  const f = await fixture(t); const origin = 'https://fixture.example'; let calls = 0, active = true;
  const handler = createPointsHandler({ pointsStore: { get: async () => ({ session: await f.get() }), upgradeRule: async args => {
    calls++; assert.equal(args.context.actor.id, A); return f.store.upgradeRule(args);
  } }, pointsPlatform: { configured: true }, publicOrigin: origin, fetchSession: async url => Response.json(url.endsWith('/api/auth/me')
    ? { authenticated: true, user: actor } : { students: [{ id: B, status: active ? 'active' : 'archived' }] }) });
  const server = createServer(async (request, response) => {
    const send = (res, status, body, headers) => { res.writeHead(status, headers); res.end(body); };
    if (!await handler(request, response, new URL(request.url, origin).pathname, send)) send(response, 404, '{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}${POINTS_API_BASE}/sessions/${f.session.id}/upgrade-rule`;
  const post = (body, requestOrigin = origin) => fetch(url, { method: 'POST', headers: {
    origin: requestOrigin, 'content-type': 'application/json', 'idempotency-key': 'upgrade-http-test',
  }, body: JSON.stringify(body) });
  assert.equal((await post({ expectedUserId: A, amount: 99999 })).status, 422);
  assert.equal((await post({ expectedUserId: A }, 'https://foreign.example')).status, 403);
  active = false; assert.equal((await post({ expectedUserId: A })).status, 403); active = true;
  assert.equal(calls, 0);
  const response = await post({ expectedUserId: A }); assert.equal(response.status, 200);
  assert.equal((await response.json()).session.rule.revision, CURRENT_POINTS_RULE_VERSION); assert.equal(calls, 1);
});

test('private bridge upgrade has a signed fixed-version payload and deterministic retry identity', async () => {
  const secret = 'isolated-test-signing-secret-only-123456'; const calls = [], sessionId = randomUUID();
  const platform = createPointsPlatformClient({ platformOrigin: 'http://127.0.0.1:19422', secret, clock: () => 123000,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json({ session: {} }); } });
  const fields = { expectedRuleVersion: 'monopoly-final-landing-v2', targetRuleVersion: CURRENT_POINTS_RULE_VERSION };
  await platform.upgradeRule(sessionId, fields, { actor, cookie: 'fixture-session=synthetic' });
  await platform.upgradeRule(sessionId, fields, { actor, cookie: 'fixture-session=synthetic' });
  const path = `/api/game-points/v1/monopoly/landing-sessions/${sessionId}/upgrade-rule`;
  const body = { expectedUserId: A, ...fields };
  assert.equal(calls[0].url, 'http://127.0.0.1:19422' + path);
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers['idempotency-key'], calls[1].options.headers['idempotency-key']);
  const signature = createHmac('sha256', secret).update(`monopoly-points-v1\n123\nPOST\n${path}\n${canonicalPointsJson(body)}`).digest('hex');
  assert.equal(calls[0].options.headers['x-monopoly-points-signature'], signature);
});

test('browser cannot upgrade remotely until its original retry identity is durably saved', async t => {
  const f = await fixture(t); const data = new Map(); let fail = false, posts = 0;
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => { if (fail) throw new Error('quota'); data.set(key, value); } };
  const client = createLandingPointsClient({ getUserId: () => A, storage, fetchImpl: async (_, options) => {
    if (options.method === 'POST') posts++; return Response.json({ session: await f.get() });
  } });
  await client.refresh('existing-game', { wallets: false }); fail = true;
  await assert.rejects(client.upgradeRule('existing-game'), { code: 'points_storage_unavailable' }); assert.equal(posts, 0);
});
