import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../standalone/server.mjs';
import { BoardLayoutStore } from '../standalone/board-layout-store.mjs';
import { GAME_LAYOUT_READ_PATH as READ, GAME_LAYOUT_WRITE_PATH as WRITE } from '../standalone/board-layout-api.mjs';
import { CLOUD_HARBOR_WORLD_REF, CRYSTAL_V120_WORLD_REF, GAME_OWNED_LAYOUT_WORLD_REFS, WORLD_REGISTRIES } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';
import { createBoardLayoutDraft, updateBoardLayoutDraft } from '../public/prototypes/universal-board/board-layout-editor-core.js';

const ORIGIN = 'https://wordattack.timclass.cn';
const board = resolveWorldComposition(CLOUD_HARBOR_WORLD_REF, WORLD_REGISTRIES).board;
const validDraft = (offset = 7) => updateBoardLayoutDraft(board,
  createBoardLayoutDraft(board, { worldRef: CLOUD_HARBOR_WORLD_REF }),
  board.nodes[0].id, { x: board.nodes[0].x + offset, y: board.nodes[0].y },
  { worldRef: CLOUD_HARBOR_WORLD_REF });
const body = (draft = validDraft(), revision = null) => ({ expectedUserId: 'owner-fixture', expectedRevision: revision, draft });

async function fixture(t, override = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'game-layout-api-'));
  const authCalls = [];
  const fetchSession = async (url, options) => {
    authCalls.push({ url, cookie: options.headers.cookie });
    assert.equal(url, 'http://127.0.0.1:19321/api/auth/me');
    assert.equal(options.redirect, 'error');
    const id = options.headers.cookie === 'fixture=owner' ? 'owner-fixture'
      : options.headers.cookie === 'fixture=teacher' ? 'teacher-fixture' : null;
    return Response.json({ authenticated: Boolean(id), user: id ? { id, role: id === 'owner-fixture' ? 'owner' : 'teacher' } : null });
  };
  const server = createGameServer({ root: directory, dataDir: directory, fetchSession, ...override });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', cookie = 'fixture=owner', origin: requestOrigin = ORIGIN, json, raw, contentType = 'application/json' } = {}) => {
    const response = await fetch(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}), ...(method === 'PUT' ? { 'content-type': contentType } : {}) }, body: raw ?? (json === undefined ? undefined : JSON.stringify(json)), redirect: 'manual' });
    return { response, payload: await response.json() };
  };
  return { directory, origin, call, authCalls };
}

test('private game layout API uses platform auth and serves both exact crystal versions', async t => {
  const f = await fixture(t);
  for (const path of [READ, WRITE]) {
    const r = await f.call(path, { method: path === WRITE ? 'PUT' : 'GET', cookie: '', json: path === WRITE ? body() : undefined });
    assert.equal(r.response.status, 401);
    assert.equal(r.payload.error, 'auth_required');
    assert.equal(r.response.headers.get('set-cookie'), null);
  }
  const initial = await f.call(READ);
  assert.equal(initial.response.status, 200);
  assert.equal(initial.response.headers.get('cache-control'), 'no-store');
  assert.equal(initial.payload.schemaVersion, 'board-layout-registry.v1');
  assert.deepEqual(initial.payload.layouts.map(({ worldRef, status }) => ({ worldRef, status })), GAME_OWNED_LAYOUT_WORLD_REFS.map(worldRef => ({ worldRef, status: 'empty' })));
  const teacherRead = await f.call(READ, { cookie: 'fixture=teacher' });
  assert.equal(teacherRead.response.status, 200);
  const teacherWrite = await f.call(WRITE, { method: 'PUT', cookie: 'fixture=teacher', json: { ...body(), expectedUserId: 'teacher-fixture' } });
  assert.equal(teacherWrite.response.status, 403);
  assert.equal(teacherWrite.payload.error, 'auth_owner_required');
  assert.equal((await f.call(READ, { method: 'POST' })).response.status, 405);
  assert.equal((await f.call(WRITE)).response.status, 405);
});

