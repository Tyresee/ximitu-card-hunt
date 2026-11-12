import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { createPointsWorld, planPointsMove } from '../standalone/points-movement.mjs';
import { WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { CURRENT_POINTS_RULE_VERSION, pointsRuleRouteRef } from '../standalone/points-rule-versions.mjs';

const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
const studentA = '22222222-2222-4222-8222-222222222222', studentB = '33333333-3333-4333-8333-333333333333';
function rule(revision = CURRENT_POINTS_RULE_VERSION) {
  const scale = revision === 'monopoly-final-landing-v3' ? 5 : 1;
  return { kind: 'server_verified_final_landing', enabled: true, revision, currency: 'wordattack-points',
    worlds: [revision === 'monopoly-final-landing-v1' ? 'world.ximitu.cloud-harbor@1.2.1' : CLOUD_HARBOR_WORLD_REF, BEYOND_CLOUD_WORLD_REF].map(worldRef => {
      const { board, level } = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
      return { worldRef, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: (node.id === 'n09' ? 500 : 100) * scale })) };
    }) };
}
async function fixture(t, { random = () => 0 } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'monopoly-authority-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const receipts = new Map(); let claimCalls = 0, failAfterCredit = false;
  const platform = {
    register: async fields => ({ session: { id: '44444444-4444-4444-8444-444444444444', externalSessionId: fields.externalSessionId,
      studentIds: fields.studentIds, rule: rule(), landingCount: 0 } }),
    claim: async (sessionId, event) => {
      claimCalls++;
      if (!receipts.has(event.turnId)) {
        const amount = rule().worlds.find(w => w.worldRef === event.worldRef).nodes.find(n => n.nodeId === event.nodeId).points;
        receipts.set(event.turnId, { landing: { ...event, amount, ruleVersion: CURRENT_POINTS_RULE_VERSION, status: 'awarded', currency: 'wordattack-points' },
          wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: amount } });
      }
      if (failAfterCredit) { failAfterCredit = false; throw new Error('response lost after credit'); }
      return receipts.get(event.turnId);
    },
  };
  const store = new PointsTurnStore({ dataDir, platform, random });
  const registration = { actor, externalSessionId: 'game-fixture', studentIds: [studentA, studentB], mode: 'teacher-led', idempotencyKey: 'register-key' };
  const { session } = await store.register(registration);
  return { store, dataDir, session, platform, registration, receipts, claimCalls: () => claimCalls,
    loseNextReceipt: () => { failAfterCredit = true; } };
}
const roll = (store, session, attemptId = 'turn-one', studentId = studentA) => store.roll({ actor, sessionId: session.id, studentId, attemptId, idempotencyKey: `${attemptId}-roll` });
const claim = (store, session, attemptId = 'turn-one') => store.claim({ actor, sessionId: session.id, attemptId, idempotencyKey: `${attemptId}-claim` });
async function autoPlan(store, session, attemptId = 'turn-one') {
  const routeChoicesByWorldInstance = {};
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await store.plan({ actor, sessionId: session.id, attemptId, routeChoicesByWorldInstance, idempotencyKey: `${attemptId}-plan` }); }
    catch (error) {
      if (error.code !== 'points_route_choice_required') throw error;
      const { worldInstanceId, junctionNodeId, options } = error.details;
      (routeChoicesByWorldInstance[worldInstanceId] ||= {})[junctionNodeId] = options[0].edgeId;
    }
  }
  throw new Error('too many branches');
}

test('registration owns starting state, freezes platform rule and rejects voice/changed students', async t => {
  const f = await fixture(t);
  assert.equal(f.session.teams[0].nodeId, 'n01');
  assert.equal(f.session.world.active.ordinal, 1);
  assert.equal(f.session.rule.revision, 'monopoly-final-landing-v3');
  assert.equal(f.session.world.routeRef, 'route.ximitu-circuit@1.0.0');
  assert.equal(f.session.movementPolicy, 'individual-laps-v1');
  assert.equal(f.session.lapRound, 1);
  assert.ok(f.session.teams.every(team => team.completedLaps === 0));
  assert.equal(f.session.world.active.worldPackRef, 'world.ximitu.cloud-harbor@1.3.0');
  assert.equal((await f.store.register(f.registration)).session.id, f.session.id);
  await assert.rejects(f.store.register({ ...f.registration, studentIds: [studentB] }), { code: 'points_idempotency_conflict' });
  await assert.rejects(f.store.register({ ...f.registration, mode: 'voice' }), { code: 'points_voice_unavailable' });
  await assert.rejects(f.store.register({ ...f.registration, studentIds: ['seat-1'] }), /UUID/);
});

