import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from "../public/prototypes/universal-board/special-cells-core.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { LANDING_POINTS_KIND, recoverableLandingTurns } from '../public/prototypes/universal-board/landing-points-game.js';

const source = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `actual app function not found: ${start}`);
  return source.slice(from, to);
}
const helpers = section('function usesLandingPoints(', 'function showLandingError(')
  + section('function savedLandingGame(', 'function renderLandingPoints(');
const legacyRenderer = section('function renderPlatformPoints(', 'function persistStableSession(');
const owner = 'teacher-one', gameId = 'old-game';
class Element {
  constructor(tag = 'div', text = '') { this.tag = tag; this.textContent = text; this.children = []; this.dataset = {}; this.listeners = {}; this.hidden = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
}
const allText = element => [element.textContent, ...element.children.map(allText)].filter(Boolean).join(' ');
function fixture({ ended = true, current = false, processed = ['committed'] } = {}) {
  const calls = [], storage = new Map(), records = new Map();
  const local = { assetGameId: gameId, assetGameEnded: ended, processedAttemptIds: [...processed],
    landingPoints: { kind: LANDING_POINTS_KIND, ownerId: owner } };
  const record = { externalSessionId: gameId, expectedUserId: owner, createdAt: '2026-10-19T00:00:00.000Z',
    session: { status: 'open', turns: {
      committed: { attemptId: 'committed', studentId: 'student-one', status: 'planned', points: 200 },
      uncommitted: { attemptId: 'uncommitted', studentId: 'student-one', status: 'planned', points: 500 },
    } } };
  records.set(gameId, record);
  storage.set(`local-save:game:${gameId}`, JSON.stringify({ gameSession: local }));
  const elements = new Map(['#platform-points-note', '#platform-points-results', '#platform-points-setup'].map(id => [id, new Element()]));
  const context = { LANDING_POINTS_KIND, recoverableLandingTurns, GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending, LOCAL_SESSION_KEY: 'local-save',
    authenticatedUserId: owner, gameSession: current ? local : null, landingRecoveryFlights: new Map(),
    landingPointsMessage: '', busy: false, window: { localStorage: { getItem: key => storage.get(key) || null } },
    renderPlatformPoints() { calls.push('render'); }, showLandingError(error) { calls.push(`error:${error.message}`); },
    renderHud() { calls.push('hud'); },
    trackGroupCoinGain() {}, holdCoinFxDisplays() {}, prepareTrackedGroupCoinHolds: () => {}, presentTrackedGroupRewards: async () => {},
    coinFx: { unholdIdle() {} },
    claimGroupLandingRewards: async (id, move) => context.landingPoints.claimGroupMove(id, move.instanceId),
    textElement: (tag, className, text) => { const el = new Element(tag, text); el.className = className; return el; },
    document: { querySelector: id => elements.get(id), createElement: tag => new Element(tag) },
    nodes: { endGame: new Element('button'), newSession: new Element('button') },
    platformPoints: { get: () => null, error: () => '', records: () => [] }, platformPointsCopy: () => '旧整局规则未启用',
    landingPoints: {
      get: id => context.authenticatedUserId === owner ? records.get(id) || null : null,
      records: () => context.authenticatedUserId === owner ? [...records.values()] : [],
      isBusy: () => false,
      refresh: async id => { calls.push(`refresh:${id}`); return { session: records.get(id)?.session }; },
      claim: async (id, attemptId) => {
        calls.push(`claim:${id}:${attemptId}`);
        const turn = records.get(id).session.turns[attemptId];
        if (turn.status !== 'awarded') { turn.status = 'awarded'; turn.receipt = { landing: { amount: turn.points } }; }
      },
      close: async id => { calls.push(`close:${id}`); records.get(id).session.status = 'closed'; },
    },
  };
  runInNewContext(helpers, context);
  return { context, calls, local, record, records, storage, elements };
}

test('actual recovery attempts closing an ended game even when refresh fails offline', async () => {
  const f = fixture();
  f.context.landingPoints.refresh = async id => { f.calls.push(`refresh:${id}`); throw new Error('offline'); };
  await assert.rejects(f.context.recoverLandingPoints(gameId), /offline/);
  assert.deepEqual(f.calls, [`refresh:${gameId}`, `close:${gameId}`, 'render']);
  assert.equal(f.record.session.status, 'closed');
  assert.equal(f.context.landingRecoveryFlights.size, 0);
});

test('after returning to setup, archived local proof recovers only the originally committed turn', async () => {
  const f = fixture();
  assert.equal(f.context.gameSession, null);
  await f.context.recoverLandingPoints(gameId);
  assert.deepEqual(f.calls, [`refresh:${gameId}`, `claim:${gameId}:committed`, `close:${gameId}`, 'render']);
  assert.equal(f.record.session.turns.committed.status, 'awarded');
  assert.equal(f.record.session.turns.uncommitted.status, 'planned');
});

test('a server plan without local commit proof never becomes a recovery claim', async () => {
  const f = fixture({ processed: [] });
  await f.context.recoverLandingPoints(gameId);
  assert.equal(f.calls.some(call => call.startsWith('claim:')), false);
  assert.equal(f.record.session.status, 'closed');
});

test('missing, damaged or mismatched local archives fail closed without network mutations', async () => {
  for (const payload of [null, '{broken', JSON.stringify({ gameSession: { assetGameId: 'another-game', landingPoints: { kind: LANDING_POINTS_KIND } } })]) {
    const f = fixture();
    if (payload === null) f.storage.delete(`local-save:game:${gameId}`);
    else f.storage.set(`local-save:game:${gameId}`, payload);
    await assert.rejects(f.context.recoverLandingPoints(gameId), /未找到/);
    assert.deepEqual(f.calls, []);
  }
});

test('another account cannot recover the archived teacher game', async () => {
  const f = fixture(); f.context.authenticatedUserId = 'teacher-two';
  await assert.rejects(f.context.recoverLandingPoints(gameId), /原老师账号/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.context.landingRecoveryFlights.size, 0);
});

test('account switch during an awaited refresh does not claim or close through the new account', async () => {
  const f = fixture();
  f.context.landingPoints.refresh = async id => {
    f.calls.push(`refresh:${id}`); f.context.authenticatedUserId = 'teacher-two';
    // The real client checks expectedUserId after every awaited response.
    throw new Error('登录账号已改变');
  };
  await assert.rejects(f.context.recoverLandingPoints(gameId), /登录账号已改变/);
  assert.equal(f.calls.some(call => /^(?:claim|close):/.test(call)), false);
});

test('repeated history recovery does not claim an already awarded event again', async () => {
  const f = fixture();
  await f.context.recoverLandingPoints(gameId);
  await f.context.recoverLandingPoints(gameId);
  assert.equal(f.calls.filter(call => call === `claim:${gameId}:committed`).length, 1);
  assert.equal(f.calls.some(call => call.endsWith(':uncommitted')), false);
});

test('concurrent retries of the same archived game share one recovery flight', async () => {
  const f = fixture(); let release;
  const pending = new Promise(resolve => { release = resolve; });
  f.context.landingPoints.refresh = async id => { f.calls.push(`refresh:${id}`); await pending; };
  const first = f.context.recoverLandingPoints(gameId), second = f.context.recoverLandingPoints(gameId);
  release(); await Promise.all([first, second]);
  assert.equal(f.calls.filter(call => call.startsWith('refresh:')).length, 1);
  assert.equal(f.calls.filter(call => call.startsWith('claim:')).length, 1);
});

test('setup points stay hidden while results and saved recovery remain available', () => {
  const f = fixture();
  runInNewContext(legacyRenderer, f.context);
  f.context.renderPlatformPoints();
  assert.equal(f.elements.get('#platform-points-setup').hidden, true);
  const results = f.elements.get('#platform-points-results');
  assert.equal(results.hidden, false);
  assert.match(allText(results), /家园积分.*只领取最终停格的家园积分/);
  // The existing history builder still supports pending/unfinished archived games.
  const history = f.elements.get('#platform-points-setup');
  f.context.appendLandingHistory(history);
  assert.match(allText(history), /待确认 200/);
  assert.match(allText(history), /有移动尚未完成/);
  assert.doesNotMatch(allText(history), /待确认 700/);
});

test('history includes older pending games beyond three recent records and honors busy controls', () => {
  const f = fixture();
  f.records.clear();
  for (let index = 0; index < 5; index++) f.records.set(`g${index}`, { externalSessionId: `g${index}`, createdAt: f.record.createdAt,
    session: { turns: { t: { status: index === 4 ? 'planned' : 'awarded', points: 100 } } } });
  f.context.busy = true;
  const panel = new Element(); f.context.appendLandingHistory(panel);
  const rows = panel.children.filter(child => child.className === 'platform-points-record');
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.children.find(child => child.tag === 'button').disabled));
});

