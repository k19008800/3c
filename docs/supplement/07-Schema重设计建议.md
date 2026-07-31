# 数据库 Schema 重设计建议

> **定位**：基于新文档（01-06）和现有 PRD 体系，重新设计 3cloud 整体数据库 Schema
> **原则**：
> 1. 弃旧库，schema 从零设计
> 2. 每个表注释清晰，字段带业务含义
> 3. 优先使用 Drizzle ORM 定义
> 4. 关键表带行级锁/乐观锁/唯一约束
> 5. 索引按查询模式设计

---

## 一、核心表总览

| 分类 | 表名 | 说明 | 优先级 |
|------|------|------|--------|
| **用户** | users | 用户（含余额）| P0 |
| | user_profiles | 用户扩展信息 | P0 |
| | user_balance_logs | 余额变动日志 | P0 |
| | user_quota_history | 用户配额/预算历史 | P1 |
| **认证** | api_keys | API Key 管理 | P0 |
| | login_logs | 登录日志 | P1 |
| **模型** | models | AI 模型定义 | P0 |
| | vendor_models | 供应商-模型映射（含成本价）| P0 |
| **供应商** | vendors | 供应商 | P0 |
| | vendor_api_keys | 供应商 API Key 管理 | P0 |
| | vendor_health_logs | 供应商健康度日志 | P1 |
| **路由** | model_routes | 模型路由配置 | P0 |
| | route_overrides | 覆盖规则 | P1 |
| **调用记录** | call_logs | API 调用日志 | P0 |
| **计费** | billing_logs | 计费日志 | P0 |
| | closing_periods | 会计锁账期 | P1 |
| **充值** | recharge_orders | 充值订单 | P0 |
| | refund_orders | 退款订单 | P0 |
| **平台总账** | platform_ledger | 平台总账流水 | P0 |
| | ledger_balances | 总账科目余额 | P1 |
| **对账** | reconciliation_logs | 对账记录 | P0 |
| | reconciliation_diffs | 对账差异明细 | P0 |
| **代理** | agents | 代理商 | P0 |
| | agent_user_relations | 代理-用户关系 | P0 |
| | commission_rules | 佣金规则 | P0 |
| | agent_commissions | 佣金记录 | P0 |
| | commission_snapshots | 佣金结算快照 | P1 |
| | withdraw_orders | 提现订单 | P0 |
| **通知** | notifications | 通知记录 | P1 |
| | notification_templates | 通知模板 | P1 |
| **运营** | promotions | 活动/优惠 | P1 |
| | operation_logs | 操作日志 | P0 |
| | site_configs | 系统配置 | P0 |
| | audit_logs | 审计日志 | P0 |

---

## 二、完整 Schema 定义

### 2.1 用户域

```typescript
// === users ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 100 }),
  avatar: varchar("avatar", { length: 500 }),

  // 角色
  role: varchar("role", { length: 20 }).notNull().default("user"),
    // user | agent | operator | agent_mgr | finance_ops | super_admin

  // 余额
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  overdraftLimit: numeric("overdraft_limit", { precision: 10, scale: 2 }).default("10.00"),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | frozen | disabled | deleted

  // 实名认证
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),

  // 安全
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),

  // 元数据
  remark: text("remark"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_email: (email) UNIQUE
// - idx_phone: (phone)
// - idx_role: (role)
// - idx_status: (status)

// === user_profiles ===
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id),

  // 偏好
  defaultModelId: integer("default_model_id").references(() => models.id),
  preferredPaymentMethod: varchar("preferred_payment_method", { length: 20 }),

  // 预算配额
  monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),
  budgetAlertThreshold: numeric("budget_alert_threshold", { precision: 5, scale: 2 }).default("0.80"),

  // 通知
  emailNotifications: boolean("email_notifications").default(true),
  smsNotifications: boolean("sms_notifications").default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === user_balance_logs ===
export const userBalanceLogs = pgTable("user_balance_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),

  // 变动
  type: varchar("type", { length: 30 }).notNull(),
    // recharge | consumption | refund | withdraw | adjustment | commission | bonus
  direction: varchar("direction", { length: 5 }).notNull(),  // in | out
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),

  // 关联
  billingLogId: integer("billing_log_id").references(() => billingLogs.id),
  rechargeOrderId: integer("recharge_order_id").references(() => rechargeOrders.id),
  withdrawOrderId: integer("withdraw_order_id").references(() => withdrawOrders.id),

  // 备注
  remark: varchar("remark", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 索引
// - idx_user_id_type: (user_id, type)
// - idx_user_id_created: (user_id, created_at DESC)
// - idx_billing_log_id: (billing_log_id)
```

