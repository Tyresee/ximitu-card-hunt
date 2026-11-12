import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLandingPointsClient } from '../public/prototypes/universal-board/landing-points-client.js';
import { PointsTurnStore } from '../standalone/points-store.mjs';
import { GROUP_MOVE_REWARD_POLICY, hasPendingGroupMoveAwards, GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from '../standalone/points-special-cells.mjs';
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
  const calls = [], bonusCalls = [], credits = new Map(), bonusCredits = new Map(), balances = new Map(roster.map(id => [id, 0]));
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
      if (!bonusCredits.has(bonus.bonusId)) {
        balances.set(bonus.studentId, balances.get(bonus.studentId) + bonus.amount);
        bonusCredits.set(bonus.bonusId, { bonus: { ...bonus, status: 'awarded' }, wallet: { studentId: bonus.studentId, currency: 'wordattack-points', balance: balances.get(bonus.studentId) } });
      }
      return structuredClone(bonusCredits.get(bonus.bonusId));
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
    bonusCalls, credits, bonusCredits, balances, restart, before: callback => { beforeClaim = callback; },
    after: callback => { afterClaim = callback; }, transform: callback => { transformReceipt = callback; } };
}


const addCell = (session, nodeId, type, suffix) => session.specialCells.cells.push({
  cellId: `sc1-${suffix}`, worldRef: CLOUD_HARBOR_WORLD_REF, nodeId, type,
});

async function prepare(t, types = ['crown', 'bag']) {
  const f = await fixture(t);
  await f.mutate(session => {
    session.teams[1].nodeId = 'n04';
    types.forEach((type, index) => { if (type) addCell(session, index ? 'n05a' : 'n03', type, index + 2); });
  });
  await f.begin();
  return f;
}

test('all base receipts precede landed effects; multiplier and fixed bag bonus retry once with the same synthetic sources', async t => {
  const f = await prepare(t);
  const first = await f.resolve();
  assert.equal(first.groupMove.landingEffectsPolicy, GROUP_LANDING_EFFECTS_POLICY);
  assert.deepEqual(first.groupMove.awards.map(a => a.landingEffectsApplied), [false, false]);
  f.before(event => { if (event.studentId === f.roster[1]) throw new Error('isolated partial base failure'); });
  const partial = await f.claim();
  assert.deepEqual(partial.groupMove.awards.map(a => a.status), ['awarded', 'planned']);
  assert.deepEqual(partial.groupMove.awards.map(a => a.landingEffectsApplied), [false, false]);
  assert.equal(f.bonusCalls.length, 0, 'not even the paid pupil activates before the batch base is complete');
  f.before(null);
  let lose = true;
  const original = f.platform.claimSpecialCellBonus;
  f.platform.claimSpecialCellBonus = async (...args) => { const result = await original(...args); if (lose) { lose = false; throw new Error('bonus reply lost after credit'); } return result; };
  const pending = await f.claim('group:claim', f.restart());
  assert.equal(groupLandingEffectsPending(pending.groupMove, pending.session.specialCells), true);
  assert.deepEqual(pending.groupMove.awards.map(a => a.specialCell.type), ['crown', 'bag']);
  assert.deepEqual(pending.groupMove.awards.map(a => a.specialCell.bonus), [1000, 100]);
  assert.equal(f.bonusCredits.size, 2);
  const balances = [...f.balances];
  const recovered = await f.claim('group:claim', f.restart());
  assert.equal(groupLandingEffectsPending(recovered.groupMove, recovered.session.specialCells), false);
  assert.equal(f.bonusCredits.size, 2);
  assert.deepEqual([...f.balances], balances, 'retry cannot mint a second bonus');
  assert.equal(Object.keys(recovered.session.turns).length, 1, 'synthetic awards never become dice turns');
  assert.deepEqual(recovered.session.specialCells.consumed, ['sc1-2', 'sc1-3']);
  for (const award of recovered.groupMove.awards) assert.equal(recovered.session.specialCells.bonusAwards[`${award.attemptId}:special`].turnId, award.attemptId);
});

test('one-time same-cell conflicts use seat order and a red packet still credits the whole class once', async t => {
  const f = await fixture(t);
  await f.mutate(session => { session.teams[1].nodeId = 'n02'; addCell(session, 'n03', 'redpack', 2); });
  await f.begin(); await f.resolve();
  const paid = await f.claim();
  assert.equal(paid.groupMove.awards[0].specialCell.type, 'redpack');
  assert.equal(paid.groupMove.awards[1].specialCell, null);
  assert.deepEqual(paid.groupMove.awards.map(a => a.landingEffectsApplied), [true, true]);
  assert.equal(f.bonusCredits.size, 2);
  assert.deepEqual([...f.bonusCredits.values()].map(r => r.bonus.amount), [50, 50]);
  await f.claim('fresh-replay'); assert.equal(f.bonusCredits.size, 2);
});