test('concurrent retries and restart preserve one sampled face; a new turn is blocked until claim', async t => {
  let samples = 0;
  const f = await fixture(t, { random: () => { samples++; return 4; } });
  const results = await Promise.all([roll(f.store, f.session), roll(f.store, f.session)]);
  assert.equal(samples, 1); assert.equal(results[0].turn.steps, 5);
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform, random: () => { throw new Error('rerolled'); } });
  assert.equal((await roll(restarted, f.session)).turn.faceIndex, 4);
  await assert.rejects(roll(restarted, f.session, 'turn-two'), { code: 'points_turn_pending' });
  await autoPlan(restarted, f.session);
  await assert.rejects(roll(restarted, f.session, 'turn-two'), { code: 'points_turn_pending' });
  await claim(restarted, f.session);
  assert.equal((await roll(f.store, f.session)).turn.status, 'awarded', 'retry returns current state, not stale roll snapshot');
  assert.equal((await roll(f.store, f.session, 'turn-two')).turn.status, 'rolled');
});

test('all six server dice faces retain uniform sampling and steps with no coin or star bonus', async t => {
  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    let samples = 0;
    const f = await fixture(t, { random: upperBound => {
      assert.equal(upperBound, 6, 'one uniform six-face sample, with no extra reward draw');
      samples++;
      return faceIndex;
    } });
    const result = await roll(f.store, f.session);
    assert.equal(result.turn.faceIndex, faceIndex);
    assert.equal(result.turn.steps, faceIndex + 1);
    assert.equal(result.turn.teacherDiceRef, 'teacher-dice.v1');
    assert.deepEqual(result.turn.bonus, { coins: 0, stars: 0 });
    assert.deepEqual(result.session.turns['turn-one'].bonus, { coins: 0, stars: 0 });
    const stored = JSON.parse(await readFile(join(f.dataDir, 'authoritative-turns.json'), 'utf8'));
    assert.deepEqual(stored.sessions[f.session.id].turns['turn-one'].bonus, { coins: 0, stars: 0 });
    const retry = await roll(f.store, f.session);
    assert.equal(retry.turn.faceIndex, faceIndex);
    assert.equal(retry.turn.steps, faceIndex + 1);
    assert.deepEqual(retry.turn.bonus, { coins: 0, stars: 0 });
    assert.equal(samples, 1);
  }
});

test('legacy locked turns recover without exposing old bonuses or rewriting historical dice evidence', async t => {
  const f = await fixture(t, { random: () => 1 });
  await roll(f.store, f.session);
  const file = join(f.dataDir, 'authoritative-turns.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  const legacy = state.sessions[f.session.id].turns['turn-one'];
  legacy.bonus = { coins: 4, stars: 1 };
  const lockedFace = { faceIndex: legacy.faceIndex, steps: legacy.steps, teacherDiceRef: legacy.teacherDiceRef,
    createdAt: legacy.createdAt, nextWorldInstanceId: legacy.nextWorldInstanceId };
  const before = JSON.stringify(state);
  await writeFile(file, before);
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform,
    random: () => { throw new Error('legacy result must never reroll'); } });
  const assertView = result => {
    const turn = result.turn || result.session.turns['turn-one'];
    for (const [key, value] of Object.entries(lockedFace)) assert.equal(turn[key], value);
    assert.deepEqual(turn.bonus, { coins: 0, stars: 0 });
    assert.deepEqual(result.session.turns['turn-one'].bonus, { coins: 0, stars: 0 });
  };
  assertView(await restarted.get({ actor, sessionId: f.session.id }));
  assertView(await restarted.get({ actor, externalSessionId: f.registration.externalSessionId }));
  assert.equal(await readFile(file, 'utf8'), before, 'GET only changes the public view');
  assertView(await roll(restarted, f.session));
  assert.equal(await readFile(file, 'utf8'), before, 'same-key recovery preserves original stored bonus evidence');
  assertView(await restarted.register(f.registration));
  assertView(await restarted.roll({ actor, sessionId: f.session.id, studentId: studentA,
    attemptId: 'turn-one', idempotencyKey: 'legacy-retry-new-key' }));
  assertView(await autoPlan(restarted, f.session));
  const awarded = await claim(restarted, f.session);
  assertView(awarded);
  assert.equal(awarded.receipt.landing.amount, 500, 'only the final tile contributes spendable points');
  assert.equal(awarded.receipt.wallet.balance, 500);
  assertView(await claim(restarted, f.session));
  assertView(await restarted.end({ actor, sessionId: f.session.id, idempotencyKey: 'legacy-end-key' }));
  assert.equal(f.claimCalls(), 1);
  const saved = JSON.parse(await readFile(file, 'utf8')).sessions[f.session.id].turns['turn-one'];
  assert.deepEqual(saved.bonus, { coins: 4, stars: 1 }, 'historical fields are not silently migrated');
  for (const [key, value] of Object.entries(lockedFace)) assert.equal(saved[key], value);
});

