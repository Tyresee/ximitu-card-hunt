# 线上隔离预检与落地结果

预检与落地日期：2026-07-21。用户已确认费用上限 2 元，持久资源只按下表冻结边界创建。生产环境为 [https://wordattack.timclass.cn](https://wordattack.timclass.cn)。

| 边界 | 候选 | 状态 | 通过条件 |
|---|---|---|---|
| 本地目录 | `voice-word-attack` | 通过（创建前无同名项） | 独立目录与独立 Git 仓库 |
| Gitee | [`tim-edu/tim-voice-word-attack`](https://gitee.com/tim-edu/tim-voice-word-attack) | 通过：独立私有仓库已创建并推送 | 只使用本仓库的 `main` 与专属流水线 |
| DNS | `wordattack.timclass.cn` | 通过：只新增本项目 A 记录，公共解析已生效 | 不修改主域、`www`、邮件或其他子域记录 |
| ECS | 项目冻结的目标实例 | 通过：实例身份已在部署前精确核对；项目 CI 常量与加密变量双重比对 | 不从其他仓库或共享变量动态选择实例 |
| 部署目录 | `/var/www/voice-word-attack` | 通过：已独立创建并只存放本项目 release/shared | 不覆盖、移动或删除其他目录 |
| API 端口 | `127.0.0.1:19321` | 通过：应用只监听 loopback，不对公网暴露 | 只由本项目 Nginx 反向代理 |
| systemd | `voice-word-attack.service` | 通过：独立 unit 已安装且 active，`current` 指向最近一次绿色构建 SHA | 不重用或覆盖其他 unit |
| Nginx | `wordattack.timclass.cn.conf` | 通过：独立 server block 已安装，`nginx -t` 成功 | 不编辑其他站点文件 |
| HTTPS | `wordattack.timclass.cn` | 通过：独立证书已签发，SAN 只含本域名，HTTP 已跳转 HTTPS | 不覆盖或扩展其他站点证书 |
| 阿里云口语评测 | 生产项目 `tim-word-attack-prod` | 通过：按量服务已开通、100 路免费并发；生产 AppID 的服务端授权已实测成功 | AppSecret 只进 ECS 环境文件；不购买并发包 |
| 阿里云百炼 | 北京地域、默认工作空间、专属 API Key | 通过：专属 Key 已创建，现有 Key 未复用、未查看 | 本项目 Key 只进 ECS 环境文件 |
| OSS | `tim-edu-tools-tts-audio/voice-word-attack/production/` | 通过：私有 Bucket 的独立前缀已实际写入本次 2 张图片和 1 次短词 TTS | 不含 List/Delete，不触碰现有 `tts-audio/` 与根目录对象 |

## 停止条件

- 发现同名资源且所有权不明确。
- 需要修改 `@`、`www`、`trace`、MX、wildcard 或任何无关 DNS。
- 需要覆盖现有 Nginx、证书、服务、目录或端口。
- 无法确认 AI 地域/产品与账号实际可用性，或需要在浏览器暴露长期密钥。

## 已核对的现网保护面

- 部署前的 `server_name` 包括 `art`、`lessonledger`、`skilltest`、smoke 子域、`trace`、主域与默认站点；不存在 `*.timclass.cn` 通配 server block。发布后 `art`、`lessonledger`、`timclass.cn`、`www`、`trace` 均为 HTTPS 200，旧 `skilltest` 与 smoke 子域保持 HTTP-only 且直连 200。
- 部署前的现有证书中没有 `wordattack.timclass.cn`；后续只为本域名签发了独立证书。
- 上层工作区包含用户未跟踪文件；本项目必须在 `voice-word-attack/` 内初始化独立 Git，禁止在上层批量暂存。
- 仓库代码已推送；Gitee Go 已在 25 秒内绿色完成完整 checks/deploy，生产 `current` 与每轮绿色构建的部署 SHA 一致。`main` Push 自动触发已配置并开启，但空提交验收未由平台调度器生成构建；最终版本经同一流水线手动入口发布，该已知平台项不扩大任何线上权限或部署边界。
- DNS 控制台的原有记录均未改动，只新增 `wordattack`；公共 DNS 与 HTTPS 已验证。
- 阿里云口语评测项目、百炼专属 Key 与最小权限身份已在用户确认后创建；完整密钥未写入 Git、文档、截图或聊天。
- OSS 复用仅限独立前缀。游戏运行时素材只引用审核后的持久对象，模型返回的 24 小时临时 URL 不写入正式内容包。
- 生产图片调用精确为 2 张候选，计费上限约 1 元；TTS 仅调用 1 次短词，费用极低。总费用已控制在 2 元以内，不再触发两类生成或重试。
- ECS 运行环境满足要求：Node.js `v20.20.2`、npm `10.8.2`、Nginx `1.20.1`、Certbot `1.22.0`；系统盘约 30GB 可用。
- ECS 出站 HTTPS 已验证可达；百炼与私有 OSS 的生产读写已通过本项目最小权限凭据验证。
- 阿里云口语评测生产项目的服务端授权、生产域名真实 Chrome SDK 加载、一次性麦克风授权、`APPLE` 可见预备弹、WebSocket 录音上传和无声/漏读结果的 0 伤害重试均已通过；正向口语分与伤害映射由提供方归一化测试和浏览器确定性门禁共同覆盖，且未扩大其他线上资源权限。真人清晰发音的正分验证保留为建议性课堂设备验收，不构成发布阻断。