function groupFixture({ current = false, saved = false, failSave = false } = {}) {
  const f = fixture({ current, ended: !current });
  f.local.screen = 'PLAYING';
  f.local.seats = [{ id: 'student-one', displayName: '虚拟学生' }];
  if (saved) f.local.completedGroupMoveIds = ['gm-one'];
  f.storage.set(`local-save:game:${gameId}`, JSON.stringify({ gameSession: f.local }));
  const move = { instanceId: 'gm-one', sourceTurnId: 'committed', status: 'confirmed', type: 'move1', steps: 1,
    rewardPolicy: 'group-final-landing-v1', worldInstanceId: 'w-one',
    moves: [{ studentId: 'student-one', fromNodeId: 'n02', toNodeId: 'n03', path: ['n03'] }],
    awards: [{ studentId: 'student-one', attemptId: 'group-landing:one', points: 100, status: 'planned', receipt: null }] };
  f.record.session.specialCells = { groupMoves: { 'gm-one': move } };
  f.record.session.world = { active: { instanceId: 'w-one' } };
  f.record.session.teams = [{ id: 'student-one', nodeId: 'n03' }];
  Object.assign(f.context, { runtime: { world: { active: { instanceId: 'w-one' } }, teams: [{ id: 'player-student-one', nodeId: 'n02' }] },
    CIRCUIT_WORLD_ROUTE_REF: 'fixture-circuit', structuredClone, playerAssetsLedger: {}, fairyState: {},
    render() { f.calls.push('render-all'); },
    persistStableSession(runtime, local, _assets, _fairy, options) {
      assert.equal(options.required, true); f.calls.push('saved-group');
      if (failSave) throw new Error('quota');
      f.storage.set('local-save', JSON.stringify({ runtime, gameSession: local }));
    },
  });
  f.context.landingPoints.claimGroupMove = async (id, instanceId) => {
    const proof = f.context.savedLandingGame(id);
    assert.ok(proof.completedGroupMoveIds.includes(instanceId), 'durable local movement proof is required');
    f.calls.push(`group-claim:${id}:${instanceId}`);
    move.awards[0].status = 'awarded';
  };
  return { ...f, move };
}

