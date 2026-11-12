# 游戏平台地图与关卡扩展契约

> 2026-10-28 最新地图循环决定：新局使用[云港个人闭环](CLOUD_HARBOR_CIRCUIT.md)，每人独立绕圈，全员完成当前圈后刷新 bonus。它明确覆盖本文向前远征的默认要求；原世界路线版本仅用于旧局恢复。没有更改语音评分、骰子或最终落点到账链路。

> 2026-10-19 最新奖励决定：[只保留最终停格家园积分](POINTS_ONLY_REWARDS.md)。旧金币、星星、骰面附加奖、兑换和整局参与奖已退役；下文相关内容仅作历史兼容。保留真实语音评分、骰点概率、路线和地图设施，历史资产不折算、不补发。

2026-09-07 奖励与资产作用域更新：参见 [单局星星规则](SESSION_STAR_ECONOMY.md)。
正式可编辑奖励为 `none / coin / star`，旧 `card` 配置等量迁为星星。语音与地图主循环不变。

2026-09-23 用户选择「梦幻水晶云港」整图，并要求节点与道路匹配地形。
新局使用 `ximitu-card-hunt-board.v1@2.2.1`、`cloud-harbor@2.2.1` 与
`world.ximitu.cloud-harbor@1.2.1`。只调整节点坐标、明确道路曲线及视觉，节点身份、
图拓扑、运输、奖励与主循环不变。旧 2.1.0 Board/Theme、1.1.0 World/Route 和美术完整
保留供旧局恢复，不以新几何热替换旧棋局。实现与验收见 [梦幻水晶云港](CRYSTAL_HARBOR_SCENE_V1.md)。

- 状态：项目级长期契约
- 版本：`game-platform-extension-contract.v1.5`
- 日期：2026-08-06
- 适用范围：通用声控棋、地图 1–8、后续地图/关卡/道具/主题扩展

这份文档不是创意提案，而是以后制作地图和关卡时的产品与工程边界。聊天总结只用于
交接；本文件、根目录 `AGENTS.md`、运行时代码和自动测试共同构成可持续的项目记忆。

用户可以明确修改产品决定，但不能由实现者在重构、换主题、做特效或修 Bug 时顺手
改变。若确需改变本契约，必须在同一次任务中说明影响，同时更新实现、测试和本文版本。

## 1. 永久不变的游戏核心

地图可以改变“落地之后发生什么”，但不能改变“如何获得一次合法移动”。

```text
学生真人录音
→ 服务端用 Session / turnId / attemptId 锁定当次任务和评分策略版本
→ 服务端独立获取 final transcript 与供应商原始证据
→ 评分策略先判断主知识点，再处理发音与流利度
→ 页面直接显示真实得分或明确的不确定状态
→ 合法结论触发骰子
→ 玩家逐格移动并显示完整计划路线
→ 真实最终落点最多结算一个主要地图设施及其固定 Trigger / 奖励
→ 处理该落点需要的道具、奖励或玩家选择
→ 保存结果并推进回合
```

### 1.1 正确答案

明确正确时，最终得分只由真实证据组成：

| 分项 | 权重 |
|---|---:|
| 知识正确性 | 60 |
| 目标词发音 | 25 |
| 整句发音 | 10 |
| 流利度 | 5 |

任何必需证据缺失都不能用常量、随机数、浏览器猜测或供应商总体分补齐。

### 1.2 明确错误

学生确实说错主知识点时：

- `knowledgeStatus = "wrong"`
- `primaryAccepted = false`
- `score = 45`
- 高供应商总体分、高发音分或高流利度都不能把 45 分抬高
- 页面直接展示 45 分，不弹出“请教师确认学生是否答对”的窗口
- 保留真实错误证据，然后进入既定骰子、移动和地图结算
- 错误不能生成“知识已掌握”证据

### 1.3 无法判断

只有证据缺失、ASR 真正歧义或必需分项不可用时，才进入重试或教师复核：

