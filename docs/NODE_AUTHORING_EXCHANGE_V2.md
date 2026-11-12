# 节点创作交换文件 v2

本文件说明如何用 Codex 批量修改棋盘节点，同时保护唯一语音评分与移动流程。

## 操作流程

1. 在棋盘页面点击“编辑地图”，进入“Codex JSON”。
2. 选择修改焦点，生成并复制完整交换 JSON。
3. 在 Codex 中用自然语言列出节点 ID 和目标变化，要求只返回完整 JSON。
4. 把结果粘贴回编辑器，解析并预览逐字段差异。
5. 确认后应用到草稿，再分别发布节点布局与节点奖励。

推荐补充指令：

```text
请保持 JSON 完整，只修改我指定范围内 editable=true 的字段。
不要修改 context、resourcePools、base、schemaVersion、contractRef、fixedOutcome、lockReason。
不要添加题目、答案、录音、评分、骰点、路线或脚本字段。
返回完整 JSON，不要返回 JSON Patch，也不要省略未修改节点。
```

## 结构

根对象固定包含：

- `schemaVersion`：`voice-board-node-authoring-exchange.v2`，只读。
- `contractRef`：`voice-board-node-authoring-exchange-contract.v2`，只读。
- `base`：布局与节点奖励 revision、草稿指纹，只读。
- `resourcePools`：当前可选奖励类型与数量范围，只读。
- `nodes`：按 worldRef、nodeId 索引的全部节点。

每个节点固定包含：

- `context`：区域、权威拓扑、固定 Trigger 和结算摘要，只读。
- `placement`：可编辑视觉坐标。
- `reward`：只有 `editable=true` 时可修改；合法组合为无奖励、金币 ×1/2/3、卡片盒 ×1。

v2 不包含 `classroomEvents`。题目、真人录音与真实评分只属于掷骰前的正式任务；最终落点
只结算地图 Trigger、道具、奖励或必要选择。

## 安全边界

- 导入不能修改路线拓扑、岔路、运输、世界出口、固定 Trigger、评分规则、骰子档位、
  本轮骰点、移动规则或进行中棋局。
- 正式顺序保持为：真人录音 → 服务端真实评分 → 先显示评价和得分 → 合法骰池随机骰点
  → 逐格移动 → 最终落点结算 Trigger、道具和奖励 → 推进回合。
- 预览拒绝缺失/额外节点、未知字段、只读字段变化、越界数值、非法奖励、超出焦点和
  基于旧 revision 或旧指纹的文件。
- 应用交换文件只更新草稿，不自动发布；新发布版本只影响新棋局。
- 骰子和卡片图片资源分别由“骰子配置”与“卡片库”管理，不写进节点交换 JSON。

## BoardTemplate 兼容说明

启航海湾中 `n24a`、`n31a`、`n37`、`n46` 的原始 `spaceRole` 仍保留为旧版
BoardTemplate / 地图美术契约中的冻结值，以保持 SVG 路线、节点位置和 ImageGen 参考底图的
版本稳定。它们的正式游戏语义必须读取运行时 `fixedOutcome`、`rewardRef` 与当前发布的节点奖励：
分别是卡片盒、金币、`5 金币 → 1 卡片盒` 兑换站和无二次任务的被动航标。不得仅凭旧
`spaceRole=activity` 把它们恢复成课堂活动，也不得由此添加题目、录音或评分字段。
