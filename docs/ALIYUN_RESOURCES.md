# 阿里云资源与数据边界

## 主游戏实时语音识别

- 产品：百炼 `fun-asr-realtime`，北京地域工作空间专属 WebSocket 端点。
- 服务端代理：浏览器只连同源 `/ws/asr`，长期 `DASHSCOPE_API_KEY` 与热词 ID 仅存在 ECS 受限 `.env`。
- 音频：AudioWorklet 输出 16 kHz、单声道、PCM16，每 100ms 一个 3.2 KiB 分片；不落盘、不写 OSS。
- 识别增强：英文语种限定、当前关卡词表 context、项目专用 `apple / banana / book` 热词表（权重 4，状态 `OK`）。热词 ID 不写入 Git 或对外 API。
- 计费：运行时按百炼实时 ASR 实际可计费时长产生费用。暂停、切后台、播放标准音和游戏结束都关闭会话，不保持无效连接。

## 运行时语音评测

- 产品：智能科教内容生成平台（SSECP）口语评测。
- 题型：`en.word_kid.score`，适用于 12 岁以下儿童英文单词跟读。
- 服务端凭 `AppID + AppSecret` 向 `https://api.cloud.ssapi.cn/auth/authorize` 换取默认 7200 秒的 `warrant_id`。
- 浏览器只得到 AppID、匿名 userId 和临时 warrant；`AppSecret` 不进入前端。
- SDK：从本项目口语评测项目下载 `engine.js`，固定部署到 `public/vendor/aliyun-edu-engine/engine.js`，不使用第三方临时脚本地址。
- 生产项目：`tim-word-attack-prod`，AppID `a0008tv`；AppSecret 仅存于受限环境文件。该项目的服务端授权已返回有效临时 warrant。
- 官方 SDK 内部需要动态代码编译；CSP 仅对本域自托管脚本开放 `unsafe-eval`，仍禁止外域脚本、对象和第三方 frame。
- SDK 初始化即固定 `en.word_kid.score` 且关闭其明文调试日志，避免默认题型的无效预连接和临时 warrant 出现在浏览器控制台。
- 残余风险：`unsafe-eval` 目前作用于同源 SPA 的整份响应策略；固定 SDK 校验和与仅同源脚本降低风险。长期若拆分架构，应把评测页放入独立 document/origin 进一步收窄。
- 官方网页 SDK：控制台下载包 `v3.0.5.zip`，SHA-256 `b91c6bd9ac490576385be7f3bfa68d554bbecbb5a2ccf2bf62c1e9531ec97d0c`；部署文件 `engine.js` 的 SHA-256 为 `b551e592f58e4489075f3a4f50b514efb5c41ef1dedd15ea5dc91c9ccb152d8f`。
- 采样与传输：SDK 使用 Web Audio，16 kHz 单声道 OGG/Speex，经 WebSocket 送评。
- 伤害分只读 `result.pron`。音量仅触发即时预备弹，`overall` 与 `details[].score` 只可用于诊断。
- `attachAudioUrl=0`，默认不持久化、不中转、不上传儿童原始录音到本项目 OSS。

## 备课内容生成

- 地域：百炼中国内地版，北京地域；API Key 必须与北京工作空间匹配。
- 配图：`wan2.7-image-pro` 为主、`qwen-image-2.0` 为备用，4:3、平面 2D、真实人物/物体/地点/动作主体、无文字、儿童友好；每次只请求 1 张。
- 图片质检：先在本服务内拒收空白或近纯色 PNG，再由 `qwen3.6-flash` 按内部中文义项与场景描述做视觉语义复核；不合格图自动重试一次，仍不合格则保留旧图并返回明确错误。
- 标准音：`cosyvoice-v3-flash`；美音 `loongannie_v3`，英音 `loongemily_v3`；生成结果先试听后审核。
- 模型结果 URL 只在后台任务中短暂使用；服务端立即下载并写入 OSS，正式内容包不引用 24 小时临时 URL。
- AI 生成位于公开备课页，不要求登录；`qwen-plus` 负责结构化词义编排，万相生成单图，视觉模型质检，CosyVoice 生成标准音。写请求保留同源检查、分类型每 IP 限流与同词生成互斥，游戏运行时不会触发文本、图像或 TTS 生成。

### 本次生产烟测结果

- 图片生成仅实际调用 1 次，精确返回 2 张候选；第 1 张已选择、审核并发布到结构化词条。
- 标准音 TTS 仅实际生成并播放 1 次单个短词。
- 生成的图片与音频均已写入 `voice-word-attack/production/` 隔离前缀，正式内容不引用上游临时 URL。
- 为遵守 2 元总费用上限，后续 QA 不得再触发图片或 TTS 生成。

## OSS 隔离

- 已只读核对 Bucket：`tim-edu-tools-tts-audio`，华东 1（杭州），私有，文件不可公共访问。
- 本项目唯一允许的生产前缀：`voice-word-attack/production/`。
- 对象键：`voice-word-attack/{environment}/packs/{packId}/words/{wordId}/{images|audio}/...`。
- 禁止写入现有 `tts-audio/`、Bucket 根目录的历史 MP3，或其他项目前缀。
- 浏览器通过本项目同源资产代理或短期签名 URL 读取，长期 AccessKey 不下发。

## 已创建的专属凭据

以下资源在用户确认费用上限 2 元后创建，均与现有项目隔离：

1. SSECP 服务按量开通，控制台显示 100 路免费并发；生产项目 `tim-word-attack-prod`。
2. 百炼北京默认业务空间专属 API Key，描述 `tim-voice-word-attack-production`；未复用已有 Key。
3. RAM 用户 `tim-voice-word-attack-production` 与自定义策略 `tim-voice-word-attack-production-oss`。当前生效策略只允许对 `tim-edu-tools-tts-audio/voice-word-attack/production/*` 执行 `oss:GetObject`、`oss:PutObject`，不含 List/Delete，不授予其他 Bucket、前缀或 AI Content 权限。口语评测临时授权使用 SSECP 项目的 AppID/AppSecret，不依赖 RAM 权限。

凭据只写入 ECS 的 `/var/www/voice-word-attack/shared/.env`（`root:voice-word-attack`，权限 `0640`），不进入 Git、截图、浏览器日志或应用响应。Cloud Shell 中用于一次性转移 AccessKey 的临时文件在本地安全接收后已删除。

## 费用护栏

- 本次上线烟测总费用上限：人民币 2 元。
- 图片候选已实际生成 2 张；按公开单价计费上限约 1 元。标准音已只生成 1 次短单词，费用极低。
- 费用烟测额度已冻结：不再进行图片/TTS 生成、自动重试或为换取更好结果而追加调用。

## 官方依据

- 百炼实时 ASR：<https://help.aliyun.com/en/model-studio/fun-asr-realtime-websocket-api>
- Fun-ASR 客户端事件：<https://help.aliyun.com/en/model-studio/fun-asr-client-events>
- 百炼定制热词：<https://help.aliyun.com/zh/model-studio/vocabulary-http-api>
- 儿童单词评测：<https://help.aliyun.com/zh/document_detail/2996310.html>
- JS SDK：<https://help.aliyun.com/zh/document_detail/2873513.html>
- 服务端授权：<https://help.aliyun.com/zh/document_detail/2865622.html>
- SDK 隐私披露：<https://help.aliyun.com/zh/document_detail/2998489.html>
- Qwen-Image API：<https://help.aliyun.com/en/model-studio/qwen-image-api>
- CosyVoice 非实时 TTS：<https://help.aliyun.com/en/model-studio/non-realtime-tts-user-guide>
