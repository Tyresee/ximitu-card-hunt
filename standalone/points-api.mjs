import { resolve } from 'node:path';
import { PointsTurnStore } from './points-store.mjs';
import { pointsError } from './points-movement.mjs';
import { createPointsPlatformClient } from './points-platform-client.mjs';
import { CURRENT_POINTS_RULE_VERSION } from './points-rule-versions.mjs';

export const POINTS_API_BASE = '/games/monopoly/api/points/v1';
const UUID = '[a-fA-F0-9-]{36}';
const SESSION = new RegExp(`^/sessions/(${UUID})(?:/(roll|close|upgrade-rule))?$`);
const TURN = new RegExp(`^/sessions/(${UUID})/turns/([^/]+)/(plan|claim)$`);
const SPECIAL_DRAW = new RegExp(`^/sessions/(${UUID})/special-cells/draw$`);
const GROUP_MOVE = new RegExp(`^/sessions/(${UUID})/group-moves/([^/]+)/(resolve|claim)$`);
function exact(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw pointsError('请求字段无效');
}
async function bodyJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw pointsError('请提交JSON', 'points_content_type_invalid', 415);
  const chunks = []; let length = 0;
  for await (const bytes of request) {
    length += bytes.length;
    if (length > 24_000) throw pointsError('请求内容过大', 'points_request_too_large', 413);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw pointsError('JSON无法解析'); }
}

