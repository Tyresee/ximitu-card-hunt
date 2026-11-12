import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { automaticRouteChoice } from '../public/prototypes/universal-board/route-choice-equivalence.js';
import { routeChoiceOutcome } from '../public/prototypes/universal-board/route-choice-outcome.js';
import { DOUBLE_DICE_POLICY } from '../public/prototypes/universal-board/double-dice-core.js';
import { findPendingRouteChoice } from '../public/prototypes/universal-board/engine-core.js';
import { createHarborMapState } from '../public/prototypes/universal-board/harbor-items-core.js';
import { createPointsWorld, planPointsMove } from '../standalone/points-movement.mjs';
import {
  WORLD_REGISTRIES, CLOUD_HARBOR_WORLD_REF, CRYSTAL_V121_WORLD_REF,
  BEYOND_CLOUD_WORLD_REF, CIRCUIT_WORLD_ROUTE_REF,
} from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';

const app = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
const student = '22222222-2222-4222-8222-222222222222';
const instance = 'automatic-route-world';

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return app.slice(start, app.indexOf('\n}\n', start) + 2);
}

// A frozen-rule fixture with independently priced destinations, like the bridge.
function ruleFor(worldRef = CLOUD_HARBOR_WORLD_REF, overrides = {}) {
  return { kind: 'server_verified_final_landing', enabled: true,
    revision: 'monopoly-final-landing-v3', currency: 'wordattack-points',
    worlds: [worldRef, BEYOND_CLOUD_WORLD_REF].map(ref => {
      const { board, level } = resolveWorldComposition(ref, WORLD_REGISTRIES);
      return { worldRef: ref, boardRef: `${board.id}@${board.version}`, levelRef: `${level.id}@${level.version}`,
        nodes: board.nodes.map(node => ({ nodeId: node.id, points: overrides[node.id] ?? 500 })) };
    }) };
}

function fixture({ start = 'n04', steps = 4, worldRef = CLOUD_HARBOR_WORLD_REF,
  prices = {}, cells = [], consumed = [], routeChoices = {} } = {}) {
  const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
  const mapState = createHarborMapState();
  const rule = ruleFor(worldRef, prices);
  const specialCells = { cells, consumed };
  const session = { seats: [{ id: student }], landingPoints: { rule } };
  const calls = { approaches: 0, prompts: 0 };
  const context = {
    activeWorldComposition: composition, activeBoardTemplate: composition.board,
    runtime: { mapState, completedMoveCount: 0 }, gameSession: session,
    fairyState: { status: 'inactive' }, FAIRY_STATUS: { active: 'active' },
    currentSessionSeat: () => session.seats[0], usesLandingPoints: () => true,
    currentSpecialCells: () => specialCells, automaticRouteChoice, routeChoiceOutcome,
    findPendingRouteChoice, routeChoices, movingTeam: { id: student, nodeId: start },
    resolvedDieValue: steps, pendingPlan: findPendingRouteChoice(composition.board, start, steps, routeChoices, mapState),
    presentedLocalRouteNodeIds: [], attemptId: 'automatic-route-attempt', DOMException,
    presentRouteChoiceApproach: async plan => { calls.approaches++; return plan.routeBeforeJunction; },
    chooseRouteForMove: async plan => { calls.prompts++; return { [plan.junctionNodeId]: plan.options[0].edgeId }; },
  };
  runInNewContext(functionSource('automaticChoiceForMove'), context);
  const run = async () => {
    const start = app.indexOf('    while (pendingPlan) {');
    const end = app.indexOf('\n\n    const plannedMove =', start);
    assert.ok(start >= 0 && end > start);
    await runInNewContext(`(async () => { ${app.slice(start, end)} })()`, context);
    return context.routeChoices;
  };
  return { context, calls, run, composition, mapState, rule, specialCells };
}

function authoritative(start, steps, choices = {}, rule = ruleFor(), diceFields = {}) {
  const state = createPointsWorld([student], () => instance, CIRCUIT_WORLD_ROUTE_REF);
  state.teams[0].nodeId = start;
  const session = { ...state, rule, studentIds: [student], completedTurns: 0 };
  const turn = { attemptId: 'automatic-route-attempt', studentId: student, steps,
    ...diceFields,
    nextWorldInstanceId: instance, startLocation: { worldInstanceId: instance, nodeId: start } };
  return planPointsMove(session, turn, { [instance]: choices });
}

test('a merging fork advances without an approach or chooser and submits its explicit edge to authority', async () => {
  const f = fixture();
  const before = JSON.stringify({ rule: f.rule, mapState: f.mapState, specialCells: f.specialCells });
  const choices = await f.run();
  assert.deepEqual(choices, { n04: 'e04a' });
  assert.deepEqual(f.calls, { approaches: 0, prompts: 0 });
  const result = authoritative('n04', 4, choices, f.rule);
  assert.deepEqual(result.plan.effects.filter(e => e.type === 'pawn_step').map(e => e.nodeId),
    ['n05a', 'n06a', 'n07a', 'n08']);
  assert.equal(result.finalLocation.nodeId, 'n08');
  assert.equal(result.points, 500);
  assert.equal(JSON.stringify({ rule: f.rule, mapState: f.mapState, specialCells: f.specialCells }), before,
    'route preview never consumes effects, changes the rule or commits a map settlement');
  assert.throws(() => authoritative('n04', 4, {}, f.rule), { code: 'points_route_choice_required' },
    'the server still requires the actual chosen edge even when the UI can choose automatically');
});