### 2.2 认证域

```typescript
// === api_keys ===
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),

  // Key 值
  keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),  // 前 8 位，如 "sk-3c-a1b2"
  keyHash: varchar("key_hash", { length: 255 }).notNull(),     // 完整 Key 的哈希值
  keyLastChars: varchar("key_last_chars", { length: 4 }),      // 后 4 位，用于展示

  name: varchar("name", { length: 100 }),                      // Key 名称
  allowedModels: integer("allowed_models").array(),            // 允许的 model_id 数组，null=全部
  rateLimit: integer("rate_limit"),                             // 独立限流（null=使用全局）
  monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),

  // IP 白名单
  ipWhitelist: varchar("ip_whitelist", { length: 500 }),       // JSON 数组或逗号分隔

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | disabled | expired

  // 使用统计
  lastUsedAt: timestamp("last_used_at"),
  totalCalls: integer("total_calls").default(0),

  // 过期
  expiresAt: timestamp("expires_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_key_prefix: (key_prefix, key_hash)  // 查询用
// - idx_user_id: (user_id)
// - idx_status: (status)

// === login_logs ===
export const loginLogs = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  email: varchar("email", { length: 255 }).notNull(),

  // 登录信息
  ip: varchar("ip", { length: 45 }).notNull(),
  userAgent: varchar("user_agent", { length: 500 }),
  deviceInfo: varchar("device_info", { length: 500 }),

  // 结果
  success: boolean("success").notNull(),
  failReason: varchar("fail_reason", { length: 100 }),  // wrong_password / user_disabled / 2fa_failed

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 索引
// - idx_user_id: (user_id)
// - idx_created_at: (created_at)
// - idx_ip_success: (ip, success)  // 异常检测
```

### 2.3 模型与供应商域

```typescript
// === models ===
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),      // 模型名，如 deepseek-chat
  displayName: varchar("display_name", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),         // deepseek / openai / glm / ...

  // 定价（用户端）
  inputPrice: numeric("input_price", { precision: 14, scale: 6 }).notNull(),     // 每 1M tokens
  outputPrice: numeric("output_price", { precision: 14, scale: 6 }).notNull(),
  inputPriceUnit: integer("input_price_unit").default(1000000),    // 计价单位，默认 1M
  outputPriceUnit: integer("output_price_unit").default(1000000),

  // 模型特性
  maxTokens: integer("max_tokens"),
  supportsStreaming: boolean("supports_streaming").default(true),
  supportsFunctionCall: boolean("supports_function_call").default(false),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | inactive | deprecated

  // 排序
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === vendors ===
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),   // 供应商名
  displayName: varchar("display_name", { length: 100 }).notNull(),

  // API 配置
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  apiVersion: varchar("api_version", { length: 20 }),

  // 健康度
  healthScore: integer("health_score").default(100),            // 0-100
  circuitBreakerState: varchar("circuit_breaker_state", { length: 20 }).default("CLOSED"),
    // CLOSED | OPEN | HALF_OPEN
  lastHealthCheckAt: timestamp("last_health_check_at"),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | inactive | maintenance

  // 结算
  settlementCycle: varchar("settlement_cycle", { length: 10 }).default("monthly"),  // monthly / weekly

  // 元数据
  remark: text("remark"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === vendor_models ===
export const vendorModels = pgTable("vendor_models", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  modelId: integer("model_id").notNull().references(() => models.id),

  // 供应商侧的模型名（可能和平台不同）
  vendorModelName: varchar("vendor_model_name", { length: 100 }).notNull(),

  // 供应商成本价
  costInputPrice: numeric("cost_input_price", { precision: 14, scale: 6 }).notNull(),
  costOutputPrice: numeric("cost_output_price", { precision: 14, scale: 6 }).notNull(),
  costInputUnit: integer("cost_input_unit").default(1000000),
  costOutputUnit: integer("cost_output_unit").default(1000000),

  // 路由权重
  weight: integer("weight").notNull().default(100),

  // 状态
  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 约束
// - (vendor_id, model_id) UNIQUE
// - 一个模型可以有多个供应商映射

// === vendor_api_keys ===
export const vendorApiKeys = pgTable("vendor_api_keys", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),

  keyName: varchar("key_name", { length: 100 }),              // 备注名
  keyValue: text("key_value").notNull(),                      // 加密存储
  keyPrefix: varchar("key_prefix", { length: 20 }),           // 用于识别哪个 Key

  // 配额
  quotaLimit: numeric("quota_limit", { precision: 14, scale: 2 }),  // 配额上限
  quotaUsed: numeric("quota_used", { precision: 14, scale: 2 }).default("0"),
  quotaResetAt: timestamp("quota_reset_at"),                  // 配额重置时间

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | quota_exhausted | disabled

  lastUsedAt: timestamp("last_used_at"),
  totalCalls: integer("total_calls").default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === vendor_health_logs ===
export const vendorHealthLogs = pgTable("vendor_health_logs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),

  checkType: varchar("check_type", { length: 20 }).notNull(),  // active / passive / deep
  success: boolean("success").notNull(),
  latencyMs: integer("latency_ms"),
  statusCode: integer("status_code"),
  errorMessage: varchar("error_message", { length: 500 }),

  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

// 索引
// - idx_vendor_id_checked: (vendor_id, checked_at DESC)
// - cleanup: 保留最近 7 天数据
```

