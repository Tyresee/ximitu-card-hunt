// Read-only economy analysis of the draft, never a runtime reward source.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BOARD_TEMPLATE} from '../../public/prototypes/universal-board/packs.js';
import {findPendingRouteChoice, walkBoardPlan} from '../../public/prototypes/universal-board/engine-core.js';
import {createHarborMapState, settleHarborTurn} from '../../public/prototypes/universal-board/harbor-items-core.js';
import {teacherDiceFaces} from '../../public/prototypes/universal-board/teacher-dice.js';

const proposal = JSON.parse(await readFile(new URL('./final-landing-points-2026-10-19.json', import.meta.url), 'utf8'));
assert.equal(proposal.enabled, false);
const world = proposal.worlds.find(w => w.boardRef === `${BOARD_TEMPLATE.id}@${BOARD_TEMPLATE.version}`);
assert.ok(world);
const prices = new Map(world.nodes.map(n => [n.nodeId, n.proposedPoints]));
const nodes = new Map(BOARD_TEMPLATE.nodes.map(n => [n.id, n]));
const faces = teacherDiceFaces({mode: 'teacher-led', teacherDiceRef: 'teacher-dice.v1'}, null);
assert.deepEqual(faces.map(f => f.steps), [1, 2, 3, 4, 5, 6]);
const ordinal = id => Number(id.match(/^n(\d+)/)?.[1]);
const cache = new Map();

function transitions(start, gateOpen, strategy) {
  const key = `${start}:${gateOpen}:${strategy}`;
  if (cache.has(key)) return cache.get(key);
  const outcomes = [];
  const state = createHarborMapState({cloudRouteOpen: gateOpen});
  for (const face of faces) {
    function resolve(choices, probability) {
      const pending = findPendingRouteChoice(BOARD_TEMPLATE, start, face.steps, choices, state);
      if (pending) {
        const options = strategy === 'first' ? pending.options.slice(0, 1)
          : strategy === 'last' ? pending.options.slice(-1) : pending.options;
        for (const option of options) resolve({...choices, [pending.junctionNodeId]: option.edgeId}, probability / options.length);
        return;
      }
      const plan = walkBoardPlan(BOARD_TEMPLATE, start, face.steps, choices, state);
      assert.equal(plan.nodeIds.length, face.steps);
      const harbor = settleHarborTurn({mapState: state, settlementId: 'analysis-turn', seatId: 'analysis-student',
        effectiveTurn: 1, startNodeId: start, plannedRouteNodeIds: plan.nodeIds,
        plannedRouteEdgeIds: plan.edgeIds, boardNodes: BOARD_TEMPLATE.nodes});
      const destination = nodes.get(plan.nodeIds.at(-1));
      // Apply the same final transport target as the production board move.
      const final = destination.spaceRole === 'transport' ? destination.transportTargetId : harbor.settledNodeId;
      assert.ok(prices.has(final));
      assert.ok(ordinal(final) > ordinal(start));
      outcomes.push({probability, final, gateOpen: harbor.mapState.cloudRouteOpen, points: prices.get(final)});
    }
    resolve({}, 1 / faces.length);
  }
  assert.ok(Math.abs(outcomes.reduce((sum, o) => sum + o.probability, 0) - 1) < 1e-10);
  cache.set(key, outcomes);
  return outcomes;
}

// Exact means from the acyclic board, independent of Monte Carlo sampling.
function expected(cutoff, strategy, initialGateOpen) {
  const memo = new Map();
  function visit(node, gate) {
    if (ordinal(node) >= cutoff) return {turns: 0, points: 0, minPoints: 0, maxPoints: 0};
    const key = `${node}:${gate}`;
    if (memo.has(key)) return memo.get(key);
    let turns = 0, points = 0, minPoints = Infinity, maxPoints = 0;
    for (const o of transitions(node, gate, strategy)) {
      const next = visit(o.final, o.gateOpen);
      turns += o.probability * (1 + next.turns);
      points += o.probability * (o.points + next.points);
      minPoints = Math.min(minPoints, o.points + next.minPoints);
      maxPoints = Math.max(maxPoints, o.points + next.maxPoints);
    }
    const result = {turns, points, minPoints, maxPoints}; memo.set(key, result); return result;
  }
  return visit('n01', initialGateOpen);
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: sorted[0], max: sorted.at(-1),
    p10: sorted[Math.floor(sorted.length * .1)], median: sorted[Math.floor(sorted.length * .5)], p90: sorted[Math.floor(sorted.length * .9)]};
}
function simulate({cutoff, strategy, initialGateOpen = false, trials = 100_000, seed = 20261019}) {
  const random = randomSource(seed), totals = [], rolls = [];
  const landings = {};
  for (let i = 0; i < trials; i++) {
    let node = 'n01', gate = initialGateOpen, total = 0, turns = 0;
    while (ordinal(node) < cutoff) {
      const list = transitions(node, gate, strategy), draw = random();
      let cumulative = 0, outcome = list.at(-1);
      for (const candidate of list) { cumulative += candidate.probability; if (draw < cumulative) { outcome = candidate; break; } }
      node = outcome.final; gate = outcome.gateOpen; total += outcome.points;
      turns++; landings[node] = (landings[node] || 0) + 1;
      assert.ok(turns < 35);
    }
    totals.push(total); rolls.push(turns);
  }
  return {cutoff, strategy, initialGateOpen, trials, seed,
    exactMean: expected(cutoff, strategy, initialGateOpen),
    singleStudent: stats(totals), pawnRolls: stats(rolls),
    affordableFromLessonIncome: Object.fromEntries([600, 800, 1000, 1200, 1500].map(price =>
      [price, totals.filter(points => points >= price).length / totals.length])),
    totalLandingCount: Object.values(landings).reduce((a, b) => a + b, 0), landings};
}

const scenarios = [
  {cutoff: 29, strategy: 'random'},
  {cutoff: 30, strategy: 'random'},
  {cutoff: 29, strategy: 'first'},
  {cutoff: 29, strategy: 'last'},
  {cutoff: 29, strategy: 'random', initialGateOpen: true},
  {cutoff: 10, strategy: 'random'},
].map(simulate);
const result = {kind: 'draft-economy-analysis', date: '2026-10-19', enabled: false,
  boardRef: world.boardRef, proposalVersion: proposal.version,
  assumptions: [
    'Fresh game starts at n01; first map half means reaching n29 or later, with n30 as a boundary sensitivity case.',
    'Fair teacher die 1-6; random fork choices unless first/last is specified; full final turn is included.',
    'Only final landing earns proposed platform points, after cannon/transport; existing coins/stars are excluded.',
    'Base scenario uses one pawn and its own gate openings. Already-open gate is a sensitivity case for shared classroom map state.',
    'Current game gives each student a separate pawn. These are per-student earnings when that student reaches half the map, not total class earnings.',
    'Quantiles are a seeded simulation, not observed students. Exact means use the same production route helpers.',
    'No starting grant or existing wallet balance included in lesson earnings. No real account was accessed.'
  ], scenarios};
const output = new URL('./half-map-economy-2026-10-19.json', import.meta.url);
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output: fileURLToPath(output), scenarios: scenarios.map(({landings, ...rest}) => rest)}, null, 2));
