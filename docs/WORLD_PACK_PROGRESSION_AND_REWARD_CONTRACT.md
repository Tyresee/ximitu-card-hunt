# WorldPack 向前扩展与节点奖励合同

> 2026-10-28 最新决定：新局改为[云港个人闭环与全班 bonus 刷新](CLOUD_HARBOR_CIRCUIT.md)。采用独立的 `route.ximitu-circuit@1.0.0` 与 `individual-laps-v1`；到终点只返回行动学生，全员完圈再统一刷新 bonus。下文第 1–8 节的单向世界、共享迁移与 repeatable tail 继续约束旧远征路线，不覆盖新圈制。评分、骰点和唯一最终落点结算边界仍然适用。

> 2026-10-19 最新奖励决定：[只保留最终停格家园积分](POINTS_ONLY_REWARDS.md)。旧金币、星星、骰面附加奖、兑换和整局参与奖已退役；下文相关内容仅作历史兼容。保留真实语音评分、骰点概率、路线和地图设施，历史资产不折算、不补发。

2026-09-07 更新以 [单局星星规则](SESSION_STAR_ECONOMY.md) 为准：金币与星星替代金币与卡片。
世界穿越及继续章节属于同一棋局，资产保留；老师结束后新局归零。旧卡片表述只作迁移参考。

> 状态：2026-07-31 用户决定，覆盖任何早期“终点回到起点”“完成一圈”设计。
>
> 适用范围：所有地图、关卡、主题、LearningPack 和课堂 Session。

## 1. 产品决定

世界是一条可持续追加的远征路线，不是一张循环棋盘。

- 一个 `WorldPack` 最多承载四个 art region。
- 当前世界最后一格是 forward exit，不是回程边。
- 全班共享一个 active world。当前棋子穿越时，其他棋子随队抵达下一世界入口。
- 旧世界的 SVG、区域图和临时视觉状态随后卸载；个人资产、课堂机会、卡册和剧情发现保留。
- 课堂结束条件仍由最低发言机会与最低总回合决定，与是否走到世界出口无关。
- “无限”优先表示不断发布新的不可变 WorldPack 和 WorldRoute 版本；当后继美术世界
  尚未发布时，只允许 WorldRoute 显式声明一个安全的 `repeatableTail`，复用尾部
  WorldPack 模板创建 `ordinal + 1` 的全新实例。它不回到旧实例、不恢复旧入口状态，
  也不把普通 WorldRoute 边改成自环。

## 2. 唯一正式回合链

跨世界不得改变既有正式流程：

```text
真人录音
→ 服务端绑定任务并用真实证据评分
→ 页面先显示评价与得分
→ 得分选择骰子档位
→ 合法骰池随机产生实际骰点
→ 预先提交完整路线
→ 当前世界逐格移动
→ 必要时播放零步耗穿越
→ 下一世界继续剩余骰点
→ 仅在真实最终落点结算固定地图 Trigger 与奖励
→ 处理该落点需要的道具、奖励或玩家选择
→ 保存并推进回合
```

- 明确知识错误仍固定 `45` 分，不弹教师确认，进入起步骰和移动，但不记录知识掌握。
- `score: null` 不得生成骰子、路线、穿越、发现或地图奖励。
- 世界、奖励和地图 reducer 不得读取 LearningPack、task、题目、答案、transcript、
  score 或骰子档位。
- 骰面奖励来自 Session 锁定的独立 DicePack，不属于 WorldPack、BoardTemplate、
  ThemePack、LearningPack 或节点落点奖励；DicePack 发布新版本不得改变进行中棋局。
- 题目、真人录音和真实评分只属于掷骰前的正式任务；最终落点之后不追加课堂题目、
  第二次录音或第二次评分。

## 3. 数据分层

### 3.1 BoardTemplate

BoardTemplate 只定义单个世界内部的权威几何：