### 2.4 路由域

```typescript
// === model_routes ===
// 模型路由配置——决定每个模型走哪个供应商
export const modelRoutes = pgTable("model_routes", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => models.id),

  // 路由策略
  strategy: varchar("strategy", { length: 20 }).notNull().default("weighted"),
    // weighted            加权轮询
    // priority            优先（优先走最高优先级，失败后降级）
    // failover            主备（只走 primary，挂了走 secondary）
    // manual_pin          手动指定

  // 健康检查
  healthCheckEnabled: boolean("health_check_enabled").default(true),
  healthCheckInterval: integer("health_check_interval").default(30000),  // ms

  // 熔断配置（JSON 覆盖全局配置）
  circuitBreakerConfig: jsonb("circuit_breaker_config"),

  // 状态
  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === model_route_vendors ===
// 模型路由的供应商映射
export const modelRouteVendors = pgTable("model_route_vendors", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => modelRoutes.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  vendorModelId: integer("vendor_model_id").notNull().references(() => vendorModels.id),

  // 路由权重
  weight: integer("weight").notNull().default(100),

  // 主备策略
  priority: integer("priority").default(0),      // 0=primary, 1=secondary, 2+=tertiary
  role: varchar("role", { length: 20 }).default("primary"),  // primary / secondary / candidate

  // 状态
  enabled: boolean("enabled").notNull().default(true),
  circuitBreakerState: varchar("circuit_breaker_state", { length: 20 }).default("CLOSED"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === route_overrides ===
// （定义见 05-路由熔断恢复梯度.md §4.4）
```

### 2.5 调用记录域

```typescript
// === call_logs ===
export const callLogs = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 64 }).notNull().unique(),  // UUID

  // 用户
  userId: integer("user_id").notNull().references(() => users.id),
  apiKeyId: integer("api_key_id").references(() => apiKeys.id),

  // 模型
  modelId: integer("model_id").notNull().references(() => models.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  vendorModelId: integer("vendor_model_id").references(() => vendorModels.id),

  // 请求参数
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  maxTokens: integer("max_tokens"),
  temperature: numeric("temperature", { precision: 4, scale: 2 }),
  stream: boolean("stream").default(false),

  // 请求响应
  requestBody: text("request_body"),                 // 原始请求（JSON，截断到 10KB）
  responseBody: text("response_body"),               // 原始响应（JSON，截断到 10KB）
  responseStatus: integer("response_status"),         // 供应商 HTTP 状态码
  errorMessage: varchar("error_message", { length: 500 }),

  // 耗时
  latencyMs: integer("latency_ms"),                   // 总耗时
  ttfbMs: integer("ttfb_ms"),                         // 首字节时间（流式）

  // 计费
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }),  // 预扣金额
  actualCost: numeric("actual_cost", { precision: 14, scale: 6 }),        // 实际费用
  vendorCost: numeric("vendor_cost", { precision: 14, scale: 6 }),        // 供应商成本

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | processing | completed | failed | cancelled

  // 元数据
  clientIp: varchar("client_ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_request_id: (request_id) UNIQUE
// - idx_user_id_created: (user_id, created_at DESC)
// - idx_vendor_id_created: (vendor_id, created_at)
// - idx_model_id: (model_id)
// - idx_status: (status) WHERE status IN ('pending', 'processing')
// 分区：按 created_at 按月分区
```

