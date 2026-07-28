# 功能说明书：§32 第三方集成与 SSO 单点登录

> **对应文档**：[`PRD-第三方集成.md`](PRD-第三方集成.md)
> **状态**：草案（仅需求文档）
> **优先级**：P1

---

## 32.0 总览

### 功能描述

平台已有的第三方集成较为薄弱（§16 只有 32 行 SPEC）。本模块补充：外部通知渠道的全局 Webhook、SSO 单点登录对接企业身份系统、企业微信/钉钉/飞书账号登录。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 32.1 | 全局 Webhook 出站 | P1 | 所有订单/事件变更推送到外部系统 |
| 32.2 | SSO 单点登录 | P1 | 企业客户对接 LDAP/OIDC/SAML，用公司账号登录 |
| 32.3 | 企业通讯录账号登录 | P1 | 企业微信/钉钉/飞书扫码登录管理后台 |

---

## 32.1 全局 Webhook 出站

### 功能描述

管理员级别的全局 Webhook 配置（区别于 §22.4 用户端 Webhook）。将平台上所有关键事件推送到外部系统（企业微信、Slack、自研系统等），实现事件驱动的外部集成。

### 完成能力 / 展示效果

**管理后台 → 设置 → Webhook：**

```
全局 Webhook

  ┌──────────────────────────────────────────────┐
  │  Webhook 端点                                  │
  ├──────────┬──────────┬──────────┬──────────────┤
  │ URL      │ 事件     │ 状态     │ 最近推送      │
  ├──────────┼──────────┼──────────┼──────────────┤
  │ https://…│ 充值/提现│ ✅ 启用  │ 2 分钟前      │
  │ https://…│ 供应商   │ ✅ 启用  │ 10 分钟前     │
  │ https://…│ 用户注册 │ ⚪ 暂停  │ 3 天前        │
  └──────────┴──────────┴──────────┴──────────────┘

  [+ 新增 Webhook]
```

**创建 Webhook 弹窗：**

```
创建 Webhook

  名称: [内部监控系统]
  URL: [https://monitor.internal.com/3cloud-webhook]
  密钥: [自动生成 Secret ▼] sk_wh_abc123...
           ↑ 用于 HMAC 签名验证

  订阅事件:
  ☑ 充值成功 / 充值异常
  ☑ 提现申请 / 提现完成
  ☑ 供应商可用性变更
  ☑ 用户注册 / 用户注销
  ☐ 代理佣金结算
  ☐ 系统告警
  ☐ 对账差异

  重试策略: 失败后重试 3 次（5s / 30s / 5min）
  连续失败后自动暂停: 🔴 10 次

  [测试推送] [保存]
```

**推送消息格式：**

```json
{
  "event": "recharge.completed",
  "timestamp": "2026-07-28T14:23:45Z",
  "id": "evt_abc123",
  "data": {
    "orderNo": "RE20260728-0001",
    "userId": 42,
    "userEmail": "user@example.com",
    "amount": 100.00,
    "channel": "wechat",
    "status": "completed"
  },
  "signature": "sha256=xxxxx"
}
```

### 数据表结构

```typescript
// global_webhooks — 全局 Webhook 配置
export const globalWebhooks = pgTable("global_webhooks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 100 }).notNull(),
  events: text("events").notNull(),                // 逗号分隔
  enabled: boolean("enabled").default(true),
  retryCount: integer("retry_count").default(3),
  consecutiveFailures: integer("consecutive_failures").default(0),
  autoDisableAfter: integer("auto_disable_after").default(10),
  lastSentAt: timestamp("last_sent_at"),
  lastStatus: varchar("last_status", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/admin/webhooks               — Webhook 列表
POST   /api/v1/admin/webhooks               — 创建 Webhook
PUT    /api/v1/admin/webhooks/:id           — 更新
DELETE /api/v1/admin/webhooks/:id           — 删除
POST   /api/v1/admin/webhooks/:id/test      — 测试推送
GET    /api/v1/admin/webhooks/:id/logs      — 推送日志
```

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 管理员创建 Webhook → 订阅充值事件 → 用户充值 → 外部系统收到推送
2. 推送签名验证通过（HMAC-SHA256）
3. 推送失败自动重试 3 次，连续 10 次失败自动暂停
4. 测试推送 → 外部系统收到测试事件

