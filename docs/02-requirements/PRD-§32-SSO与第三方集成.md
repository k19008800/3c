# §32 第三方集成与 SSO

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/oauth.ts`、`services/auth/oauth.ts`、`api/src/routes/webhooks.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

> **总体结论：SSO/OIDC/SAML/LDAP 整体空白。** 当前登录方式仅邮箱密码 + GitHub C 端 OAuth。

## 32.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 32.1 | 管理员级全局出站 Webhook（事件→企微/Slack/自研 URL） | —（`routes/webhooks.ts` 是用户端入站配置，见 §22.4） | ❌ | 无平台级事件投递引擎 |
| 32.2 | SSO 单点登录（OIDC / SAML 2.0 / LDAP） | —（无 sso_config 表、无 `/admin/settings/sso`、无 `/auth/sso/:provider`） | ❌ | 完全未实现；会话交换流程（ADR-0025）仅有决策无代码 |
| 32.3 | 企微/钉钉/飞书扫码登录（管理后台） | — | ❌ | |
| 32.4 | C 端第三方 OAuth | `oauth.ts`：`/auth/oauth/github/url`、`/github/callback`、`/bindings`、`/:provider/{bind,unbind}` | 🟡 | GitHub 已接（含 state 一次性校验）；wechat/telegram/google 返回 501 OAuthNotImplementedError |
| 32.5 | SSO 角色 group 映射（Admin/Viewer） | — | ❌ | 随 SSO 整体未建 |

## 32.2 关键架构（规划）

- SSO 落地顺序建议：先 OIDC（企业微信/飞书/钉钉均支持 OIDC 协议），SAML 仅在有政务/金融客户要求时补；LDAP 最后。
- 会话交换遵循 ADR-0025：外部 IdP 回调 → 平台签发本地 JWT → 旧本地账号绑定/首次自动建号。

## 32.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | C 端微信登录（替换 501 占位） |
| P2 | OIDC SSO 通用接入 + 管理后台扫码登录 |
| P2 | 全局出站事件 Webhook 引擎 |
| P3 | SAML / LDAP |
