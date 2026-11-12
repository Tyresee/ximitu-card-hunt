import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { GROUP_LANDING_EFFECTS_POLICY, groupLandingEffectsPending } from '../public/prototypes/universal-board/special-cells-core.js';

const app = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');

function source(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(app);
  assert.ok(match, `actual app function missing: ${name}`);
  const end = app.indexOf('\n}\n', match.index);
  assert.ok(end > match.index, `actual app function incomplete: ${name}`);
  return app.slice(match.index, end + 2);
}

function restartFixture() {
  const calls = { confirm: [], finish: [], errors: [] };
  const menu = { open: true };
  const context = {
    busy: false,
    specialCellsFollowUpActive: false,
    gameSession: { sessionId: 'saved-game', inputGate: 'open' },
    usesLandingPoints: () => false,
    needsLandingRecovery: () => false,
    currentSpecialCells: () => null,
    groupLandingEffectsPending,
    window: { confirm: message => { calls.confirm.push(message); return true; } },
    document: { querySelector: selector => {
      assert.equal(selector, '.board-utility-menu');
      return menu;
    } },
    finishCurrentGame: async options => { calls.finish.push(JSON.parse(JSON.stringify(options))); },
    showLandingError: error => calls.errors.push(error),
  };
  runInNewContext(`${source('restartGameBlocked')}\n${source('restartCurrentGame')}`, context);
  return { context, calls, menu };
}

test('restart is blocked while an opportunity, movement, follow-up or settlement is unfinished', async () => {
  for (const change of [
    ctx => { ctx.busy = true; },
    ctx => { ctx.specialCellsFollowUpActive = true; },
    ctx => { ctx.gameSession = null; },
    ctx => { ctx.gameSession.teacherOpportunity = { id: 'original-roll', faceIndex: 4 }; },
    ctx => { ctx.gameSession.inputGate = 'settlement_pending'; },
    ctx => { ctx.usesLandingPoints = () => true; ctx.needsLandingRecovery = () => true; },
  ]) {
    const { context, calls, menu } = restartFixture();
    change(context);
    const savedSession = context.gameSession;
    assert.equal(context.restartGameBlocked(), true);
    await context.restartCurrentGame();
    assert.equal(context.gameSession, savedSession);
    assert.equal(calls.confirm.length, 0);
    assert.equal(calls.finish.length, 0);
    assert.equal(menu.open, true);
  }
});

test('restart waits for confirmed group landing effects and their matching bonuses', async () => {
  for (const snapshot of [
    { groupMoves: { group: { status: 'confirmed', landingEffectsPolicy: GROUP_LANDING_EFFECTS_POLICY,
      awards: [{ status: 'awarded', attemptId: 'landed-student', landingEffectsApplied: false }] } } },
    { groupMoves: { group: { status: 'confirmed', landingEffectsPolicy: GROUP_LANDING_EFFECTS_POLICY,
      awards: [{ status: 'awarded', attemptId: 'landed-student', landingEffectsApplied: true }] } },
      bonusAwards: { bonus: { turnId: 'landed-student', status: 'pending' } } },
  ]) {
    const { context, calls, menu } = restartFixture();
    context.usesLandingPoints = () => true;
    context.currentSpecialCells = () => snapshot;
    assert.equal(context.restartGameBlocked(), true);
    await context.restartCurrentGame();
    assert.equal(calls.confirm.length, 0);
    assert.equal(calls.finish.length, 0);
    assert.equal(menu.open, true);
  }
  const { context } = restartFixture();
  context.usesLandingPoints = () => true;
  context.currentSpecialCells = () => ({ groupMoves: { group: {
    status: 'confirmed', landingEffectsPolicy: GROUP_LANDING_EFFECTS_POLICY,
    awards: [{ status: 'awarded', attemptId: 'landed-student', landingEffectsApplied: true }],
  } }, bonusAwards: { bonus: { turnId: 'landed-student', status: 'awarded' } } });
  assert.equal(context.restartGameBlocked(), false);
});

test('canceling restart keeps the current game and operation menu intact', async () => {
  const { context, calls, menu } = restartFixture();
  const original = context.gameSession;
  context.window.confirm = message => { calls.confirm.push(message); return false; };
  await context.restartCurrentGame();
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.finish.length, 0);
  assert.equal(context.gameSession, original);
  assert.equal(menu.open, true);
});