test('landed moves form an ordered queue; nested sources are valid and the third success exhausts later challenges', async t => {
  const f = await prepare(t, ['move1', 'move2']);
  await f.mutate(session => { addCell(session, 'n04', 'move1', 4); });
  await f.resolve(); const initial = await f.claim();
  let pending = Object.values(initial.session.specialCells.groupMoves).filter(move => move.status === 'pending');
  assert.equal(pending.length, 2);
  const [a,b] = pending;
  assert.ok(a.sourceTurnId.startsWith('group-landing:'));
  const resolve = id => f.store.resolveGroupMove({ actor, sessionId:f.session.id, instanceId:id, decision:'confirm', idempotencyKey:`confirm:${id}` });
  const claim = id => f.store.claimGroupMove({ actor, sessionId:f.session.id, instanceId:id, idempotencyKey:`claim:${id}`, context:f.context });
  await assert.rejects(resolve(b.instanceId), {code:'special_cells_group_move_pending'});
  await resolve(a.instanceId); const second = await claim(a.instanceId);
  pending = Object.values(second.session.specialCells.groupMoves).filter(move => move.status === 'pending');
  assert.equal(pending[0].instanceId,b.instanceId);
  assert.ok(pending.length >= 2);
  const third = await resolve(b.instanceId);
  assert.equal(third.session.specialCells.groupMoveSuccesses,3);
  assert.ok(Object.values(third.session.specialCells.groupMoves).filter(move=>![a.instanceId,b.instanceId,'gm-source-turn'].includes(move.instanceId)).every(move=>move.status==='exhausted'));
  const complete = await claim(b.instanceId);
  assert.equal(hasPendingGroupMoveAwards(complete.session),false);
  assert.equal(Object.values(complete.session.specialCells.groupMoves).some(move=>move.status==='pending'),false);
  await f.roll('after-chain',f.roster[0]);
});

test('multiple landed rerolls remain queued across another pupil roll, while each matching roll consumes only its own chance', async t => {
  const f = await fixture(t,{count:3});
  await f.mutate(session=>{session.teams[1].nodeId='n04';session.teams[2].nodeId='n06a';addCell(session,'n03','reroll',2);addCell(session,'n05a','reroll',3);});
  await f.begin();await f.resolve();const paid=await f.claim();
  assert.deepEqual(paid.session.specialCells.pendingRerolls.map(entry=>entry.studentId),f.roster.slice(0,2));
  const other=await f.roll('other',f.roster[2]);
  assert.equal(other.turn.rerollOf,undefined);
  assert.equal(other.session.specialCells.pendingRerolls.length,2);
  await f.store.plan({actor,sessionId:f.session.id,attemptId:'other',routeChoicesByWorldInstance:{},idempotencyKey:'other:plan'});
  await f.store.claim({actor,sessionId:f.session.id,attemptId:'other',idempotencyKey:'other:claim',context:f.context});
  const own=await f.roll('own',f.roster[0]);
  assert.equal(own.turn.rerollOf,paid.groupMove.awards[0].attemptId);
  assert.deepEqual(own.session.specialCells.pendingRerolls.map(entry=>entry.studentId),[f.roster[1]]);
});

test('a landed dual chance is held once and another pupil does not consume it', async t => {
  const f=await prepare(t,['double_dice',null]);await f.resolve();const paid=await f.claim();
  const source=paid.groupMove.awards[0].attemptId;
  assert.equal(paid.groupMove.awards[0].specialCell.doubleDiceGranted,true);
  assert.equal(paid.session.specialCells.heldDoubleDiceByStudent[f.roster[0]].sourceTurnId,source);
  await f.claim('replay');
  const dual=await f.roll('held',f.roster[0]);
  assert.deepEqual(dual.turn.faceIndices,[0,0]);assert.equal(dual.turn.steps,2);assert.equal(dual.turn.doubleDiceOf,source);
  assert.equal(dual.session.specialCells.heldDoubleDiceByStudent[f.roster[0]],undefined);
});

test('historical confirmed groups without the new policy are never retroactively given effects', async t => {
  const f=await prepare(t,['crown','double_dice']);await f.resolve();
  await f.mutate(session=>{const move=session.specialCells.groupMoves['gm-source-turn'];delete move.landingEffectsPolicy;for(const award of move.awards)delete award.landingEffectsApplied;});
  const paid=await f.claim();
  assert.ok(paid.groupMove.awards.every(award=>award.status==='awarded'&&award.specialCell===undefined));
  assert.deepEqual(paid.session.specialCells.consumed,[]);assert.deepEqual(paid.session.specialCells.heldDoubleDiceByStudent,{});assert.equal(f.bonusCalls.length,0);
});


