import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "../public/prototypes/universal-board/special-cells-core.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { createLandingPointsClient } from '../public/prototypes/universal-board/landing-points-client.js';
import { LANDING_POINTS_KIND, recoverableLandingTurns } from '../public/prototypes/universal-board/landing-points-game.js';
import { CURRENT_POINTS_RULE_VERSION } from '../standalone/points-rule-versions.mjs';
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const EXTERNAL = 'circuit-bonus-recovery', ATTEMPT = 'last-finisher';
const BASE = '/games/monopoly/api/points/v1';
const actor = { id: USER, role: 'owner' };
const appSource = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
function section(start, end) {
  const from = appSource.indexOf(start), to = appSource.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `actual app function missing: ${start}`);
  return appSource.slice(from, to);
}
const recoverySource = section('function usesLandingPoints(', 'function syncCircuitLapProgress(')
  + section('function savedLandingGame(', 'function appendLandingHistory(');

function rule() {
  return { kind: 'server_verified_final_landing', enabled: true, revision: CURRENT_POINTS_RULE_VERSION,
    currency: 'wordattack-points', worlds: [CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
      const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: 1000 })) };
    }) };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'circuit-bonus-client-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const data = new Map(), calls = [], balances = new Map([[A, 0], [B, 0]]);
  const baseCredits = new Map(), bonusCredits = new Map();
  let sequence = 0, loseBonusResponse = true;
  const storage = { getItem: key => data.get(key) || null, setItem: (key, raw) => data.set(key, raw) };
  const wallet = studentId => ({ studentId, currency: 'wordattack-points', balance: balances.get(studentId),
    revision: balances.get(studentId) / 100 });
  const platform = {
    register: async fields => ({ session: { id: '44444444-4444-4444-8444-444444444444',
      externalSessionId: fields.externalSessionId, studentIds: [...fields.studentIds], rule: rule(), landingCount: 0 } }),
    claim: async (sessionId, event) => {
      if (!baseCredits.has(event.turnId)) {
        balances.set(event.studentId, balances.get(event.studentId) + 1000);
        baseCredits.set(event.turnId, { landing: { ...event, amount: 1000, currency: 'wordattack-points',
          ruleVersion: CURRENT_POINTS_RULE_VERSION, status: 'awarded' }, wallet: wallet(event.studentId) });
      }
      return structuredClone(baseCredits.get(event.turnId));
    },
    claimSpecialCellBonus: async (sessionId, bonus) => {
      if (!bonusCredits.has(bonus.bonusId)) {
        balances.set(bonus.studentId, balances.get(bonus.studentId) + bonus.amount);
        bonusCredits.set(bonus.bonusId, { bonus: { ...bonus, status: 'awarded' }, wallet: wallet(bonus.studentId) });
      }
      if (loseBonusResponse) { loseBonusResponse = false; throw new Error('lost bonus reply after its one credit'); }
      return structuredClone(bonusCredits.get(bonus.bonusId));
    },
  };
  const store = new PointsTurnStore({ dataDir, platform, random: () => 1 });
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const idempotencyKey = options.headers['Idempotency-Key'];
    calls.push({ url, method: options.method, body, idempotencyKey });
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    if (body) assert.equal(body.expectedUserId, USER);
    let payload;
    try {
      if (url.startsWith('/api/game-points/v1/students/')) payload = { wallet: wallet(url.split('/').at(-2)) };
      else if (url === `${BASE}/sessions`) payload = await store.register({ actor, externalSessionId: body.externalSessionId,
        studentIds: body.studentIds, mode: body.mode, idempotencyKey });
      else if (url.startsWith(`${BASE}/sessions/by-external/`)) payload = await store.get({ actor,
        externalSessionId: decodeURIComponent(url.split('/').at(-1)) });
      else {
        const route = url.slice(`${BASE}/sessions/`.length).split('/');
        const sessionId = decodeURIComponent(route[0]);
        if (options.method === 'GET') payload = await store.get({ actor, sessionId });
        else if (route[1] === 'roll') payload = await store.roll({ actor, sessionId,
          studentId: body.studentId, attemptId: body.attemptId, idempotencyKey });
        else if (route[1] === 'turns' && route[3] === 'plan') payload = await store.plan({ actor, sessionId,
          attemptId: decodeURIComponent(route[2]), routeChoicesByWorldInstance: body.routeChoicesByWorldInstance, idempotencyKey });
        else if (route[1] === 'turns' && route[3] === 'claim') payload = await store.claim({ actor, sessionId,
          attemptId: decodeURIComponent(route[2]), idempotencyKey });
        else throw new Error(`unexpected fixture request: ${options.method} ${url}`);
      }
      return Response.json(payload);
    } catch (error) { return Response.json({ error: error.code, message: error.message }, { status: error.statusCode || 500 }); }
  };
  const create = () => createLandingPointsClient({ getUserId: () => USER, storage, fetchImpl,
    createId: () => `request-${++sequence}` });
  const client = create();
  const registered = await client.registerNewGame({ externalSessionId: EXTERNAL, studentIds: [A, B] });
  const file = join(dataDir, 'authoritative-turns.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  const session = state.sessions[registered.session.id];
  session.teams[0].completedLaps = 1; session.teams[1].nodeId = 'n48';
  Object.assign(session.specialCells, { drawNumber: 1, density: 'few',
    cells: [{ cellId: 'sc1-01', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId: 'n02', type: 'star', basePoints: 1000, routeOrder: 5 }] });
  await writeFile(file, JSON.stringify(state));
  await client.refresh(EXTERNAL, { wallets: false });
  await client.roll(EXTERNAL, { studentId: B, attemptId: ATTEMPT });
  await client.plan(EXTERNAL, { attemptId: ATTEMPT, routeChoicesByWorldInstance: {} });
  await client.claim(EXTERNAL, ATTEMPT);

  const recover = (target, { committed = [ATTEMPT], missingLocal = false } = {}) => {
    const local = { assetGameId: EXTERNAL, assetGameEnded: false, processedAttemptIds: committed,
      landingPoints: { kind: LANDING_POINTS_KIND, ownerId: USER } };
    const context = { LANDING_POINTS_KIND, recoverableLandingTurns, GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending, LOCAL_SESSION_KEY: 'local-save',
      gameSession: missingLocal ? null : local, authenticatedUserId: USER, landingRecoveryFlights: new Map(),
      window: { localStorage: { getItem: () => null } }, landingPoints: target, landingPointsMessage: '',
      syncCircuitLapProgress() {}, renderPlatformPoints() {}, renderHud() {},
      trackGroupCoinGain() {}, holdCoinFxDisplays() {}, prepareTrackedGroupCoinHolds: () => {}, presentTrackedGroupRewards: async () => {},
      coinFx: { unholdIdle() {} },
      claimGroupLandingRewards: async (id, move) => target.claimGroupMove(id, move.instanceId) };
    runInNewContext(recoverySource, context);
    return context.recoverLandingPoints(EXTERNAL);
  };
  return { client, create, recover, calls, balances, baseCredits, bonusCredits };
}