- `score = null`
- 不显示伪造分数
- 在获得合法结论前不产生骰值、不移动、不结算地图效果
- 教师复核是证据异常出口，不是明确答错后的常规确认步骤

### 1.4 保护方式

当前关键代码与测试包括：

- `public/js/lib/assessment-policy.js`
- `tests/assessment-policy.test.js`
- `tests/assessment-policy-v2.test.js`
- `tests/voice-board-assessment.test.js`
- `tests/voice-board-assessment-http.test.js`
- `tests/universal-board-turn-flow-guard.test.js`

地图扩展不得通过前端分支绕过这些模块，也不得创建第二套评分或骰子流程。

## 2. 版本化所有权

| 层 | 负责 | 严禁拥有 |
|---|---|---|
| EngineContract | 回合、骰子、路径事务、结算顺序、幂等、存档 | 地图专属文案、知识点、主题美术 |
| DicePack | 六种正式骰子的六个实体面、每面点数与受限奖励 | 分数阈值、本轮实际结果、地图/题目/评分证据 |
| BoardTemplate | 世界尺寸、区域、节点、边、道路几何、运输、效果引用 | 题目、标准答案、背景图片内容 |
| ThemePack | 背景、配色、道路/节点皮肤、地标、音效与演出 | 判分、骰子概率、奖励规则 |
| LevelPack | 剧情阶段、区域资源、地图状态、地图事件、胜利条件 | 具体知识答案、ASR 证据 |
| NodeRewardPack | 精确地图/关卡版本下，`none / coin / card` 落点槽的受限覆写 | 普通节点密度、路线、运输、机关、活动、发现、世界穿越、评分与骰子 |
| LearningPack / Task Pack | 教学目标、任务、提示、标准答案、素材 | SVG 坐标、地图道具、骰子与移动 |
| AssessmentPolicy | 正确/易混形式、证据规则、权重、评分动作 | 地图、剧情、资源与美术 |
| Legacy ClassroomEventProgram | 仅兼容读取旧发布数据，不进入新 Session 主循环 | 新题目、固定 Trigger、评分、奖励、骰子、移动、路线、地图状态与任意脚本 |

`GameRelease` 只引用以上各包的确定版本。不能靠运行时猜测“现在大概是哪张地图”
或读取某个知识点名称来选择地图效果。

DicePack 只能由项目所有者经严格校验后发布。六面必须显式存在并等概率抽取，不能保存
任意 `weight`；它也不能直接保存本轮 `faceIndex / steps / roll`。Session 创建时锁定完整
DicePack 快照和发布 revision，热发布不得改变正在进行或刷新恢复的棋局。

NodeRewardPack 同样只能由项目所有者发布，并必须完整引用当前两个 WorldPack 对应的精确
`boardRef`、`levelRef` 与全部节点。它只允许既有纯资源槽在“沿用默认 / 无资源 / 金币 /
星星 / 钥匙”之间按上限调整；普通 no-op 节点和岔路、运输、机关、活动、精灵踪迹、发现、
展廊、世界门保持只读。Session 创建时锁定完整 NodeRewardPack 快照；同一快照必须同时
驱动节点图标、说明和最终落点到账，热发布不得改变进行中或刷新恢复的棋局。

题目、答案和评分依据只属于掷骰前的 LearningPack / Task Pack。最终落点节点不得绑定或
追加课堂题目；旧 `ClassroomEventProgram` 只允许兼容读取和迁移，不再提供发布入口，也不
进入新 Session。节点编辑只允许选择已注册的地图 Trigger、道具与奖励；运输、portal、
goal 和分岔的拓扑字段继续保持锁定。

## 3. 地图效果与知识点完全无关

地图效果可以读取：

- 当前玩家、当前区域和节点
- 本次骰值
- 已提交的路线与路线选择
- 玩家道具、共享资源和区域状态
- 已处理事件 ID
- Session 的稳定随机种子

