# 通用知识点语音评分与 Codex 管线 v2

- 状态：Implementation Scope
- 日期：2026-07-29
- 兼容基线：`assessment-policy.v1` 与当前 `have / has` 生产策略
- 新配置：`assessment-policy-catalog.v2`
- 首发评测器：`reference-choice.v1`
- 结构契约：[`schemas/assessment-policy-catalog.v2.schema.json`](schemas/assessment-policy-catalog.v2.schema.json)

## 1. 用户与目标

教师通过 Codex 用自然语言描述本节课的一个或多个主知识点、有限对比形式和适用
教学目标。Codex 把需求转换为受控的结构化策略目录草稿；平台负责校验、模拟、
审核、发布和运行时执行。

语音评分不追求所有细微发音差异百分之百可辨。系统必须保证：

1. 供应商能够稳定区分的明显对比项（例如 `have / has`、`am / is / are`）
   成为高权重主考点。
2. 主考点明确错误时，即使整句发音、完整度或流利度很高，最终分也固定为
   `45`，并继续游戏；供应商总体分 `99` 也不能把最终分抬过 `45`。
3. 证据缺失、冲突或不满足供应商契约时进入 `teacher_review`，不得伪造确定结论。
4. 主考点通过后，按知识点、目标词发音、整句发音和流利度计算表现分；明确错误
   直接使用固定低分，不让其他分项抵消。
5. 旧 `assessment-policy.v1` 发布快照和旧 `onWrong: "retry"` 保持可读、可回滚；
   兼容运行时把旧值按同一“固定 45 分并继续”规则执行，且不改写存储内容。

浏览器完成评分时会声明
`resultContractVersion = "voice-board-assessment-result.v2"`。部署前已打开的旧页面
没有这个声明，服务端会让它安全回退为 `retry + null`，避免旧代码把“45 分继续”
误记成知识点掌握；刷新后加载的新页面立即使用 45 分继续契约。

## 2. “通用”的安全边界

Codex 不向生产环境注入代码、正则表达式或原始供应商参数。通用性来自平台维护的
评测器注册表。

v2 首发评测器为 `reference-choice.v1`：

- Codex 为一条知识点策略配置 1–32 个有限对比组；每组用
  `evaluatorConfig.choiceSets[].forms` 列出 2–17 个英文单词或短语。
- 运行时从服务端锁定的标准答案中，在全部对比组里查找唯一出现且只出现一次的
  目标形式。该形式成为正确项，同组其他形式成为明显误答。
- 阿里扩展选择题把正确形式设为 `key`、同组明显误答设为 `unkey`。
- 正确项证据通过；错误项证据固定 45 分并继续；无法确认时教师确认。
- 策略不接受脚本、正则、上下文提示或原始供应商参数字段。

它可覆盖：

- `have / has`
- `am / is / are`
- `do / does`
- `this / these`、`that / those`
- `there is / there are`
- 课程词表内的单复数和第三人称形式
- `in / on / under` 等明确选项
- 教师提供了有限对比形式的其他离散知识点

纯开放语义、没有有限对比项的表达或极细微音素差异不伪装成确定性规则。后续只能
通过注册新的受控评测器扩展；在此之前使用普通句子表现分或教师确认。

## 3. 角色与权限

- 教师与 Codex MCP：
  - 读取供应商能力、评测器注册表和服务端题目目录；
  - 读取当前草稿与发布版本；
  - 保存完整策略目录草稿；
  - 校验、模拟并提交审核。
- Owner：
  - 拥有以上能力；
  - 在教师网页确认发布精确草稿修订。
- MCP：
  - 永远没有发布、激活、删除或任意脚本工具；
  - 不读取或展示供应商密钥。

## 4. 数据模型

`assessment-policy-catalog.v2` 的顶层字段为：

- `schemaVersion`：固定为 `assessment-policy-catalog.v2`；
- `catalogId`：稳定目录标识；
- `displayName`：目录显示名称；
- `policies`：1–64 条知识点策略。

每条 `policies[]` 的字段为：

