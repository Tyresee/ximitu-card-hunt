# 大富翁 · 云港星星大冒险

视觉设计交接请先阅读 [AI_DESIGN_HANDOFF.md](AI_DESIGN_HANDOFF.md)，其中包含当前源码状态、本地样板截图、预览方式与规则边界。

独立的云港棋盘游戏仓库。游戏平台与声音打怪兽在另一个仓库开发；本游戏有自己的源码、构建、测试、服务和发布版本。

新开棋局使用同一张云港地图反复绕圈，每名学生独立前进；全体学生完成一圈后统一刷新 bonus。规则和旧局兼容边界见[云港个人绕圈](docs/CLOUD_HARBOR_CIRCUIT.md)。

线上通过 [游戏大厅](https://wordattack.timclass.cn/) 进入，旧链接会保留参数并跳转到 [独立游戏入口](https://wordattack.timclass.cn/games/monopoly/)。平台已登录时沿用同一会话；会话失效后在平台登录，再返回游戏。

## 开发目录

- `public/prototypes/universal-board/`：唯一游戏源码，包含棋盘、骰子、移动、落点、存档和界面。保留目录名以维持已有游戏合同及测试引用。
- `public/js/`：游戏使用的语音客户端及核心协议。账号、学生资料、评分服务由平台提供。
- `public/assets/`、`public/vendor/`：游戏素材和语音 SDK。
- `standalone/server.mjs`：同源会话校验及游戏静态服务，不保存账号、密码或学生数据。
- `art-source/`：地图原图、引导图和可验证的美术清单，不进入线上构建。
- `dist/`：自动生成且不提交的唯一发布产物。禁止手工修改。
- `tests/platform-contract-fixtures/`：迁移兼容测试快照，只用于测试，不部署。

本项目只维护游戏部分。入口接入、共享接口和发布边界见 [拆分说明](docs/PROJECT_SPLIT.md)。开始开发前阅读 [AGENTS.md](AGENTS.md) 和其中的游戏合同。

## 验证和运行

需要 Node.js 20+；生产服务没有 npm 运行时依赖。

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm start
```

`npm start` 监听 `127.0.0.1:19421`。默认向本机 `19321` 平台校验登录；本地完整联调需要同一反向代理把游戏路径交给 `19421`、平台页面/API/WebSocket 交给 `19321`。

仅验证游戏界面可运行 `node scripts/preview-fixture.mjs`，访问 `http://127.0.0.1:19422/prototypes/universal-board/`。该工具提供两个明确命名的虚拟学生，不连接线上数据、不产生真实登录或语音评分，也不进入发布产物。

验证学生列表不被慢配置阻塞，可使用 `LOCAL_GAME_QA=1 LOCAL_GAME_REGISTRY_DELAY_MS=25000 node scripts/preview-fixture.mjs`；仅本地布局、骰面和奖励接口延迟，学生名单应先显示，配置完成前仍不能创建新局。

## 发布

先把本次已验证的游戏改动提交到本仓库，再运行：

```bash
bash scripts/deploy-game.sh
```

脚本要求工作区干净，重新构建并执行测试。使用已配置的 `aliyun-ecs` SSH，校验压缩包和每个资源的 SHA-256，以完整 Git SHA 创建不可变版本，原子切换 `current`，重启独立游戏服务，再检查公网版本。失败时恢复旧服务、入口配置及版本链接。

发布必须使用服务器上的 `/opt/tim-storage-archive/deploy_artifacts.py`。同一部署锁内，先完成既有历史版本归档，再将完整 `HEAD` 源码 bundle、发布压缩包和回退配置快照同步备份至私有 OSS，并完整下载核验；任一步失败就停止应用变更。健康检查通过后，`previous` 指向切换前的版本，立即归档并移除其他未被引用的运行版本。ECS 长期保留当前版、上一版和正在使用的版本，备份回执保存在 `/var/lib/tim-storage-archive/deploy/ximitu-card-hunt/`；本次上传暂存于成功和失败退出时清理。健康应用提交后，若最终归档遇到故障，保留健康版本并报告失败，下次发布在创建新版本前必须先完成归档。

服务为 `ximitu-card-hunt.service`，目录 `/var/www/ximitu-card-hunt`。发布不修改平台数据库或评分密钥。独立私有远端为 [TimEdu/ximitu-card-hunt](https://gitee.com/tim-edu/ximitu-card-hunt)，SSH 为 `git@gitee.com:tim-edu/ximitu-card-hunt.git`，主分支 `main`。推送与发布分开执行，推送不会自动部署；完整源码的原始 bundle 字节另存于已验证的私有 OSS 备份。

积分桥19423的服务依赖与“平台恢复后无法掷骰”修复见[积分桥生命周期](docs/POINTS_BRIDGE_LIFECYCLE.md)。配置修复独立于游戏静态资源发布，不能只以19421健康判断到账服务可用。

历史设计文档中原平台的部署命令、测试总数和账号说明是历史记录；当前运行方法以本文件和拆分说明为准。评分到骰子、老师主持、世界向前扩展及本局星星规则继续遵守对应合同。