test('attempt identity cannot change student or route; missing and unrelated fork inputs fail closed', async t => {
  const f = await fixture(t, { random: () => 5 });
  await roll(f.store, f.session);
  await assert.rejects(f.store.roll({ actor, sessionId: f.session.id, studentId: studentB, attemptId: 'turn-one', idempotencyKey: 'different-key' }), { code: 'points_turn_conflict' });
  await assert.rejects(f.store.plan({ actor, sessionId: f.session.id, attemptId: 'turn-one', routeChoicesByWorldInstance: {}, idempotencyKey: 'plan-empty' }), { code: 'points_route_choice_required' });
  const planned = await autoPlan(f.store, f.session);
  await assert.rejects(f.store.plan({ actor, sessionId: f.session.id, attemptId: 'turn-one', routeChoicesByWorldInstance: {}, idempotencyKey: 'different-plan-key' }), { code: 'points_turn_conflict' });
  assert.equal(planned.turn.plan.stepsConsumed, 6);
  assert.equal(planned.session.teams[1].nodeId, 'n01');
});

test('lost wallet receipt retries same immutable event once; close does not discard pending claim', async t => {
  const f = await fixture(t);
  await roll(f.store, f.session); const planned = await autoPlan(f.store, f.session);
  f.loseNextReceipt(); await assert.rejects(claim(f.store, f.session), /response lost/);
  assert.equal(f.receipts.size, 1);
  await f.store.end({ actor, sessionId: f.session.id, idempotencyKey: 'close-key' });
  const recovered = await claim(f.store, f.session);
  assert.equal(recovered.turn.receipt.landing.nodeId, planned.turn.finalLocation.nodeId);
  assert.equal(f.receipts.size, 1); assert.equal(f.claimCalls(), 2);
  await claim(f.store, f.session); assert.equal(f.claimCalls(), 2);
  await assert.rejects(roll(f.store, f.session, 'turn-two'), { code: 'points_session_closed' });
});

test('closing an unplanned roll abandons it and never issues money', async t => {
  const f = await fixture(t); await roll(f.store, f.session);
  await f.store.end({ actor, sessionId: f.session.id, idempotencyKey: 'close-key' });
  assert.equal((await f.store.get({ actor, sessionId: f.session.id })).session.turns['turn-one'].status, 'abandoned');
  await assert.rejects(claim(f.store, f.session), { code: 'points_turn_unplanned' });
  await assert.rejects(autoPlan(f.store, f.session)); assert.equal(f.receipts.size, 0);
});

test('wrong wallet receipt cannot mark a turn awarded', async t => {
  const f = await fixture(t); await roll(f.store, f.session); await autoPlan(f.store, f.session);
  const actual = f.platform.claim;
  f.platform.claim = async (...args) => ({ ...await actual(...args), wallet: { studentId: studentB, currency: 'wordattack-points', balance: 100 } });
  await assert.rejects(claim(f.store, f.session), { code: 'points_receipt_invalid' });
  assert.equal((await f.store.get({ actor, sessionId: f.session.id })).session.turns['turn-one'].status, 'planned');
});

test('other member cannot inspect or claim this teacher session; corrupt disk fails closed', async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.get({ actor: { id: randomUUID(), role: 'member' }, sessionId: f.session.id }), { code: 'points_forbidden' });
  await writeFile(join(f.dataDir, 'authoritative-turns.json'), '{broken');
  await assert.rejects(f.store.get({ actor, sessionId: f.session.id }), { code: 'points_store_corrupt' });
});

