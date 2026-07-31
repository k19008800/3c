# 深化参考：§32 第三方集成与 SSO

> **对应**：[`SPEC-§32-第三方集成与SSO.md`](SPEC-§32-第三方集成与SSO.md)
> **关联**：[`ref-4.6-security.md`](ref-4.6-security.md)、[`ref-16.3-sms.md`](ref-16.3-sms.md)、[`ref-16.4-oss.md`](ref-16.4-oss.md)
> **优先级**：P1 | **状态**：需求文档（部分已实现：Global Webhook §32.1 + SSO §32.2 + 企业通讯录 §32.3 配置 API）
> **最后更新**：2026-07-31

---

## 概述

本模块覆盖三种第三方集成能力：全局 Webhook 回调、SSO 单点登录（OIDC/SAML/LDAP）、企业通讯录 OAuth 登录（企微/钉钉/飞书）。其中 Webhook 和 SSO 配置的 API 端已实现，前端配置页也已实现。

> ⚠️ 注意：SSO/企业通讯录目前仅完成**配置存储 API**，实际的 OAuth/SAML 认证登录链路尚未接入——用户配置后还不能通过 SSO 真正登录平台。

---

## §32.1 全局 Webhook（已实现）

### 数据表结构

```typescript
// webhooks — 全局 Webhook 配置
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  events: text("events").notNull(),
    // JSON: 订阅的事件类型数组
    // 如 ["user.created", "user.deleted", "recharge.completed", "agent.commission_settled"]
  secret: varchar("secret", { length: 100 }).notNull(),
    // HMAC 签名密钥
  isActive: boolean("is_active").default(true),
  retryCount: integer("retry_count").default(3),
  timeoutMs: integer("timeout_ms").default(5000),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// webhook_delivery_logs — Webhook 投递日志
export const webhookDeliveryLogs = pgTable("webhook_delivery_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => webhooks.id),
  event: varchar("event", { length: 50 }).notNull(),
  payload: text("payload"),   // 原始 payload
  responseCode: integer("response_code"),
  responseBody: text("response_body"),
  latencyMs: integer("latency_ms"),
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'success' | 'failed' | 'timeout'
  attempt: integer("attempt").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 支持事件

| 事件类型 | 触发时机 | 优先级 |
|---------|---------|--------|
| user.created | 用户注册 | P0 |
| user.deleted | 用户注销 | P0 |
| user.updated | 信息变更 | P1 |
| recharge.completed | 充值成功 | P0 |
| recharge.refunded | 充值退款 | P1 |
| withdraw.created | 提现申请 | P1 |
| withdraw.completed | 提现完成 | P1 |
| agent.commission_settled | 代理佣金结算 | P1 |
| alert.triggered | 告警触发 | P0 |
| model.price_changed | 模型价格变更 | P0 |

### API 接口

```
GET    /api/v1/admin/webhooks                      — Webhook 配置列表
POST   /api/v1/admin/webhooks                      — 创建 Webhook
  body: { name, url, events[], secret?, retryCount?, timeoutMs? }
PUT    /api/v1/admin/webhooks/:id                  — 编辑 Webhook
DELETE /api/v1/admin/webhooks/:id                  — 删除 Webhook
POST   /api/v1/admin/webhooks/:id/test             — 发送测试事件
PUT    /api/v1/admin/webhooks/:id/toggle           — 启用/禁用
GET    /api/v1/admin/webhooks/:id/logs             — 投递记录
  params: { status?, dateFrom?, dateTo?, page, limit }
```

### HMAC 签名机制

```
// 请求头
X-Webhook-Signature: sha256=HMAC_SHA256(payload, secret)
X-Webhook-Event: user.created
X-Webhook-Timestamp: 1690358400