### 2.6 计费域

```typescript
// === billing_logs ===
// （完整定义见 01-计费引擎状态机.md §4.1）

// === closing_periods ===
// （完整定义见 01-计费引擎状态机.md §4.2）
```

### 2.7 充值域

```typescript
// === recharge_orders ===
// （完整定义见 03-充值退款状态机.md §6.1）

// === refund_orders ===
// （完整定义见 03-充值退款状态机.md §6.2）
```

### 2.8 平台总账域

```typescript
// === platform_ledger ===
// 平台总账流水——所有资金流水的统一记录
export const platformLedger = pgTable("platform_ledger", {
  id: serial("id").primaryKey(),
  ledgerNo: varchar("ledger_no", { length: 30 }).notNull().unique(),  // PL20260728000001

  // 类型
  type: varchar("type", { length: 30 }).notNull(),
    // user_recharge        用户充值
    // user_consumption     用户消费（平台收入）
    // user_refund          用户退款
    // agent_withdraw       代理提现
    // agent_commission     代理佣金支出
    // vendor_settlement    供应商结算支出
    // adjustment           调账
    // bonus                活动赠送
    // campaign_reclaim     活动扣回

  direction: varchar("direction", { length: 5 }).notNull(),  // in / out

  // 金额
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 14, scale: 2 }),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),

  // 关联
  rechargeOrderId: integer("recharge_order_id").references(() => rechargeOrders.id),
  withdrawOrderId: integer("withdraw_order_id").references(() => withdrawOrders.id),
  billingLogId: integer("billing_log_id").references(() => billingLogs.id),

  // 日期
  date: date("date").notNull(),  // 归属日期

  // 备注
  remark: varchar("remark", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 索引
// - idx_ledger_no: (ledger_no) UNIQUE
// - idx_type_date: (type, date)
// - idx_date: (date)
// - idx_recharge_order_id: (recharge_order_id)
// 分区：按 date 按月分区

// === ledger_balances ===
// 总账科目余额（每日快照）
export const ledgerBalances = pgTable("ledger_balances", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  type: varchar("type", { length: 30 }).notNull(),

  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull(),
  totalIn: numeric("total_in", { precision: 14, scale: 2 }).notNull().default("0"),
  totalOut: numeric("total_out", { precision: 14, scale: 2 }).notNull().default("0"),
  closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }).notNull(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 约束
// - (date, type) UNIQUE
// - closingBalance = openingBalance + totalIn - totalOut
```

### 2.9 对账域

```typescript
// === reconciliation_logs ===
// 对账批次记录
export const reconciliationLogs = pgTable("reconciliation_logs", {
  id: serial("id").primaryKey(),
  reconciliationType: varchar("reconciliation_type", { length: 30 }).notNull(),
    // vendor_consumption / vendor_settlement / agent_commission / recharge / balance

  // 对账范围
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // 对方
  counterpartyType: varchar("counterparty_type", { length: 20 }),  // vendor / agent / payment_channel
  counterpartyId: integer("counterparty_id"),

  // 汇总
  totalPlatformRecords: integer("total_platform_records").notNull(),
  totalCounterpartyRecords: integer("total_counterparty_records"),
  totalPlatformAmount: numeric("total_platform_amount", { precision: 14, scale: 2 }).notNull(),
  totalCounterpartyAmount: numeric("total_counterparty_amount", { precision: 14, scale: 2 }),
  diffCount: integer("diff_count").default(0),
  diffAmount: numeric("diff_amount", { precision: 14, scale: 2 }).default("0"),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | processing | completed | manual_review

  // 结果
  result: varchar("result", { length: 20 }),  // matched / has_diff / failed

  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === reconciliation_diffs ===
// 对账差异明细
export const reconciliationDiffs = pgTable("reconciliation_diffs", {
  id: serial("id").primaryKey(),
  reconciliationLogId: integer("reconciliation_log_id").notNull()
    .references(() => reconciliationLogs.id),

  // 差异类型
  diffType: varchar("diff_type", { length: 20 }).notNull(),
    // missing_in_platform    平台有，对方无
    // missing_in_counterparty  对方有，平台无
    // amount_mismatch        金额不一致
    // duplicate              重复记录
    // time_mismatch          时间归属差异

  // 平台侧
  platformRecordId: integer("platform_record_id"),
  platformRecordRef: varchar("platform_record_ref", { length: 100 }),  // 如 order_no
  platformAmount: numeric("platform_amount", { precision: 14, scale: 2 }),

  // 对方侧
  counterpartyRecordRef: varchar("counterparty_record_ref", { length: 100 }),
  counterpartyAmount: numeric("counterparty_amount", { precision: 14, scale: 2 }),

  diffAmount: numeric("diff_amount", { precision: 14, scale: 2 }),

  // 严重程度
  severity: varchar("severity", { length: 10 }).notNull().default("INFO"),
    // INFO | WARN | CRITICAL

  // 处理状态
  status: varchar("status", { length: 20 }).notNull().default("new"),
    // new | pending_auto | pending_review | resolved | confirmed
  resolution: varchar("resolution", { length: 30 }),
    // resolved_as_platform_valid | resolved_as_counterparty_valid
    // | resolved_as_auto_match | resolved_as_price_change
    // | resolved_as_duplicate | resolved_as_write_off

  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  remark: varchar("remark", { length: 500 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_reconciliation_log_id: (reconciliation_log_id)
// - idx_status: (status)
// - idx_severity: (severity)
```