```js
{
  kind: "BoardTemplate",
  id: "board.cloud-harbor",
  version: "2.0.0",
  entry: { id: "main", nodeId: "n01" },
  exits: [{
    id: "forward",
    nodeId: "n49",
    transitionProfileRef: "world.portal.forward.v1",
  }],
  zones: [],       // 1–4
  artRegions: [],  // 1–4
  nodes: [],
  edges: [],
}
```

强制条件：

- forward exit 在本 BoardTemplate 内出度为 `0`。
- 除声明出口外不得存在死路。
- 所有节点、入口和出口可达。
- BoardTemplate 不得通过普通 edge 引用另一个世界的节点。
- 每个 art region 都绑定与道路同源的 `layoutContractRef`。

### 3.2 WorldPack

WorldPack 是可单独装载和卸载的地图内容组合：

```js
{
  kind: "WorldPack",
  id: "world.cloud-harbor",
  version: "1.0.0",
  boardTemplateRef: "board.cloud-harbor@2.0.0",
  themePackRef: "theme.cloud-harbor@2.0.0",
  levelPackRef: "level.cloud-harbor@2.0.0",
  assetBudget: { maxArtRegions: 4 },
}
```

WorldPack 不得含 `learningPackRef`、task、题目、答案、评分、transcript 或运行时代码。

### 3.3 WorldRoute

跨世界连接属于单独、可版本化的路线，不固化进 WorldPack：

```js
{
  kind: "WorldRoute",
  id: "route.ximitu-main",
  version: "1.0.0",
  entryWorldRef: "world.cloud-harbor@1.0.0",
  transitions: [{
    fromWorldRef: "world.cloud-harbor@1.0.0",
    exitId: "forward",
    toWorldRef: "world.star-islands@1.0.0",
  }],
  repeatableTail: {
    worldRef: "world.star-islands@1.0.0",
    exitId: "forward",
    instancePolicy: "append-new-instance-v1",
  },
}
```

校验器必须拒绝缺失引用、`latest`、同一出口多目标、回到已访问实例的环，以及正式
release 中没有后继方案的 forward exit。普通 `fromWorldRef === toWorldRef` 仍然是
非法自环；`repeatableTail` 不是 transition edge，只有同时满足以下条件才合法：

- 精确指向有限 WorldRoute 中已经可达的终端 WorldPack；
- BoardTemplate 只有一个出口，且出口 ID 与声明精确一致；
- 该 WorldPack 没有其他 authored outgoing transition；
- `instancePolicy` 固定为 `append-new-instance-v1`；
- 每次穿越生成与当前及已完成实例都不同的新 `instanceId`，并把 ordinal 精确加一。

## 4. 跨世界移动

- 到达出口节点消耗骰子的正常一格。
- `world_transition` 的步数成本固定为 `0`。
- 若仍有骰点，当前棋子从下一世界的中性 arrival 节点继续走。
- arrival 节点不得自动发大奖、启动运输或触发主要地图效果。
- 一次骰子最多穿越一个世界实例边界。
- `pawn_step` 总数必须严格等于实际骰点；不能因为死路少走。
- 只在完整计划的最终落点触发最多一个主要奖励/地图效果。
- 规则状态先原子持久化，再播放动画；刷新不得重掷、重走或重复发奖。
- 新实例的 `mapState` 和 `levelState` 必须从该 WorldPack 的
  `initialMapState` / `initialLevelState` 建立；不得继承刚归档实例已经开启的桥梁、
  发现列表或临时设施。

全班共享远征的携带规则：

- 当前棋子落在完整路线的最终节点。
- 其他棋子落在下一世界入口。
- 个人金币、卡片、重复次数、角色和课堂发言机会全部保留。
- 旧存档中的星星、钥匙、待开卡盒与卡卡精灵只迁入带来源说明的只读审计区，不得静默
  丢失，也不得重新变成新局可消费资源。
- 旧世界相机、hover、路线预览、临时设施和图片引用默认不保留。

## 5. 节点奖励合同

LevelPack 必须为每个节点显式声明：

