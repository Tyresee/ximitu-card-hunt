# 独立部署方案

生产地址：[https://wordattack.timclass.cn](https://wordattack.timclass.cn)

Gitee：[https://gitee.com/tim-edu/tim-voice-word-attack](https://gitee.com/tim-edu/tim-voice-word-attack)

2026-07-21 最终状态：独立服务已上线；Gitee Go 已在 25 秒内绿色完成完整 checks/deploy，生产 `current` 必须与每轮绿色构建的完整 Git SHA 一致。`main` Push 自动触发已配置并开启，但 2026-07-22 的空提交验收未由 Gitee 调度器生成构建；最终版本使用同一受控流水线的手动入口发布。公共 DNS、HTTP 301、HTTPS、仅含本域名的证书 SAN、全绿健康检查和原站隔离均已通过。

## 冻结边界（预检通过后启用）

- Gitee：`tim-edu/tim-voice-word-attack`，独立 `main`。
- 域名：`wordattack.timclass.cn`，只新增该 A 记录。
- ECS：项目冻结的单一目标实例；地址同时固定在项目专属 CI 边界校验和 Gitee Go 变量中，两者必须一致。目录 `/var/www/voice-word-attack/{releases,current,shared}`。
- 后端：`voice-word-attack.service`，仅监听 loopback 专用端口。
- Nginx：单独 `/etc/nginx/conf.d/wordattack.timclass.cn.conf`；`/ws/asr` 与 `/ws/voice-board-asr` 分别使用精确匹配的专用 location 传递 WebSocket Upgrade，普通 HTTP 反向代理不受影响。
- 证书：仅 `wordattack.timclass.cn`；保留独立 ACME challenge。

## 发布顺序

1. 校验仓库、DNS 主机、目录、端口、服务名、Nginx server_name 和证书均无冲突。
2. 本地测试通过后创建空 Gitee 仓库，推送 `main`。
3. Gitee Go 先执行 `npm ci` 与 `npm run verify`，再通过 SSH 上传以完整 Git SHA 命名并带 SHA-256 校验的归档。
4. ECS 解压和依赖安装成功后原子切换 `current` 并重启独立服务；新版本健康检查失败会立即恢复原软链接和原版本服务。
5. 安装 HTTP-only Nginx 配置，`nginx -t` 后 reload；用 Host header 验证。
6. 只新增 `wordattack` A 记录到已冻结的项目目标实例，公共解析正确后签发独立证书并启用 HTTPS。
7. 推送只改变构建标识的小提交，验证 push → checks → deploy → 公网内容闭环；若 Gitee 调度器未出单，则记录该事实并通过同一流水线的“执行构建”入口完成 checks/deploy，不绕过任何门禁。

账号化首发在步骤 3 前增加一次安全迁移：先把仓库内最新 `scripts/deploy-ecs.sh` 以受控运维方式安装为服务器 root-owned 固定入口，并核对 `--capabilities` 精确返回 `account-auth-v1 secure-upload-v1`。流水线随后使用 `0700` 随机远端上传目录传递发布包与一次性 bootstrap 密钥；固定入口先完成只读预检，再停止旧的无认证服务、生成 root-only 的 `shared/data` 一致性备份、初始化主账号并激活新版本。账号库一旦存在，任何失败或人工回滚都不得恢复缺少 `deploy/security-epoch` 的旧开放版本。

## Gitee Go 加密变量

已注册工作流位于 `.workflow/voice-word-attack-main.yml`。[Gitee 官方快速开始](https://gitee.com/help/articles/4357)说明工作流描述文件需由平台注册；本仓库已在 Gitee Go 界面“保存”一次，使该文件成为唯一权威配置并启用 `main` Push 自动触发。2026-07-22 的空提交验收没有生成自动构建，现阶段以“执行构建”为已验证发布入口，并按 [Gitee 官方不触发排查说明](https://help.gitee.com/enterprise/pipeline/questions/not-trigger)保留后续平台项。若平台当前可选的 Node 20 小版本与文件不同，只在界面选择任意 `>=20` 的受支持版本并让平台回写 `nodeVersion`，不得修改命令或部署边界。

保护变量只引用名称、不提交值：

- `DEPLOY_SSH_KEY`：独立部署私钥；不要复用个人主密钥。
- `DEPLOY_KNOWN_HOSTS`：线下核验后的 ECS 主机公钥行；流水线禁止 `StrictHostKeyChecking=no`。
- `DEPLOY_SSH_PORT`：固定为 `22`。
- `DEPLOY_BASE`：必须精确为 `/var/www/voice-word-attack`。
- `DEPLOY_USER`：固定为项目专属账号 `voice-word-deploy`。
- `DEPLOY_HOST`：必须与 `scripts/ci-deploy.sh` 中经预检冻结的目标实例常量精确一致；变量用于部署时注入和防误投，主机地址本身不是密钥。
- `AUTH_BOOTSTRAP_OWNER_PASSWORD`：只在首次账号化发布前临时设置。部署成功并验证主账号登录后立即从 Gitee Go 删除；不得写入生产 `.env`。

ECS 上的 `voice-word-deploy` 只有本项目专属 SSH Key。其 sudo 权限只允许调用 root 所有、部署用户不可修改的 `/usr/local/sbin/voice-word-attack-deploy`。CI 不上传并以 root 执行任意脚本；固定入口会再次校验项目目录、域名、端口、`0700` 上传目录所有权、归档路径、Git SHA、SHA-256 与安全版本标记。CI 的 EXIT 清理会在成功或失败时删除整个随机上传目录，避免明文 bootstrap 密钥残留。

最终发布前已用 SHA-256 核对服务器固定入口与仓库 `scripts/deploy-ecs.sh` 完全一致，确认其中 `shared` 目录为 `0751`、`.env` 仍为 `0640`，Nginx 可穿越到独立 ACME webroot 而不能列目录。

阿里云业务密钥只存在 ECS 的 `/var/www/voice-word-attack/shared/.env`，不进入 Gitee Go。该文件由 `deploy/production.env.example` 线下生成，权限必须为 `root:voice-word-attack 0640`。

## 仓库内发布文件

- `deploy/systemd/voice-word-attack.service`：固定用户、目录、端口环境和 systemd 沙箱，只允许写本项目 `shared`。
- `deploy/nginx/wordattack.timclass.cn.http.conf`：首次签证书前使用的独立 HTTP/ACME 配置。
- `deploy/nginx/wordattack.timclass.cn.https.conf`：证书签发后的 HTTPS 配置，只引用本域名证书。
- `scripts/deploy-ecs.sh`：校验项目标记、压缩包 SHA-256、服务/端口/Nginx 冲突后，创建 Git SHA release 并原子切换 `current`。
- `scripts/rollback-ecs.sh`：默认切回上一个兼容 release，也可指定 Git SHA；账号库存在后拒绝任何缺少 `account-auth-v1` 安全标记的旧版。
- `scripts/health-check.sh`：同时校验 HTTP 200、服务身份、健康状态和可选的 Git SHA 版本。
- `scripts/ci-deploy.sh`：固定 Gitee 仓库、ECS、目录、部署账号和 SSH 主机公钥，只上传发布归档并调用服务器上的 root-owned 固定入口。

首次发布前，先把 `deploy/production.env.example` 复制为服务器 `shared/.env` 并线下填入业务密钥；主账号 bootstrap 密码不写入该文件，只由首次流水线的临时保护变量传递。部署脚本发现环境缺失时只生成 `.env.example` 然后停止，不会以 mock 或空密钥上线。仓库必须提交 `package-lock.json`，否则 CI 和服务器都会拒绝非确定性安装。

`/api/health` 是静态就绪检查：验证非空配置、真实 provider、百炼 ASR/热词配置和固定 SDK 文件存在，探活本身不发起上游识别。上游 WebSocket 与音频转写由限次生产链路烟测单独证明，避免健康探针产生可计费时长。

HTTPS 切换步骤：先使用 HTTP 模板完成 Host-header 健康检查和 ACME challenge；只为 `wordattack.timclass.cn` 签发证书；确认 `/etc/letsencrypt/live/wordattack.timclass.cn/` 存在后，以 HTTPS 模板替换本项目 Nginx 文件，执行 `nginx -t` 成功才 reload。后续发布会依当前是否启用 443 选择对应的项目模板，在 `nginx -t` 与 reload 失败时自动恢复原项目文件；不修改 Certbot 证书或其他 server block。

## 最终部署结果

- `/api/health` 全部检查项为 `true`；`voice-word-attack.service` 为 active。
- `/var/www/voice-word-attack/current` 指向最近一次绿色流水线的完整 Git SHA，应用端口 `19321` 仅监听 `127.0.0.1`。
- 生产域名真实 Chrome 已完成一次性麦克风测试：录音时显示 `APPLE` 可见预备弹，阿里云无声回包按设计结算为 0 伤害并引导重读。
- 最终自动化测试 47/47 通过，`npm audit --omit=dev` 为 0 个漏洞。
- 真人清晰发音返回正向 `pron` 分数保留为建议性课堂设备验收，不是发布阻断项。

## 回滚

- 每次部署保留所有 Git SHA release，不自动删除；`scripts/rollback-ecs.sh --list` 可查看，`--previous` 切回上一兼容版本，`--release <sha>` 精确切换。若 `shared/data/auth-store.json` 已存在，旧的无认证 release 即使曾通过健康检查也不可再激活。
- Nginx 变更前保留项目专属配置副本；只回滚本项目文件并再次 `nginx -t`。
- Git 回滚使用 `git revert <sha>` 推送，不改写历史。
- 数据文件位于 `shared`，发布与回滚不覆盖；首次账号迁移会在停服状态下生成 `/var/www/voice-word-attack/backups/pre-auth-<SHA>.tar.gz`（`root:root 0600`），失败时保留备份并保持旧开放版本停用。
- 词条识别参数采用向后兼容迁移：服务启动时只为 `id` 与 `word` 均匹配、且缺少配置或 `recognition.configVersion` 落后于种子包的旧已发布词条补入新默认值；首次迁移前保留 `published-pack.pre-recognition-defaults.json`，同版本的教师配置不会被覆盖。

## 隔离承诺

不修改现有“声音游乐园”、黄金矿工或其他仓库、目录、端口、systemd unit、DNS 记录、证书和 Nginx 配置。若任一候选边界冲突，停止该项并换用全新名称，不复用或覆盖。

既有 `art`、`lessonledger`、`timclass.cn`、`www`、`trace` 五个 hostname 在本项目上线后仍返回 HTTPS 200；旧 `skilltest` 与 smoke 子域保持独立 HTTP-only 且直连 200。本项目的目录、端口、unit、Nginx 文件、证书与 DNS 主机名均保持独立。
