# 平台共享登录契约

大富翁不创建第二套账号系统。游戏平台是唯一认证源，大富翁只验证平台发出的登录会话。

## 当前部署契约

- 两个入口使用同一个 HTTPS 主域名和同一个 Cookie 作用域。
- 平台登录接口写入 `__Host-vwa_session`；Cookie 保持 `HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`。
- 大富翁通过同源请求 `/api/auth/me` 获取当前用户；浏览器请求使用 `credentials: "same-origin"`。
- 平台和大富翁服务端必须使用同一个会话校验权威；大富翁不得复制账号密码、会话 Token 或 `auth-store.json`。

## 推荐拓扑

```text
wordattack.timclass.cn/
├── /                 平台入口和登录
├── /game/            声音打怪兽
└── /games/monopoly/  大富翁
```

反向代理可以把两个路径转给不同项目，但 `/api/auth/*` 仍由平台认证服务处理。大富翁自己的
API 只读取已经验证的 `userId`，游戏 Session、棋局状态和资产数据独立保存。

## 禁止事项

- 不在大富翁项目中重新注册、登录、改密或撤销平台账号。
- 不把会话 Token 放进 URL、localStorage、游戏清单或前端日志。
- 不把 `__Host-` Cookie 改成可跨域的 `Domain` Cookie 来“凑合共享”。
- 如果未来使用不同域名，必须改为平台跳转式 SSO，并单独审核回调、CSRF 和登出传播；当前清单不支持这种模式。