test('different base rewards still approach the fork and ask once', async () => {
  const f = fixture({ steps: 1, prices: { n05a: 500, n05b: 1500 } });
  await f.run();
  assert.deepEqual(f.calls, { approaches: 1, prompts: 1 });
});

test('different ordinary stopping nodes still ask even when base rewards are equal', async () => {
  const f = fixture({ steps: 1 });
  const choices = await f.run();
  assert.deepEqual(choices, { n04: 'e04a' });
  assert.deepEqual(f.calls, { approaches: 1, prompts: 1 });
  const result = authoritative('n04', 1, choices, f.rule);
  assert.equal(result.finalLocation.nodeId, 'n05a');
  assert.equal(result.points, 500);
});

test('equal-price different landings keep a choice with active or consumed specials', async () => {
  const cell = { cellId: 'active-star', worldRef: CLOUD_HARBOR_WORLD_REF, nodeId: 'n05a', type: 'star' };
  const active = fixture({ steps: 1, cells: [cell] });
  await active.run();
  assert.deepEqual(active.calls, { approaches: 1, prompts: 1 });
  const consumed = fixture({ steps: 1, cells: [cell], consumed: [cell.cellId] });
  await consumed.run();
  assert.deepEqual(consumed.calls, { approaches: 1, prompts: 1 });
});

test('legacy transport and map-opening effects remain choices even when the settled prices match', async () => {
  for (const [start, steps] of [['n04', 2], ['n10', 2]]) {
    const f = fixture({ start, steps, worldRef: CRYSTAL_V121_WORLD_REF });
    await f.run();
    assert.deepEqual(f.calls, { approaches: 1, prompts: 1 }, `${start} historical mechanism cannot be silently replaced`);
  }
});

test('a final landing on another fork never asks how to leave that stopping tile', async () => {
  const f = fixture({ steps: 6 });
  const choices = await f.run();
  assert.deepEqual(choices, { n04: 'e04a' });
  assert.deepEqual(f.calls, { approaches: 0, prompts: 0 });
  const planned = authoritative('n04', 6, choices, f.rule);
  assert.equal(planned.finalLocation.nodeId, 'n10');
  assert.equal(planned.plan.stepsConsumed, 6);
  assert.equal(findPendingRouteChoice(f.composition.board, 'n04', 6, choices, f.mapState), null);
});

test('an already saved explicit route survives replay without asking or replacing it', async () => {
  const choices = { n04: 'e04b' };
  const f = fixture({ routeChoices: choices });
  await f.run();
  assert.deepEqual(choices, { n04: 'e04b' });
  assert.deepEqual(f.calls, { approaches: 0, prompts: 0 });
  const planned = authoritative('n04', 4, choices, f.rule);
  assert.deepEqual(planned.plan.effects.filter(e => e.type === 'pawn_step').map(e => e.nodeId),
    ['n05b', 'n06b', 'n07b', 'n08']);
});

test('a double-dice lap return also bypasses its equivalent destination fork before any chooser', async () => {
  const f = fixture({ start: 'n01', steps: 7 });
  Object.assign(f.context, {
    destinationComposition: f.composition, destinationMapState: f.mapState,
    destinationRouteChoices: {}, destinationEntryNodeId: 'n01', remainingWorldSteps: 7,
    destinationPendingPlan: f.context.pendingPlan, presentedDestinationRouteNodeIds: [],
    committedLocalNodeIds: ['n49'], circuitTurn: true, resolvedDieValue: 8,
  });
  const start = app.indexOf('      while (destinationPendingPlan) {');
  const end = app.indexOf('\n      if (remainingWorldSteps > 0) {', start);
  assert.ok(start >= 0 && end > start);
  await runInNewContext(`(async () => { ${app.slice(start, end)} })()`, f.context);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.destinationRouteChoices)), { n04: 'e04a' });
  assert.deepEqual(f.calls, { approaches: 0, prompts: 0 });
  const planned = authoritative('n48', 8, f.context.destinationRouteChoices, f.rule,
    { dicePolicy: DOUBLE_DICE_POLICY, faceIndices: [3, 3] });
  assert.equal(planned.finalLocation.nodeId, 'n08');
  assert.equal(planned.plan.stepsConsumed, 8);
  assert.equal(planned.plan.lapReturns.length, 1);
  assert.equal(planned.plan.lapCompletions.length, 1);
});

test('the exact circuit finish stops without another choice and its next move returns only once', async () => {
  const finish = fixture({ start: 'n48', steps: 1 });
  await finish.run();
  assert.deepEqual(finish.calls, { approaches: 0, prompts: 0 });
  const stopped = authoritative('n48', 1);
  assert.equal(stopped.finalLocation.nodeId, 'n49');
  assert.equal(stopped.plan.lapCompletions.length, 1);
  assert.deepEqual(stopped.plan.lapReturns, []);
  const leaving = fixture({ start: 'n49', steps: 1 });
  await leaving.run();
  assert.deepEqual(leaving.calls, { approaches: 0, prompts: 0 });
  const resumed = authoritative('n49', 1);
  assert.equal(resumed.finalLocation.nodeId, 'n02');
  assert.equal(resumed.plan.lapReturns.length, 1);
  assert.deepEqual(resumed.plan.lapCompletions, []);
});
