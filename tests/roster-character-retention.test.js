import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { CHARACTER_PROFILES, normalizeCharacterAssignments, assignCharacter } from '../public/prototypes/universal-board/experience-core.js';

const source = readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
const characterIds = CHARACTER_PROFILES.map(character => character.id);
const studentId = index => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(studentId);
const profile = (id, displayName) => ({ id, displayName });
const profiles = [A, B, C, D, E].map((id, index) => profile(id, String.fromCharCode(65 + index)));

function functionSource(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `missing actual application function ${name}`);
  const tail = source.slice(match.index), end = tail.slice(1).search(/\n(?:async )?function /);
  assert.ok(end >= 0, `missing boundary after ${name}`);
  return tail.slice(0, end + 1);
}

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.value = ''; this.textContent = ''; this.children = [];
    this.dataset = {}; this.listeners = {}; this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
}

function fixture({ selected = [A, B, C], assignments = characterIds.slice(0, 3), roster = profiles,
  focus = 2, screen = 'SETUP', loaded = true, fetchImpl = async () => { throw new Error('unexpected fetch'); } } = {}) {
  const requests = [], renders = [];
  const nodes = Object.fromEntries(['setupPlayerCount', 'studentCreateSubmit', 'studentCreateName', 'studentManagerOpen',
    'studentRosterProgress', 'studentRosterStatus', 'studentProfileList'].map(name => [name, new Element()]));
  nodes.setupPlayerCount.value = String(Math.max(1, selected.length));
  const context = createContext({
    selectedStudentIds: [...selected], characterAssignments: [...assignments], selectedCharacterSeatIndex: focus,
    playerCount: Math.max(1, selected.length), studentProfiles: structuredClone(roster),
    studentProfilesLoading: false, studentProfilesLoaded: loaded, studentProfilesError: '', studentCreateBusy: false,
    authenticatedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', STUDENT_PROFILE_STORE_SCHEMA_VERSION: 'student-profiles.v1',
    gameSession: screen === 'SETUP' ? null : { screen, seats: selected.map(id => ({ id })) },
    normalizeCharacterAssignments, nodes, document: { createElement: tag => new Element(tag) },
    landingPoints: { wallet: () => null },
    textElement: (tag, className, text) => { const el = new Element(tag); el.className = className; el.textContent = text; return el; },
    renderPlatformPoints: () => renders.push('platform'),
    renderCharacterSelection: () => renders.push('characters'), updateSetupPreview: () => renders.push('preview'),
    fetch: async (url, options) => { requests.push({ url, ...options }); return fetchImpl(url, options); },
  });
  for (const name of ['selectedStudentProfiles', 'studentGameName', 'normalizeSelectedStudentIds', 'updateSetupRoster', 'studentAssetSummary',
    'renderStudentRoster', 'loadStudentProfiles', 'createStudentProfile']) runInContext(functionSource(name), context);
  context.renderStudentRoster();
  const click = id => {
    const card = nodes.studentProfileList.children.find(child => child.dataset.studentId === id);
    assert.ok(card, `roster card missing: ${id}`);
    assert.equal(card.disabled, false, `roster card unexpectedly disabled: ${id}`);
    card.listeners.click();
  };
  const choose = (seatIndex, characterId) => {
    context.characterAssignments = assignCharacter(context.characterAssignments,
      { seatIndex, characterId, playerCount: context.playerCount });
    context.selectedCharacterSeatIndex = seatIndex;
  };
  const snapshot = () => ({ selected: Array.from(context.selectedStudentIds), characters: Array.from(context.characterAssignments),
    focus: context.selectedCharacterSeatIndex, count: context.playerCount, selectValue: nodes.setupPlayerCount.value });
  return { context, nodes, requests, renders, click, choose, snapshot };
}

