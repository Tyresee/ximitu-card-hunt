import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupCoinFxLedger } from '../public/prototypes/universal-board/group-coin-fx-ledger.js';

test('pending visual receipts survive reload while historical paid components form a baseline', () => {
  const data=new Map(),storage=()=>({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)});
  const first=createGroupCoinFxLedger({storage});
  first.track('owner:game','group-one',['landing:old']);
  first.mark('owner:game',['landing:new-a']);
  const restored=createGroupCoinFxLedger({storage});
  restored.track('owner:game','group-one',['landing:new-b']);
  assert.deepEqual(restored.pending('owner:game'),['group-one']);
  assert.deepEqual(restored.seen('owner:game'),['landing:old','landing:new-a']);
  assert.deepEqual(restored.seen('another-owner:game'),[]);
  restored.complete('owner:game','group-one');
  assert.deepEqual(createGroupCoinFxLedger({storage}).pending('owner:game'),[]);
});

test('unavailable presentation storage keeps in-memory dedupe without blocking reward logic', () => {
  const ledger=createGroupCoinFxLedger({storage:()=>{throw new Error('quota')}});
  assert.doesNotThrow(()=>ledger.track('scope','move'));
  ledger.mark('scope',['landing:a']);
  ledger.track('scope','move',['landing:b']);
  assert.deepEqual(ledger.seen('scope'),['landing:a']);
  ledger.complete('scope','move');
  assert.deepEqual(ledger.pending('scope'),[]);
});