test('setup recovers group awards only from saved animation proof and never turns server confirmation into proof', async () => {
  for (const saved of [false, true]) {
    const f = groupFixture({ saved });
    await f.context.recoverLandingPoints(gameId);
    assert.equal(f.calls.includes(`group-claim:${gameId}:gm-one`), saved);
    assert.equal(f.calls.includes('saved-group'), false, 'setup cannot manufacture movement proof');
  }
});

test('lost resolve recovery restores every authoritative final position and saves before claiming', async () => {
  const f = groupFixture({ current: true });
  await f.context.recoverLandingPoints(gameId);
  assert.equal(f.context.runtime.teams[0].nodeId, 'n03');
  assert.deepEqual([...f.context.gameSession.completedGroupMoveIds], ['gm-one']);
  assert.ok(f.calls.indexOf('saved-group') < f.calls.indexOf(`group-claim:${gameId}:gm-one`));
  const stored = JSON.parse(f.storage.get('local-save'));
  assert.equal(stored.runtime.teams[0].nodeId, 'n03');
  assert.deepEqual(stored.gameSession.completedGroupMoveIds, ['gm-one']);
});

test('failed required group snapshot cannot leave an in-memory claim proof or issue a payout', async () => {
  const f = groupFixture({ current: true, failSave: true });
  await assert.rejects(f.context.recoverLandingPoints(gameId), /quota/);
  assert.equal(f.context.gameSession.completedGroupMoveIds, undefined);
  assert.equal(f.calls.some(call => call.startsWith('group-claim:')), false);
});