test('loss of server file cannot register an old paid platform session back at the start', async t => {
  const f = await fixture(t);
  await rm(join(f.dataDir, 'authoritative-turns.json'));
  const register = f.platform.register;
  f.platform.register = async (...args) => { const result = await register(...args); result.session.landingCount = 1; return result; };
  await assert.rejects(f.store.register(f.registration), { code: 'points_state_recovery_required' });
});

// Explicit immutable pre-circuit snapshot. Shared-world travel, historical
// transports and their existing final-landing amount tables remain supported.
function serverState(nodeId, worldRef = CLOUD_HARBOR_WORLD_REF) {
  const revision = worldRef === 'world.ximitu.cloud-harbor@1.2.1' ? 'monopoly-final-landing-v1' : 'monopoly-final-landing-v2';
  const session = { studentIds: [studentA, studentB],
    ...createPointsWorld([studentA, studentB], randomUUID, pointsRuleRouteRef(revision)), completedTurns: 0, rule: rule(revision) };
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  session.world.active.worldPackRef = worldRef;
  session.world.active.ordinal = worldRef === BEYOND_CLOUD_WORLD_REF ? 2 : 1;
  session.world.active.mapState = structuredClone(composition.level.initialMapState || {});
  session.world.active.levelState = structuredClone(composition.level.initialLevelState || {});
  session.teams[0].nodeId = nodeId;
  return session;
}
function turnFor(session, steps) {
  return { attemptId: randomUUID(), studentId: studentA, steps, nextWorldInstanceId: randomUUID(),
    startLocation: { nodeId: session.teams[0].nodeId, worldInstanceId: session.world.active.instanceId } };
}
test('transport awards only true destination; passing through transport does not trigger it', () => {
  // Historical 1.2.1 snapshots keep their frozen launcher transports.
  const legacy = 'world.ximitu.cloud-harbor@1.2.1';
  const session = serverState('n05a', legacy);
  const landed = planPointsMove(session, turnFor(session, 1));
  assert.equal(landed.finalLocation.nodeId, 'n09'); assert.equal(landed.points, 500);
  assert.equal(landed.event.nodeId, 'n09');
  const passing = planPointsMove(session, turnFor(session, 2)); assert.equal(passing.finalLocation.nodeId, 'n07a');
  const second = serverState('n33', legacy); assert.equal(planPointsMove(second, turnFor(second, 1)).finalLocation.nodeId, 'n37');
  // The current 1.3.0 board has no transports: the same moves stop where they land.
  const current = serverState('n05a');
  assert.equal(planPointsMove(current, turnFor(current, 1)).finalLocation.nodeId, 'n06a');
  const currentSecond = serverState('n33');
  assert.equal(planPointsMove(currentSecond, turnFor(currentSecond, 1)).finalLocation.nodeId, 'n34');
});

test('legacy cloud gate and world2 firstStateChanges update shared state only on the final landing', () => {
  const session = serverState('n11b', 'world.ximitu.cloud-harbor@1.2.1');
  assert.equal(planPointsMove(session, turnFor(session, 1)).world.active.mapState.cloudRouteOpen, true);
  assert.notEqual(planPointsMove(session, turnFor(session, 2)).world.active.mapState.cloudRouteOpen, true);
  const c = resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES);
  const gate = c.board.nodes.find(n => c.level.landingProfiles[c.level.nodeBindings[n.id].rewardRef]?.firstStateChanges);
  const prior = c.board.edges.find(edge => edge.to === gate.id).from;
  const world2 = serverState(prior, BEYOND_CLOUD_WORLD_REF);
  const unlocked = planPointsMove(world2, turnFor(world2, 1));
  assert.equal(unlocked.world.active.mapState.auroraBridgeOpen, true);
  assert.ok(unlocked.world.active.levelState.discoveredNodeIds.includes(gate.id));
});