function stubReturnToSetup(f) {
  f.nodes.cardRevealStage = new Element();
  Object.assign(f.context, {
    busy: false, specialCellsFollowUpActive: false, rewardPresentationEpoch: 0, rewardPresentationQueues: new Map(),
    currentDiceRewardOriginPoint: null, movePlanPresentation: null, pendingStudentAssetSettlements: [],
    sessionDicePackSnapshot: {}, sessionNodeRewardPackSnapshot: {}, sessionClassroomEventProgramSnapshot: {}, sessionCardCatalogSnapshot: {},
    lastSessionSummary: null, CLOUD_HARBOR_WORLD_REF: 'world.ximitu.cloud-harbor@1.3.0',
    THEME_PACKS: { 'cloud-harbor': { id: 'cloud-harbor' } },
    playerAssetsLedger: {}, fairyState: {}, persistStableSession: () => {},
    runtime: { teams: [] }, createPrototypeRuntime: () => ({ teams: [] }), createPlayerAssetsLedger: () => ({}),
    createFairyState: () => ({}), initialBoardCamera: () => ({ x: 0, y: 0 }),
    clearSavedSession: () => assert.fail('clearSnapshot:false must preserve the original saved game'),
  });
  for (const name of ['cancelPendingDiceChoice', 'cancelPendingRouteChoice', 'cancelPendingCoinExchangeChoice',
    'destroySentenceListener', 'hideTurnFeedback', 'hideTurnShowtime', 'activateWorldComposition',
    'syncVisiblePlayerAssets', 'resetSpeechAttemptTracking', 'render']) f.context[name] = () => {};
  runInContext(functionSource('returnToSetup'), f.context);
}

test('actual student-card clicks retain UUID-bound roles when adding D and deleting B', () => {
  const f = fixture({ roster: profiles });
  f.click(D);
  assert.deepEqual(f.snapshot(), { selected: [A, B, C, D], characters: [...characterIds.slice(0, 3), null],
    focus: 3, count: 4, selectValue: '4' });
  f.choose(3, characterIds[3]);
  f.context.selectedCharacterSeatIndex = 2;
  f.click(B);
  assert.deepEqual(f.snapshot(), { selected: [A, C, D], characters: [characterIds[0], characterIds[2], characterIds[3]],
    focus: 1, count: 3, selectValue: '3' });
  assert.equal(f.context.selectedStudentIds[f.context.selectedCharacterSeatIndex], C, 'focus follows the surviving student UUID');
});

test('clearing the roster drops removed roles and reselecting starts an unassigned student', () => {
  const f = fixture();
  for (const id of [A, B, C]) f.click(id);
  assert.deepEqual(f.snapshot(), { selected: [], characters: [null], focus: 0, count: 1, selectValue: '1' });
  f.click(B);
  assert.deepEqual(f.snapshot(), { selected: [B], characters: [null], focus: 0, count: 1, selectValue: '1' });
});

test('successful create appends an unassigned student without resetting existing roles', async () => {
  const f = fixture({ roster: profiles.slice(0, 3), fetchImpl: async (url, options) => {
    assert.equal(url, '/api/student-profiles/v1');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { expectedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'D' });
    return Response.json({ student: profile(D, 'D') });
  } });
  f.nodes.studentCreateName.value = ' D ';
  await f.context.createStudentProfile();
  assert.deepEqual(f.snapshot(), { selected: [A, B, C, D], characters: [...characterIds.slice(0, 3), null],
    focus: 3, count: 4, selectValue: '4' });
  assert.equal(f.nodes.studentCreateName.value, '');
  assert.equal(f.context.studentCreateBusy, false);
});

test('creating a ninth profile preserves all eight selected roles and the existing focused UUID', async () => {
  const selected = Array.from({ length: 8 }, (_, index) => studentId(index + 1));
  const ninth = profile(studentId(9), 'Ninth');
  const f = fixture({ selected, assignments: characterIds.slice(0, 8), focus: 5,
    roster: selected.map((id, index) => profile(id, `Student ${index + 1}`)),
    fetchImpl: async () => Response.json({ student: ninth }) });
  const before = f.snapshot();
  f.nodes.studentCreateName.value = 'Ninth';
  await f.context.createStudentProfile();
  assert.deepEqual(f.snapshot(), before);
  assert.ok(f.context.studentProfiles.some(student => student.id === ninth.id));
  assert.equal(f.nodes.studentProfileList.children.find(card => card.dataset.studentId === ninth.id).disabled, true);
  assert.equal(f.context.studentProfilesError, '');
});