test('reload recovers an awarded base turn with an old-draw bonus using the original claim identity', async t => {
  const f = await fixture(t);
  const before = f.client.get(EXTERNAL);
  assert.equal(before.session.turns[ATTEMPT].status, 'awarded');
  assert.equal(before.session.specialCells.drawNumber, 2);
  assert.equal(before.session.specialCells.bonusAwards[`${ATTEMPT}:special`].status, 'pending');
  assert.equal(before.operations[`claim:${ATTEMPT}`].status, 'done');
  assert.equal(f.balances.get(B), 1500, 'the lost bonus response already credited the wallet once');
  assert.deepEqual(recoverableLandingTurns(before.session, [ATTEMPT]).map(turn => turn.attemptId), [ATTEMPT]);
  const originalClaim = f.calls.find(call => call.url.endsWith('/claim'));

  const restored = f.create();
  await f.recover(restored);
  const claims = f.calls.filter(call => call.url.endsWith('/claim'));
  assert.equal(claims.length, 2, 'awarded base status must not suppress its pending-bonus retry');
  assert.equal(claims[1].url, originalClaim.url);
  assert.equal(claims[1].idempotencyKey, originalClaim.idempotencyKey);
  assert.deepEqual(claims[1].body, { expectedUserId: USER }, 'the browser never supplies new cell IDs or money');
  const recovered = restored.get(EXTERNAL).session;
  const award = recovered.specialCells.bonusAwards[`${ATTEMPT}:special`];
  assert.equal(award.status, 'awarded');
  assert.equal(award.cellId, 'sc1-01', 'the original bonus is recovered after layout sc2 is active');
  assert.equal(recovered.specialCells.drawNumber, 2);
  assert.equal(recovered.lapRound, 2);
  assert.equal(restored.wallet(B).balance, 1500);
  assert.equal(f.baseCredits.size, 1);
  assert.equal(f.bonusCredits.size, 1);

  const requestCount = f.calls.length;
  await restored.claim(EXTERNAL, ATTEMPT);
  assert.equal(f.calls.length, requestCount, 'a settled bonus uses the cached turn with no network mutation');
  await f.recover(restored);
  assert.equal(f.calls.filter(call => call.url.endsWith('/claim')).length, 2);
  assert.deepEqual(recoverableLandingTurns(restored.get(EXTERNAL).session, [ATTEMPT]), []);
  assert.equal(f.balances.get(B), 1500);
});

test('pending bonuses without local committed movement proof cannot trigger recovery claims', async t => {
  const f = await fixture(t), restored = f.create();
  const initialClaims = f.calls.filter(call => call.url.endsWith('/claim')).length;
  await f.recover(restored, { committed: [] });
  assert.equal(f.calls.filter(call => call.url.endsWith('/claim')).length, initialClaims);
  assert.equal(restored.get(EXTERNAL).session.specialCells.bonusAwards[`${ATTEMPT}:special`].status, 'pending');
  assert.deepEqual(recoverableLandingTurns(restored.get(EXTERNAL).session, ['another-attempt']), []);
  assert.equal(f.bonusCredits.size, 1);
});

test('a missing local game archive blocks even the recovery lookup', async t => {
  const f = await fixture(t), restored = f.create();
  const initialRequests = f.calls.length;
  await assert.rejects(f.recover(restored, { missingLocal: true }), /未找到/);
  assert.equal(f.calls.length, initialRequests);
});