### 2.10 代理域

```typescript
// === agents ===
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),

  // 等级与审核
  level: varchar("level", { length: 20 }).notNull().default("preparatory"),
    // preparatory | primary | advanced
  auditStatus: varchar("audit_status", { length: 20 }).notNull().default("approved"),
    // pending | approved | rejected
  auditRemark: text("audit_remark"),
  auditedBy: integer("audited_by").references(() => users.id),
  auditedAt: timestamp("audited_at", { withTimezone: true }),

  // 团队层级
  parentAgentId: integer("parent_agent_id").references(() => agents.id),
  teamDepth: integer("team_depth").default(0),

  // 佣金
  availableCommission: numeric("available_commission", { precision: 14, scale: 2 }).default("0"),
  totalCommission: numeric("total_commission", { precision: 14, scale: 2 }).default("0"),
  totalWithdrawn: numeric("total_withdrawn", { precision: 14, scale: 2 }).default("0"),

  // 高级代理专有
  accountManager: varchar("account_manager", { length: 128 }),
  prioritySupport: boolean("priority_support").notNull().default(false),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | frozen | disabled

  // 银行信息
  bankName: varchar("bank_name", { length: 100 }),
  bankAccountName: varchar("bank_account_name", { length: 100 }),
  bankAccountNo: varchar("bank_account_no", { length: 50 }),
  bankBranch: varchar("bank_branch", { length: 200 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_user_id: (user_id) UNIQUE
// - idx_parent_agent_id: (parent_agent_id)
// - idx_level: (level)

// === agent_user_relations ===
// 代理-用户关系
export const agentUserRelations = pgTable("agent_user_relations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  userId: integer("user_id").notNull().references(() => users.id).unique(),

  // 关系
  relationType: varchar("relation_type", { length: 20 }).notNull().default("direct"),
    // direct: 直接代理关系
    // invite: 邀请链接

  // 状态
  active: boolean("active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at"),
  deactivateReason: varchar("deactivate_reason", { length: 200 }),

  // 用户加入时的佣金率快照
  snapshotRate: numeric("snapshot_rate", { precision: 5, scale: 4 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 约束
// - (agent_id, user_id) UNIQUE
// - (user_id) UNIQUE（一个用户只能属于一个代理）

// === commission_rules ===
// （完整定义见 04-代理佣金与结算.md §1.2）

// === agent_commissions ===
// 佣金记录
export const agentCommissions = pgTable("agent_commissions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  userId: integer("user_id").notNull().references(() => users.id),
  billingLogId: integer("billing_log_id").notNull().references(() => billingLogs.id),

  // 佣金
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  rate: numeric("rate", { precision: 5, scale: 4 }).notNull(),

  // 层级
  level: integer("level").notNull().default(1),  // 1=直系, 2=二级, 3=三级

  // 消费金额
  consumptionAmount: numeric("consumption_amount", { precision: 14, scale: 2 }).notNull(),

  // 归属期
  periodDate: date("period_date").notNull(),     // 消费归属日期
  periodMonth: varchar("period_month", { length: 7 }).notNull(),  // YYYY-MM

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | settled | paid | cancelled

  // 结算
  settledAt: timestamp("settled_at"),
  settledInPeriod: varchar("settled_in_period", { length: 7 }),  // 结算月份

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 约束
// - (agent_id, billing_log_id) UNIQUE
// - (agent_id, billing_log_id, level) UNIQUE（多级佣金）

// 索引
// - idx_agent_period_date: (agent_id, period_date)
// - idx_period_month: (period_month)
// - idx_billing_log_id: (billing_log_id)

// === commission_snapshots ===
// （完整定义见 04-代理佣金与结算.md §4.2）

// === withdraw_orders ===
// 提现订单
export const withdrawOrders = pgTable("withdraw_orders", {
  id: serial("id").primaryKey(),
  withdrawNo: varchar("withdraw_no", { length: 30 }).notNull().unique(), // WD20260728000001
  agentId: integer("agent_id").notNull().references(() => agents.id),

  // 金额
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 10, scale: 2 }).default("0"),  // 手续费

  // 提现方式
  withdrawMethod: varchar("withdraw_method", { length: 20 }).notNull().default("bank"),
    // bank | alipay | wechat

  // 银行信息（快照，不关联外键）
  bankName: varchar("bank_name", { length: 100 }),
  bankAccountName: varchar("bank_account_name", { length: 100 }),
  bankAccountNo: varchar("bank_account_no", { length: 50 }),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("withdraw_requested"),
    // withdraw_requested | pending_first_review | pending_second_review
    // pending_payment | paid | rejected | payment_failed

  // 审核
  firstReviewBy: integer("first_review_by").references(() => users.id),
  firstReviewAt: timestamp("first_review_at"),
  firstReviewRemark: varchar("first_review_remark", { length: 500 }),

  secondReviewBy: integer("second_review_by").references(() => users.id),
  secondReviewAt: timestamp("second_review_at"),
  secondReviewRemark: varchar("second_review_remark", { length: 500 }),

  // 打款
  paidAt: timestamp("paid_at"),
  paidBy: integer("paid_by").references(() => users.id),
  paymentProofUrl: varchar("payment_proof_url", { length: 500 }),

  // 重试
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),

  // 备注
  remark: varchar("remark", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 索引
// - idx_withdraw_no: (withdraw_no) UNIQUE
// - idx_agent_id: (agent_id)
// - idx_status: (status)
```