地图效果不得读取：

- 学科、单元、教材或知识点
- `learningPackId`、任务 ID 或教学目标 ID
- 题目、标准答案或模型答案
- transcript、识别候选词或供应商语音分
- 最终得分、分数等级或掌握等级

必须保持两个交换律：

```text
相同地图输入 + 不同 LearningPack = 完全相同的地图结果
相同语音证据与 AssessmentPolicy + 不同地图 = 完全相同的评分结果
```

地图特效只能丰富世界观和剧情：例如港口雾笛锁定目标、信号炮完成运输、云瀑水门
开启共享航道。它不能因为题目是 have/has、方位介词或科学概念而变化。

最终落点没有独立课堂题目层。不同 LearningPack 只改变掷骰前的任务与评分依据；在合法
得分、骰点、路线和地图状态相同的情况下，最终地图 Trigger、奖励和状态必须完全相同。

## 4. 当前四区与后继 WorldPack 的真实状态

页面当前展示的 Zone 01–04 是第一个 `WorldPack` 内同一 `BOARD_TEMPLATE` 的四个
区域，不等于四个独立世界。2026-07-30 的产品决定要求：最后一格只向前穿越下一
WorldPack，禁止回到本世界起点。现有原型已完成 WorldPack 注册和四区正式背景接入；
仍需保护以下兼容边界：

- `BOARD_TEMPLATE`、`LEVEL_ONE` 仍作为旧调用方的兼容导出存在，但运行时组合必须经注册表解析
- 部分地图效果演出仍在 `app.js` 内按具体效果硬编码
- Zone 01–04 均具备同源分区引导图和整图空间总控；2.2.1 使用用户选定的水晶背景，
  2.1.0 的 v3 背景和引导图继续供旧局使用

因此：

- 一个 WorldPack 最多四区；新区超过四区时必须追加下一 WorldPack。
- 增加后继世界前，必须先完成注册表化，而不是复制页面。
- forward exit 到下一世界的 transition 不消耗骰点；剩余点数必须继续逐格走完。
- 课堂 Session 的公平结束与世界位置独立，不以回到起点或归港为条件。

目标结构：

```text
GameRelease
├── BOARD_TEMPLATES[boardTemplateRef]
├── DICE_PACKS[dicePackRef]
├── THEME_PACKS[themePackRef]
├── LEVEL_PACKS[levelPackRef]
├── WORLD_PACKS[worldPackRef]
├── WORLD_ROUTES[worldRouteRef]
├── REWARD_DEFINITIONS[rewardRef]
├── NODE_REWARD_PACKS[nodeRewardPackRef]
├── LEARNING_PACKS[learningPackRef]
├── ASSESSMENT_POLICIES[assessmentPolicyRef]
├── LEGACY_CLASSROOM_EVENT_PROGRAMS[legacyRef]（只读迁移，可省略）
├── MAP_EFFECT_DEFINITIONS[effectRef]
└── MAP_EFFECT_PRESENTERS[presenterRef]
```

还必须有统一组合校验器，检查：

- 所有引用存在且版本兼容
- DicePack 恰有六种正式骰子、每种恰有六个合法实体面，且不拥有评分阈值或本轮结果
- WorldRoute 的普通 transition 图无环；forward exit 有唯一后继，或仅在终端声明
  `append-new-instance-v1` 的安全 `repeatableTail`，且全部引用不使用 `latest`
- 节点、边、道路几何和运输目标合法
- 每个节点都有 LevelPack 的显式 `rewardRef`
- NodeRewardPack 完整覆盖精确 Board/Level 版本的全部节点，且只有纯资源槽允许受限覆写
- 新 Session 不引用 `ClassroomEventProgram`，节点 Trigger 数据不包含题目、答案、录音、
  transcript、score、评测器或脚本字段
