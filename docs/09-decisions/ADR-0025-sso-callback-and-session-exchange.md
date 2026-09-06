# ADR-0025：SSO Callback 域名与会话交换方式

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 6 的确认
- 关联 ADR：ADR-0008、ADR-0011、ADR-0014

## 背景
既有 SSO 文档使用未纳入部署范围的 `admin.unmisa.com`，并存在回调直接返回 JWT 与 HTTP-only Cookie 鉴权目标冲突。

## 决策
- 统一 callback 地址为 `https://api.unmisa.com/api/v1/auth/sso/callback`；除非未来完成独立 DNS、TLS、反向代理和发布配置，不使用 `admin.unmisa.com`。
- SSO provider 回调接收 authorization code；后端验证 `state`、issuer、client_id、redirect_uri 和 PKCE。
- 后端完成 provider 验证后签发一次性、短时 authorization code；前端仅通过 HTTPS 使用该 code 兑换平台会话。
- 服务端使用 `Secure`、`HttpOnly`、`SameSite=Lax` 或更严格策略的 Cookie 建立会话。
- 不在 URL、页面正文或前端持久化存储中返回或保存长期 JWT。
- `state` 和 authorization code 必须一次性使用、短时有效；code 绑定用户、浏览器会话、redirect URI 和 PKCE verifier。
- callback 的域名、路径和协议必须与 provider 注册值完全一致。
- 回调失败返回固定错误码并记录 `request_id`，不得泄露 provider token 或敏感响应。
- 登录 2FA 与资金操作级 2FA 分离。

## 影响与迁移
更新 SSO SPEC/API、部署域名与反向代理配置、会话安全文档、测试和 E2E；补充 state/PKCE/重放/redirect mismatch/Cookie 属性测试。未完成真实域名和 provider 配置前不得标记 SSO 为 `approved` 或宣称已上线。

## 关联文件
- `docs/00-index/open-issues.md`
- `docs/00-index/decision-register.md`
- `audit/08-deployment/document-decision-log.md#dec-025`