```js
nodeBindings: {
  n01: {
    semanticType: "unknown",
    rewardRef: "reward.curiosity.card-peek.v1",
    repeatRewardRef: "reward.display.album-spotlight.v1",
    label: "潮汐卡影",
    teaser: "卡背后面藏着谁？",
  },
}
```

不允许依赖 node ID 数组、`spaceRole` 或 ThemePack 图标推断规则。ThemePack 只负责皮肤、
动画和声音。

### 5.1 普通节点与特殊节点的固定密度

2026-07-31 起，每个 WorldPack 约一半节点是显式 `ordinary`，另一半才是资源、发现、
选择、运输、地图设施、活动或世界出口。节点总数为奇数时只允许相差 1：

- World 01：30 个 ordinary、31 个 special。
- World 02：31 个 ordinary、31 个 special。

`ordinary` 仍必须拥有 LevelPack 的显式 `rewardRef`，但其结算必须是严格 no-op：

- 不发金币、星星、钥匙、卡盒、卡片或其他资源；
- 不生成地图、图鉴、展廊或节点事件；
- 不写 shared / per-player discovered 状态，不改变 mapState；
- 不显示节点发现横幅、不播放节点音效、不使用落点角色文案兜底；
- 只保留棋子逐格移动后的通用落地动作、位置提交和回合原子存档。

普通节点可以继续使用地点专属名称和精美环境视觉，但不能用奖励徽章制造“会发东西”的
误导。岔路、条件岔路、运输、地图设施、活动、图鉴和 forward exit 不得降级为
ordinary；任一合法路线连续 ordinary 不超过两个。真人发言固定获得的参与奖励属于
回合层，不属于节点奖励，界面必须明确标为“发言奖励”。

### 5.2 好奇心节奏

奖励必须交替制造以下体验：

1. 未知：卡片剪影、世界局部轮廓、设施线索。
2. 选择：两条路线或两张未收集卡的明确差异。
3. 收集：复用金币、卡片盒和卡片。
4. 组合：只有最终落在固定兑换站后，玩家才可主动执行
   `5 金币 → 1 卡片盒 → 立即开出 1 张卡片`。
5. 展示：卡册亮相、桥梁修复、灯塔点亮、世界印记。
6. 再次未知：把注意力引向下一区或下一世界。

不得为了“更多奖励”增加第二组可消费货币。连续安静节点不超过两个；大型演出每区
约一至两个，重复触发使用短版演出。

### 5.3 允许的核心 rewardRef

- `reward.curiosity.card-peek.v1`
- `reward.curiosity.route-scout.v1`
- `reward.curiosity.world-peek.v1`
- `reward.choice.route.v1`
- `reward.choice.next-card.v1`
- `reward.collect.coin-1.v1`
- `reward.collect.card-case-1.v1`
- `reward.exchange.coin-card-case.v1`
- `reward.display.album-spotlight.v1`
- `reward.display.region-change.v1`
- `reward.display.retired-fairy-signal.v1`（只展示历史线索，不生成精灵或二次交互）
- 世界专属 item、map effect、transport、region effect
- `world.portal.forward.v1`

每个结果使用稳定 settlement ID 幂等；首次和重复文案必须都存在。演出失败只降级成
文字，不得重算资源、骰点或位置。

### 5.4 NodeRewardPack 编辑覆写

逐节点奖励编辑不直接改写 LevelPack，也不把奖励字段塞进 BoardTemplate 坐标草稿。
它使用独立、版本化的 `voice-board-node-reward-pack.v1`：

- 必须同时保留当前两个 WorldPack，并精确匹配各自 `boardRef`、`levelRef`；
- 必须为两个世界的每个节点且只提供一个策略，禁止遗漏或附加未知节点；
- 策略只允许 `none / coin / card_case`；金币为 1–3，卡片盒固定为 1；
- 只有 LevelPack 已声明的纯资源槽或 progress-unit 槽可编辑；
- ordinary、岔路、条件路线、运输、地图机关、活动、经过触发、精灵踪迹、发现、图鉴、
  展廊、世界景观与 forward exit 必须保持 `none`；
