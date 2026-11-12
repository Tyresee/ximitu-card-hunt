import { resolve } from 'node:path';
import { BoardLayoutStore, BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION } from './board-layout-store.mjs';
import { GAME_OWNED_LAYOUT_WORLD_REFS, WORLD_REGISTRIES } from '../public/prototypes/universal-board/world-packs.js';
import { resolveWorldComposition } from '../public/prototypes/universal-board/world-runtime-core.js';

export const GAME_LAYOUT_READ_PATH = '/games/monopoly/api/board-layouts/v1';
export const GAME_LAYOUT_WRITE_PATH = '/games/monopoly/api/admin/board-layouts/v1';
const MAX_BODY_BYTES = 64_000;

function requestError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw requestError(415, 'content_type_invalid', '请使用 JSON 格式提交布局');
  }
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    request.resume();
    throw requestError(413, 'request_too_large', '布局数据过大');
  }
  const bytes = await new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const onError = error => { cleanup(); rejectBody(error); };
    const onAborted = () => onError(requestError(400, 'request_aborted', '布局请求已中断'));
    const onEnd = () => { cleanup(); resolveBody(Buffer.concat(chunks)); };
    const onData = chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        cleanup();
        request.resume();
        rejectBody(requestError(413, 'request_too_large', '布局数据过大'));
      } else chunks.push(chunk);
    };
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { throw requestError(400, 'invalid_json', '布局 JSON 无法解析'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw requestError(422, 'board_layout_invalid', '布局请求必须是对象');
  }
  return body;
}

export function createGameLayoutHandler({ dataDir, layoutStore, platformOrigin, fetchSession, publicOrigin }) {
  let store = layoutStore || null;
  const getStore = () => {
    if (!store) {
      if (!dataDir) throw requestError(503, 'board_layout_unavailable', '地图布局服务暂未就绪，请稍后重试');
      store = new BoardLayoutStore({
        dataDir: resolve(dataDir, 'board-layouts'),
        boardsByWorldRef: Object.fromEntries(GAME_OWNED_LAYOUT_WORLD_REFS.map(worldRef => [
          worldRef, resolveWorldComposition(worldRef, WORLD_REGISTRIES).board,
        ])),
      });
    }
    return store;
  };
  return async function handleGameLayout(request, response, pathname, send) {
    if (![GAME_LAYOUT_READ_PATH, GAME_LAYOUT_WRITE_PATH].includes(pathname)) return false;
    const expectedMethod = pathname === GAME_LAYOUT_READ_PATH ? 'GET' : 'PUT';
    const json = (status, payload, extra = {}) => send(response, status, JSON.stringify(payload), {
      'content-type': 'application/json; charset=utf-8', ...extra,
    });
    try {
      if (request.method !== expectedMethod) {
        json(405, { error: 'method_not_allowed', message: '不支持该请求方法' }, { allow: expectedMethod });
        return true;
      }
      let session;
      try {
        const upstream = await fetchSession(platformOrigin + '/api/auth/me', {
          headers: { cookie: request.headers.cookie || '' },
          redirect: 'error', signal: AbortSignal.timeout(3000),
        });
        if (!upstream.ok) throw new Error('platform authentication unavailable');
        session = await upstream.json();
      } catch {
        throw requestError(503, 'auth_service_unavailable', '登录服务暂时不可用，请稍后重试');
      }
      if (session?.authenticated !== true || !session.user?.id) {
        throw requestError(401, 'auth_required', '请先登录后再继续');
      }
      if (expectedMethod === 'GET') {
        json(200, await getStore().read());
        return true;
      }
      if (request.headers.origin !== publicOrigin) {
        throw requestError(403, 'origin_rejected', '布局发布必须来自当前游戏平台页面');
      }
      if (session.user.role !== 'owner') {
        throw requestError(403, 'auth_owner_required', '仅主账号可以发布地图布局');
      }
      const body = await readBody(request);
      if (body.expectedUserId !== session.user.id) {
        throw requestError(409, 'auth_context_changed', '登录账号已改变，请刷新后再操作');
      }
      if (
        !Object.hasOwn(body, 'expectedRevision')
        || Object.keys(body).some(key => !['expectedUserId', 'expectedRevision', 'draft'].includes(key))
      ) {
        throw requestError(422, 'board_layout_invalid', '布局请求缺少修订号或包含额外字段');
      }
      const layout = await getStore().save({
        actorUserId: session.user.id, expectedRevision: body.expectedRevision, draft: body.draft,
      });
      json(200, { schemaVersion: BOARD_LAYOUT_REGISTRY_SCHEMA_VERSION, layout });
    } catch (error) {
      const status = error.statusCode || 500;
      json(status, {
        error: error.code || 'board_layout_unavailable',
        message: status >= 500 ? '地图布局服务暂时不可用，请保留草稿并稍后重试' : error.message,
      });
    }
    return true;
  };
}