### 2.11 运营域

```typescript
// === promotions ===
// 活动/优惠
export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
    // recharge_bonus     充值赠送
    // discount_coupon    折扣券
    // first_recharge     首充奖励
    // seasonal           季节性活动

  // 规则（JSON）
  rules: jsonb("rules").notNull(),
  // 示例：
  // recharge_bonus: { threshold: 100, bonus: 20 }  // 充 100 送 20
  // discount_coupon: { discount: 0.85, limit: 50 }  // 85 折，最高减 50

  // 可用范围
  paymentMethods: varchar("payment_methods", { length: 100 }),  // 逗号分隔

  // 时间
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),

  // 预算
  totalBudget: numeric("total_budget", { precision: 14, scale: 2 }),
  usedBudget: numeric("used_budget", { precision: 14, scale: 2 }).default("0"),
  maxUsagePerUser: integer("max_usage_per_user").default(1),

  // 状态
  status: varchar("status", { length: 20 }).notNull().default("draft"),
    // draft | active | paused | ended

  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === operation_logs ===
// 运营操作日志（关键操作记录，不可篡改）
export const operationLogs = pgTable("operation_logs", {
  id: serial("id").primaryKey(),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  operatorRole: varchar("operator_role", { length: 20 }).notNull(),

  // 操作类型
  action: varchar("action", { length: 50 }).notNull(),
    // user_audit_approve / user_audit_reject
    // agent_audit_approve / agent_audit_reject
    // recharge_verify / recharge_reject
    // refund_approve / refund_process
    // withdraw_audit / withdraw_pay
    // adjustment / balance_modify
    // vendor_toggle / vendor_maintenance
    // price_change / model_config_change
    // manual_override / override_clear
    // config_change

  // 目标
  targetType: varchar("target_type", { length: 30 }),
  targetId: integer("target_id"),

  // 变更详情
  before: jsonb("before"),   // 变更前快照
  after: jsonb("after"),     // 变更后快照

  // 备注
  remark: varchar("remark", { length: 500 }),
  ip: varchar("ip", { length: 45 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 索引
// - idx_operator_id: (operator_id)
// - idx_action: (action)
// - idx_target: (target_type, target_id)
// - idx_created_at: (created_at)
// 注意：operation_logs 不可 DELETE，仅可归档

// === site_configs ===
// 系统配置（键值对）
export const siteConfigs = pgTable("site_configs", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("string"),
    // string / number / boolean / json / jsonb
  description: varchar("description", { length: 500 }),
  group: varchar("group", { length: 50 }),  // payment / billing / routing / commission / ...

  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === audit_logs ===
// 审计日志（安全相关操作，不可篡改）
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
    // login_success / login_failed / password_change / 2fa_enable / 2fa_disable
    // api_key_create / api_key_delete / api_key_rotate
    // role_change / permission_change
    // sensitive_config_read / sensitive_config_change
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  details: jsonb("details"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 索引
// - idx_user_id: (user_id)
// - idx_event_type: (event_type)
// - idx_created_at: (created_at)
// 注意：audit_logs 不可 DELETE，保全策略
```