test('private layout writes require exact origin, current identity and canonical schema', async t => {
  const f = await fixture(t);
  for (const origin of ['', 'null', 'https://evil.example', `${ORIGIN}.evil.example`]) {
    const r = await f.call(WRITE, { method: 'PUT', origin, json: body() });
    assert.equal(r.response.status, 403, origin);
    assert.equal(r.payload.error, 'origin_rejected');
  }
  const changed = await f.call(WRITE, { method: 'PUT', json: { ...body(), expectedUserId: 'old-owner' } });
  assert.equal(changed.response.status, 409);
  assert.equal(changed.payload.error, 'auth_context_changed');
  for (const invalid of [
    { ...body(), extra: true },
    { expectedUserId: 'owner-fixture', draft: validDraft() },
    body({ ...validDraft(), worldRef: 'world.ximitu.cloud-harbor@1.1.0' }),
    body({ ...validDraft(), boardRef: `${board.id}@2.1.0` }),
    body({ ...validDraft(), baseSignature: 'forged' }),
    body({ ...validDraft(), nodePositions: { n01: { x: 2399, y: 500 } } }),
    body({ ...validDraft(), nodePositions: { n01: { x: 130, y: 500, score: 100 } } }),
    body({ ...validDraft(), nodePositions: { nonexistent: { x: 130, y: 500 } } }),
  ]) assert.equal((await f.call(WRITE, { method: 'PUT', json: invalid })).response.status, 422);
  assert.equal((await f.call(WRITE, { method: 'PUT', raw: '{bad' })).response.status, 400);
  assert.equal((await f.call(WRITE, { method: 'PUT', raw: '[]' })).response.status, 422);
  assert.equal((await f.call(WRITE, { method: 'PUT', json: body(), contentType: 'text/plain' })).response.status, 415);
  assert.equal((await f.call(WRITE, { method: 'PUT', json: { ...body(), padding: 'x'.repeat(70_000) } })).response.status, 413);
  assert.equal((await f.call(READ)).payload.layouts[0].status, 'empty');
});

