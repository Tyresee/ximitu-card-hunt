# 质量与上线验收报告

日期：2026-07-23

环境：macOS Chrome（真实浏览器）与 Node.js 本地运行时

本地地址：`http://127.0.0.1:19333`

生产地址：[https://wordattack.timclass.cn](https://wordattack.timclass.cn)

仓库：[https://gitee.com/tim-edu/tim-voice-word-attack](https://gitee.com/tim-edu/tim-voice-word-attack)

## 长期多素材包库：已签署（2026-07-23）

- [x] 用真实旧版单包 `draft` / `published` 启动迁移，确认原 ID、标题、词条、审核状态、修订号和当前发布包无损进入素材包库；连续重启不重复建包。
- [x] 新建 A、B 两个素材包，分别保存草稿和发布；重启服务后包列表、各自草稿/发布版和 `activePackId` 均保持，发布 A 不删除 B 的草稿。
- [x] 不同词序走自动另存判定，原包不被改写；复制包继续引用原 OSS 图片与标准音。该项通过纯逻辑和持久化测试验证，未调用付费生成接口。
- [x] 将已发布 A 设为当前游戏包后游戏读取 A；切换到已发布 B 后只读取 B。未发布草稿没有激活入口，服务端也会拒绝激活。
- [x] 同一包的旧 `revision` 保存明确冲突；不同包的保存和版本状态彼此隔离。
- [x] 新包的“待填第一组词”状态可跨保存和重启保留；第一组新词一经保存或原模板一经发布就永久转为正式素材包，之后换词会另建新包，不覆盖已生成图片与读音。
- [x] 保存、发布和激活均覆盖事务中断、恢复失败、旧版本回滚后继续编辑与并发读取故障注入；恢复快照不可被后续写入覆盖，未提交内容不会被儿童端读取。
- [x] `npm run verify` 共 210 项全部通过；Chromium 桌面端完成新建两包、离页自动保存、发布但不激活、显式切换、开始游戏、冲突恢复和服务重启持久化回归。
- [x] Chromium 快速连续后退且保存冲突时仍回到原教师页、保留本地修改并提供显式重新载入入口；390×844 下 3 个素材包满足 `scrollWidth === innerWidth === 390`，正常链路控制台 0 error / 0 warning。

## 当前结论：真实跑道推进、触线失败与分级打击反馈已完成

- 旧版推进在固定 `18 × 8px = 144px` 后封顶；生产 300 秒词包中，7 只怪兽最晚第 120 秒就全部停止。现已改为 `0..100%` 逻辑进度，并映射“怪兽出生点—机器人终点线”的实时 DOM 宽度，不再使用固定像素上限。
- 终点线由机器人实际右边缘加 8px 安全间距确定；`ResizeObserver` 在桌面、手机和动态重绘后重新测量跑道。桌面 1246px 战场的触线误差为 0.03px，390px 手机为 0.01px，手机横向溢出为 0。
- 推进改为只动画 `transform`。65% 和 85% 分别显示“逼近防线”“即将破线”；存活怪兽达到 100% 后显示破线反馈、停止识词与弹道，并以 `line_breached` 进入明确的失败结算。
- 当前生产速度下，未受攻击的 `pencil case` 约第 239 秒触线、`teacher` 约第 267 秒触线；攻击只扣除生命，不再改变怪兽的位置或移动速度，因此失败是可预期、可防守的风险。

- 生产诊断号 `11535d00-e93c-40c8-9b75-8f8ad89ca81e` 对应百炼 `DataInspectionFailed` / HTTP 400，不是本地 60 次/小时保护，也不是百炼 429 限流；同一时段其他词成功，属于特定画面描述的内容审核拒绝。
- 逗号、分号或换行分隔的输入会保留词组内部空格；`pencil case` 从输入、百炼词包 JSON、内容 schema、配图、TTS 到连续识词均作为一个完整目标，模型若缩成 `case` 会被拒收，不再静默改词。
- 生图提示已改为简洁正向自然语言，只保留词义、场景、儿童 2D 风格、4:3 构图和不添加文字；移除了“武器、暴力、恐怖”等固定否定词，不对教师场景做关键词黑名单清洗。`DataInspectionFailed` 现在明确返回 `provider_content_rejected`，不会错误切到备用模型或被包装成通用 500。
- 百炼明确返回未计费的内容检查失败时，服务端只自动重试一次短中性场景；网络超时、投递状态未知、已取得图片或任何可能计费的失败均不重复请求。连续两次被拒后只提示单独重试该词，不要求重建整套词包。
- 批量生成先以内容版本校验保存词包骨架，再逐词生成、逐词保存；未通过骨架保存前不会调用图片或 TTS。相同单词或词组直接复用已保存图片和同口音读音；若生成期间另一页面造成 `409`，只把当前新图片/读音安全合并到最新草稿，且绝不覆盖对方改过的同一素材。
- 新增可选 `Seedream → 智谱 CogView → 百炼` 图片路由。新密钥为空时自动跳过，当前生产仍保持百炼；只有明确未取得图片的 429/5xx 才跨服务降级，内容拒绝、超时、网络投递状态未知或可能已计费时不重复调用。
- Seedream Base64 与智谱临时 URL 均在服务端限长、验文件签名并立即读取；智谱仅允许两个精确官方 HTTPS 主机且禁止重定向。语义审核与 OSS 保存使用同一份图片字节，避免“审核图”和“落盘图”不一致。
- 教师页“输入 3–8 个单词 → 一键生成完整词包”仍由百炼 `qwen-plus` JSON 模式补齐内部词义/词性/配图描述，随后为每个词生成 1 张图片和 1 条 CosyVoice 标准音，并转存独立 OSS。
- 图片不再盲选隐藏候选：服务端先拒收空白/近纯色 PNG，再用 `qwen3.6-flash` 检查图片是否确实表达目标义项；失败自动重试一次，仍失败则不覆盖旧图。
- 本地图片保护额度从每 IP 每小时 12 次提升到 60 次，词包与 TTS 使用独立额度；请求解析校验后才扣额度，尚未取得上游图片的失败会退回额度，429 返回准确 `Retry-After`。图片服务全局最多并行 2 项；逐词生成增加页面全局互斥、内容版本校验和服务端同词互斥，消除切词后交错保存与重复点击风暴。
- 生产北京工作空间已做一次不生成图片的轻量真实调用，`qwen-plus` 成功返回 `apple / banana / book` 的可解析 JSON，API Key 未离开 ECS。
- 桌面与 390×844 手机浏览器完成布局和输入校验验收；非法的 2 词输入会就地提示且不替换旧词包。
- 当前自动化门禁 173/173 通过，`npm audit --omit=dev` 为 0 vulnerabilities；本地验证未调用任何付费模型。
- 命中反馈新增本地 Web Audio 合成声效：基础、良好、优秀与击败分别使用不同力度、音高和尾音，不下载远程音频，也不产生图片/TTS/模型费用。用户首次点击游戏或 QA 控制时预先解锁音频上下文，延迟落点仍符合浏览器自动播放规则。
- 真实弹道落点新增冲击闪光、双层扩散环、八向碎片、伤害数字、目标抖动与高等级轻微场地震动；全部核心动画只使用 `transform` 与 `opacity`。连续同词双弹使用独立命中序号，前一弹的清理计时器不会提前清除后一弹特效。
- 390×844 Chrome 下冲击特效无横向溢出，伤害数字不遮挡道路标签；`prefers-reduced-motion: reduce` 下 CSS 动效缩短为 `1e-06s`，弹道仍沿用 180ms 端点交叉淡化。浏览器控制台 0 error / 0 warning。
- 教师认证链已按产品要求完整移除：全新无 Cookie 浏览器直接呈现备课台，`GET /api/admin/content-pack` 无会话返回 200，旧 `/api/auth/status` 返回 404；登录页、登录/退出接口、密码哈希工具和部署密码要求均不存在。

- 主游戏已从 Chrome `SpeechRecognition` 切换为百炼 `fun-asr-realtime`：浏览器采集 16 kHz 单声道 PCM，经同源 `/ws/asr` 和 Node 服务端代理发往百炼北京工作空间。API Key 不下发浏览器。
- 生产热词表已创建并查询为 `OK`：`apple / banana / book`，英文，权重 4。运行时同时传入当前关卡词表 context、`language_hints=["en"]` 与 450ms VAD 断句。
- 生产 `/api/health` 返回 `continuousRecognitionProvider=bailian`、`asrConfigured=true`、`asrHotwordsConfigured=true`；Nginx 已为 `/ws/asr` 开启 Upgrade 与 310 秒流式超时。
- 公网 WebSocket 已实际获得百炼 `task-started`。按 100ms 分片发送 16 kHz PCM 后，生产实际 final 转写为 `apple.`、`banana.`、`book.`，三词全部精确命中。
- 百炼实时识词、动态 3—8 路、真实跑道触线失败、分级打击反馈、词图灵魂弹出、开放备课、三家可配置单图链路、质量门禁与一键词包门禁合计 176/176 通过，`npm audit --omit=dev` 为 0 vulnerabilities。浏览器 QA 中 APPLE 只扣 APPLE、BOOK 只扣 BOOK，页面显示“百炼实时识别中”，控制台 0 error / 0 warning。
- 攻击规则仅接受百炼 final 转写中精确出现的当前词条。`hello`、`nothing`、`come on` 等未配置词可显示但不发弹；不使用近音自动攻击。
- 原始音频仅在游戏会话中流式转发，不落盘、不写 OSS。暂停、播放标准音、离开页面或结束游戏都会关闭本地音频轨和百炼会话。

## 动态 3—8 路修复：本地与真实浏览器通过

- 用户复现：词包配置 4 或 5 个词时，游戏仍只显示 3 条路；第 4、5 个词被排到下一批次，开局不能直接攻击。
- 根因：词包生成器使用 `lane = index % 3`，游戏又固定截取每批 3 个敌人；这不是内容审核或素材状态过滤，而是旧版三路产品逻辑仍写死在运行时。
- 修复：按 `wave.order` 为 3—8 个词生成唯一的 `0..N-1` 道路，所有怪兽从开局起同时渲染、推进和参与定向匹配；教师页道路改为只读自动编号。
- 兼容：旧的三路循环 JSON 在读取时自动规范化，API 与游戏只使用动态道路；磁盘继续以旧格式兼容序列化，使上一发布版本在紧急回滚时仍可读取共享内容。
- 识别容量：浏览器一次 final 结果的有效 occurrence 上限同步提升到 8，确保 8 个不同目标词可在同一结果中各发一弹。
- 自动化：3、4、5、6、7、8 词分别覆盖 schema、词包生成、敌人快照、视图道路数、教师只读编号、连续识词与共享数据迁移；`npm run verify` 为 128/128。
- 390×844 Chrome：5 路和 8 路均满足 `scrollWidth === innerWidth === 390`，每只怪兽完整位于所属道路内；8 路齐射后 8 只怪兽全部从 `6/6` 降至 `5/6`，shot count 为 8，控制台 0 error / 0 warning。
- 证据截图：`output/playwright/game-five-dynamic-lanes-mobile-clean.png`、`output/playwright/game-eight-dynamic-lanes-mobile.png`。

下方的“设备端识词”段落是切换前的历史验收记录，用于解释本次架构替换原因，不代表当前生产实现。

## 历史：设备端识词版本结论（已被替代）

本报告已切换到本轮“点击开始后持续设备端识词 + 逐 occurrence 发弹 + 真实炮口曲线弹道”的验收口径。代码、浏览器和生产结果必须以本轮提交重新取证；2026-07-21 的旧版通过记录只作为隔离与阿里云逐词评测基线，不能当作本轮新功能已通过。

当前状态：生产仍为三路并发修复版本；用户复测发现底部遗留的单目标“精准挑战”入口，以及设备端不可用时自动切入单一词条评分的错误回退。多词候选、近音映射、浏览器多词回退及界面清理已完成本地修复和 Chrome 回归，等待本轮发布后补齐生产签署。

## 多词识别与单目标回退修复

- 用户复现：页面底部显示跟随当前锁定变化的“精准挑战 BANANA”；实际朗读 APPLE、BOOK 未发弹，而 BANANA 有一次有效命中。
- 根因：`beginGame()` 和致命监听错误处理会把游戏切到 `runPrecisionAttempt()`；该评测接口只接收 `state.activeIndex` 对应的一个已知词条，因此不可能从 APPLE/BANANA/BOOK 中重新选择目标。
- 交互修复：主游戏移除“精准挑战”按钮，结算页移除“精准挑战均分”；连续识词失败时绝不再启动单目标评测。
- 识别修复：`maxAlternatives` 从 1 提升为 5，按引擎顺序选择第一个精确命中当前词表的候选；全部候选都不精确时接受唯一近音映射，已覆盖 `look → BOOK`、`able → APPLE`。
- 能力回退：优先设备端识别；缺少设备端 API 或语言包时继续使用浏览器自带的多词识别，并明确显示准备状态。浏览器完全不支持或权限被拒绝时停止并允许重试，不开始怪兽计时。
- 设备端稳定性：真实 Chrome 复核发现 `quality=command` 加高权重短语会把清晰 APPLE 塌缩成大量 BANANA；现已移除该非标准质量参数、把短语 boost 降为 2，并在引擎只有匹配 interim 后结束时提升一次该结果，避免 APPLE 明明显示在转写区却不发弹。
- BOOK 漏识别回归：保留词表外语句不发弹的白名单规则，只为长期漏识别的 BOOK 配置词条级上下文 boost 7 与单词级 interim 提升；APPLE/BANANA 仍为 2。BOOK interim 候选稳定 600ms 后可发弹并与迟到 final 去重；BANANA BANANA 仍等 final 后发两弹，`hello`、`nothing`、`come on` 等未知 interim 仍不发弹。
- 首次生产回归：功能提交 `3e0f376001a0a3e15bf5895b0d7b58134ab3a7ac` 已由 Gitee Go #13 绿色部署，但用户实测证明 boost 5 仍不足；该结果已由 boost 7 与稳定 interim 提升方案取代。
- 本地 Chrome：APPLE 单发后仅 APPLE `6/6 → 5/6`；BOOK 单发后仅 BOOK `6/6 → 5/6`；BANANA 两连发后仅 BANANA `6/6 → 4/6`。三个场景 shot count 分别为 1、1、2，控制台 0 error / 0 warning。

## 历史：三路并发推进与按词定向修复

- 根因复现：旧计时器只更新 `state.currentEnemy`，APPLE 的 `creep` 会增长，BANANA/BOOK 始终为 `0`；非当前目标同时被降为 62% 透明度，实际仍是单目标轮换体验。
- 运行模型：同一可见批次的三只存活怪兽按各自 `enemy.speed` 并发推进；某个目标有弹道在途时只暂停该目标以固定命中锚点，另外两路继续移动。
- 定向规则：最终识别结果里的每个白名单词只查找并攻击当前画面中携带该 `entryId` 的存活怪兽；未知词、已击败目标和下一批次词不会串线。
- 桌面 Chrome：三路 `creep` 从 `0.18/0.17/0.15` 持续增长到 `2.16/1.98/1.80`，三只怪兽均为 100% 不透明，控制台 0 error / 0 warning。
- 选择性攻击：模拟 `banana banana` 后只有 BANANA 从 `6/6` 降至 `4/6`，APPLE/BOOK 保持 `6/6`，shot count 为 2，锁定卡同步切换为 BANANA。
- 三词定向：模拟 `apple banana book` 后三路各自从 `6/6` 降至 `5/6`，shot count 为 3；证据截图为 `output/playwright/game-three-lane-targeting.png`。
- 390×844 Chrome：页面 `scrollWidth === innerWidth === 390`，三路状态均为 `advancing`，控制台 0 error / 0 warning。
- 生产签署：Gitee Go #9 对 `594b288` 完成完整 verify/deploy；公网健康版本为同一完整 SHA，生产与本地 `public/js/game.js` SHA-256 均为 `3c449a2f8908ff85b60dfd0a7d119c70ff2d6c79e153c15c284b78aebaaa335a`。

## 本轮验收口径

- 点击一次开始后才启动计时、敌人移动和持续录音，不要求每个单词再次按麦克风。
- 持续识词优先 `processLocally=true`；设备端不可用时明确使用浏览器多词模式，仍只匹配当前画面的结构化词条白名单。
- final transcript 中的每个配置词 occurrence 独立发弹；`banana banana` 必须产生两枚 `BANANA` 导弹和两次 1 点基础伤害。
- 按顺序检查最多 5 个候选；精确匹配优先，全部不精确时只接受唯一近音映射。每词 token bucket 容量 2、每 500ms 补 1 发。
- 每枚导弹从当前炮口中心起飞，沿可见曲线弹道命中所属词条怪兽；多枚在途时不瞬移、不相互覆盖、不因页面重绘消失。
- 连续识词弹固定 1 点伤害；Recognition confidence 不冒充发音准确度。
- 播放标准音时暂停持续监听，结束或失败后恢复，不让扬声器声音自触发攻击。
- 设备端识别不可用或语言包不可安装时明确使用浏览器多词模式；权限被拒绝时停止并允许重试，不新增阿里云实时 ASR。

## 自动化门禁：本地通过

- [x] `npm run verify` 通过：173/173 tests，0 fail。
- [x] `npm run smoke` 通过：健康接口、游戏页与已发布 3 词内容包正常。
- [x] `npm audit --omit=dev`：0 vulnerabilities。
- [x] 全部项目 JavaScript 通过 `node --check`。
- [x] 连续词匹配覆盖白名单、单词边界、final occurrence 保留、`banana banana` 两次命中、暂停/恢复、致命错误和启动超时重试。
- [x] 多候选顺序、APPLE/BOOK 近音映射、浏览器多词回退、60 次异常重复最多立即 2 发、跨 final 限流和 500ms token 补充均有确定性测试。
- [x] 三路怪兽并发推进、攻击只扣血不击退、所有存活怪兽恒速向前、可见存活怪兽按 `entryId` 精确锁定均有确定性测试。
- [x] 弹道测试覆盖真实起终点、曲线控制点、唯一 projectile ID、并发飞行、重绘保留和 reduced-motion。
- [x] 打击声效测试覆盖音效等级、伤害力度、击败尾音、浏览器音频解锁与 Web Audio 不可用时的安全降级；词图灵魂特效测试覆盖约 2 倍尺寸、动画峰值边界、顶部/底部向中央聚拢、横屏约束、约 2 秒完整停留、最终击败结算等待与减少动态模式，视图测试覆盖单目标、等级和伤害数字绑定。
- [x] HTTP 安全头测试确认同源 `microphone` 与 `on-device-speech-recognition` 权限策略。
- [x] Gitee Go YAML 解析、部署/健康/回滚脚本语法检查通过；`git diff --check` 通过。

上一发布基线曾为 47/47 自动化测试、0 个生产依赖漏洞；本轮新增模块后不得继续引用 47/47 作为当前测试结果。

## 本地真实浏览器：核心链路通过

- [x] 首屏显示明确开始操作；等待 1.2 秒后计时仍为 `03:00`、敌人 creep 仍为 `0`。
- [x] Chrome 报告设备端英语包为 `downloadable`；一次点击完成下载/启动后进入“持续监听中”，浏览器只在用户手势后打开麦克风；暂停按钮可停止监听。
- [x] 识别器优先使用 `available/install` 与 `processLocally=true`；不具备设备端 API 时保持多词白名单并使用浏览器识别，项目未新增云端连续 ASR 端点。
- [x] 当前结构化 `apple/banana/book` 白名单与词边界、未知词忽略已由纯函数测试覆盖；确定性浏览器入口按同一 occurrence 数据驱动。
- [x] `BANANA ×2` 在同一飞行窗口出现两枚不同 ID 的独立导弹和两条可见路径；两条路径的 `M` 坐标逐值等于炮口中心，终点逐值等于 banana 目标锚点。
- [x] 两枚 `BANANA` 命中后生命值从 `6/6` 变为 `4/6`，DOM 记录 shot count 为 2，在途弹最终全部清理。
- [x] 第二枚起飞触发界面重绘时第一枚仍保留；截图可见两弹分处弹道不同位置，无固定百分比起点或瞬移。
- [x] 设备端能力 API 缺失的可控场景进入浏览器多词模式，仍会识别任一路词条，不切换单目标评分。
- [x] 1440×900、1024×768、390×844 均为 0 横向溢出；开始遮罩、监听状态和炮口可见，主游戏无“精准挑战”按钮。
- [x] `prefers-reduced-motion` 弹道测试确认保留完整起终点并缩短为 180ms 端点交叉淡化。
- [x] 本轮桌面、移动与设备端启动会话控制台均为 0 error / 0 warning；核心 API 与安全响应头正常。

本轮浏览器验收必须生成新的截图或录屏；旧的 `game-projectile-preview-desktop.png` 等单弹截图不能证明双弹并发和真实曲线起点。

## 生产环境：核心上线通过

- [x] Gitee Go #9 对三路修复提交 `594b288664e716a16cf62a75a70ffab8f981c58b` 完成完整 checks/deploy，生产健康 SHA 与功能提交一致。
- [x] 生产 `game.js` 与本地逐字节一致；本次未新增图片、TTS、实时 ASR 或其他付费 AI 调用。
- [x] Gitee 仓库 `main` 包含功能提交 `cf223b928b6674a5c4b578ccba70573b860e0e18`，Gitee Go #7 的完整 checks/deploy 绿色通过。
- [x] 各功能发布后生产 `/api/health` 均返回对应完整 SHA，服务健康；生产 `npm run smoke` 通过。最终文档归档发布后再次按当轮 HEAD 校验。
- [x] HTTPS 首页、教师端、游戏端和 `game.js`、`continuous-speech.js`、`projectile-flight.js` 均为 200；三份关键 JS 的生产 SHA-256 与本地逐字节一致。
- [x] 应用响应头明确向同源开放 `microphone` 与 `on-device-speech-recognition`，CSP、HSTS、DENY frame 和 COOP 未回退。项目 Nginx 仍附加一条旧的同源麦克风策略；Chrome 在该实际响应上成功进入设备端监听，本轮为避免扩大基础设施变更未合并这两条头。
- [x] 生产 Chrome 点击一次后进入“持续监听中”。Mac 真实声学输入一次 `banana` 使 shot count 0→1、HP 6→5；随后一次 `banana banana` 使 shot count 1→3、HP 5→3，准确增加两枚基础弹。
- [x] 首次声学回归暴露低位候选 `banana ×60` 被错误优先的问题；修复为 top-1 + token bucket 后，同一单词声学输入恢复为 1 发、双词恢复为 2 发。confidence 未参与发音分或伤害。
- [x] 持续识词只在 `available/install` 可验证且 `processLocally=true` 时启动；项目未新增 NLS/实时 ASR、原始录音上传端点或计时收费资源，功能增量费用为 0 元。本轮未单独保存浏览器 HAR。
- [ ] 生产域名上的阿里云 SSECP 逐词精准挑战仍可申请临时 warrant、完成录音和温和处理无声/漏读结果。
- [x] 生产 OSS 的 `banana` 标准音实际播放成功；播放期间暂停监听，结束后自动恢复，且未误发子弹。图片资源随游戏页继续正常加载。
- [x] 流水线重新验证固定项目目录、loopback 专用端口、独立 systemd unit、独立 Nginx 域名/upstream 和专属数据目录，隔离结构未变化。
- [x] 既有 `art`、`lessonledger`、`timclass.cn`、`www`、`trace` 五个 hostname 逐一返回 HTTPS 200，本轮部署未影响其他线上项目。
- [x] Push 自动触发仍未由 Gitee 调度；本轮使用同一受控“执行构建”入口完成 #6、#7、#9。真实回滚未重复执行，回滚能力沿用上一版已通过基线。

## 上一版本已验证基线（非本轮签署）

2026-07-21 的上一生产版本已经验证以下基础能力：

- 公共 DNS、HTTPS、项目专属 Nginx/server、loopback 端口、systemd unit、release/shared 目录与五个既有 HTTPS hostname 隔离正常。
- Gitee 私有仓库、完整 checks/deploy、健康检查、SHA 一致性和项目专属回滚链路可用；Push 自动触发配置已开启，但调度器未出单时采用同一流水线手动执行构建。
- 教师端结构化词条草稿/发布隔离、4:3 怪兽图片槽、三词已发布内容包和响应式基础页面通过。
- 阿里云官方 SSECP SDK 自托管加载、生产域名一次性麦克风授权、`en.word_kid.score` WebSocket 与无声/漏读温和重试链路通过。
- 确定性逐词评分曾验证 55/75/92 分分别映射 1/2/3 点伤害，默认怪兽为 6 点生命。

这些记录是本轮复测前的可复用基础设施基线；持续设备端识词、同词双弹和真实曲线弹道已由上方本轮证据重新签署。

## AI 费用与隐私护栏

- 历史图片生成实际调用 1 次并返回 2 张候选，计费上限约 1 元；标准音 TTS 只生成 1 个短词，项目累计费用已控制在 2 元以内。
- 本轮不再生成图片或 TTS，不接入阿里云实时 ASR，不创建 NLS AppKey/Token，也不按录音时长产生新费用。
- Chrome SpeechRecognition 优先在设备端处理；浏览器回退不调用本项目后端或阿里云实时 ASR，本轮功能增量费用为 0 元。
- 阿里云 SSECP 适配器只作为历史能力保留，不由主游戏调用；长期密钥仍只在项目专属服务端环境变量中。
- 原始儿童录音默认不落盘、不写 OSS；持续识词的音频不发送到项目后端。

## 无障碍与响应式回归：待复测

- [ ] 开始按钮、标准音和暂停/继续控制可键盘聚焦，并有清晰 `:focus-visible`。
- [ ] 监听、暂停、不可用、命中等级与生命值有文字或可读名称，不只依赖颜色和动画。
- [ ] 图片替代文字、怪兽生命值和动态命中提示对辅助技术可读，纯装饰弹道不造成冗余播报。
- [ ] 开始遮罩关闭后焦点进入游戏主区域；权限拒绝和本地识别不可用提示可被读屏读取。

## 截图与证据清单

上一版本截图保留在 `output/playwright/`，包括首页、教师端、旧游戏单弹状态和结算页。它们属于历史基线。

本轮已补充：

- `output/playwright/game-start-mobile.png`：点击开始前的移动端引导遮罩；
- `output/playwright/game-banana-double-ballistics.png`：桌面双弹同时在途与两条可见曲线路径；
- DOM 断言：两枚 projectile ID 唯一、两条路径起终点精确、`BANANA` HP 为 `4/6`；
- `output/playwright/game-banana-double-mobile.png`：390×844 双弹响应式状态。
- `output/playwright/game-excellent-impact-desktop.png`：桌面优秀命中的闪光、扩散环、碎片与伤害数字；
- `output/playwright/game-excellent-impact-mobile.png`：390×844 优秀命中，伤害数字与道路标签保持分离。
- `output/playwright/word-soul-effect/word-soul-peak-desktop.png`：APPLE 词图从命中位置放大到约 234×177px，并同时显示清晰词形。
- `output/playwright/word-soul-effect/word-soul-split-desktop.png`：放大词图沿锯齿中线裂为左右两半、旋转碎散并淡出。
- `output/playwright/word-soul-effect/word-soul-concurrent-desktop.png`：APPLE、BANANA、BOOK 三次连续命中同时保留三套独立灵魂图，怪兽位置与进度回退均为 0。
- `output/playwright/word-soul-effect/word-soul-peak-mobile.png`：390×844 下词图放大到约 186×141px，左右边界完整且横向溢出为 0。
- `output/playwright/word-soul-effect/word-soul-reduced-motion.png`：减少动态模式不播放位移和裂开动画，只短暂显示约 203px 宽的静态清晰大图。
- `output/playwright/word-soul-effect/word-soul-v2-intact-desktop.png`：1280×720 下 APPLE 词图从顶部怪兽位置向左下聚拢到中央安全区，完整显示约 460×345px；第 2.1 秒整图仍无裂缝。
- `output/playwright/word-soul-effect/word-soul-v2-split-desktop.png`：同一次命中到第 2.6 秒才进入裂开阶段，整图遮罩退出、左右半图与裂纹同步出现。
- `output/playwright/word-soul-effect/word-soul-v2-book-desktop.png`：底部 BOOK 词图向上移动约 152px 后放大，完整图边界为 478–938px / 185–530px。
- `output/playwright/word-soul-effect/word-soul-v2-apple-mobile.png`：390×844 下动画峰值约 357×268px，左右边界约 17–374px，页面横向溢出为 0，顶部 APPLE 向下移动约 177px。
- `output/playwright/word-soul-effect/word-soul-v2-book-mobile.png`：390×844 下底部 BOOK 向上移动约 118px并完整留在视口内。
- 最终击败实测：第三只怪兽掉血后第 2.8 秒仍停留在 `/game/` 且裂纹可见，约 3.35 秒完成整套动画后才进入 `/results/`，结算不会提前销毁特效。
- `output/playwright/defense-breach-desktop.png`：桌面怪兽左边缘精确抵达终点线并显示破线反馈；
- `output/playwright/defense-breach-mobile.png`：390×844 手机触线状态，实际终点误差约 0.01px 且无横向溢出。

本轮已补充生产健康 SHA、权限策略、真实声学 `banana banana`、标准音暂停/恢复和五个既有 hostname 隔离记录。课堂上线前仍建议由实际儿童声音做一次人工体验验收；设备端不可用浏览器 fallback 与阿里云逐词精准挑战保留为后续兼容性回归项。

自动化门禁、本地真实浏览器和生产核心复测均已完成，本轮核心上线结论为“通过”；上方未勾选的兼容性与无障碍项目继续作为明确的后续回归清单，不影响本次隔离发布结论。
