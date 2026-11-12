# 信息架构与页面流

## 页面

- `/`：进入页。选择“开始游戏”或“教师备课”；显示 `activePackId` 对应的当前游戏包与云端/演示状态。
- `/teacher/`：素材包库与教师配置。新建/选择素材包 → 输入 3–8 个单词 → 自动补齐词义/词性/配图/标准音/关卡参数 → 快速审核 → 发布 → 设为当前游戏包；下方保留逐词高级编辑与素材替换。
- `/game/`：只读取 `activePackId` 指向的已发布包，按词包时长运行动态 3—8 路防线。任务卡、关卡 HUD、道路舞台、实际宽度终点线、麦克风主操作、标准音与柔和提示。
- `/results/`：结算。区分全部击败、时间结束与怪兽触线失败；展示尝试、命中、击败数和星星，可再玩一局或返回备课。

## 核心导航规则

- 儿童游戏页每屏只有一个主行动：朗读/按住说话。
- 教师入口公开访问，生产环境不显示登录页，也不要求账号、口令或会话。
- 批量生成只有一次显式教师操作会触发；生成结果先写当前包草稿，不自动越过人工审核发布；新词组自动另存为新包。
- 选择素材包只切换编辑上下文；只有明确“设为当前游戏包”才改变儿童端下一局读取的包，且目标包必须已发布。
- 教师页恢复上次正在编辑的素材包；切包、页内导航和浏览器后退前先保存未保存的包修改，生成或保存进行中不允许离开。尚未提交生成的词组输入与新包名称保存在本机，刷新后继续填写。
- 游戏进行中离开页面需确认；结算后可直接重开同一内容包。
- 移动端不压缩成小字：任务卡与舞台优先，次要状态折叠到一行。

## 内容关系

```text
PackLibrary
  ├─ activePackId → ContentPack.published
  └─ ContentPack[]
       ├─ draft / published / revision
       ├─ LevelSettings (duration, mode, activeOrder)
       └─ WordEntry[]
            ├─ Semantic data (word, meaning, POS, accent)
            ├─ Reviewed OSS assets (primary image, candidates, audio)
            ├─ Scoring profile (basic/good/excellent)
            └─ Enemy profile (HP, speed, lane, repeat target)

WordEntry → EnemyInstance → RectangularMediaSlot
          → MissionCard
          → PronunciationRequest(refText)
          → WordProjectile(displayText, damageTier)
```

## 访问边界

- 任何访问者：读取当前游戏包、游玩，也可直接进入教师页查看素材包库、新建/选择包、编辑独立草稿、生成/上传素材、审核发布并显式切换当前游戏包。
- 服务端：持有阿里云/OSS 凭据；浏览器只接收业务结果和审核后的资源 URL。
- 游戏读取边界：公开接口只返回 `activePackId` 指向的已发布版本；其他包草稿、最后编辑包和未发布修改不得泄漏到儿童端。
- 写接口仍拒绝跨站浏览器来源，AI 生成仍按客户端 IP 限流；这些是滥用护栏，不构成登录权限。