test('a pending create response merges into the latest roster and latest role assignments', async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const f = fixture({ roster: profiles.filter(student => student.id !== D), fetchImpl: () => response });
  f.nodes.studentCreateName.value = 'D';
  const creating = f.context.createStudentProfile();
  assert.equal(f.context.studentCreateBusy, true);
  f.click(B);
  f.click(E);
  f.choose(2, characterIds[4]);
  assert.deepEqual(f.snapshot().selected, [A, C, E]);
  resolve(Response.json({ student: profile(D, 'D') }));
  await creating;
  assert.deepEqual(f.snapshot(), { selected: [A, C, E, D], characters: [characterIds[0], characterIds[2], characterIds[4], null],
    focus: 3, count: 4, selectValue: '4' });
});

test('profile refresh removes unavailable UUIDs while preserving surviving roles and focus', async () => {
  const f = fixture({ fetchImpl: async (url, options) => {
    assert.equal(url, '/api/student-profiles/v1');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options), ['cache']);
    return Response.json({ schemaVersion: 'student-profiles.v1', students: [profile(C, 'C renamed'), profile(A, 'A'), profile(E, 'E')] });
  } });
  assert.equal(await f.context.loadStudentProfiles(), true);
  assert.deepEqual(f.snapshot(), { selected: [A, C], characters: [characterIds[0], characterIds[2]],
    focus: 1, count: 2, selectValue: '2' });
  assert.equal(f.context.studentProfilesLoaded, true);
});

test('PLAYING roster normalization cannot alter the characters locked into the saved game', async () => {
  const f = fixture({ screen: 'PLAYING', fetchImpl: async () => Response.json({
    schemaVersion: 'student-profiles.v1', students: [profile(C, 'C'), profile(A, 'A'), profile(D, 'D')],
  }) });
  const characters = f.context.characterAssignments;
  const savedGame = structuredClone(f.context.gameSession);
  const count = f.context.playerCount, focus = f.context.selectedCharacterSeatIndex;
  await f.context.loadStudentProfiles();
  assert.deepEqual(Array.from(f.context.selectedStudentIds), [A, C]);
  assert.strictEqual(f.context.characterAssignments, characters, 'the original saved role array remains intact');
  assert.deepEqual(Array.from(f.context.characterAssignments), characterIds.slice(0, 3));
  assert.deepEqual(f.context.gameSession, savedGame);
  assert.equal(f.context.playerCount, count);
  assert.equal(f.context.selectedCharacterSeatIndex, focus);
});

test('RESULTS roster normalization also keeps the completed game roles intact', async () => {
  const f = fixture({ screen: 'RESULTS', fetchImpl: async () => Response.json({
    schemaVersion: 'student-profiles.v1', students: [profile(C, 'C'), profile(A, 'A')],
  }) });
  const characters = f.context.characterAssignments;
  const savedGame = structuredClone(f.context.gameSession);
  await f.context.loadStudentProfiles();
  assert.deepEqual(Array.from(f.context.selectedStudentIds), [A, C]);
  assert.strictEqual(f.context.characterAssignments, characters);
  assert.deepEqual(Array.from(f.context.characterAssignments), characterIds.slice(0, 3));
  assert.deepEqual(f.context.gameSession, savedGame);
  assert.equal(f.context.playerCount, 3);
  assert.equal(f.context.selectedCharacterSeatIndex, 2);
});