- LevelPack 只引用 BoardTemplate 已声明的插槽
- ThemePack 覆盖所需视觉语义但不拥有规则
- 地图效果定义与演出可以缺省回退，不会阻塞主循环
- LearningPack 不含地图、美术和移动字段

不得采用：

- `if (map5) ... else if (map6) ...`
- 为每张地图复制一份 `app.js`
- 把道路坐标写进背景生成提示后不再保留机器可读源
- 让知识包决定地图道具或地图背景

## 5. 新地图/关卡的固定制作顺序

以下顺序是门禁，不是建议。

### 阶段 0：判断扩展类型

先明确本次是：

- 同一 BoardTemplate 的新区
- 同一地图的新 ThemePack
- 同一地图的新 LevelPack
- 全新的独立 BoardTemplate

若是独立地图而注册表化尚未完成，先完成公共注册表和组合校验器。

退出条件：知道本次改动属于哪一层，不会把知识、地图和主题混在一个对象里。

### 阶段 1：冻结主循环

记录并运行当前语音评分、骰子、逐格移动、回合与存档基线。地图工作不得顺手修改
评分权重、错误分数、教师复核条件、骰子概率或回合顺序。

若用户明确要求编辑骰面，改动仍必须局限在版本化 DicePack：不得把分数阈值、评分出口、
当前 roll 或地图拓扑一并开放；发布版本只影响新 Session。

若用户明确要求编辑节点奖励，改动必须局限在版本化 NodeRewardPack：坐标、拓扑、普通
节点密度和固定机制不进入编辑字段；页面可列出全部节点，但只解锁纯资源槽。发布版本只
影响新 Session，当前棋局继续使用创建时锁定的完整快照。

节点编辑不得绑定课堂题目。题目编辑只修改掷骰前的 LearningPack / Task Pack；节点编辑
只修改受限的地图 Trigger、道具和奖励，且不能读取或写入评分证据。

退出条件：核心测试通过，且本次变更清单不包含主循环文件；如确需包含，必须得到
用户对该行为变化的单独明确授权。

### 阶段 2：写一页地图体验规格

先回答：

- 这是哪里，玩家在这里帮助谁完成什么
- 该区域独有的资源是什么
- 1–2 个最能体现地点的地图设施是什么
- 每个设施分别改变位置、路线、目标状态、共享地图状态还是视觉环境
- 首次和重复触发有何差异
- 如何在 1 秒左右让孩子看懂“发生了什么”
- 如何避免惩罚、掠夺、长连锁和额外货币膨胀

效果必须强关联地图地点，但不得绑定知识点。

退出条件：只读文字也能说明“为什么这个效果只能属于这张地图”，且效果之间不是
同一种奖励换图标。

### 阶段 3：先确定代码道路和拓扑

在 BoardTemplate 中先固定：

- 世界尺寸、视窗和区域边界
- 节点 ID、坐标、角色和命中区
- 边、分岔顺序、汇合和跨区接缝
- 每条边的明确几何与地形语义
- 运输起点、飞行/行驶经过点和最终落点
- 地图设施、前景遮挡和动态特效锚点

道路几何不能只由渲染器依据节点临时“猜一条弯线”。目标模型应允许每条边声明
折线、二次/三次贝塞尔控制点或经校验的路径引用，以及 `ground / bridge / water /
cloud / transport` 等地形类型。

退出条件：无背景图时，纯 SVG 棋盘已可玩、可读、可走通。

### 阶段 4：从同一数据导出 1:1 美术引导图

引导图必须从同一 BoardTemplate 生成或校验，至少包含：

- 精确画布和裁切范围
- 路线中心线与足够宽的低矮安全走廊
- 节点和命中区
- 分岔、汇合、跨区接缝
- 地标、地图设施和动态特效锚点
- 运输经过点、落点和飞行净空
- 前景可遮挡区与禁止高物区
- `layoutContractRef`

退出条件：改变任何节点、边、道路几何或运输落点都会使引导图校验失败。

