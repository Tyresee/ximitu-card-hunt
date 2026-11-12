import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { BOARD_TEMPLATE, THEME_PACKS } from '../public/prototypes/universal-board/packs.js';
import * as snapshots from '../public/prototypes/universal-board/cloud-harbor-published-snapshots.js';
import { CRYSTAL_BOARD_TEMPLATE_V221, CRYSTAL_THEME_V221 } from '../public/prototypes/universal-board/crystal-harbor-v221-snapshots.js';
import * as crystalSnapshots from '../public/prototypes/universal-board/crystal-harbor-published-snapshots.js';
import {
  CLOUD_HARBOR_WORLD_REF, PREVIOUS_CLOUD_HARBOR_WORLD_REF,
  PREVIOUS_XIMITU_WORLD_ROUTE_REF, LEGACY_CLOUD_HARBOR_WORLD_REF,
  LEGACY_XIMITU_WORLD_ROUTE_REF, WORLD_ROUTES, WORLD_REGISTRIES,
  XIMITU_WORLD_ROUTE, isCloudHarborWorldRef, isGameOwnedLayoutWorldRef,
  CRYSTAL_V120_WORLD_REF, CRYSTAL_V120_ROUTE_REF, CRYSTAL_V121_WORLD_REF, CRYSTAL_V121_ROUTE_REF,
} from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition, walkWorldPlan, commitSharedExpedition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { createBoardLayoutDraft, normalizeBoardLayoutDraft } from '../public/prototypes/universal-board/board-layout-editor-core.js';
import { withClayPreviewTheme } from '../public/prototypes/universal-board/clay-preview.js';
import {
  DEFAULT_NODE_REWARD_PACK, normalizeNodeRewardPack, retargetNodeRewardPack,
  updateNodeRewardPolicy, nodeRewardPolicy,
} from '../public/prototypes/universal-board/node-reward-pack-core.js';

