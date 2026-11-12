import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createPointsHandler, POINTS_API_BASE } from '../standalone/points-api.mjs';
import { createPointsPlatformClient } from '../standalone/points-platform-client.mjs';
import { canonicalPointsJson } from '../standalone/points-store.mjs';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const studentId = '22222222-2222-4222-8222-222222222222', sessionId = '33333333-3333-4333-8333-333333333333';
const origin = 'https://wordattack.timclass.cn';
async function fixture(t) {
  const calls = []; let authenticated = true, active = true;
  const store = Object.fromEntries(['register', 'get', 'roll', 'plan', 'claim', 'end'].map(method => [method, async args => {
    calls.push({ method, args }); return { session: { id: sessionId, studentIds: [studentId], createdBy: actor.id } };
  }]));
  const handle = createPointsHandler({ pointsStore: store, pointsPlatform: { configured: true },
    publicOrigin: origin, platformOrigin: 'http://platform.example', fetchSession: async (url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.headers.cookie, 'sid=fixture');
      if (url.endsWith('/api/auth/me')) return Response.json({ authenticated, user: actor });
      assert.ok(url.endsWith('/api/student-profiles/v1'));
      return Response.json({ students: [{ id: studentId, status: active ? 'active' : 'archived' }] });
    } });
  const server = createServer(async (req, res) => {
    const send = (response, status, body, headers) => { response.writeHead(status, { 'cache-control': 'no-store', ...headers }); response.end(body); };
    if (!await handle(req, res, new URL(req.url, 'http://test').pathname, send)) send(res, 404, '{}', {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}${POINTS_API_BASE}`;
  const request = (path, body, extra = {}) => fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { cookie: 'sid=fixture', origin, 'content-type': 'application/json', 'idempotency-key': 'fixture-command', ...(extra.headers || {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')) });
  return { calls, request, authenticated: value => { authenticated = value; }, active: value => { active = value; } };
}
test('context is authenticated and reports only teacher mode availability', async t => {
  const f = await fixture(t);
  const response = await f.request('/context'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: true, supportedModes: ['teacher-led'], ruleVersion: 'monopoly-final-landing-v3' });
  f.authenticated(false); assert.equal((await f.request('/context')).status, 401);
});
test('registration, roll, plan, claim and close forward strict commands to authority', async t => {
  const f = await fixture(t);
  for (const [path, fields, method] of [
    ['/sessions', { externalSessionId: 'game-1', studentIds: [studentId], mode: 'teacher-led' }, 'register'],
    [`/sessions/${sessionId}/roll`, { studentId, attemptId: 'teacher-123' }, 'roll'],
    [`/sessions/${sessionId}/turns/teacher-123/plan`, { routeChoicesByWorldInstance: {} }, 'plan'],
    [`/sessions/${sessionId}/turns/teacher-123/claim`, {}, 'claim'],
    [`/sessions/${sessionId}/close`, {}, 'end'],
  ]) {
    const response = await f.request(path, { expectedUserId: actor.id, ...fields });
    assert.equal(response.status, 200, await response.text());
    assert.equal(f.calls.at(-1).method, method);
    assert.equal(f.calls.at(-1).args.idempotencyKey, 'fixture-command');
  }
});
test('forged amount/node/score and unknown registration fields never reach store mutations', async t => {
  const f = await fixture(t);
  for (const forged of [{ amount: 9999 }, { nodeId: 'n40' }, { score: 100 }, { studentId }]) {
    const response = await f.request(`/sessions/${sessionId}/turns/t1/claim`, { expectedUserId: actor.id, ...forged });
    assert.equal(response.status, 422);
  }
  assert.equal(f.calls.some(call => call.method === 'claim'), false);
  assert.equal((await f.request('/sessions', { expectedUserId: actor.id, externalSessionId: 'g1', studentIds: [studentId], mode: 'teacher-led', startNodeId: 'n40' })).status, 422);
});
test('same origin, expected account and active roster gate all writes', async t => {
  const f = await fixture(t), body = { expectedUserId: actor.id, studentId, attemptId: 't1' }, path = `/sessions/${sessionId}/roll`;
  assert.equal((await f.request(path, body, { headers: { origin: 'https://wrong.example' } })).status, 403);
  assert.equal((await f.request(path, { ...body, expectedUserId: 'different-account' })).status, 409);
  f.active(false); assert.equal((await f.request(path, body)).status, 403);
  assert.equal(f.calls.some(call => call.method === 'roll'), false);
});
test('GET recovery never mutates a missing local session or touches the signing service', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/sessions/by-external/game-1')).status, 200);
  assert.deepEqual(f.calls.map(call => call.method), ['get']);
});

test('platform bridge signs exact body/path and uses stable per-event keys across retries', async () => {
  const secret = 'fixture-only-secret-not-a-real-credential', now = 1800000000000, requests = [];
  const client = createPointsPlatformClient({ platformOrigin: 'http://127.0.0.1:19423', publicOrigin: origin, secret, clock: () => now,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const body = options.body ? JSON.parse(options.body) : null;
      const pathname = new URL(url).pathname;
      const expected = createHmac('sha256', secret).update(`monopoly-points-v1\n1800000000\n${options.method}\n${pathname}\n${canonicalPointsJson(body)}`).digest('hex');
      assert.equal(options.headers['x-monopoly-points-signature'], expected);
      assert.equal(options.headers.cookie, 'sid=fixture'); assert.equal(options.headers.origin, origin);
      assert.equal(options.redirect, 'error'); return Response.json({ ok: true });
    } });
  const context = { actor, cookie: 'sid=fixture' }, event = { turnId: 'teacher-123', studentId, nodeId: 'n02', worldInstanceId: 'w1' };
  await client.register({ externalSessionId: 'game-1', studentIds: [studentId], ruleVersion: 'monopoly-final-landing-v1' }, context);
  assert.equal(JSON.parse(requests[0].options.body).gameMode, 'teacher-led');
  await client.claim(sessionId, event, context); await client.claim(sessionId, event, context);
  assert.equal(requests[1].options.headers['idempotency-key'], requests[2].options.headers['idempotency-key']);
  assert.equal(JSON.parse(requests[1].options.body).amount, undefined);
  await client.getByExternal('game-1', context); await client.getLanding(sessionId, event.turnId, context);
  const bonus = { bonusId: `${event.turnId}:special`, turnId: event.turnId, studentId, cellId: 'sc1-01',
    type: 'star', amount: 100, policy: 'points-only-v2-special-cells' };
  await client.claimSpecialCellBonus(sessionId, bonus, context);
  await client.claimSpecialCellBonus(sessionId, bonus, context);
  const bonusCalls = requests.filter(({ url }) => url.includes('/special-bonuses'));
  assert.equal(bonusCalls.length, 2);
  assert.equal(bonusCalls[0].options.headers['idempotency-key'], bonusCalls[1].options.headers['idempotency-key']);
  assert.deepEqual(JSON.parse(bonusCalls[0].options.body), {
    expectedUserId: actor.id, bonusId: bonus.bonusId, turnId: bonus.turnId, studentId, cellId: bonus.cellId,
    type: bonus.type, amount: bonus.amount, policy: bonus.policy,
  });
  await client.getSpecialCellBonus(sessionId, bonus.bonusId, context);
  assert.ok(requests.every(({ url }) => url.startsWith('http://127.0.0.1:19423/')));
});
test('missing bridge secret makes no requests; transient platform errors stay explicit', async () => {
  let calls = 0;
  const disabled = createPointsPlatformClient({ secret: '', fetchImpl: async () => { calls++; } });
  assert.equal(disabled.configured, false);
  await assert.rejects(disabled.register({}, { actor }), { code: 'points_platform_unavailable' }); assert.equal(calls, 0);
  const unavailable = createPointsPlatformClient({ secret: 'fixture-only-secret-not-a-real-credential', fetchImpl: async () => { throw new Error('network failed'); } });
  await assert.rejects(unavailable.claim(sessionId, {}, { actor }), { code: 'points_platform_unavailable' });
});