test('current board pays the true final cell where the slide used to be and never opens the old shortcut', () => {
  const session = serverState('n11b');
  const slide = planPointsMove(session, turnFor(session, 1));
  assert.equal(slide.finalLocation.nodeId, 'n12b');
  assert.equal(slide.event.nodeId, 'n12b');
  assert.equal(slide.event.worldRef, 'world.ximitu.cloud-harbor@1.3.0');
  assert.equal(slide.event.boardRef, 'ximitu-card-hunt-board.v1@2.3.0');
  assert.equal(slide.event.levelRef, 'ximitu-card-hunt.level-01@2.1.0');
  assert.equal(slide.points, session.rule.worlds[0].nodes.find(node => node.nodeId === 'n12b').points);
  assert.equal(slide.teams[0].nodeId, 'n12b');
  assert.equal(slide.teams[1].nodeId, 'n01', 'only the acting student moves');
  assert.equal(slide.plan.effects.some(effect => effect.type === 'transport_move'), false);
  assert.notEqual(slide.world.active.mapState.cloudRouteOpen, true);
  const passing = planPointsMove(session, turnFor(session, 2));
  assert.equal(passing.finalLocation.nodeId, 'n13b');
  assert.notEqual(passing.world.active.mapState.cloudRouteOpen, true);
  const neutral = serverState('n04');
  const fog = planPointsMove(neutral, turnFor(neutral, 1), { [neutral.world.active.instanceId]: { n04: 'e04b' } });
  assert.equal(fog.finalLocation.nodeId, 'n05b');
  assert.equal(fog.world.active.mapState.foghornTriggered, false);
  const oldOpenState = serverState('n14');
  oldOpenState.world.active.mapState.cloudRouteOpen = true;
  assert.equal(planPointsMove(oldOpenState, turnFor(oldOpenState, 1)).finalLocation.nodeId, 'n15');
  assert.throws(() => planPointsMove(oldOpenState, turnFor(oldOpenState, 1),
    { [oldOpenState.world.active.instanceId]: { n14: 'e14c' } }), { code: 'points_route_invalid' });
});

for (const [legacyRevision, legacyWorld, legacyRoute] of [
  ['monopoly-final-landing-v1', 'world.ximitu.cloud-harbor@1.2.1', 'route.ximitu-main@1.2.1'],
  ['monopoly-final-landing-v2', CLOUD_HARBOR_WORLD_REF, 'route.ximitu-main@1.3.0'],
]) test(`${legacyRevision} interrupted registration recovers its original price and route across the v3 upgrade`, async t => {
  const f = await fixture(t);
  await rm(join(f.dataDir, 'authoritative-turns.json'));
  const original = { id: f.session.platformSessionId, externalSessionId: f.registration.externalSessionId,
    studentIds: f.registration.studentIds, gameMode: 'teacher-led', createdBy: actor.id,
    landingCount: 0, rule: rule(legacyRevision) };
  f.platform.register = async fields => {
    assert.equal(fields.ruleVersion, CURRENT_POINTS_RULE_VERSION);
    throw Object.assign(new Error('original registration exists'), { code: 'game_points_idempotency_conflict' });
  };
  let reads = 0;
  f.platform.getByExternal = async externalId => {
    reads++; assert.equal(externalId, original.externalSessionId);
    return { session: structuredClone(original) };
  };
  const recovered = (await f.store.register(f.registration)).session;
  assert.equal(reads, 1);
  assert.equal(recovered.rule.revision, legacyRevision);
  assert.equal(recovered.world.routeRef, legacyRoute);
  assert.equal(recovered.world.active.worldPackRef, legacyWorld);
  assert.deepEqual((await f.store.register(f.registration)).session, recovered);
  assert.equal(reads, 1, 'stored registrations never reread or adopt the latest rule');
  // This is an already-locked pre-deployment turn, not a new roll after the upgrade.
  const path = join(f.dataDir, 'authoritative-turns.json');
  const disk = JSON.parse(await readFile(path, 'utf8'));
  const saved = disk.sessions[recovered.id], attemptId = 'legacy-pending';
  saved.turns[attemptId] = { attemptId, studentId: studentA, status: 'rolled', faceIndex: 0, steps: 1,
    bonus: { coins: 0, stars: 0 }, teacherDiceRef: 'teacher-dice.v1', nextWorldInstanceId: randomUUID(),
    startLocation: { worldRef: saved.world.active.worldPackRef, worldInstanceId: saved.world.active.instanceId,
      worldOrdinal: saved.world.active.ordinal, nodeId: saved.teams[0].nodeId },
    createdAt: '2026-11-01T00:00:00.000Z', receipt: null };
  saved.activeTurnId = attemptId;
  await writeFile(path, JSON.stringify(disk));
  const planned = await autoPlan(f.store, recovered, attemptId);
  assert.equal(planned.turn.event.worldRef, legacyWorld);
  assert.equal(planned.turn.points, 100, 'legacy pending landing keeps the exact original price');
  f.platform.claim = async (sessionId, event) => ({ landing: { ...event, amount: planned.turn.points,
    ruleVersion: legacyRevision, status: 'awarded', currency: 'wordattack-points' },
    wallet: { studentId: event.studentId, currency: 'wordattack-points', balance: planned.turn.points } });
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform,
    random: () => assert.fail('old pending turn cannot reroll') });
  assert.equal((await claim(restarted, recovered, attemptId)).receipt.landing.ruleVersion, legacyRevision);
  await rm(join(f.dataDir, 'authoritative-turns.json'));
  original.landingCount = 1;
  await assert.rejects(f.store.register(f.registration), { code: 'points_state_recovery_required' });
  await assert.rejects(readFile(join(f.dataDir, 'authoritative-turns.json')), { code: 'ENOENT' });
});