test('returning from a restored game aligns seat UUIDs before editing a stale setup roster', async () => {
  const restoredCharacters = [characterIds[5], characterIds[8]];
  const f = fixture({ selected: [A, B], assignments: restoredCharacters, focus: 1, screen: 'PLAYING' });
  const restoredSession = Object.freeze({ screen: 'PLAYING', assetGameId: 'restored-game',
    seats: Object.freeze([Object.freeze({ id: A, teamId: `player-${A}` }), Object.freeze({ id: C, teamId: `player-${C}` })]),
    processedAttemptIds: Object.freeze(['saved-turn']) });
  assert.ok(restoredSession.seats.every(seat => !Object.hasOwn(seat, 'characterId')),
    'real restored seats bind UUIDs; the saved character array separately follows that seat order');
  const savedRaw = JSON.stringify({ gameSession: restoredSession, characterAssignments: restoredCharacters,
    runtime: { teams: [{ id: `player-${A}`, nodeId: 'n20' }, { id: `player-${C}`, nodeId: 'n32' }] } });
  const savedStorage = new Map([['local-session', savedRaw]]), storageWrites = [];
  f.nodes.cardRevealStage = new Element();
  Object.assign(f.context, {
    gameSession: restoredSession, busy: false, specialCellsFollowUpActive: false, rewardPresentationEpoch: 7, rewardPresentationQueues: new Map(),
    currentDiceRewardOriginPoint: null, movePlanPresentation: null, pendingStudentAssetSettlements: [],
    sessionDicePackSnapshot: {}, sessionNodeRewardPackSnapshot: {}, sessionClassroomEventProgramSnapshot: {}, sessionCardCatalogSnapshot: {},
    lastSessionSummary: null, CLOUD_HARBOR_WORLD_REF: 'world.ximitu.cloud-harbor@1.3.0',
    THEME_PACKS: { 'cloud-harbor': { id: 'cloud-harbor' } },
    runtime: { teams: [{ id: `player-${A}`, nodeId: 'n20' }, { id: `player-${C}`, nodeId: 'n32' }] },
    playerAssetsLedger: {}, fairyState: {},
    persistStableSession: (_runtime, _session, _assets, _fairy, options) => {
      assert.equal(options.autoResumeOnReload, false);
      const snapshot = JSON.parse(savedStorage.get('local-session'));
      snapshot.autoResumeOnReload = false;
      savedStorage.set('local-session', JSON.stringify(snapshot));
      storageWrites.push('local-session');
    },
    createPrototypeRuntime: () => ({ teams: [{ id: 'preview-a', nodeId: 'n01' }, { id: 'preview-c', nodeId: 'n01' }] }),
    createPlayerAssetsLedger: () => ({}), createFairyState: () => ({}), initialBoardCamera: () => ({ x: 0, y: 0 }),
    window: { localStorage: { getItem: key => savedStorage.get(key) || null,
      setItem: (key, value) => { storageWrites.push(key); savedStorage.set(key, value); } } },
    clearSavedSession: () => assert.fail('clearSnapshot:false must preserve the original saved game'),
  });
  for (const name of ['cancelPendingDiceChoice', 'cancelPendingRouteChoice', 'cancelPendingCoinExchangeChoice',
    'destroySentenceListener', 'hideTurnFeedback', 'hideTurnShowtime', 'activateWorldComposition',
    'syncVisiblePlayerAssets', 'resetSpeechAttemptTracking', 'render']) f.context[name] = () => {};
  runInContext(functionSource('returnToSetup'), f.context);
  await f.context.returnToSetup({ clearSnapshot: false });
  assert.equal(f.context.gameSession, null);
  assert.deepEqual(f.snapshot(), { selected: [A, C], characters: restoredCharacters, focus: 1, count: 2, selectValue: '2' });
  f.click(D);
  assert.deepEqual(f.snapshot(), { selected: [A, C, D], characters: [...restoredCharacters, null],
    focus: 2, count: 3, selectValue: '3' });
  assert.equal(JSON.stringify({ gameSession: restoredSession, characterAssignments: restoredCharacters,
    runtime: { teams: [{ id: `player-${A}`, nodeId: 'n20' }, { id: `player-${C}`, nodeId: 'n32' }] } }), savedRaw);
  const pausedSnapshot = JSON.parse(savedStorage.get('local-session'));
  assert.equal(pausedSnapshot.autoResumeOnReload, false);
  delete pausedSnapshot.autoResumeOnReload;
  assert.deepEqual(pausedSnapshot, JSON.parse(savedRaw));
  assert.deepEqual(storageWrites, ['local-session'], 'pause changes only the reload preference; setup edits preserve the played snapshot');
});