const app = fs.readFileSync(new URL('../public/prototypes/universal-board/app.js', import.meta.url), 'utf8');
function appFunctionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const tail = app.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /) + 1;
  return `${app.slice(start - 6, start) === "async " ? "async " : ""}${tail.slice(0, end)}`;
}
function appFunction(name, bindings) {
  return Function(...Object.keys(bindings), `return (${appFunctionSource(name)});`)(...Object.values(bindings));
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('published 2.1 geometry, art, world, route and release are independent immutable snapshots', () => {
  const expected = {
    PREVIOUS_BOARD_TEMPLATE_V21: '085d50277cb3abd127f94010c436e9acdd0c28cfd1d989ac35f188ba41320019',
    PREVIOUS_CLOUD_HARBOR_THEME_V21: '7a6204b9075f6359b1ca3f07d1babb763b6998b7456d5208eab2566bcc801075',
    PREVIOUS_CLOUD_HARBOR_WORLD_V11: 'b42248d9e43bc8bb049ddb6836bfb4d30d6592ebf19274345efd683e7ca36e0b',
    PREVIOUS_XIMITU_WORLD_ROUTE: 'a5c0480bef876ccbe00266a74002c1207e0584826ac15c02af4ccb8b5f83ea1c',
    PREVIOUS_XIMITU_GAME_RELEASE: '46aa08d2306c1226ce7b86fc18b7bf96baeb9782f5834344ae4ea37b0c9389da',
  };
  for (const [name, digest] of Object.entries(expected)) assert.equal(hash(snapshots[name]), digest, name);
  assert.throws(() => { snapshots.PREVIOUS_BOARD_TEMPLATE_V21.nodes[0].x = 0; }, TypeError);
  assert.notStrictEqual(BOARD_TEMPLATE.nodes[0], snapshots.PREVIOUS_BOARD_TEMPLATE_V21.nodes[0]);
  const old = resolveWorldComposition(PREVIOUS_CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES);
  assert.deepEqual(old.board, snapshots.PREVIOUS_BOARD_TEMPLATE_V21);
  assert.deepEqual(old.theme, snapshots.PREVIOUS_CLOUD_HARBOR_THEME_V21);
});

test('published crystal 2.2.0 sessions keep exact immutable geometry, theme, world and route', () => {
  const expected = {
    CRYSTAL_BOARD_TEMPLATE_V220: '4e06230e580df9561a0f492affc1e26721bf13dc0fd026986aa2bc3cd9cd8d85',
    CRYSTAL_THEME_V220: 'a0a01b9cb3fb7a51d63197cb80d5e553c3989c8a02eba9bc162b653dd0cfc586',
    CRYSTAL_WORLD_V120: '5550c1ea24e70a822f19634f62967f4bbb4f6e1707b6f7dba6e4d3fa38691735',
    CRYSTAL_WORLD_ROUTE_V120: '3cc4dd434623521e94745ebc1c6ca94715016f9c7c0c4de928d9cf1efad42d36',
    CRYSTAL_GAME_RELEASE_V220: '93501154753447f42347db683ff64c56ae8b8bf2263b97cac4e87110fa2253ab',
  };
  for (const [name, digest] of Object.entries(expected)) assert.equal(hash(crystalSnapshots[name]), digest, name);
  assert.throws(() => { crystalSnapshots.CRYSTAL_BOARD_TEMPLATE_V220.nodes[0].x = 0; }, TypeError);
  const old = resolveWorldComposition(CRYSTAL_V120_WORLD_REF, WORLD_REGISTRIES);
  assert.deepEqual(old.board, crystalSnapshots.CRYSTAL_BOARD_TEMPLATE_V220);
  assert.deepEqual(old.theme, crystalSnapshots.CRYSTAL_THEME_V220);
  assert.strictEqual(WORLD_ROUTES[CRYSTAL_V120_ROUTE_REF], crystalSnapshots.CRYSTAL_WORLD_ROUTE_V120);
  assert.notStrictEqual(BOARD_TEMPLATE.nodes[0], old.board.nodes[0]);
  const draft = createBoardLayoutDraft(old.board, { worldRef: CRYSTAL_V120_WORLD_REF });
  assert.ok(normalizeBoardLayoutDraft(old.board, draft, { worldRef: CRYSTAL_V120_WORLD_REF }));
  assert.equal(normalizeBoardLayoutDraft(BOARD_TEMPLATE, draft, { worldRef: CLOUD_HARBOR_WORLD_REF }), null);
});

test('crystal geometry preserves every node rule, edge rule, transport and forward exit', () => {
  const project = (board) => ({
    nodes: board.nodes.map(({ x, y, ...rule }) => rule),
    edges: board.edges.map(({ pathData, ...rule }) => rule),
    entry: board.entry, exits: board.exits, startNodeId: board.startNodeId,
  });
  assert.deepEqual(project(CRYSTAL_BOARD_TEMPLATE_V221), project(snapshots.PREVIOUS_BOARD_TEMPLATE_V21));
  assert.deepEqual(project(CRYSTAL_BOARD_TEMPLATE_V221), project(crystalSnapshots.CRYSTAL_BOARD_TEMPLATE_V220));
  assert.equal(CRYSTAL_BOARD_TEMPLATE_V221.version, '2.2.1');
  assert.equal(CRYSTAL_THEME_V221.version, '2.2.1');
  assert.equal(CRYSTAL_BOARD_TEMPLATE_V221.edges.filter(({ pathData }) => pathData).length, 65);
});

test('saved 1.1 layouts validate only against their exact board and cannot move crystal nodes', () => {
  const oldDraft = createBoardLayoutDraft(snapshots.PREVIOUS_BOARD_TEMPLATE_V21, { worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF });
  oldDraft.nodePositions.n01 = { x: 85, y: 520 };
  assert.ok(normalizeBoardLayoutDraft(snapshots.PREVIOUS_BOARD_TEMPLATE_V21, oldDraft, { worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF }));
  assert.equal(normalizeBoardLayoutDraft(BOARD_TEMPLATE, oldDraft, { worldRef: CLOUD_HARBOR_WORLD_REF }), null);
});

test('old published reward settings retarget only refs and old session snapshots remain exact', () => {
  for (const oldWorldRef of [PREVIOUS_CLOUD_HARBOR_WORLD_REF, CRYSTAL_V120_WORLD_REF, CRYSTAL_V121_WORLD_REF]) {
    const oldDefault = retargetNodeRewardPack(DEFAULT_NODE_REWARD_PACK, oldWorldRef);
    const old = updateNodeRewardPolicy(oldDefault, oldWorldRef, 'n02', { type: 'coin', amount: 3 });
    const before = JSON.stringify(old);
    const current = retargetNodeRewardPack(old);
    assert.deepEqual(nodeRewardPolicy(current, CLOUD_HARBOR_WORLD_REF, 'n02'), { type: 'coin', amount: 3 });
    assert.deepEqual(current.worlds[CLOUD_HARBOR_WORLD_REF].nodes, old.worlds[oldWorldRef].nodes);
    assert.equal(JSON.stringify(old), before);
    const normalizeSnapshot = appFunction('normalizeSessionNodeRewardPackSnapshot', { normalizeNodeRewardPack });
    const snapshot = { schemaVersion: 'node-reward-pack-session-snapshot.v1', revision: 'published-revision-old', pack: old };
    assert.deepEqual(normalizeSnapshot(snapshot), snapshot);
    assert.deepEqual(retargetNodeRewardPack(current, oldWorldRef), old);
    const mixed = structuredClone(current);
    mixed.worlds[oldWorldRef] = old.worlds[oldWorldRef];
    assert.throws(() => normalizeNodeRewardPack(mixed));
  }
});

test('restoring an old harbor chooses its saved theme and exact route, then crosses normally', () => {
  for (const [worldRef, routeRef] of [
    [PREVIOUS_CLOUD_HARBOR_WORLD_REF, PREVIOUS_XIMITU_WORLD_ROUTE_REF],
    [CRYSTAL_V120_WORLD_REF, CRYSTAL_V120_ROUTE_REF],
    [CRYSTAL_V121_WORLD_REF, CRYSTAL_V121_ROUTE_REF],
    [CLOUD_HARBOR_WORLD_REF, `${XIMITU_WORLD_ROUTE.id}@${XIMITU_WORLD_ROUTE.version}`],
  ]) {
    const runtime = { world: { routeRef } };
    const selectRoute = appFunction('currentWorldRoute', { runtime, WORLD_ROUTES, XIMITU_WORLD_ROUTE });
    const route = selectRoute();
    assert.equal(`${route.id}@${route.version}`, routeRef);
    const composition = resolveWorldComposition(worldRef, WORLD_REGISTRIES);
    const selectTheme = appFunction('composedThemeForWorld', {
      isCloudHarborWorldRef, THEME_PACKS, withClayPreviewTheme, CLAY_PREVIEW_REQUESTED: false,
    });
    assert.deepEqual(selectTheme(composition, THEME_PACKS['cloud-harbor']), composition.theme);
    const plan = walkWorldPlan({ moveId: `cross-${worldRef}`, worldInstanceId: 'old:world:1', nextWorldInstanceId: 'old:world:2', worldOrdinal: 1, worldRef, startNodeId: 'n47', steps: 6, worldRoute: route, registries: WORLD_REGISTRIES });
    const world = { schemaVersion: 'world-runtime.v1', routeRef, active: { worldPackRef: worldRef, instanceId: 'old:world:1', ordinal: 1, mapState: {}, levelState: {} }, completed: [], processedTransitionIds: [] };
    const committed = commitSharedExpedition({ worldRuntime: world, teams: [{ id: 'p1', nodeId: 'n47' }], activeTeamId: 'p1', plan });
    assert.equal(plan.stepsConsumed, 6);
    assert.equal(committed.worldRuntime.routeRef, routeRef);
    assert.equal(committed.worldRuntime.active.worldPackRef, 'world.ximitu.beyond-cloud@1.0.0');
  }
});

test('v7 migration keeps its historic v8 composition rather than silently adopting crystal', () => {
  const migrate = appFunction('migratedV7Snapshot', { LOCAL_SESSION_SCHEMA_VERSION: 12, LEGACY_XIMITU_WORLD_ROUTE_REF, LEGACY_CLOUD_HARBOR_WORLD_REF, PREVIOUS_CLOUD_HARBOR_WORLD_REF, PREVIOUS_XIMITU_WORLD_ROUTE_REF });
  const input = { schemaVersion: 7, runtime: { world: { routeRef: LEGACY_XIMITU_WORLD_ROUTE_REF, active: { worldPackRef: LEGACY_CLOUD_HARBOR_WORLD_REF }, completed: [] } } };
  const next = migrate(input);
  assert.equal(next.runtime.world.active.worldPackRef, PREVIOUS_CLOUD_HARBOR_WORLD_REF);
  assert.equal(next.runtime.world.routeRef, PREVIOUS_XIMITU_WORLD_ROUTE_REF);
  assert.equal(input.runtime.world.active.worldPackRef, LEGACY_CLOUD_HARBOR_WORLD_REF);
});


test('new layout edits use game storage while old drafts and World 02 keep their existing owner', async () => {
  const endpoint = appFunction('boardLayoutEndpointForWorld', { isGameOwnedLayoutWorldRef });
  assert.equal(endpoint(CLOUD_HARBOR_WORLD_REF), '/games/monopoly/api/board-layouts/v1');
  assert.equal(endpoint(CLOUD_HARBOR_WORLD_REF, { admin: true }), '/games/monopoly/api/admin/board-layouts/v1');
  assert.equal(endpoint(CRYSTAL_V120_WORLD_REF, { admin: true }), '/games/monopoly/api/admin/board-layouts/v1');
  assert.equal(endpoint(PREVIOUS_CLOUD_HARBOR_WORLD_REF, { admin: true }), '/api/admin/board-layouts/v1');
  assert.equal(endpoint('world.ximitu.beyond-cloud@1.0.0', { admin: true }), '/api/admin/board-layouts/v1');
  for (const [name, prefix] of [['layoutEditorDraftStorageKey', 'LOCAL_LAYOUT_DRAFT_PREFIX'], ['layoutEditorAppliedStorageKey', 'LOCAL_LAYOUT_APPLIED_PREFIX']]) {
    const storageKey = appFunction(name, { isGameOwnedLayoutWorldRef, [prefix]: 'storage:' });
    assert.equal(storageKey(PREVIOUS_CLOUD_HARBOR_WORLD_REF), 'storage:world.ximitu.cloud-harbor');
    assert.equal(storageKey(CRYSTAL_V120_WORLD_REF), 'storage:world.ximitu.cloud-harbor@1.2.0');
    assert.equal(storageKey(CRYSTAL_V121_WORLD_REF), 'storage:world.ximitu.cloud-harbor@1.2.1');
    assert.equal(storageKey(CLOUD_HARBOR_WORLD_REF), 'storage:world.ximitu.cloud-harbor@1.3.0');
  }
  const schema = 'board-layout-registry.v1';
  const oldLayout = { worldRef: PREVIOUS_CLOUD_HARBOR_WORLD_REF, revision: 'old' };
  const newLayout = { worldRef: CLOUD_HARBOR_WORLD_REF, revision: 'new' };
  const crystalLayout = { worldRef: CRYSTAL_V120_WORLD_REF, revision: 'original-crystal' };
  let published = null;
  const load = appFunction('loadPublishedBoardLayouts', {
    boardLayoutRegistryError: '', renderLayoutRegistryStatus: () => {},
    CLOUD_HARBOR_WORLD_REF, isGameOwnedLayoutWorldRef,
    BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION: schema,
    boardLayoutEndpointForWorld: endpoint,
    fetch: async (url) => ({ ok: true, json: async () => ({ schemaVersion: schema,
      layouts: url.startsWith('/games/') ? [newLayout, crystalLayout, { ...oldLayout, revision: 'wrong-owner' }]
        : [oldLayout, { ...newLayout, revision: 'wrong-owner' }, { ...crystalLayout, revision: 'wrong-owner' }],
    }) }),
    applyBoardLayoutRegistryPayload: (value) => { published = value; return true; },
  });
  assert.equal(await load(), true);
  assert.deepEqual(published.layouts, [oldLayout, newLayout, crystalLayout]);
  let appliedFailure = false;
  const failedLoad = appFunction('loadPublishedBoardLayouts', {
    boardLayoutRegistryError: '', renderLayoutRegistryStatus: () => {},
    CLOUD_HARBOR_WORLD_REF, isGameOwnedLayoutWorldRef, BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION: schema,
    boardLayoutEndpointForWorld: endpoint,
    fetch: async (url) => ({ ok: !url.startsWith('/games/') }),
    applyBoardLayoutRegistryPayload: () => { appliedFailure = true; },
  });
  assert.equal(await failedLoad(), false);
  assert.equal(appliedFailure, false);
});


test('layout GET failure is visible, preserves confirmed cache and original drafts, and blocks rebinding or publishing', async () => {
  const originalDraft = { marker: 'untouched-local-draft' };
  let draftReads = 0;
  let draftWrites = 0;
  let requests = 0;
  const nodes = { layoutRegistryError: { hidden: true, textContent: '' }, layoutEditorOpen: { disabled: false } };
  const state = vm.createContext({
    CLOUD_HARBOR_WORLD_REF, isGameOwnedLayoutWorldRef, BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION: 'board-layout-registry.v1',
    boardLayoutRegistryLoaded: true, boardLayoutRegistryError: '',
    qaControlsEnabled: false, QA_PAGE_REQUESTED: false, authenticatedUserId: 'owner',
    layoutEditor: { active: true, draft: originalDraft, saving: false },
    LAYOUT_EDITOR_WORLD_REFS: [CLOUD_HARBOR_WORLD_REF],
    nodes,
    cloneLayoutEditorDraft: structuredClone,
    loadLocalAuthoringDraft: () => { draftReads += 1; },
    persistLocalAuthoringDraft: () => { draftWrites += 1; },
    syncLayoutEditorControls: () => {},
    applyBoardLayoutRegistryPayload: () => { throw new Error('must not replace confirmed cache on failure'); },
    fetch: async () => { requests += 1; return { ok: false }; },
  });
  vm.runInContext(['boardLayoutEndpointForWorld', 'layoutEditingAvailable', 'renderLayoutRegistryStatus',
    'loadPublishedBoardLayouts', 'loadLayoutEditorDraft', 'persistLayoutEditorDraft',
    'publishLayoutEditorDraft', 'openLayoutEditor', 'switchLayoutEditorWorld', 'saveLayoutEditorDraft',
  ].map(appFunctionSource).join('\n'), state);
  assert.equal(await state.loadPublishedBoardLayouts(), false);
  assert.equal(state.boardLayoutRegistryLoaded, true, 'retain successfully read cache');
  assert.equal(state.layoutEditingAvailable(), false);
  assert.match(nodes.layoutRegistryError.textContent, /原草稿已保留/);
  assert.equal(nodes.layoutRegistryError.hidden, false);
  assert.equal(nodes.layoutEditorOpen.disabled, true);
  state.openLayoutEditor();
  state.switchLayoutEditorWorld(CLOUD_HARBOR_WORLD_REF);
  assert.deepEqual(state.loadLayoutEditorDraft(), originalDraft);
  assert.equal(state.persistLayoutEditorDraft(), false);
  await state.saveLayoutEditorDraft();
  await assert.rejects(state.publishLayoutEditorDraft(), /原草稿已保留/);
  assert.equal(draftReads, 0);
  assert.equal(draftWrites, 0);
  assert.equal(requests, 2, 'no PUT after failed GET');
  assert.strictEqual(state.layoutEditor.draft, originalDraft);
  state.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 'board-layout-registry.v1', layouts: [] }) });
  state.applyBoardLayoutRegistryPayload = () => true;
  assert.equal(await state.loadPublishedBoardLayouts(), true);
  assert.equal(nodes.layoutRegistryError.hidden, true);
  assert.equal(nodes.layoutEditorOpen.disabled, false);
  assert.equal(state.layoutEditingAvailable(), true);
});

test('anonymous local QA still edits locally while authenticated QA waits for the game registry', () => {
  const available = (overrides = {}) => appFunction('layoutEditingAvailable', {
    boardLayoutRegistryError: '', boardLayoutRegistryLoaded: false,
    qaControlsEnabled: true, QA_PAGE_REQUESTED: true, authenticatedUserId: null,
    ...overrides,
  })();
  assert.equal(available(), true);
  assert.equal(available({ authenticatedUserId: 'fixture-owner' }), false);
  assert.equal(available({ authenticatedUserId: 'fixture-owner', boardLayoutRegistryLoaded: true }), true);
  assert.equal(available({ boardLayoutRegistryError: 'failed' }), false);
});