---

## 32.2 SSO 单点登录

### 功能描述

企业客户不需要在 3Cloud 上创建独立账号，而是通过公司已有的身份系统（LDAP / OIDC / SAML 2.0）登录管理后台，实现统一账号管理。

### 完成能力 / 展示效果

**管理后台 → 设置 → SSO 配置：**

```
SSO 单点登录配置

  SSO 登录: [已启用]

  认证协议: [OpenID Connect (OIDC) ▼]
    ○ LDAP / Active Directory
    ● OpenID Connect (OIDC)
    ○ SAML 2.0

  OIDC 配置:
  ┌──────────────────────────────────────────────┐
  │  Issuer URL:  [https://login.company.com]    │
  │  Client ID:   [3cloud-xxxx]                   │
  │  Client Secret: [********]                    │
  │  Scopes:      [openid profile email]          │
  │  Redirect URI: [https://admin.unmisa.com/     │
  │                 auth/sso/callback]            │
  │                                               │
  │  [测试 SSO 连接]                               │
  └──────────────────────────────────────────────┘
```

**登录页效果：**

```
登录 3Cloud 管理后台

  邮箱: [___________]
  密码: [___________]

  [登录]

  ──── 或使用企业账号登录 ────

  [使用企业 SSO 登录]

  点击后跳转到企业身份认证页 → 认证通过后自动登录
```

**SSO 账户映射规则：**

```
SSO 认证通过后 →
  ├── 查找 email 是否已有 3Cloud 账号
  │   ├── 有 → 直接登录（绑定该 SSO 账号）
  │   └── 无 → 自动创建账号
  ├── 角色映射:
  │   ├── SSO group "3Cloud-Admin" → 映射为 admin 角色
  │   └── SSO group "3Cloud-Viewer" → 映射为 viewer 角色
  └── 登录成功后返回 JWT token（后续请求同现有认证）
```

### 数据表扩展

```typescript
// users 表扩展
// sso_provider: varchar — 'ldap' | 'oidc' | 'saml' | null
// sso_external_id: varchar — 外部系统中的用户 ID
// sso_last_login_at: timestamp

// site_configs 扩展字段
// sso_enabled: boolean
// sso_provider: 'ldap' | 'oidc' | 'saml'
// sso_config: jsonb — 各协议的详细配置
```

### API 接口

```
GET  /api/v1/admin/settings/sso              — 获取 SSO 配置
PUT  /api/v1/admin/settings/sso              — 更新 SSO 配置
POST /api/v1/admin/settings/sso/test         — 测试 SSO 连接

GET  /api/v1/auth/sso/:provider              — 跳转到 SSO 认证页
GET  /api/v1/auth/sso/:provider/callback     — SSO 回调处理
```

### 验收标准

1. 管理员配置 OIDC → 登录页显示"使用企业 SSO 登录"
2. 点击 SSO 登录 → 跳转到企业身份认证页 → 认证后自动登录
3. SSO 用户首次登录 → 自动创建 3Cloud 账号
4. SSO 用户角色按 group 映射规则自动分配
5. 测试 SSO 连接 → 显示连接成功/失败

---

## 32.3 企业通讯录账号登录

### 功能描述

支持企业微信/钉钉/飞书的扫码登录。开箱即用，无需额外配置身份提供商。

### 完成能力 / 展示效果

**登录页新增按钮：**

```
登录 3Cloud 管理后台

  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ 企业微信  │  │  钉钉   │  │  飞书   │
  │  扫码登录 │  │ 扫码登录 │  │ 扫码登录 │
  └─────────┘  └─────────┘  └─────────┘

  或使用 邮箱 + 密码 登录
```

**数据表：**

```
// user_oauth_connections 表扩展
// provider 新增: wecom / dingtalk / feishu
```

### 验收标准

1. 登录页显示企业微信扫码登录按钮
2. 扫码后认证通过 → 自动登录或绑定已有账号
3. 首次扫码登录 → 引导绑定已有 3Cloud 账号或创建新账号


---

### [?] 页面帮助

**页面名称**：功能说明书：§32 第三方集成与 SSO 单点登录

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§32 第三方集成与 SSO 单点登录 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
