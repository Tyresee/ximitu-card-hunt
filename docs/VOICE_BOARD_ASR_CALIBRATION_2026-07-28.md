# 声控棋真实百炼 ASR 标定记录（2026-07-28）

## 结论

- 真实百炼 `fun-asr-realtime` 上游连接、16 kHz PCM 流式传输、final transcript、
  服务端评测和唯一一次 `answer-resolved` 已端到端通过。
- 句末静音默认值由 1100ms 调整为 **1300ms**。该值仍可通过
  `DASHSCOPE_BOARD_SENTENCE_SILENCE_MS` 配置，服务端只接受 200–6000ms
  的整数。
- 完整句若未命中主目标或配置关键词，现在进入 `teacher_review`；不完整句仍为
  `retry`。这样可以处理 `has` 被 ASR 听成 `had` 等无法仅凭转写安全判定的情况，
  同时不会把教师放行记成主目标掌握。

## 安全与环境

- 测试代码运行在 ECS 的隔离临时目录和 `127.0.0.1:19322` 回环端口。
- 本机通过 SSH 隧道访问；百炼 API Key 和 Workspace ID 始终留在 ECS 的受保护
  `.env` 中，没有复制到本机、代码、日志或聊天。
- 使用 macOS 系统英语语音生成测试音频，再转换为 16 kHz、单声道、
  signed 16-bit little-endian 裸 PCM。
- 使用 Junior、Samantha、Daniel 三种英语语音和不同语速；每条音频前补
  300ms 静音，普通样本末尾补 1800ms 静音。
- 本轮共建立 25 个真实百炼测试会话；登录限流触发的 3 次 HTTP 429 没有连接
  ASR 上游。

## 基础规则样本

| 输入或场景 | ASR final | 最终判定 | 结果 |
|---|---|---|---|
| `She has two apples.`，慢速 Junior | `She has two apples.` | `accepted / primary_accepted` | 通过 |
| 同句，Samantha | `She has two apples.` | `accepted / primary_accepted` | 通过 |
| 同句，Daniel 英音 | `She has two apples.` | `accepted / primary_accepted` | 通过 |
| 同句，快速 Junior | `She had two apples.` | 修正后为 `teacher_review` | 安全降级 |
| `She have two apples.`，Junior | `She have two apples.` | `accepted / keyword_match` | 通过且不记掌握 |
| 同句，Samantha | `She have two apples.` | `accepted / keyword_match` | 通过且不记掌握 |
| `She has.` | `She has.` | `retry` | 通过 |
| `Has.` | `has.` | `retry` | 通过 |
| `She owns two apples.` | `She owns two apples.` | 修正后为 `teacher_review` | 通过 |
| `The ball is under the chair.` | 同句 | `accepted / primary_accepted` | 通过 |
| `The ball is on the chair.` | 同句 | `teacher_review` | 通过 |
| `The ball under the chair.` | 同句 | `retry` | 通过 |

快速 Junior 样本说明：ASR 将正确发音的 `has` 输出为 `had`。系统不能在没有
音频置信度或教师现场判断的情况下擅自把 `had` 改回 `has`，否则真实语法错误也
可能被误记为正确。因此完整但不确定的句子交给教师复核，而不是自动掌握或盲目
重试。

## 句中思考停顿对比

测试句由 `She has`、受控静音、`two apples.` 拼接而成。

| `max_sentence_silence` | 0.7 秒句中停顿 | 1.0 秒句中停顿 | 1.2 秒句中停顿 |
|---:|---|---|---|
| 900ms | 完整句，通过 | 提前 final 为 `She has.` | 提前 final 为 `She has.` |
| 1100ms | 完整句，通过 | 完整句，通过 | 提前 final 为 `She has.` |
| 1300ms | 完整句，通过 | 完整句，通过 | 完整句，通过 |

1300ms 相比 1100ms 通常增加约 0.3–0.5 秒等待，但能保留 1.2 秒的儿童思考
停顿。课堂中减少打断和无效重说的价值高于节省这半秒，因此选择 1300ms。

## 浏览器完整链路

最后一条样本在已登录的真实 Chromium 中运行。测试仅把合成 PCM 暂时包装为
`MediaStream`，其余代码完全走正式浏览器链路：

```text
getUserMedia
→ AudioWorklet 采集与 PCM 转换
→ /ws/voice-board-asr
→ 百炼 fun-asr-realtime
→ 服务端评测
→ answer-resolved
→ 自动投骰与移动
```

结果为：正确句自动投出 3、完成 1 次发言、增加 1 颗知识星并进入共享终章；
浏览器控制台为 0 error / 0 warning。截图：
[真实 ASR 后进入终章](../output/playwright/universal-board-real-asr-browser-boss.png)。

## 仍需真实课堂确认

- 本轮是合成英语语音的真实云端 ASR 调用，不等同于儿童手持或桌面麦克风实测。
- 仍需覆盖真实儿童口音、音量、抢话、同伴背景声、教室混响和设备距离。
- 1300ms 是当前工程默认值，不是永久教学结论；课堂样本积累后可继续调节。
- 本记录生成时，新 `/ws/voice-board-asr` 和对应 Nginx 路由尚未部署；直链
  灰度发布后仍需在公网重复健康、认证边界和一次真实上游转写验收。