- `policyId`：稳定知识点策略标识；
- `displayName`：知识点显示名称；
- `bindings.objectiveIds`：绑定 1–16 个题目主教学目标；
- `requiredGate: true`：为旧契约保留的高权重主考点标记；
- `evaluatorRef: "reference-choice.v1"`：使用登记的有限对比评测器；
- `evaluatorConfig.choiceSets`：1–32 个对比组；
  - 每个对比组只含 `forms`；
  - `forms` 含 2–17 个不同的规范化小写英文单词或短语；
- `onWrong: "score_low"`：新策略默认值，明确错误固定 45 分并继续；
- `onWrong: "retry"`：仅作为旧策略兼容值接受并原样保存，运行时语义同
  `score_low`；
- `onUncertain: "teacher_review"`；
- `providerProfileRef: "aliyun.extended-choice.v1"`；
- `weights`：
  - `knowledgeCorrectness`；
  - `targetPronunciation`；
  - `sentencePronunciation`；
  - `fluency`。

四项权重都必须在 0–100 之间、合计必须为 100，且
`knowledgeCorrectness` 至少为 50。目录 ID、策略 ID 与教学目标 ID 使用
`^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`，最长 128 个字符；显示名称为
1–80 个字符。

示例：

```json
{
  "schemaVersion": "assessment-policy-catalog.v2",
  "catalogId": "english.voice.default",
  "displayName": "英语语音高权重知识点",
  "policies": [
    {
      "policyId": "grammar.have_has",
      "displayName": "Have / Has",
      "bindings": {
        "objectiveIds": ["grammar.have_has"]
      },
      "requiredGate": true,
      "evaluatorRef": "reference-choice.v1",
      "evaluatorConfig": {
        "choiceSets": [
          {
            "forms": ["have", "has"]
          }
        ]
      },
      "onWrong": "score_low",
      "onUncertain": "teacher_review",
      "providerProfileRef": "aliyun.extended-choice.v1",
      "weights": {
        "knowledgeCorrectness": 60,
        "targetPronunciation": 25,
        "sentencePronunciation": 10,
        "fluency": 5
      }
    }
  ]
}
```

每道题使用服务端解析出的主教学目标：显式 `primaryObjectiveId` 优先；旧题没有该
字段时使用 `objectiveIds[0]`。完整任务包会进一步把 objective ID 映射到
objective 的 `skillId`。运行时只选择与该主目标匹配的一条策略，避免一次供应商
评测声称能独立证明多个考点。

## 5. Schema 与服务端语义预检

JSON Schema 严格拒绝所有未登记字段，并能表达对象形状、常量、局部数量、格式、
局部去重和单项权重范围。它不能完整表达实现中的跨字段和服务端状态约束，因此
通过 Schema 不等于可以发布。

服务端仍必须执行语义预检，包括：

- 四项权重总和必须为 100；
- `policyId` 在目录内唯一；
- 同一 `objectiveId` 不得由多条策略重复绑定；
- 同一策略内，同一形式不得跨对比组重复；
- 同组短语不得互相完整包含；
- 每一个 `bindings.objectiveIds[]` 都必须绑定至少一道已发布语音题的主目标；
- 每道匹配题的服务端标准答案必须在全部对比组中唯一命中一个形式，且只出现一次；
- 评测器、供应商配置档及二者兼容关系必须仍在服务端能力注册表中。

服务端会先规范化字符串，再运行上述校验；Schema 文件描述的是 Codex 应提交和
平台应保存的规范结构，不替代服务端规范化、任务绑定检查或发布预检。

## 6. 运行时

```text
服务端锁定题目与标准答案
  -> 解析题目主教学目标
  -> 从已发布 catalog 选择唯一 policy
  -> 在标准答案中唯一解析 choiceSets 目标形式
  -> 编译为不可变 assessment-policy.v1 运行时快照
  -> 生成阿里扩展选择题参数
  -> 玩家明确结束录音
  -> 供应商返回 key / unkey / 无可靠证据
  -> 本地高权重主考点规则
  -> 正确：evaluation.action=accepted + 加权表现分
  -> 明确错误：evaluation.action=score_low + 固定 45 分
  -> 证据不足：evaluation.action=teacher_review
  -> 游戏适配：score_low 映射为 result=accepted，primaryAccepted=false
  -> 完成评分后进入游戏结算
```