test('new registration fails closed for mismatched or incomplete immutable rule snapshots', async t => {
  const f = await fixture(t);
  const original = f.platform.register;
  const corruptions = [
    snapshot => { snapshot.revision = 'monopoly-final-landing-v1'; },
    snapshot => { snapshot.worlds[0].nodes.pop(); },
    snapshot => { snapshot.worlds[0].nodes[1] = snapshot.worlds[0].nodes[0]; },
    snapshot => { snapshot.worlds[0].boardRef = 'ximitu-card-hunt-board.v1@2.2.1'; },
    snapshot => { snapshot.worlds[0].nodes[0].points = 9999; },
    snapshot => { snapshot.currency = 'unregistered-currency'; },
  ];
  for (const [index, corrupt] of corruptions.entries()) {
    f.platform.register = async (...args) => {
      const result = await original(...args); corrupt(result.session.rule); return result;
    };
    await assert.rejects(f.store.register({ ...f.registration, externalSessionId: `invalid-${index}`, idempotencyKey: `invalid-${index}` }),
      error => ['points_rule_unavailable', 'points_receipt_invalid'].includes(error.code));
  }
  const stored = JSON.parse(await readFile(join(f.dataDir, 'authoritative-turns.json'), 'utf8'));
  assert.equal(Object.keys(stored.sessions).length, 1);
});

test('forward crossing spends no extra die step, moves all students and repeatable tail resets state', () => {
  const session = serverState('n48');
  assert.equal(session.world.routeRef, 'route.ximitu-main@1.3.0');
  assert.equal(Object.hasOwn(session, 'movementPolicy'), false);
  const result = planPointsMove(session, turnFor(session, 2));
  assert.equal(result.plan.stepsConsumed, 2); assert.equal(result.plan.transitions.length, 1);
  assert.equal(result.world.active.worldPackRef, BEYOND_CLOUD_WORLD_REF);
  const c = resolveWorldComposition(BEYOND_CLOUD_WORLD_REF, WORLD_REGISTRIES);
  assert.equal(result.teams[1].nodeId, c.board.entryNodeId || c.board.startNodeId);
  assert.notEqual(result.teams[0].nodeId, result.teams[1].nodeId);
  const exit = c.board.exits[0].nodeId, prior = c.board.edges.find(edge => edge.to === exit).from;
  const tail = serverState(prior, BEYOND_CLOUD_WORLD_REF); tail.world.active.mapState.auroraBridgeOpen = true;
  const repeated = planPointsMove(tail, turnFor(tail, 1));
  assert.equal(repeated.world.active.ordinal, 3); assert.equal(repeated.world.active.mapState.auroraBridgeOpen, false);
  assert.notEqual(repeated.world.active.instanceId, tail.world.active.instanceId);
});

test('stored idempotency receipts reference sessions instead of copying entire history', async t => {
  const f = await fixture(t); await roll(f.store, f.session); await autoPlan(f.store, f.session); await claim(f.store, f.session);
  const state = JSON.parse(await readFile(join(f.dataDir, 'authoritative-turns.json'), 'utf8'));
  for (const receipt of Object.values(state.receipts)) assert.equal(Object.hasOwn(receipt, 'result'), false);
});

