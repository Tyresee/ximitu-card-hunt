import { createHash, createHmac } from 'node:crypto';
import { canonicalPointsJson } from './points-store.mjs';
import { pointsError } from './points-movement.mjs';

const BASE = '/api/game-points/v1/monopoly/landing-sessions';
const stableKey = value => `monopoly-${createHash('sha256').update(value).digest('hex')}`;
export function createPointsPlatformClient({ platformOrigin = 'http://127.0.0.1:19321',
  publicOrigin = 'https://wordattack.timclass.cn', secret = process.env.MONOPOLY_POINTS_SIGNING_SECRET,
  fetchImpl = fetch, clock = Date.now } = {}) {
  const configured = typeof secret === 'string' && secret.length >= 32 && secret.length <= 4096;
  async function request(method, pathname, fields, context, key) {
    if (!configured) throw pointsError('平台积分尚未配置，本局不会到账', 'points_platform_unavailable', 503);
    const body = fields === null ? null : { expectedUserId: context.actor.id, ...fields };
    const timestamp = String(Math.floor(clock() / 1000));
    const signature = createHmac('sha256', secret)
      .update(`monopoly-points-v1\n${timestamp}\n${method}\n${pathname}\n${canonicalPointsJson(body)}`).digest('hex');
    let response;
    try {
      response = await fetchImpl(platformOrigin + pathname, { method, redirect: 'error', signal: AbortSignal.timeout(12_000),
        headers: { cookie: context.cookie || '', origin: publicOrigin, 'content-type': 'application/json',
          'x-monopoly-points-timestamp': timestamp, 'x-monopoly-points-signature': signature,
          ...(key ? { 'idempotency-key': stableKey(key) } : {}) }, ...(body === null ? {} : { body: JSON.stringify(body) }) });
    } catch { throw pointsError('平台到账服务暂时不可用，已保留原回合', 'points_platform_unavailable', 503); }
    let result;
    try { result = await response.json(); } catch { throw pointsError('平台回执无法读取，已保留原回合', 'points_receipt_invalid', 502); }
    if (!response.ok) throw pointsError(result.message || '平台积分请求失败', result.error || 'points_platform_unavailable', response.status);
    return result;
  }
  return {
    configured,
    register: (fields, context) => request('POST', BASE, { ...fields, gameMode: 'teacher-led' }, context,
      `register:${context.actor.id}:${fields.externalSessionId}`),
    upgradeRule: (sessionId, fields, context) => request('POST', `${BASE}/${encodeURIComponent(sessionId)}/upgrade-rule`, fields, context,
      `rule-upgrade:${sessionId}:${fields.expectedRuleVersion}:${fields.targetRuleVersion}`),
    claim: (sessionId, event, context) => request('POST', `${BASE}/${encodeURIComponent(sessionId)}/landings`, event, context,
      `claim:${sessionId}:${event.turnId}`),
    claimSpecialCellBonus: (sessionId, bonus, context) => request('POST',
      `${BASE}/${encodeURIComponent(sessionId)}/special-bonuses`, {
        bonusId: bonus.bonusId, turnId: bonus.turnId, studentId: bonus.studentId, cellId: bonus.cellId,
        type: bonus.type, amount: bonus.amount, policy: bonus.policy,
      }, context, `bonus:${sessionId}:${bonus.bonusId}`),
    getByExternal: (externalId, context) => request('GET', `${BASE}/by-external/${encodeURIComponent(externalId)}`, null, context),
    getLanding: (sessionId, turnId, context) => request('GET', `${BASE}/${encodeURIComponent(sessionId)}/landings/${encodeURIComponent(turnId)}`, null, context),
    getSpecialCellBonus: (sessionId, bonusId, context) => request('GET',
      `${BASE}/${encodeURIComponent(sessionId)}/special-bonuses/${encodeURIComponent(bonusId)}`, null, context),
  };
}