### 阶段 5：按引导图制作背景

背景可以包含地貌、港湾、建筑、云层、远景和氛围，但不得烘焙：

- 可交互棋格和节点
- 权威路线边缘或路线箭头
- 角色、棋子和动态道具
- 文本、标牌内容、HUD 和按钮

背景中的真实桥、栈道、航道或云路必须对应代码道路。若只是装饰，视觉上不能让玩家
误以为可以通行。道路安全走廊内只放低矮地表、云雾、水面或可被道路覆盖的纹理。

退出条件：背景以准确比例覆盖 `artBox`，不靠静默裁切修正错位，且道路叠加后不会
穿建筑、悬空或偏离可通行表面。

### 阶段 6：实现纯规则与独立演出

地图效果拆成：

- `definition`：纯数据/纯规则，决定合法输入、状态变化和确定性结果
- `presenter`：声音、粒子、相机、动画和儿童可读文案

演出失败只能降级为可读文本和基础 SVG，不得重算骰子、改变路线、重复发奖励或卡死
回合。规则测试不得引用具体知识任务 ID。

退出条件：纯规则可以在 Node 测试中运行，Presenter 404 或低动态模式仍可完成回合。

### 阶段 7：只做线上垂直切片

先实现一个区域和 1–2 个强地图效果，不立即铺满整张地图。构建到线上隔离入口后，
让用户实际判断：

- 是否一眼能看懂
- 是否真的有趣
- 是否与地点强相关
- 是否拖慢课堂
- 是否遮挡得分、骰子和路线

不够有趣时只回退/调整该效果层，不触碰已冻结的评分和主循环。

退出条件：用户明确认可方向。

### 阶段 8：扩完整地图与内容组合

方向确认后再补齐：

- 完整区域美术和接缝
- 地图资源与剧情进度
- 全部效果演出和声音
- 独立 LearningPack / AssessmentPolicy 组合
- 1/2/4/8 人、移动端、低动态和刷新恢复

LearningPack 和地图独立制作，最后由 GameRelease 组合；不按知识点重画地图。

### 阶段 9：版本化、发布和真人验收

- 固定 BoardTemplate、ThemePack、LevelPack、LearningPack、AssessmentPolicy、
  DicePack、NodeRewardPack、TriggerPack、CardCatalog、layout contract 的精确版本
- 跑完整自动化和视觉门禁
- 仅在用户授权当次部署后执行安全发布
- 用户验收使用线上构建，不用本地页面冒充
- 最终评分验收必须使用真人录音；模拟证据只能证明工程分支，不能冒充阿里云成绩

## 6. 道路—背景布局契约

### 6.1 单一几何来源

`BoardTemplate` 是节点、边、道路几何、运输和命中区的唯一事实来源。布局引导图、
缩略图、运行时道路、路线预览和地图美术校验都必须消费同一来源。

当前 World 01 四区已有：

- BoardTemplate：`public/prototypes/universal-board/packs.js`
- 新版引导图：`art-source/cloud-harbor/crystal-v2/layout-guides/zone-01-layout-guide.svg` 至 `zone-04-layout-guide.svg`
- 新版空间总控：`art-source/cloud-harbor/crystal-v2/world-01-imagegen-control-guide.svg`
- 新版背景：`public/assets/board-themes/cloud-harbor/regions/zone-01-crystal-v1.jpg` 至 `zone-04-crystal-v1.jpg`
- 新版布局门禁：`tests/crystal-harbor-layout.test.js`
- 旧 2.1.0 的 `regions-v2/layout-guides`、`regions-v3` 总控、`zone-*-v3.jpg` 保留原始字节；
  `tests/universal-board-layout-contract.test.js` 继续固定验证旧版，不覆盖为新图

四区分别绑定：

```text
board.ximitu-card-hunt.zone-01-layout.v6
board.ximitu-card-hunt.zone-02-layout.v4
board.ximitu-card-hunt.zone-03-layout.v2
board.ximitu-card-hunt.zone-04-layout.v2
```