test('confirmed restart uses the existing archive and return-to-setup path', async () => {
  const { context, calls, menu } = restartFixture();
  assert.equal(context.restartGameBlocked(), false);
  await context.restartCurrentGame();
  assert.equal(calls.confirm.length, 1);
  assert.match(calls.confirm[0], /已到账.*积分保留/);
  assert.deepEqual(calls.finish, [{ returnToSetupAfter: true }]);
  assert.equal(menu.open, false);
  assert.equal(calls.errors.length, 0);
});

test('restart rechecks pending work after the confirmation dialog returns', async () => {
  const { context, calls, menu } = restartFixture();
  context.window.confirm = message => {
    calls.confirm.push(message);
    context.gameSession.teacherOpportunity = { id: 'opportunity-during-confirm' };
    return true;
  };
  await context.restartCurrentGame();
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.finish.length, 0);
  assert.equal(menu.open, true);
  assert.equal(context.gameSession.teacherOpportunity.id, 'opportunity-during-confirm');
});

test('failed archival is reported and does not close the operation menu as if restart succeeded', async () => {
  const { context, calls, menu } = restartFixture();
  const original = context.gameSession;
  const error = new Error('存档写入失败');
  context.finishCurrentGame = async () => { throw error; };
  await context.restartCurrentGame();
  assert.deepEqual(calls.errors, [error]);
  assert.equal(context.gameSession, original);
  assert.equal(menu.open, true);
});

function feedbackFixture(teacher) {
  const calls = { hide: [], clear: 0, dismiss: 0 };
  const scoreWrap = { hidden: true };
  const steps = ['judgement', 'reward', 'dice', 'move', 'effect'].map(step => ({
    dataset: { feedbackStep: step }, classList: { toggle() {} },
  }));
  const nodes = Object.fromEntries([
    'turnFeedback', 'feedbackKicker', 'feedbackTitle', 'feedbackTranscript',
    'feedbackGuidance', 'feedbackScore', 'feedbackDice', 'feedbackMove',
  ].map(name => [name, { hidden: true, dataset: {}, classList: { remove() {} } }]));
  nodes.turnFeedback.querySelectorAll = () => steps;
  nodes.feedbackScore.closest = () => scoreWrap;
  nodes.feedbackDice.previousElementSibling = {};
  const context = {
    nodes, gameSession: { mode: teacher ? 'teacher-led' : 'voice' },
    isTeacherSession: () => teacher,
    hideTurnFeedback: options => calls.hide.push(JSON.parse(JSON.stringify(options))),
    clearTurnFeedbackTimers: () => { calls.clear++; },
    scheduleTurnFeedbackDismiss: () => { calls.dismiss++; },
    FEEDBACK_PHASES: ['judgement', 'reward', 'dice', 'move', 'effect'],
  };
  runInNewContext(source('renderTurnFeedback'), context);
  return { context, nodes, calls, scoreWrap };
}

test('teacher play never opens or schedules the right-side auto-dismiss feedback popup', () => {
  const { context, nodes, calls } = feedbackFixture(true);
  context.renderTurnFeedback({ profile: { tone: 'success', outcomeLabel: '老师奖励', diceLabel: '课堂骰' } });
  assert.equal(nodes.turnFeedback.hidden, true);
  assert.deepEqual(calls.hide, [{ immediate: true }]);
  assert.equal(calls.clear, 0);
  assert.equal(calls.dismiss, 0);
});

test('voice-mode feedback still displays its actual score and transcript before dice', () => {
  const { context, nodes, calls, scoreWrap } = feedbackFixture(false);
  context.renderTurnFeedback({
    profile: { tone: 'partial', outcomeLabel: '主知识点用错了', score: 45, diceLabel: '起步骰' },
    transcript: 'She have two apples.', guidance: '这题要用 has。',
  });
  assert.equal(nodes.turnFeedback.hidden, false);
  assert.equal(nodes.turnFeedback.dataset.phase, 'judgement');
  assert.equal(nodes.feedbackScore.textContent, '45');
  assert.equal(nodes.feedbackTranscript.textContent, '你说：She have two apples.');
  assert.equal(nodes.feedbackGuidance.textContent, '这题要用 has。');
  assert.equal(nodes.feedbackDice.textContent, '起步骰');
  assert.equal(scoreWrap.hidden, false);
  assert.equal(calls.clear, 1);
  assert.equal(calls.dismiss, 1);
  assert.deepEqual(calls.hide, []);
});