export function createPointsHandler({ dataDir, pointsStore, pointsPlatform, platformOrigin = 'http://127.0.0.1:19321',
  pointsPlatformOrigin = process.env.POINTS_PLATFORM_ORIGIN || platformOrigin,
  publicOrigin = 'https://wordattack.timclass.cn', fetchSession = fetch, signingSecret } = {}) {
  const platform = pointsPlatform || createPointsPlatformClient({ platformOrigin: pointsPlatformOrigin, publicOrigin,
    ...(signingSecret === undefined ? {} : { secret: signingSecret }), fetchImpl: fetchSession });
  let store = pointsStore;
  const getStore = () => {
    if (!store) {
      if (!dataDir) throw pointsError('积分存储未配置', 'points_store_unavailable', 503);
      store = new PointsTurnStore({ dataDir: resolve(dataDir, 'points'), platform });
    }
    return store;
  };
  async function upstream(path, cookie) {
    try {
      const response = await fetchSession(platformOrigin + path, { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('upstream unavailable');
      return await response.json();
    } catch { throw pointsError('平台身份服务暂不可用', 'points_auth_unavailable', 503); }
  }
  return async function handlePoints(request, response, pathname, send) {
    if (pathname !== POINTS_API_BASE && !pathname.startsWith(POINTS_API_BASE + '/')) return false;
    const answer = (status, value) => send(response, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8' });
    try {
      if (!['GET', 'POST'].includes(request.method)) throw pointsError('请求方法不支持', 'points_method_invalid', 405);
      const cookie = request.headers.cookie || '';
      const authentication = await upstream('/api/auth/me', cookie);
      if (authentication.authenticated !== true || !authentication.user?.id) throw pointsError('请先登录', 'auth_required', 401);
      const actor = authentication.user;
      if (!['owner', 'member'].includes(actor.role)) throw pointsError('无权使用课堂积分', 'points_forbidden', 403);
      const context = { actor, cookie };
      const path = pathname.slice(POINTS_API_BASE.length);
      if (request.method === 'GET' && path === '/context') {
        answer(200, { enabled: platform.configured === true, supportedModes: ['teacher-led'], ruleVersion: CURRENT_POINTS_RULE_VERSION }); return true;
      }
      const sessionMatch = path.match(SESSION), turnMatch = path.match(TURN);
      const drawMatch = path.match(SPECIAL_DRAW), groupMatch = path.match(GROUP_MOVE);
      let existing;
      const anyMatch = sessionMatch || turnMatch || drawMatch || groupMatch;
      if (anyMatch) existing = await getStore().get({ actor, sessionId: anyMatch[1] });
      if (request.method === 'GET') {
        if (path.startsWith('/sessions/by-external/')) existing = await getStore().get({ actor, externalSessionId: decodeURIComponent(path.slice('/sessions/by-external/'.length)) });
        else if (!sessionMatch || sessionMatch[2]) throw pointsError('未找到接口', 'not_found', 404);
        answer(200, existing); return true;
      }
      if (request.headers.origin !== publicOrigin) throw pointsError('积分操作必须来自游戏平台', 'points_origin_invalid', 403);
      const body = await bodyJson(request);
      if (body?.expectedUserId !== actor.id) throw pointsError('登录账号已变化，请刷新', 'auth_context_changed', 409);
      const idempotencyKey = request.headers['idempotency-key'];
      const roster = await upstream('/api/student-profiles/v1', cookie);
      const allowed = new Set((roster.students || []).filter(student => student.status === 'active').map(student => student.id));
      const studentIds = existing?.session.studentIds || body.studentIds;
      if (!Array.isArray(studentIds) || studentIds.some(studentId => !allowed.has(studentId))) throw pointsError('学生不可用或不属于当前账号', 'points_student_invalid', 403);
      let result;
      if (path === '/sessions') {
        exact(body, ['expectedUserId', 'externalSessionId', 'studentIds', 'mode']);
        result = await getStore().register({ actor, externalSessionId: body.externalSessionId, studentIds: body.studentIds,
          mode: body.mode, idempotencyKey, context });
      } else if (sessionMatch?.[2] === 'roll') {
        exact(body, ['expectedUserId', 'studentId', 'attemptId']);
        result = await getStore().roll({ actor, sessionId: sessionMatch[1], studentId: body.studentId, attemptId: body.attemptId, idempotencyKey, context });
      } else if (sessionMatch?.[2] === 'upgrade-rule') {
        exact(body, ['expectedUserId']);
        result = await getStore().upgradeRule({ actor, sessionId: sessionMatch[1], idempotencyKey, context });
      } else if (sessionMatch?.[2] === 'close') {
        exact(body, ['expectedUserId']); result = await getStore().end({ actor, sessionId: sessionMatch[1], idempotencyKey });
      } else if (turnMatch?.[3] === 'plan') {
        exact(body, ['expectedUserId', 'routeChoicesByWorldInstance']);
        result = await getStore().plan({ actor, sessionId: turnMatch[1], attemptId: decodeURIComponent(turnMatch[2]), routeChoicesByWorldInstance: body.routeChoicesByWorldInstance, idempotencyKey });
      } else if (turnMatch?.[3] === 'claim') {
        exact(body, ['expectedUserId']);
        result = await getStore().claim({ actor, sessionId: turnMatch[1], attemptId: decodeURIComponent(turnMatch[2]), idempotencyKey, context });
      } else if (drawMatch) {
        exact(body, ['expectedUserId', 'density', 'multipliersEnabled', 'previousDrawNumber']);
        result = await getStore().drawSpecialCells({ actor, sessionId: drawMatch[1], density: body.density,
          multipliersEnabled: body.multipliersEnabled, previousDrawNumber: body.previousDrawNumber, idempotencyKey });
      } else if (groupMatch?.[3] === 'resolve') {
        exact(body, ['expectedUserId', 'decision']);
        result = await getStore().resolveGroupMove({ actor, sessionId: groupMatch[1], instanceId: decodeURIComponent(groupMatch[2]),
          decision: body.decision, idempotencyKey });
      } else if (groupMatch?.[3] === 'claim') {
        exact(body, ['expectedUserId']);
        result = await getStore().claimGroupMove({ actor, sessionId: groupMatch[1], instanceId: decodeURIComponent(groupMatch[2]),
          idempotencyKey, context });
      } else throw pointsError('未找到接口', 'not_found', 404);
      answer(200, result);
    } catch (error) {
      const status = error.statusCode || 500;
      answer(status, { error: error.code || 'points_unavailable', message: error.statusCode ? error.message : '积分暂未到账，原回合已保留',
        ...(error.details ? { details: error.details } : {}) });
    }
    return true;
  };
}