### 6.2 图层顺序

固定渲染顺序：

1. 地形回退
2. 裁切后的背景图
3. 区域过渡与接缝
4. 道路阴影、轮廓和底色
5. 道路纹理、亮边和当前路线流光
6. 地标
7. 节点、命中区和状态
8. 棋子
9. 地图动态设施与瞬时特效
10. HUD、得分、骰子和教师控件

图片加载失败只能显示回退层；不得重建拓扑或阻塞游戏。

### 6.3 视觉验收门禁

至少在桌面 1440、窄桌面/平板 1024、移动端 375 下验证：

- 每个节点位于对应道路上
- 所有合法分岔清晰，非法方向不似可通行
- 道路不穿建筑、悬崖和高前景
- 跨水和跨空有明确桥、船、云路或运输解释
- 背景没有假路线、假桥或假入口
- 区域接缝连续，路线在相邻区域不跳变
- 棋子经过前景时遮挡关系合理
- 运输起点、经过点、最终落点和动画完全一致
- 道路纹理不会盖住节点、当前路线或分岔提示
- 低动态模式仍能读出结果

自动测试可以阻止坐标和版本漂移，但不能代替人眼判断道路是否“贴着环境长出来”。
布局冻结必须同时拥有自动测试和真实浏览器截图证据。

## 7. 第一区的世界观边界

Zone 01“启航海湾”使用港口/码头/云港世界观。首批核心设施以
[`XIMITU_CARD_HUNT_ZONE_01_ITEM_SPEC.md`](./levels/XIMITU_CARD_HUNT_ZONE_01_ITEM_SPEC.md)
为准：

- 停靠锚：影响下次移动的落点选择
- 港口雾笛：锁定/揭示地图目标
- 云霄信号炮：`n06a → n09` 的主题运输
- 云瀑水门：开启共享云阶捷径
- 离港信标：区域结束演出

这些设施改变的对象分别是停止位置、目标状态、棋子位置、地图拓扑和区域环境。
它们不因正在练习的知识点而改变，也不创建第二套可累计货币。

## 8. 自动化与交付检查表

每次地图/关卡工作完成前逐项确认：

- [ ] 没有改动 60/25/10/5、明确错误 45 分或教师复核边界
- [ ] 没有新建第二套“录音 → 分数 → 骰子”流程
- [ ] DicePack 只包含六个等概率实体面及受限奖励，不含分数阈值或指定本轮结果
- [ ] 进行中 Session 锁定创建时 DicePack，发布新版本不会热替换
- [ ] NodeRewardPack 完整覆盖精确地图/关卡版本，且只开放受限纯资源槽
- [ ] 同一 NodeRewardPack 快照驱动节点展示与最终落点到账，进行中 Session 不热替换
- [ ] 新 Session 不创建落点课堂题目，最终落点只处理 Trigger、道具和奖励
- [ ] 节点 Trigger 数据不含题目、答案、录音、transcript、score 或评测器字段
- [ ] 地图效果输入不含知识、transcript 或 score
- [ ] 换 LearningPack 后地图结果保持相同
- [ ] 换地图后相同证据得分保持相同
- [ ] BoardTemplate 是道路与节点唯一事实来源
- [ ] 引导图、背景和 BoardTemplate 使用同一 `layoutContractRef`
- [ ] 背景没有烘焙棋格、路线、文字、HUD 或假通路
- [ ] 运输动画经过点和最终落点与规则一致
- [ ] 视觉层失败不会改变规则或卡住回合
- [ ] 一个区域的线上垂直切片先经过用户趣味性确认
- [ ] 自动化测试与真实浏览器多尺寸验收通过
- [ ] 未经授权没有 stage、commit、push 或部署
- [ ] 没有展示密钥，也没有把模拟结果写成真人/阿里云成绩