每次尝试保存目录版本、选中策略的元数据和编译后的运行时策略快照。发布中的任何
变化都不能改变已经开始的答题尝试。

`score_low` 是评分领域的 `evaluation.action` 与 `scoringOutcome`，`accepted`
是游戏完成接口的线协议结果，两者不是同一个字段。明确错误必须同时保留
`knowledgeStatus: "wrong"` 和
`primaryAccepted: false`，因此可以继续本回合，但不会被记录为主知识点掌握。

没有匹配策略时，旧题可继续使用既有 v1 兼容路径；显式声明新主目标但没有已发布
匹配策略的题目必须受控失败，不能假装已经启用高权重主考点规则。

## 7. 页面与 Codex 工作流

教师页对 v2 显示：

- 自然语言需求摘要；
- 全部策略及其目标绑定、对比组、供应商档和权重；
- 评测器能力与“明显错误固定 45 分并继续、证据不足教师确认”的边界；
- 校验、模拟、送审和 Owner 发布状态；
- MCP endpoint 与凭证管理。

Codex MCP 上下文必须同时返回：

- 供应商能力注册表；
- 评测器注册表；
- 安全的 v2 默认策略目录；
- 服务端题目目录；
- `have/has`、`am/is/are`、第三人称和单复数等结构化示例；
- 明确要求先读取当前修订、不得虚构供应商能力、不得发布。

服务端强制为每条策略生成“正确项证据”“明显误答但总体表现分为 99”“证据不足”
三类认证模拟。调用方提供的自定义模拟只能追加，不能替代这三类必测案例。

## 8. 验收标准

1. 旧 `assessment-policy.v1` 与旧 `onWrong: "retry"` 的存储文件、内容哈希和
   回滚版本不被改写；兼容运行时将明确错误按固定 45 分继续结算。
2. 一个 v2 目录可同时保存至少 `have/has` 与 `am/is/are` 两条策略。
3. 题目主目标为 `grammar.be_present` 时，运行时自动选择 `am/is/are` 策略。
4. `She are happy.` 即使供应商总体分为 99，评分动作也为 `score_low`、知识点
   结果为 `wrong`、最终分固定为 `45`；游戏接口返回 `accepted` 并继续，但
   `primaryAccepted` 为 `false`。
5. `She is happy.` 有明确正确项证据时通过并计算有限表现分。
6. 没有 key/unkey 或可靠目标证据时返回 `teacher_review`。
7. 未登记评测器、未知供应商档、无有效对比组、重复或歧义绑定、错误权重均被拒绝。
8. v2 默认模拟为每条策略生成正确、错误和证据不足三类案例。
9. Codex MCP 能保存、校验、模拟和送审 v2，但工具列表仍无发布工具。
10. 教师页可安全显示和发布 v2，所有远端文字转义，移动端与 reduced-motion 可用。
11. 语音流程继续保持“准备 -> 明确录音 -> 手动答完 -> 评分”，不恢复自动提交。
12. 全量逻辑测试、HTTP 测试、完整游戏 E2E、smoke 和浏览器检查通过后才可发布。

## 9. 迁移与部署风险

- v2 使用独立 sidecar 存储；旧 v1 存储文件不被读取时改写，也不重算旧内容哈希。
- v2 草稿和发布版本走独立目录工作流，不会原地改写旧 v1 快照。首次尚无 v2
  草稿时，网页与 MCP 的起始目录会从当前已发布 v1 策略生成只读迁移基线，
  保留名称、考点、对比形式、`onWrong`、供应商档与权重；保存后仍须重新检查、
  模拟、审核并由 Owner 发布，绝不会自动切换线上规则。
- 新草稿默认写入 `onWrong: "score_low"`。读取旧 `onWrong: "retry"` 时不在
  normalizer 或存储层改写，只有运行时兼容层按固定 45 分继续执行。
- 没有发布 v2 时，旧题继续使用既有 v1/安全默认兼容路径，并应用相同低分规则。
- 新生产发布必须保留
  `5ce159b874af0809f9cb7c68045001026994086b` 作为明确回滚点。
- 不修改碰撞金币 A/B/C 或西米兔一星卡稀缺度。
