# 游戏平台与独立游戏拆分

## 所有权

平台仓库：`/Users/tiantianci/Documents/排课/voice-word-attack`，维护首页、声音打怪兽、账号、学生资料、内容编辑和语音评测服务。

游戏仓库：`/Users/tiantianci/Documents/ChatGPT/大富翁`，维护云港游戏界面、地图、骰子、移动、最终落点、存档、素材、测试和独立部署。游戏开发只在此仓库提交。游戏平台保留的旧棋盘文件是历史兼容及服务端评测依赖快照，不是线上游戏前端的发布来源。

游戏可分别构建部署，平台和游戏不相互合并开发分支。本次没有改变已认可的游戏规则或绘制效果。

## 同源入口与登录

- 清单：`game.manifest.json`，契约 `platform-game-entry.v1`。
- 新入口：`/games/monopoly/`。
- 游戏模块、样式、素材：`/games/monopoly/` 和 `/games/monopoly-runtime/`，只属于游戏服务。
- 旧文档入口 `/prototypes/universal-board`、尾斜线和 `index.html` 使用 302，保留查询参数。
- 同一 HTTPS 域名沿用平台 `__Host-vwa_session`，HttpOnly / Secure / Path=/。没有第二份账号库，也不把 Cookie 或令牌放进 URL。
- 游戏服务向固定平台地址 `/api/auth/me` 校验 Cookie；必须返回 `authenticated: true`。HTTP 200 但 false 仍回平台登录，并携带受控站内返回路径。
- 登录服务故障返回 503，避免把服务故障误当退出登录。HTML 不缓存，静态资源要求重新验证。
- 图片、脚本和样式使用发布清单中的内容哈希作为 ETag。刷新时内容未变返回 304，复用本机已下载文件；内容变化仍返回新文件。HTML、登录和学生等私有接口不使用这套静态资源缓存。
- 原 localStorage 存档键保持不变；同域跳转后继续读取原局。

## 共享服务接口

独立发布不等于脱离平台。以下接口仍由 `127.0.0.1:19321` 的平台服务提供：

| 服务 | 接口 |
| --- | --- |
| 登录与配置 | `/api/auth/me`、`/api/config`、`/login/` |
| 学生资料与历史资产兼容 | `/api/student-profiles/v1` 及子路径 |
| 发布的地图、骰面、奖励、事件 | `/api/board-layouts/v1`、`/api/dice-packs/v1`、`/api/node-reward-packs/v1`、`/api/classroom-event-programs/v1` |
| 旧卡片资源兼容 | `/api/card-catalog/v1` 及子路径 |
| Owner 内容管理 | 对应 `/api/admin/*` 接口 |
| 真实语音评测 | `/api/voice-board/*`、`/ws/voice-board-asr` 及平台返回的供应商配置 |

新知识包需要与平台评测服务同步发布协议和内容，不能只改前端后声称服务端已支持。平台接口继续按已有身份和版本约束校验写入；游戏不拥有平台管理员后端代码或生产数据。

## 发布隔离

- 平台：`voice-word-attack.service`，`127.0.0.1:19321`。
- 游戏：`ximitu-card-hunt.service`，`127.0.0.1:19421`。
- 游戏发行目录：`/var/www/ximitu-card-hunt/releases/<完整提交号>`。
- 平台 nginx 模板只保留 `include /etc/nginx/voice-word-attack-games/*.conf` 接入点；游戏发布独立维护其中的 `monopoly.conf`。以后发布平台仍保留游戏路由。
- 未来游戏各自使用独立仓库、服务端口和 URL 前缀；禁止覆盖 `/js/`、`/assets/` 或其他游戏路径。
- 独立私有 Gitee 远端为 `git@gitee.com:tim-edu/ximitu-card-hunt.git`，主分支 `main`；已提交历史于 2026-10-18 推送。2026-11-11 起，发布的完整源码 bundle、压缩发布包与回退配置快照同步归档至已验证的私有 OSS；原始字节哈希和对象位置通过 `/var/lib/tim-storage-archive/deploy/ximitu-card-hunt/last-<kind>.json` 恢复索引查询。不要把原平台远端配置到本仓库；推送不会自动触发部署。

## 验证与回退

运行 `npm run verify` 检查游戏规则、美术合同、构建依赖图、同源会话处理和访问边界。发布脚本在切换前将旧版本链接、systemd 单元和当前 nginx 配置备份到本次上传暂存目录，并把快照打包归档到私有 OSS；完整下载验证成功才允许修改应用。部署或健康检查失败自动使用该暂存快照恢复。成功提交应用后，即时归档旧发行目录，长期运行文件只保留 `current`、`previous` 与仍被进程或配置引用的版本。

人工回退代码时，以 `previous` 指向的已知版本为目标，在游戏部署锁内原子恢复 `current` 并重启游戏服务。需要恢复配置时，先读取 `last-data-backup.json`，按记录的对象位置下载、验证 SHA-256，并在独立恢复目录取出 `previous-release` 和配置文件；不要直接覆盖运行中的目录。历史 `/var/www/ximitu-card-hunt/backups/` 仅对应旧发布留下的回退证据。仅需回退代码时无需回退共享 nginx 配置。平台数据没有被复制或迁移。游戏私有布局数据须按下面规则单独保留。


2026-09-23 起，水晶地图 1.2.0 / 1.2.1 的精确布局由游戏的
`/games/monopoly/api/board-layouts/v1` 与对应 admin 接口保存，身份仍向平台核验；
更早地图、World 02、骰面与奖励保持原平台接口。数据文件是
`/var/lib/ximitu-card-hunt/board-layouts/visual-layouts.json`。

需要布局数据迁移时，应先停止游戏服务，制作现有布局文件的一致性快照，并记录不存在文件的情况；快照在本次暂存目录打包，用必需的归档 helper 以 `data-backup` 归档并完整下载验证后，再清理临时副本。人工回退
到仅认识1.2.0的旧服务前，先停止游戏服务，将当前完整 board-layouts 目录单独归档保留，
再从已验证的私有 OSS 备份恢复部署前布局快照；部署前无文件时保留归档中的新布局，由旧服务重建目录。
不得丢弃新布局，也不得修改或重启平台19321。回退旧前端还会无法识别新1.2.1棋局，
因此优先发布保留两版注册的修复构建；不可宣称单纯切回旧二进制即可完整恢复新局。
