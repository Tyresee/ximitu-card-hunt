import test from 'node:test';
import assert from 'node:assert/strict';
import { validLandingPointsValue, landingPointsValueScale, isFivefoldRuleUpgrade } from '../public/prototypes/universal-board/landing-points-values.js';
import { nodeLandingPointsPresentation } from '../public/prototypes/universal-board/node-landing-points-presentation.js';
import { tilePointsTier, tilePointsText } from '../public/prototypes/universal-board/tile-points-visuals.js';

const oldValues = [100, 200, 300, 500, 1000];
const newValues = [500, 1000, 1500, 2500, 5000];
const previous = { kind: 'server_verified_final_landing', enabled: true, revision: 'monopoly-final-landing-v2', currency: 'wordattack-points',
  worlds: [{ worldRef: 'world', boardRef: 'board@1', levelRef: 'level@1', nodes: oldValues.map((points,i) => ({nodeId:`n${i}`,points})) }] };
const current = { ...structuredClone(previous), revision: 'monopoly-final-landing-v3', baseRevision: previous.revision,
  worlds: previous.worlds.map(world => ({...world,nodes:world.nodes.map(node=>({...node,points:node.points*5}))})) };

test('each protocol version accepts only its approved tile values', () => {
  for (const revision of ['monopoly-final-landing-v1','monopoly-final-landing-v2']) {
    for (const amount of oldValues) assert.equal(validLandingPointsValue(revision,amount),true);
    assert.equal(validLandingPointsValue(revision,5000),false);
  }
  for (const amount of newValues) assert.equal(validLandingPointsValue(current.revision,amount),true);
  for (const amount of [100,200,300,3000,5001,10000]) assert.equal(validLandingPointsValue(current.revision,amount),false);
  assert.equal(validLandingPointsValue('unknown',500),false);
});

test('upgrade is exactly one multiplication and preserves all original topology references', () => {
  assert.equal(isFivefoldRuleUpgrade(previous,current),true);
  assert.equal(isFivefoldRuleUpgrade(current,current),false);
  for (const change of [rule=>{rule.worlds[0].boardRef='other'}, rule=>{rule.worlds[0].nodes[0].points=2500}, rule=>{rule.worlds[0].nodes.reverse()}, rule=>{rule.baseRevision='unknown'}]) {
    const bad=structuredClone(current);change(bad);assert.equal(isFivefoldRuleUpgrade(previous,bad),false);
  }
  assert.deepEqual(previous.worlds[0].nodes.map(node=>node.points),oldValues);
});

test('tiles print the final number directly and retain each original color tier', () => {
  const board={nodes:current.worlds[0].nodes.map(node=>({id:node.nodeId}))};
  for (const [index,amount] of newValues.entries()) {
    const presentation=nodeLandingPointsPresentation({rule:current,worldRef:'world',node:{id:`n${index}`},board});
    assert.equal(presentation.amount,amount);
    assert.equal(tilePointsText(presentation),String(amount));
    assert.doesNotMatch(tilePointsText(presentation),/[×*]/);
    assert.equal(tilePointsTier(amount,presentation.valueScale).id,tilePointsTier(oldValues[index]).id);
    assert.equal(landingPointsValueScale(current.revision),5);
  }
});