test('silently discarded group snapshot does not authorize payout', async () => {
  const f = groupFixture({ current: true });
  f.context.persistStableSession = () => {};
  await assert.rejects(f.context.recoverLandingPoints(gameId), /未能保存/);
  assert.equal(f.context.gameSession.completedGroupMoveIds, undefined);
  assert.equal(f.calls.some(call => call.startsWith('group-claim:')), false);
});

test('group recovery fails closed when world or original trigger movement does not match', async () => {
  const wrongWorld = groupFixture({ current: true });
  wrongWorld.context.runtime.world.active.instanceId = 'another-world';
  await assert.rejects(wrongWorld.context.recoverLandingPoints(gameId), /位置不一致/);
  assert.equal(wrongWorld.calls.some(call => call.startsWith('group-claim:')), false);
  const uncommitted = groupFixture({ current: true });
  uncommitted.local.processedAttemptIds = [];
  await uncommitted.context.recoverLandingPoints(gameId);
  assert.equal(uncommitted.calls.some(call => call.startsWith('group-claim:')), false);
});

test('actual challenge follow-up waits for terminal placement and required save before claiming new landing awards', async () => {
  const f = groupFixture({ current: true });
  f.move.status = 'pending';
  Object.assign(f.context, { specialCellsFollowUpActive: false,
    currentSpecialCells: () => f.record.session.specialCells,
    renderTeacherPanel() {}, renderBoard() {}, reducedMotionRequested: () => true, presentationDuration: () => 0,
    boardSounds: { play() {} }, scSleep: async () => {}, showSpecialCellBanner: async () => {},
    askSpecialCellGroupMove: async ({ onDecision }) => { await onDecision('confirm'); return { decision: 'confirm' }; },
  });
  f.context.landingPoints.getTurn = () => null;
  f.context.landingPoints.resolveGroupMove = async () => { f.calls.push('resolve'); f.move.status = 'confirmed'; return { groupMove: f.move }; };
  runInNewContext(section('async function runSpecialCellFollowUp(', 'function grantSpecialCellReroll('), f.context);
  await f.context.runSpecialCellFollowUp(null, 'gm-one');
  assert.equal(f.context.runtime.teams[0].nodeId, 'n03');
  assert.ok(f.calls.indexOf('resolve') < f.calls.indexOf('saved-group'));
  assert.ok(f.calls.indexOf('saved-group') < f.calls.indexOf(`group-claim:${gameId}:gm-one`));
  assert.equal(f.context.specialCellsFollowUpActive, false);
});

test('history retains older pending group payouts and distinguishes unshown moves from retryable awards', () => {
  const f = groupFixture();
  f.records.delete(gameId);
  for (let index = 0; index < 4; index++) f.records.set(`recent-${index}`, { externalSessionId: `recent-${index}`,
    createdAt: f.record.createdAt, session: { turns: {} } });
  f.records.set(gameId, f.record);
  const panel = new Element(); f.context.appendLandingHistory(panel);
  assert.equal(panel.children.filter(child => child.className === 'platform-points-record').length, 4);
  assert.match(allText(panel), /有移动尚未完成/);
  f.local.completedGroupMoveIds = ['gm-one'];
  f.storage.set(`local-save:game:${gameId}`, JSON.stringify({ gameSession: f.local }));
  const next = new Element(); f.context.appendLandingHistory(next);
  assert.match(allText(next), /待确认 300/);
});

