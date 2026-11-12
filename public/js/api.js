const DEFAULT_TIMEOUT_MS = 8_000;
export class ApiError extends Error {
  constructor(message, {
    status = 0,
    code = "request_failed",
    details = null,
    retryAfterSeconds = 0,
    diagnosticId = null,
  } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
    this.diagnosticId = diagnosticId;
  }
}

async function request(path, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        friendlyError(payload.error, response.status, payload)
          || payload.message
          || (response.status >= 500 ? "服务暂时不可用，请稍后重试" : "请求没有完成，请再试一次"),
        {
        status: response.status,
        code: payload.error || "request_failed",
        details: payload.issues || null,
        retryAfterSeconds: Number(payload.retryAfterSeconds || response.headers.get("retry-after")) || 0,
        diagnosticId: payload.diagnosticId || response.headers.get("x-request-id") || null,
        },
      );
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("连接超时了，请再试一次", { code: "timeout" });
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("暂时连不上服务，请检查网络后重试", { code: "network_error" });
  } finally {
    window.clearTimeout(timeout);
  }
}

function friendlyWait(seconds) {
  const value = Math.max(1, Number(seconds) || 1);
  if (value < 60) return `约 ${value} 秒`;
  return `约 ${Math.ceil(value / 60)} 分钟`;
}

