# 积分桥停止导致无法掷骰（2026-11-05）

线上游戏9526f68本身健康，但19423私有积分桥处于inactive、端口拒绝连接。
11月5日01:44平台反复停启，bridge的`Requires=voice-word-attack.service`导致它被正常停止；
最后一次依赖启动失败。平台09:51恢复后，没有反向启动这个已停止的依赖者。
`Restart=on-failure`不会恢复这种正常stop，因此游戏无法登记或恢复积分事件。

先启动原积分桥恢复19423，不修改钱包、学生、存档或已锁骰子。
前端已有失败后保留原机会、继续掷骰和重试到账路径；定向恢复测试54项通过，未修改前端门禁。

## 配置修复

将完整unit中唯一的`Requires=voice-word-attack.service`改为`Wants=voice-word-attack.service`，
保留原After顺序及全部Service字段。systemd依赖项不能通过drop-in清空，必须修改完整unit。
平台暂时停止不会再正常停止积分桥。
bridge自身异常仍由原Restart=on-failure恢复。机器启动仍由原multi-user.target启用服务。

每次请求的真实平台认证、签名、账本完整性和共享文件锁都保留；平台不可用时仍拒绝到账。
保留原User、沙箱、私有环境文件、loopback端口和唯一钱包目录。不重启19321平台。
受管积分桥的`deploy/monopoly-points-bridge.service.example`同步以独立配置提交修正，
后续发布应以该提交为基准，避免旧模板恢复Requires；本次不混入平台工作区其他改动。

在服务器执行已审核的配置修复脚本：

```sh
bash repair-points-bridge-lifecycle.sh
```

脚本核对现有unit和平台存活，备份原unit、只改目标依赖行，验证依赖关系，重新加载配置并启动bridge。
若服务已恢复，启动操作不重启它；检查平台PID保持不变及19423 `/healthz`校验成功。
配置验证失败自动恢复原unit。它不读取或打印密钥，不写入任何学生或账本。

本次是服务生命周期修复，公开游戏JS/CSS无需替换，游戏运行版本仍为9526f68。
构建和自动化测试仍按仓库verify执行；线上服务恢复与公开游戏版本分别记录。
真实systemd239的隔离假依赖测试应复现原Requires故障，并验证Wants下依赖停启不停止bridge；
只对合成sleep服务做停启，不通过重启真实平台来验收。