test('returning before the first roster GET preserves restored roles through loading and adding D', async () => {
  let resolve;
  const pendingResponse = new Promise(done => { resolve = done; });
  const restoredCharacters = [characterIds[5], characterIds[8]];
  const f = fixture({ selected: [A, C], assignments: restoredCharacters, roster: [], loaded: false,
    focus: 1, screen: 'PLAYING', fetchImpl: () => pendingResponse });
  stubReturnToSetup(f);
  await f.context.returnToSetup({ clearSnapshot: false });
  const expected = { selected: [A, C], characters: restoredCharacters, focus: 1, count: 2, selectValue: '2' };
  assert.deepEqual(f.snapshot(), expected);
  assert.equal(f.context.selectedStudentProfiles().length, 0, 'preserved UUIDs do not fabricate a loaded roster for the start gate');
  const loading = f.context.loadStudentProfiles();
  assert.equal(f.context.studentProfilesLoading, true);
  assert.deepEqual(f.snapshot(), expected);
  resolve(Response.json({ schemaVersion: 'student-profiles.v1', students: [profile(C, 'C'), profile(A, 'A'), profile(D, 'D')] }));
  assert.equal(await loading, true);
  assert.deepEqual(f.snapshot(), expected);
  assert.deepEqual(Array.from(f.context.selectedStudentProfiles(), student => student.id), [A, C]);
  f.click(D);
  assert.deepEqual(f.snapshot(), { selected: [A, C, D], characters: [...restoredCharacters, null],
    focus: 2, count: 3, selectValue: '3' });
});

test('a failed first roster load preserves restored roles, then a successful list can remove a truly missing UUID', async () => {
  let attempt = 0;
  const restoredCharacters = [characterIds[5], characterIds[8]];
  const f = fixture({ selected: [A, C], assignments: restoredCharacters, roster: [], loaded: false,
    focus: 1, screen: 'PLAYING', fetchImpl: async () => ++attempt === 1
      ? Response.json({ message: 'temporarily offline' }, { status: 503 })
      : Response.json({ schemaVersion: 'student-profiles.v1', students: [profile(D, 'D'), profile(A, 'A')] }) });
  stubReturnToSetup(f);
  await f.context.returnToSetup({ clearSnapshot: false });
  const beforeLoad = f.snapshot();
  assert.equal(await f.context.loadStudentProfiles(), false);
  assert.equal(f.context.studentProfilesLoaded, false);
  assert.deepEqual(f.snapshot(), beforeLoad);
  assert.equal(f.context.selectedStudentProfiles().length, 0);
  assert.equal(await f.context.loadStudentProfiles(), true);
  assert.equal(f.context.studentProfilesLoaded, true);
  assert.deepEqual(f.snapshot(), { selected: [A], characters: [restoredCharacters[0]], focus: 0, count: 1, selectValue: '1' });
  assert.deepEqual(Array.from(f.context.selectedStudentProfiles(), student => student.id), [A]);
});

test('failed create responses and network failures leave the roster, roles and focus unchanged', async () => {
  for (const fetchImpl of [async () => Response.json({ message: 'save rejected' }, { status: 409 }),
    async () => { throw new TypeError('offline'); }]) {
    const f = fixture({ fetchImpl });
    const before = f.snapshot(), rosterBefore = structuredClone(f.context.studentProfiles);
    f.nodes.studentCreateName.value = 'New';
    await f.context.createStudentProfile();
    assert.deepEqual(f.snapshot(), before);
    assert.deepEqual(f.context.studentProfiles, rosterBefore);
    assert.equal(f.context.studentCreateBusy, false);
    assert.ok(f.context.studentProfilesError);
  }
});

test('the real character normalizer rejects duplicate roles after a roster change', () => {
  const f = fixture({ assignments: [characterIds[0], characterIds[0], 'invalid-character'] });
  f.click(D);
  assert.deepEqual(f.snapshot().characters, [characterIds[0], null, null, null]);
  f.choose(3, characterIds[0]);
  f.click(B);
  const characters = f.snapshot().characters.filter(Boolean);
  assert.equal(characters.length, new Set(characters).size);
  assert.deepEqual(f.snapshot().characters, [null, null, characterIds[0]]);
});