// 验证步骤
1. 接收方从 header 读取签名、事件类型、时间戳
2. 对比时间戳偏差（拒绝偏差 > 5 分钟）
3. 使用 secret 对 body 计算 HMAC_SHA256
4. 比较计算值与 X-Webhook-Signature
```

### 前端组件

```tsx
<WebhookConfigList
  webhooks: WebhookConfig[]
  onCreate: () => void
  onEdit: (id: number) => void
  onDelete: (id: number) => Promise<void>
  onToggle: (id: number, isActive: boolean) => Promise<void>
  onTest: (id: number) => Promise<void>
/>

<WebhookConfigForm
  events: EventOption[]
  initialData?: WebhookConfig
  onSubmit: (data: WebhookFormData) => Promise<void>
/>

<WebhookDeliveryLogs
  webhookId: number
  logs: DeliveryLog[]
  filters: { status?, dateRange? }
  onFilterChange: (filters) => void
/>

interface WebhookConfig {
  id: number
  name: string
  url: string
  events: string[]
  secret: string
  isActive: boolean
  retryCount: number
  timeoutMs: number
  lastSuccessAt?: string
  lastError?: string
  createdAt: string
}

interface WebhookFormData {
  name: string
  url: string
  events: string[]
  secret?: string
  retryCount: number
  timeoutMs: number
}

interface DeliveryLog {
  id: number
  event: string
  status: 'pending' | 'success' | 'failed' | 'timeout'
  responseCode?: number
  responseBody?: string
  latencyMs?: number
  attempt: number
  createdAt: string
}
```

### 重试策略

| 尝试 | 间隔 | 说明 |
|------|------|------|
| 第 1 次 | 立即 | 初始投递 |
| 第 2 次 | 30s 后 | 首次失败后重试 |
| 第 3 次 | 5min 后 | 再次失败后重试 |
| 第 4 次 | 30min 后 | 最后一次（如果配置了 retryCount=4）|

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 32.1-1 | 创建 Webhook | 填写 URL+事件+密钥，创建成功 |
| 32.1-2 | 测试 Webhook | 发送测试事件到指定 URL，显示响应码 |
| 32.1-3 | 事件触发自动推送 | 充值完成后收到 Webhook 回调 |
| 32.1-4 | HMAC 签名验证 | 请求头包含有效签名 |
| 32.1-5 | 失败重试 | 投递失败按间隔重试 |
| 32.1-6 | 投递日志查看 | 查看每次投递的请求/响应/耗时 |

---

## §32.2 SSO 单点登录（配置 API 已实现）

### 数据表结构

```typescript
// sso_configs — SSO 配置
export const ssoConfigs = pgTable("sso_configs", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 30 }).notNull().unique(),
    // 'oidc' | 'saml' | 'ldap'
  label: varchar("label", { length: 50 }).default("SSO"),
  isEnabled: boolean("is_enabled").default(false),
  config: text("config").notNull(),
    // OIDC:  { issuerUrl, clientId, clientSecret, scopes[], redirectUri }
    // SAML: { idpEntityId, idpSsoUrl, idpCertificate, acsUrl, spEntityId }
    // LDAP: { url, bindDn, bindPassword, searchBase, userFilter }
  forcedDomains: text("forced_domains"),
    // JSON: 指定域名下的用户强制使用 SSO 登录
  defaultRole: varchar("default_role", { length: 50 }),
    // SSO 登录后默认分配的角色
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/admin/sso/configs                  — SSO 配置列表
POST   /api/v1/admin/sso/configs                  — 配置 SSO 提供商
  body: { provider, label, config, forcedDomains?, defaultRole? }
PUT    /api/v1/admin/sso/configs/:provider         — 更新配置
DELETE /api/v1/admin/sso/configs/:provider         — 删除配置
POST   /api/v1/admin/sso/configs/:provider/test    — 测试 SSO 连接
PUT    /api/v1/admin/sso/configs/:provider/toggle  — 启用/禁用