test('pending group payouts and unresolved challenges keep the teacher dice gate closed', () => {
  const f = groupFixture({ current: true, saved: true });
  Object.assign(f.context, { currentSpecialCells: () => f.record.session.specialCells,
    specialCellsIntro: null, specialCellsFollowUpActive: false, specialCellsIntroSeen: () => true });
  f.record.session.specialCells.locked = true;
  runInNewContext(section('function specialCellsBlockingDice(', 'function specialCellsIntroSeen('), f.context);
  assert.match(f.context.specialCellsBlockingDice(), /积分待到账/);
  f.move.awards[0].status = 'awarded';
  assert.equal(f.context.specialCellsBlockingDice(), '');
  f.move.status = 'pending';
  assert.match(f.context.specialCellsBlockingDice(), /小挑战/);
});

test('ending or returning cannot interrupt a challenge presentation before its durable movement proof', async () => {
  const f = groupFixture({ current: true });
  f.context.specialCellsFollowUpActive = true;
  runInNewContext(section('async function finishCurrentGame(', 'function snapshotWorldComposition('), f.context);
  const before = f.context.gameSession;
  await f.context.finishCurrentGame({ returnToSetupAfter: true });
  await f.context.returnToSetup({ clearSnapshot: false });
  assert.equal(f.context.gameSession, before);
  assert.deepEqual(f.calls, []);
  assert.match(section('function renderSessionStages(', 'function render('), /nodes\.endGame\.disabled = busy \|\| specialCellsFollowUpActive/);
  assert.equal((source.match(/nodes\.returnToSetup\.disabled = busy \|\| specialCellsFollowUpActive/g) || []).length, 2,
    'teacher and voice controls both disable pause during the challenge');
});

test('receipt recovery redraws only the matching current game HUD after awards are accepted', async () => {
  const current = groupFixture({ current: true, saved: true });
  await current.context.recoverLandingPoints(gameId);
  assert.ok(current.calls.indexOf(`group-claim:${gameId}:gm-one`) < current.calls.indexOf('hud'));
  assert.equal(current.calls.filter(call => call === 'hud').length, 1);
  const archived = groupFixture({ saved: true });
  await archived.context.recoverLandingPoints(gameId);
  assert.equal(archived.calls.includes('hud'), false, 'setup recovery must not redraw another game');
  assert.equal(archived.move.awards[0].status, 'awarded');
});

function wireGroupDriver(f) {
  Object.assign(f.context, { specialCellsFollowUpActive: false,
    currentSpecialCells: () => f.record.session.specialCells,
    renderTeacherPanel() {}, renderBoard() {}, reducedMotionRequested: () => true, presentationDuration: () => 0,
    boardSounds: { play() {} }, scSleep: async () => {}, showSpecialCellBanner: async () => {},
    askSpecialCellGroupMove: async ({ onDecision }) => {
      const pending = Object.values(f.record.session.specialCells.groupMoves).find(move => move.status === 'pending');
      assert.ok(pending, 'driver asks exactly one unresolved challenge');
      assert.equal(f.context.groupSourceLocallyCommitted(pending.sourceTurnId, f.record.session), true,
        'child challenge must descend from a locally committed original turn');
      f.calls.push(`ask:${pending.instanceId}`);
      await onDecision('confirm'); return { decision: 'confirm' };
    },
  });
  f.context.landingPoints.getTurn = () => null;
  f.context.landingPoints.resolveGroupMove = async (_id, instanceId) => {
    const move = f.record.session.specialCells.groupMoves[instanceId];
    f.calls.push(`resolve:${instanceId}`); move.status = 'confirmed';
    f.record.session.teams = move.moves.map(entry => ({ id: entry.studentId, nodeId: entry.toNodeId }));
    return { session: f.record.session, groupMove: move };
  };
  runInNewContext(section('async function runSpecialCellFollowUp(', 'function grantSpecialCellReroll('), f.context);
}

function childMove(parent, { instanceId = 'gm-two', fromNodeId = 'n03', toNodeId = 'n04' } = {}) {
  return { ...structuredClone(parent), instanceId, sourceTurnId: parent.awards[0].attemptId,
    status: 'pending', landingEffectsPolicy: GROUP_LANDING_EFFECTS_POLICY,
    moves: [{ studentId: 'student-one', fromNodeId, toNodeId, path: [toNodeId] }],
    awards: [{ studentId: 'student-one', attemptId: `group-landing:${instanceId}`, points: 100,
      status: 'planned', receipt: null, landingEffectsApplied: false }] };
}