async function holdClaimInChild(t, f) {
  const moduleUrl = new URL('../standalone/points-store.mjs', import.meta.url).href;
  const code = `
    import {PointsTurnStore} from ${JSON.stringify(moduleUrl)};
    const keepAlive = setInterval(() => {}, 1000);
    const store = new PointsTurnStore({dataDir: process.env.POINTS_LOCK_TEST_DIR,
      platform: {claim: async () => { process.stdout.write('LOCK_HELD\\n'); await new Promise(() => {}); }}});
    await store.claim({actor:${JSON.stringify(actor)},sessionId:${JSON.stringify(f.session.id)},
      attemptId:'turn-one',idempotencyKey:'child-claim'});
    clearInterval(keepAlive);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, POINTS_LOCK_TEST_DIR: f.dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
  });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`child lock timeout: ${stderr}`)), 5000);
    child.stdout.on('data', bytes => {
      output += bytes.toString();
      if (output.includes('LOCK_HELD\n')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`child exited ${code}: ${stderr}`)); });
  });
  return child;
}

test('live cross-process owner is never displaced; lock stores PID, creation time and unique token', async t => {
  const f = await fixture(t); await roll(f.store, f.session); await autoPlan(f.store, f.session);
  const child = await holdClaimInChild(t, f);
  const lockPath = join(f.dataDir, 'authoritative-turns.json.lock');
  const before = await readFile(lockPath, 'utf8'), lock = JSON.parse(before);
  assert.equal(lock.pid, child.pid); assert.equal(lock.schemaVersion, 'monopoly-process-lock.v1');
  assert.ok(Number.isFinite(Date.parse(lock.createdAt))); assert.match(lock.token, /^[a-f0-9-]{36}$/i);
  await assert.rejects(claim(f.store, f.session), { code: 'points_store_busy' });
  assert.equal(await readFile(lockPath, 'utf8'), before);
  assert.equal(f.claimCalls(), 0);
  child.kill('SIGKILL'); await once(child, 'exit');
});

test('restart safely reclaims a killed writer lock and resumes the original pending claim', async t => {
  const f = await fixture(t); await roll(f.store, f.session); const original = await autoPlan(f.store, f.session);
  const child = await holdClaimInChild(t, f);
  child.kill('SIGKILL'); await once(child, 'exit');
  const restarted = new PointsTurnStore({ dataDir: f.dataDir, platform: f.platform, random: () => { throw new Error('must not reroll'); } });
  const recovered = await claim(restarted, f.session);
  assert.equal(recovered.turn.status, 'awarded');
  assert.deepEqual(recovered.turn.event, original.turn.event);
  assert.equal(f.receipts.size, 1);
  await assert.rejects(readFile(join(f.dataDir, 'authoritative-turns.json.lock')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.dataDir, 'authoritative-turns.json.lock.recovery')), { code: 'ENOENT' });
});

test('a previously killed recovery owner is recovered under a separate nested mutex', async t => {
  const f = await fixture(t); await roll(f.store, f.session); await autoPlan(f.store, f.session);
  const child = await holdClaimInChild(t, f);
  const lockPath = join(f.dataDir, 'authoritative-turns.json.lock');
  const owner = await readFile(lockPath, 'utf8');
  child.kill('SIGKILL'); await once(child, 'exit');
  await writeFile(`${lockPath}.recovery`, owner);
  assert.equal((await claim(f.store, f.session)).turn.status, 'awarded');
  for (const suffix of ['', '.recovery', '.recovery.recovery']) await assert.rejects(readFile(lockPath + suffix), { code: 'ENOENT' });
});

test('empty, damaged and missing-PID locks fail closed with diagnostics and remain untouched', async t => {
  const f = await fixture(t); await roll(f.store, f.session); await autoPlan(f.store, f.session);
  const lockPath = join(f.dataDir, 'authoritative-turns.json.lock');
  for (const raw of ['', '{invalid', JSON.stringify({ schemaVersion: 'monopoly-process-lock.v1', createdAt: new Date().toISOString(), token: randomUUID() })]) {
    await writeFile(lockPath, raw);
    await assert.rejects(claim(f.store, f.session), { code: 'points_store_lock_invalid' });
    assert.equal(await readFile(lockPath, 'utf8'), raw);
  }
  assert.equal(f.claimCalls(), 0);
});