// 登录认证
GET    /api/v1/auth/sso/:provider                  — 跳转到 SSO 登录页面
POST   /api/v1/auth/sso/:provider/callback         — SSO 回调处理
```

### SSO 类型配置

**OIDC（推荐）**：

```typescript
interface OIDCConfig {
  issuerUrl: string          // 如 https://login.microsoftonline.com/{tenant}/v2.0
  clientId: string
  clientSecret: string
  scopes: string[]           // 默认 ["openid", "profile", "email"]
  redirectUri: string        // 如 https://api.unmisa.com/api/v1/auth/sso/oidc/callback
  usernameClaim: string      // 用于映射用户名的 claim，默认 "preferred_username"
  emailClaim: string         // 用于映射邮箱的 claim，默认 "email"
  autoCreateUser: boolean    // 首次登录自动创建用户
}
```

**SAML**：

```typescript
interface SAMLConfig {
  idpEntityId: string        // IdP Entity ID
  idpSsoUrl: string          // IdP SSO URL (POST binding)
  idpCertificate: string     // IdP X.509 证书（用于验证 SAML Response）
  acsUrl: string             // Assertion Consumer Service URL
  spEntityId: string         // SP Entity ID
  nameIdFormat: string       // 默认 "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
  attributeMapping: {        // SAML attribute → 平台字段映射
    username: string
    email: string
    displayName?: string
  }
}
```

**LDAP**：

```typescript
interface LDAPConfig {
  url: string                // ldap://ldap.example.com:389 或 ldaps://
  bindDn: string             // cn=admin,dc=example,dc=com
  bindPassword: string
  searchBase: string         // ou=users,dc=example,dc=com
  userFilter: string         // (uid={{username}})
  attributes: {              // LDAP 属性映射
    username: string         // "uid" | "cn" | "sAMAccountName"
    email: string            // "mail"
    displayName: string      // "displayName"
    phone?: string           // "telephoneNumber"
  }
  tlsOptions?: {
    rejectUnauthorized: boolean
  }
}
```

### 登录流程

```
OIDC 登录:
  用户点击"SSO 登录" → 跳转至 IdP 页面 → 用户授权 → IdP 回调 → 验证 ID Token
  → 查找/创建平台用户 → 签发平台 JWT → 重定向回控制台

SAML 登录:
  用户点击"SSO 登录" → 平台生成 SAML Request → 重定向到 IdP → IdP 返回 SAML Response
  → 验证签名/断言 → 创建/匹配用户 → 签发平台 JWT → 重定向回控制台

LDAP 登录:
  用户输入用户名+密码 → 平台使用 LDAP bind 验证 → 查找用户属性
  → 创建/匹配用户 → 签发平台 JWT → 重定向回控制台
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 32.2-1 | 配置 OIDC SSO | 填写 Issuer/ClientID/Secret，保存成功 |
| 32.2-2 | 配置 SAML SSO | 上传 IdP 元数据/手动配置，保存成功 |
| 32.2-3 | 配置 LDAP | 填写连接参数，测试连通性 |
| 32.2-4 | SSO 登录 | 用户通过 SSO 进入平台，自动创建或匹配用户（配置 API 已实现 **但完整登录链路未接入**）|

---

## §32.3 企业通讯录登录（配置 API 已实现）

### 数据表结构

```typescript
// enterprise_oauth_configs — 企业通讯录 OAuth 配置
export const enterpriseOAuthConfigs = pgTable("enterprise_oauth_configs", {
  id: serial("id").primaryKey(),
  platform: varchar("platform", { length: 20 }).notNull().unique(),
    // 'wecom' | 'dingtalk' | 'feishu'
  label: varchar("label", { length: 50 }),
  isEnabled: boolean("is_enabled").default(false),
  config: text("config").notNull(),
    // 企微: { corpId, agentId, secret, token, encodingAesKey }
    // 钉钉: { appKey, appSecret, corpId }
    // 飞书: { appId, appSecret }
  autoCreateUser: boolean("auto_create_user").default(true),
  defaultRole: varchar("default_role", { length: 50 }),
  syncContacts: boolean("sync_contacts").default(false),
    // 可选：同步企业通讯录为平台用户
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/admin/enterprise-oauth              — 配置列表（企微/钉钉/飞书）
POST   /api/v1/admin/enterprise-oauth              — 配置
  body: { platform, label, config, autoCreateUser?, defaultRole?, syncContacts? }
PUT    /api/v1/admin/enterprise-oauth/:platform     — 更新
DELETE /api/v1/admin/enterprise-oauth/:platform     — 删除
POST   /api/v1/admin/enterprise-oauth/:platform/test   — 测试连接
PUT    /api/v1/admin/enterprise-oauth/:platform/toggle — 启用/禁用

// 登录认证（尚未实现完整链路）
GET    /api/v1/auth/enterprise/:platform            — 跳转到企业 OAuth
POST   /api/v1/auth/enterprise/:platform/callback   — OAuth 回调
```