test('client keeps a paid-base group claim pending while its landed bonus retries, then exposes its synthetic source', async t => {
  const f=await prepare(t);await f.resolve();
  const storageData=new Map();const storage={getItem:key=>storageData.get(key)||null,setItem:(key,value)=>storageData.set(key,String(value))};
  let postCount=0,lose=true;const original=f.platform.claimSpecialCellBonus;
  f.platform.claimSpecialCellBonus=async(...args)=>{const result=await original(...args);if(lose){lose=false;throw new Error('lost first bonus reply');}return result;};
  const fetchImpl=async(url,options={})=>{
    if(options.method==='POST'){
      postCount++;
      const key=options.headers['Idempotency-Key'];
      const saved=JSON.parse(storage.getItem(`ximitu-card-hunt.landing-points.v1:${actor.id}`));
      assert.equal(saved['group-fixture'].operations['group-claim:gm-source-turn'].idempotencyKey,key);
      return Response.json(await f.claim(key));
    }
    return Response.json({session:await f.get()});
  };
  const make=()=>createLandingPointsClient({getUserId:()=>actor.id,storage,fetchImpl});
  const client=make();await client.refresh('group-fixture',{wallets:false});
  const partial=await client.claimGroupMove('group-fixture','gm-source-turn');
  assert.ok(partial.groupMove.awards.every(award=>award.status==='awarded'));
  assert.equal(client.get('group-fixture').operations['group-claim:gm-source-turn'].status,'pending');
  const restarted=make();await restarted.refresh('group-fixture',{wallets:false});
  const paid=await restarted.claimGroupMove('group-fixture','gm-source-turn');
  assert.equal(postCount,2,'all-base-paid cannot make the client skip outstanding effects');
  assert.equal(restarted.get('group-fixture').operations['group-claim:gm-source-turn'].status,'done');
  assert.equal(groupLandingEffectsPending(paid.groupMove,paid.session.specialCells),false);
  const source=restarted.getTurn('group-fixture',paid.groupMove.awards[0].attemptId);
  assert.equal(source.specialCell.type,'crown');assert.equal(source.status,'awarded');
  await restarted.claimGroupMove('group-fixture','gm-source-turn');assert.equal(postCount,2);
});


test('a nested challenge cannot start while the previous batch still has an unpaid effect bonus', async t => {
  const f=await prepare(t,['crown','move1']);await f.resolve();
  let fail=true;const original=f.platform.claimSpecialCellBonus;
  f.platform.claimSpecialCellBonus=async(...args)=>{if(fail)throw new Error('bonus unavailable');return original(...args);};
  const waiting=await f.claim();const child=Object.values(waiting.session.specialCells.groupMoves).find(move=>move.status==='pending');
  assert.ok(child);assert.equal(groupLandingEffectsPending(waiting.groupMove,waiting.session.specialCells),true);
  const resolve=()=>f.store.resolveGroupMove({actor,sessionId:f.session.id,instanceId:child.instanceId,decision:'confirm',idempotencyKey:'child:confirm'});
  await assert.rejects(resolve(),{code:'special_cells_group_awards_pending'});
  fail=false;await f.claim();assert.equal((await resolve()).groupMove.status,'confirmed');
});

test('ending a confirmed batch still recovers cash effects but does not start another movement or extra roll', async t => {
  const f=await prepare(t,['crown','move1']);await f.resolve();
  await f.store.end({actor,sessionId:f.session.id,idempotencyKey:'closed'});
  const paid=await f.claim();assert.equal(paid.groupMove.awards[0].specialCell.bonus,1000);
  assert.equal(f.bonusCredits.size,1);
  assert.equal(paid.groupMove.awards[1].specialCell.exhausted,true);
  assert.equal(Object.values(paid.session.specialCells.groupMoves).some(move=>move.status==='pending'),false);
});


test('a one-time move challenge at a shared landing is reserved for the first seat until confirm or cancel', async t => {
  const f=await fixture(t);await f.mutate(session=>{session.teams[1].nodeId='n02';addCell(session,'n03','move3',2);});
  await f.begin();await f.resolve();const paid=await f.claim();
  const children=Object.values(paid.session.specialCells.groupMoves).filter(move=>move.status==='pending');
  assert.equal(children.length,1);
  assert.equal(children[0].sourceTurnId,paid.groupMove.awards[0].attemptId);
  assert.equal(paid.groupMove.awards[1].specialCell,null);
  assert.equal(paid.session.specialCells.consumed.includes('sc1-2'),false,'only actual confirmation consumes move3');
  await f.store.resolveGroupMove({actor,sessionId:f.session.id,instanceId:children[0].instanceId,decision:'cancel',idempotencyKey:'cancel-reservation'});
  assert.equal((await f.get()).specialCells.consumed.includes('sc1-2'),false);
});