- 禁止出现 score、transcript、骰子、权重、步数、路线、脚本或任意效果字段。

编辑器必须列出全部节点，明确展示当前固定效果、默认资源和锁定原因；坐标、骰子与节点
奖励分别保存、分别发布。新 Session 创建时锁定完整 NodeRewardPack 及 revision，刷新和
继续远征仍使用该快照。最终奖励覆写只能在完整逐格移动结束后，对真实最终落点结算一次；
同一份快照同时决定地图节点图标、说明和到账资源。

### 5.5 系统 Trigger 与题目边界

LevelPack / RewardDefinition / BoardTemplate 已声明的奖励、发现、机关、运输、portal、
world transition 等都是地图 Trigger。题目只属于掷骰前的 LearningPack / Task Pack，
不得绑定到最终落点；旧 `voice-board-classroom-event-program.v1` 仅兼容读取和迁移。

- 节点编辑器只允许选择注册的地图 Trigger、道具和奖励。
- 运输、portal、goal、分岔和条件道路的权威拓扑继续锁定。
- Trigger 数据禁止题目、答案、录音、transcript、score、evaluator、脚本、HTML、CSS、
  表达式、回调地址和任意网络请求。
- `ordinary` 仍是严格地图 no-op，不追加题目或奖励。

## 6. 本地存档

从单板存档升级时：

1. 先按旧 schema 完整验证。
2. 保存原始 JSON 到版本备份键，不覆盖不同内容的已有备份。
3. 旧 BoardTemplate 保守映射为第一个 WorldPack；不得根据回合数猜测过去循环次数。
4. 保留 Session、taskIndex、processedAttemptIds、个人账本、精灵卡盒和当前队伍位置。
5. 旧 ClassroomEventProgram 只保留备份或兼容读取，新 Session 不引用该数据。
6. 新存档写入后重新读取并校验；失败则恢复旧原文。

当前没有服务端棋局存档，因此只能承诺同一浏览器恢复，不能宣称跨设备同步。

## 7. 美术与性能

- 道路、节点、分岔、运输和出口先在 BoardTemplate 中冻结。
- 从同一模板导出每区 1:1 引导图后，才可生成或绘制背景。
- 背景不得烘焙棋格、可点击道路、HUD 或动态状态。
- 任意时刻 DOM 中最多四张当前世界区域图，只保留一个 board SVG 和一个 minimap。
- 缺图或 404 时必须立即回退到可玩的 SVG；规则和位置不得改变。
- 世界切换先呈现 SVG fallback，再异步解码背景；视觉加载不得阻塞规则提交。

## 8. 必须锁定的测试

- 旧世界出口无内部回边，WorldRoute 无环。
- 骰点 `1–6` 跨出口后 `pawn_step` 数严格等于点数，transition 恰好一次且零步耗。
- 显式 repeatable tail 可连续创建多个 ordinal 递增的新实例；普通 self-edge、
  非终端 tail、复用当前/历史 instanceId 都被拒绝。
- World 02 `w2n52` 穿越后仍可在新 World 02 实例继续剩余骰点，连续多次抵达尾部
  不得出现 dead-end throw，且每次 map/level state 都从初始值开始。
- `45` 分可以正常穿越；`score: null` 没有骰子、路线或 transition。
- 同一地图输入更换 LearningPack，路线、世界和奖励结果完全相同。
- 运输、portal、world transition 后只在完整路线的真实最终落点结算一次地图结果。
- 最终落点不会创建课堂题目、第二次录音、第二次评分、骰子或移动。
- 每个 BoardTemplate 的所有节点都有显式 `rewardRef`。
- 首次/重复奖励、世界 transition 和 settlement 均幂等。
- 切换前不预载下一世界四图；切换后旧图从 DOM 移除。
- 跨世界动画中刷新只恢复已提交终态，不重复移动或发奖。
- Session 的公平终章可以在任意世界位置触发。