function finishGroupAwards(f, instanceId) {
  const proof = f.context.savedLandingGame(gameId);
  assert.ok(proof.completedGroupMoveIds.includes(instanceId), 'required position save precedes every claim');
  const move = f.record.session.specialCells.groupMoves[instanceId];
  for (const award of move.awards) { award.status = 'awarded'; award.landingEffectsApplied = true; }
}

test('one actual driver drains a newly created child challenge without recursive suppression or lost save proof', async () => {
  const f = groupFixture({ current: true });
  f.record.session.turns.committed.status = 'awarded';
  f.move.status = 'pending'; f.move.landingEffectsPolicy = GROUP_LANDING_EFFECTS_POLICY;
  const next = childMove(f.move);
  f.context.landingPoints.claimGroupMove = async (_id, instanceId) => {
    finishGroupAwards(f, instanceId); f.calls.push(`group-claim:${gameId}:${instanceId}`);
    if (instanceId === f.move.instanceId) f.record.session.specialCells.groupMoves[next.instanceId] = next;
  };
  wireGroupDriver(f);
  await f.context.runSpecialCellFollowUp(null, f.move.instanceId);
  assert.deepEqual(f.calls.filter(call => call.startsWith('ask:')), ['ask:gm-one', 'ask:gm-two']);
  assert.equal(f.calls.filter(call => call === 'saved-group').length, 2);
  assert.ok(f.calls.indexOf(`group-claim:${gameId}:gm-one`) < f.calls.indexOf('ask:gm-two'));
  assert.ok(f.calls.indexOf(`group-claim:${gameId}:gm-two`) > f.calls.lastIndexOf('saved-group'));
  assert.deepEqual([...f.context.gameSession.completedGroupMoveIds], ['gm-one', 'gm-two']);
  assert.equal(f.context.runtime.teams[0].nodeId, 'n04');
  assert.equal(f.context.specialCellsFollowUpActive, false);
});

test('the actual chain driver settles original pending bonuses before asking or moving the next challenge', async () => {
  const f = groupFixture({ current: true, saved: true });
  f.record.session.turns.committed.status = 'awarded';
  f.move.landingEffectsPolicy = GROUP_LANDING_EFFECTS_POLICY;
  Object.assign(f.move.awards[0], { status: 'awarded', landingEffectsApplied: true });
  f.context.runtime.teams[0].nodeId = 'n03';
  const next = childMove(f.move);
  f.record.session.specialCells.groupMoves[next.instanceId] = next;
  const bonus = { turnId: f.move.awards[0].attemptId, status: 'pending' };
  f.record.session.specialCells.bonusAwards = { 'parent-special': bonus };
  let started, release;
  const claimed = new Promise(resolve => { started = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  f.context.landingPoints.claimGroupMove = async (_id, instanceId) => {
    assert.ok(f.context.savedLandingGame(gameId).completedGroupMoveIds.includes(instanceId));
    if (instanceId === f.move.instanceId) {
      f.calls.push('bonus-claim-start'); started(); await waiting;
      bonus.status = 'awarded'; f.calls.push('bonus-claim-end');
    }
    finishGroupAwards(f, instanceId); f.calls.push(`group-claim:${gameId}:${instanceId}`);
  };
  wireGroupDriver(f);
  const running = f.context.runSpecialCellFollowUp(null, f.move.instanceId);
  await claimed;
  assert.equal(f.calls.some(call => call.startsWith('ask:')), false, 'no prompt may race the original bonus payout');
  assert.equal(f.context.runtime.teams[0].nodeId, 'n03');
  release(); await running;
  assert.ok(f.calls.indexOf('bonus-claim-end') < f.calls.indexOf('ask:gm-two'));
  assert.equal(f.calls.filter(call => call === 'ask:gm-two').length, 1);
  assert.equal(f.context.runtime.teams[0].nodeId, 'n04');
  assert.equal(f.context.specialCellsFollowUpActive, false);
});