function friendlyError(code, status, payload = {}) {
  const messages = {
    authentication_required: "请先登录后再继续",
    auth_required: "请先登录后再继续",
    auth_session_invalid: "登录状态已过期，请重新登录",
    auth_context_changed: "登录账号已经变化，请刷新页面后再操作",
    invalid_credentials: "账号或密码不正确",
    auth_invalid_credentials: "账号或密码不正确",
    auth_rate_limited: `尝试次数较多，请在${friendlyWait(payload.retryAfterSeconds)}后再试`,
    account_disabled: "这个账号已被停用，请联系主账号",
    user_disabled: "这个账号已被停用，请联系主账号",
    auth_user_disabled: "这个账号已被停用，请联系主账号",
    username_taken: "这个账号名已经有人使用，请换一个",
    auth_username_taken: "这个账号名已经有人使用，请换一个",
    username_invalid: "账号名格式不正确，请检查后重试",
    auth_username_invalid: "账号名格式不正确，请使用 3—32 位英文字母、数字、点、横线或下划线",
    display_name_invalid: "请填写 1—40 个字的称呼",
    auth_display_name_invalid: "请填写一个清楚的显示称呼",
    password_invalid: "密码不符合安全要求，请按提示修改",
    auth_password_invalid: "密码不符合安全要求，请按提示修改",
    auth_new_password_invalid: "新密码不符合安全要求，请按提示修改",
    password_too_weak: "密码强度不够，请使用更长的字母与数字组合",
    current_password_invalid: "原密码不正确",
    auth_current_password_invalid: "原密码不正确",
    invite_invalid: "邀请码不正确，请向主账号确认",
    invite_not_found: "邀请码不正确，请向主账号确认",
    auth_invitation_invalid: "邀请码不正确或已过期，请向主账号确认",
    auth_invitation_not_found: "没有找到这个邀请码，请刷新后重试",
    auth_invitation_already_used: "这个邀请码已经使用过，不能再次撤销",
    auth_invitation_note_invalid: "领取人备注过长，请简化后重试",
    invite_used: "这个邀请码已经使用过，请向主账号领取新邀请码",
    invite_expired: "这个邀请码已过期，请向主账号领取新邀请码",
    invite_revoked: "这个邀请码已被撤销，请向主账号领取新邀请码",
    reset_code_invalid: "账号或重置码不正确，请向主账号确认",
    reset_code_expired: "这个重置码已过期，请向主账号领取新的重置码",
    reset_code_used: "这个重置码已经使用过，请向主账号领取新的重置码",
    auth_password_reset_invalid: "账号或重置码不正确，可能已使用或过期",
    forbidden: "当前账号没有执行这项操作的权限",
    auth_forbidden: "当前账号没有执行这项操作的权限",
    owner_required: "只有主账号可以进入账号管理",
    auth_owner_required: "只有主账号可以进入账号管理",
    auth_owner_password_reset_forbidden: "主账号请在“我的账号”中使用当前密码修改",
    cannot_disable_owner: "主账号不能被停用",
    auth_owner_cannot_be_disabled: "主账号不能被停用",
    cannot_disable_self: "不能停用当前正在使用的账号",
    user_not_found: "没有找到这个账号，请刷新后重试",
    auth_user_not_found: "没有找到这个账号，请刷新后重试",
    auth_user_status_invalid: "账号状态无效，请刷新后重试",
    invite_not_active: "这个邀请码已无法使用，请刷新后查看状态",
    content_invalid: "内容包里还有需要检查的字段",
    content_pack_not_found: "没有找到这个素材包，请刷新后重试",
    content_pack_not_published: "这个素材包还没有发布，暂时不能用于游戏",
    content_pack_title_invalid: "请给素材包填写一个清楚的名称",
    content_pack_limit_reached: "素材包数量已达到上限，请先整理已有素材包",
    content_pack_transaction_recovery_required: "素材库正在安全恢复，请稍后刷新页面再试；本次操作尚未确认保存",
    active_pack_requires_published: "草稿还不能用于游戏，请先审核并发布",
    entry_not_found: "这个单词已更新，请刷新后重试",
    content_entry_not_found: "这个单词已更新，请刷新素材包后重试",
    rate_limited: "本系统的操作保护额度暂时用完了，请稍后再试",
    local_image_rate_limited: `本系统的图片生成保护额度已用完，请在${friendlyWait(payload.retryAfterSeconds)}后再试`,
    local_word_pack_rate_limited: `本系统的词包生成保护额度已用完，请在${friendlyWait(payload.retryAfterSeconds)}后再试`,
    local_tts_rate_limited: `本系统的标准音生成保护额度已用完，请在${friendlyWait(payload.retryAfterSeconds)}后再试`,
    provider_rate_limited: "图片模型当前拥挤，备用服务也未能完成，请稍后再试",
    provider_content_rejected: "图片模型连续没有接受这个教学场景，原图已保留；请稍后单独重试，不需要重新生成整套词包",
    image_ai_not_configured: "图片生成服务尚未配置",
    generated_image_blank: "图片模型连续返回空白图，旧图片没有被替换，请再试一次",
    generated_image_semantic_mismatch: "新图片没有通过词义检查，旧图片没有被替换，请再试一次",
    image_review_unavailable: "图片已经生成，但词义检查服务没有完成；为避免错误图片，旧图没有被替换，请稍后再试",
    image_generation_in_progress: "这个单词的图片正在生成，请等待当前任务完成",
    image_queue_full: "当前等待生成的图片较多，请稍后再试",
    image_queue_timeout: "图片生成队列等待超时，请稍后再试",
    image_count_invalid: "图片生成参数已更新，请刷新页面后再试",
    content_version_conflict: "内容已在另一个页面更新；为避免覆盖，请刷新后再试",
    content_revision_required: "内容版本已更新；为避免覆盖，请刷新后再试",
    attempt_expired_or_completed: "这次朗读已过期，请重新朗读",
    real_pronunciation_required: "真实语音评测尚未就绪",
    voice_board_assessment_unavailable: "声音魔法还没有准备好，请稍后再试",
    assessment_policy_not_found: "还没有知识点评分草稿，请先保存",
    assessment_policy_revision_conflict: "知识点配置已在另一个页面更新，请刷新后再试",
    assessment_policy_idempotency_reuse: "这次保存标识已用于不同内容，请重新保存",
    assessment_policy_invalid: "知识点配置还有需要修正的规则",
    assessment_policy_review_stale: "草稿在验证后发生了变化，请重新验证并提交审核",
    assessment_policy_review_required: "请先完成配置检查、案例模拟并提交审核",
    authoring_token_invalid: "Codex MCP 凭证无效、已撤销或已过期",
    authoring_token_not_found: "没有找到这个 Codex MCP 凭证",
    authoring_token_scope_required: "这个 Codex MCP 凭证没有所需权限",
    authoring_token_label_invalid: "请填写 1—64 个字的 MCP 凭证名称",
    authoring_token_ttl_invalid: "MCP 凭证有效期须为 1—365 天",
  };
  return messages[code] || null;
}


export const api = {
  startVoiceBoardAssessment: (payload) => request("/api/voice-board/assessment/start", {method: "POST", body: payload, timeoutMs: 12_000}),
  completeVoiceBoardAssessment: (payload) => request("/api/voice-board/assessment/complete", {method: "POST", body: payload, timeoutMs: 20_000}),
};