test('layout CAS rejects competing tabs, identical retry is stable, and disk survives restart', async t => {
  const f = await fixture(t);
  const first = await f.call(WRITE, { method: 'PUT', json: body() });
  assert.equal(first.response.status, 200);
  const revision = first.payload.layout.revision;
  assert.ok(revision);
  const retry = await f.call(WRITE, { method: 'PUT', json: body(validDraft(), revision) });
  assert.equal(retry.payload.layout.revision, revision);
  const attempts = await Promise.all([10, 15].map(offset => f.call(WRITE, { method: 'PUT', json: body(validDraft(offset), revision) })));
  assert.deepEqual(attempts.map(r => r.response.status).sort(), [200, 409]);
  assert.equal(attempts.find(r => r.response.status === 409).payload.error, 'board_layout_revision_conflict');
  const saved = attempts.find(r => r.response.status === 200).payload.layout;
  const dataDir = join(f.directory, 'board-layouts');
  const restarted = new BoardLayoutStore({ dataDir, boardsByWorldRef: { [CLOUD_HARBOR_WORLD_REF]: board } });
  assert.deepEqual((await restarted.read()).layouts[0], saved);
  assert.equal((await stat(join(dataDir, 'visual-layouts.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(dataDir), ['visual-layouts.json']);
  const persisted = JSON.parse(await readFile(join(dataDir, 'visual-layouts.json'), 'utf8'));
  assert.deepEqual(Object.keys(persisted.layouts), [CLOUD_HARBOR_WORLD_REF]);
  const teacher = await f.call(READ, { cookie: 'fixture=teacher' });
  assert.deepEqual(teacher.payload.layouts[0], saved);
});

test('upgrade preserves published 1.2.0 layouts and isolates new 1.2.1 writes and revisions', async t => {
  const f = await fixture(t);
  const dataDir = join(f.directory, 'board-layouts');
  const oldBoard = resolveWorldComposition(CRYSTAL_V120_WORLD_REF, WORLD_REGISTRIES).board;
  const oldDraft = offset => updateBoardLayoutDraft(oldBoard,
    createBoardLayoutDraft(oldBoard, { worldRef: CRYSTAL_V120_WORLD_REF }),
    oldBoard.nodes[0].id, { x: oldBoard.nodes[0].x + offset, y: oldBoard.nodes[0].y },
    { worldRef: CRYSTAL_V120_WORLD_REF });
  // Seed the file using precisely the previous service's single-version registry.
  const oldService = new BoardLayoutStore({ dataDir, boardsByWorldRef: { [CRYSTAL_V120_WORLD_REF]: oldBoard } });
  const savedOld = await oldService.save({ actorUserId: 'owner-fixture', expectedRevision: null, draft: oldDraft(4) });
  const filePath = join(dataDir, 'visual-layouts.json');
  const beforeUpgrade = await readFile(filePath, 'utf8');
  const initial = await f.call(READ);
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.payload.layouts.find(entry => entry.worldRef === CRYSTAL_V120_WORLD_REF), savedOld);
  assert.equal(initial.payload.layouts.find(entry => entry.worldRef === CLOUD_HARBOR_WORLD_REF).status, 'empty');
  assert.equal(await readFile(filePath, 'utf8'), beforeUpgrade, 'reading the upgrade never rewrites old data');
  const newSaved = await f.call(WRITE, { method: 'PUT', json: body() });
  assert.equal(newSaved.response.status, 200);
  const afterNew = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(afterNew.layouts[CRYSTAL_V120_WORLD_REF], JSON.parse(beforeUpgrade).layouts[CRYSTAL_V120_WORLD_REF]);
  const mismatched = await f.call(WRITE, { method: 'PUT', json: body({ ...oldDraft(5), worldRef: CLOUD_HARBOR_WORLD_REF }, newSaved.payload.layout.revision) });
  assert.equal(mismatched.response.status, 422, 'old geometry cannot be republished under a new world ref');
  const updates = await Promise.all([
    f.call(WRITE, { method: 'PUT', json: body(oldDraft(6), savedOld.revision) }),
    f.call(WRITE, { method: 'PUT', json: body(validDraft(9), newSaved.payload.layout.revision) }),
  ]);
  assert.deepEqual(updates.map(entry => entry.response.status), [200, 200]);
  const restarted = new BoardLayoutStore({ dataDir, boardsByWorldRef: Object.fromEntries(
    GAME_OWNED_LAYOUT_WORLD_REFS.map(worldRef => [worldRef, resolveWorldComposition(worldRef, WORLD_REGISTRIES).board]),
  ) });
  const entries = (await restarted.read()).layouts;
  for (const update of updates) assert.deepEqual(entries.find(entry => entry.worldRef === update.payload.layout.worldRef), update.payload.layout);
  assert.equal((await f.call(WRITE, { method: 'PUT', json: body(oldDraft(7), savedOld.revision) })).response.status, 409);
});

test('chunked body limit returns explicit 413 without committing any layout', async t => {
  const f = await fixture(t);
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(f.origin + WRITE, { method: 'PUT', headers: { cookie: 'fixture=owner', origin: ORIGIN, 'content-type': 'application/json' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.write('{"padding":"' + 'x'.repeat(40_000));
    request.end('x'.repeat(40_000) + '"}');
  });
  assert.equal(status, 413);
  assert.equal((await f.call(READ)).payload.layouts[0].status, 'empty');
});

test('platform outage and corrupt private store fail closed and preserve existing data', async t => {
  for (const fetchSession of [async () => { throw new Error('offline'); }, async () => new Response('no', { status: 503 }), async () => new Response('not json')]) {
    const f = await fixture(t, { fetchSession });
    const r = await f.call(READ);
    assert.equal(r.response.status, 503);
    assert.equal(r.payload.error, 'auth_service_unavailable');
  }
  const f = await fixture(t);
  await f.call(WRITE, { method: 'PUT', json: body() });
  const path = join(f.directory, 'board-layouts/visual-layouts.json');
  await writeFile(path, '{corrupt', 'utf8');
  for (const [pathName, options] of [[READ, {}], [WRITE, { method: 'PUT', json: body() }]]) {
    const r = await f.call(pathName, options);
    assert.equal(r.response.status, 500);
    assert.equal(r.payload.error, 'board_layout_store_corrupt');
  }
  assert.equal(await readFile(path, 'utf8'), '{corrupt');
});

test('changed base geometry leaves private data stale and rejects an old draft without overwriting it', async t => {
  const f = await fixture(t);
  const saved = await f.call(WRITE, { method: 'PUT', json: body() });
  const dataDir = join(f.directory, 'board-layouts');
  const changed = new BoardLayoutStore({ dataDir, boardsByWorldRef: { [CLOUD_HARBOR_WORLD_REF]: { ...board, version: '99.0.0' } } });
  const entry = (await changed.read()).layouts[0];
  assert.equal(entry.status, 'stale');
  assert.equal(entry.revision, saved.payload.layout.revision);
  assert.equal(entry.draft, null);
  await assert.rejects(changed.save({ actorUserId: 'owner-fixture', expectedRevision: entry.revision, draft: validDraft() }), error => error.code === 'board_layout_invalid');
  assert.deepEqual((await f.call(READ)).payload.layouts[0], saved.payload.layout);
});