### 前端组件

```tsx
<EnterpriseOAuthConfig
  platforms: { platform: string; label: string; isEnabled: boolean }[]
  onConfigure: (platform: string) => void
  onToggle: (platform: string, isEnabled: boolean) => Promise<void>
/>

<EnterpriseOAuthForm
  platform: 'wecom' | 'dingtalk' | 'feishu'
  initialData?: EnterpriseOAuthConfig
  onSubmit: (data: EnterpriseOAuthFormData) => Promise<void>
  onTest: (data: EnterpriseOAuthFormData) => Promise<string>
/>

interface EnterpriseOAuthFormData {
  platform: string
  label: string
  config: WecomConfig | DingtalkConfig | FeishuConfig
  autoCreateUser: boolean
  defaultRole?: string
}
```

### 各平台配置字段

**企微 (WeCom)：**

```typescript
interface WecomConfig {
  corpId: string
  agentId: string
  secret: string
  token?: string             // 回调配置用
  encodingAesKey?: string    // 回调配置用
}
```

**钉钉 (DingTalk)：**

```typescript
interface DingtalkConfig {
  appKey: string
  appSecret: string
  corpId: string
}
```

**飞书 (Feishu)：**

```typescript
interface FeishuConfig {
  appId: string
  appSecret: string
}
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 32.3-1 | 配置企微 OAuth | 填写 CorpID/AgentID/Secret，测试连接 |
| 32.3-2 | 配置钉钉 OAuth | 填写 AppKey/AppSecret/CorpId |
| 32.3-3 | 配置飞书 OAuth | 填写 AppId/AppSecret |
| 32.3-4 | 启用/禁用 | 启用后登录页显示对应入口按钮 |
| 32.3-5 | 通讯录同步（可选） | 指定组织架构自动创建用户账号（**尚未实现**）|

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| SSO-001 | SSO 用户邮箱已存在 | 匹配已有用户并绑定 SSO 身份，不创建重复账号 |
| SSO-002 | SSO 登录失败（IdP 不可达） | 降级为密码/验证码登录，提示 SSO 当前不可用 |
| SSO-003 | SAML Response 签名验证失败 | 拒绝登录，记录详细签名验证错误日志 |
| SSO-004 | SSO 配置变更后已有 Token | 旧 Token 有效期内仍可用，新登录使用新配置 |
| SSO-005 | Webhook 目标 URL 不可达 | 按重试策略重试，所有重试失败后标记 deactivated |
| SSO-006 | 企业 OAuth 强制域名不匹配 | 用户邮箱域名不匹配时拒绝 SSO 登录，提示使用平台账号 |
| SSO-007 | 多 SSO 提供商同时启用 | 登录页显示启用的 SSO 按钮列表，用户自行选择 |
| SSO-008 | SSO 用户首次登录无默认角色 | 分配默认角色（如 viewer），管理员可后续调整 |

---

## 上下游关系

```
§32 第三方集成与SSO:
  ├── §32.1 全局 Webhook: webhooks → 事件系统 → ref-4.8-system-config
  ├── §32.2 SSO 单点登录: ssoConfigs → 认证服务 → ref-2.1-roles-permissions
  ├── §32.3 企业通讯录: enterpriseOAuthConfigs → 认证服务 → 用户创建
  └── 管理面板: admin → 侧边栏"设置 → 第三方集成"入口
```