---

## 三、表间关系总图

```
users (1) ── (1) user_profiles
users (1) ── (*) api_keys
users (1) ── (*) login_logs
users (1) ── (*) call_logs
users (1) ── (*) billing_logs
users (1) ── (*) recharge_orders
users (1) ── (*) user_balance_logs
users (1) ── (0..1) agents

agents (1) ── (*) agent_user_relations
agents (1) ── (*) commission_rules
agents (1) ── (*) agent_commissions
agents (1) ── (*) commission_snapshots
agents (1) ── (*) withdraw_orders
agents (1) ── (0..1) agents (parent)

models (1) ── (*) vendor_models
vendors (1) ── (*) vendor_models
vendors (1) ── (*) vendor_api_keys
vendors (1) ── (*) vendor_health_logs

models (1) ── (*) model_routes
model_routes (1) ── (*) model_route_vendors
model_route_vendors (*) ── (1) vendor_models

call_logs (1) ── (0..1) billing_logs
billing_logs (1) ── (*) agent_commissions

recharge_orders (1) ── (0..*) refund_orders
recharge_orders (1) ── (*) platform_ledger
billing_logs (1) ── (*) platform_ledger
withdraw_orders (1) ── (*) platform_ledger

reconciliation_logs (1) ── (*) reconciliation_diffs
```

---

## 四、重写数据库迁移策略

### 4.1 迁移原则

```
1. 完全弃用旧库，不迁移历史数据
2. 新库 schema 使用 Drizzle ORM 的 migrate 命令初始化
3. 新库在第一个生产部署时创建空表
4. 旧库保留只读访问（至少 90 天），仅用于查询历史数据
5. 新库上线后，原系统继续运行 7 天，确保数据积累后再切换
```

### 4.2 迁移命令

```bash
# 初始化数据库
npx drizzle-kit generate   # 生成 SQL 迁移文件
npx drizzle-kit migrate    # 执行迁移

# 首次部署
# 1. 创建新数据库 3cloud_v2
# 2. 执行迁移
# 3. 导入基础数据（模型、供应商、系统配置等）
# 4. 验证数据一致性
```

### 4.3 基础数据初始化

```sql
-- 首次部署需要导入的基础数据：
-- 1. 系统默认配置（site_configs）
-- 2. 已知模型列表（models）
-- 3. 已知供应商列表（vendors）
-- 4. 供应商-模型映射（vendor_models）
-- 5. 默认路由配置（model_routes + model_route_vendors）
-- 以上基础数据使用 seed 脚本导入，不依赖迁移
```

---

## 五、表分区策略

| 表名 | 分区键 | 分区类型 | 保留周期 |
|------|--------|---------|---------|
| call_logs | created_at | 月分区 | 永久 |
| billing_logs | created_at | 月分区 | 永久 |
| platform_ledger | date | 月分区 | 永久 |
| user_balance_logs | created_at | 月分区 | 永久 |
| vendor_health_logs | checked_at | 日分区 | 7 天 |
| login_logs | created_at | 月分区 | 90 天 |
| audit_logs | created_at | 月分区 | 永久 |