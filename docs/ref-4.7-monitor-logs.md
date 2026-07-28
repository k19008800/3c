# 监控与日志 — 深化参考文档

> **对应章节**：[PRD-README.md §4.7 监控与日志精化](../PRD-README.md#47-监控与日志精化)
> **状态**：基于现有后端代码（`api/src/db/schema/operation-alert.ts`、`api/src/db/schema/monitoring.ts`、`api/src/routes/admin/operation-logs.ts`、`api/src/routes/admin/audit-logs.ts`、`api/src/routes/admin/log-analysis.ts`、`api/src/routes/admin/operation-alerts.ts`、`api/src/routes/admin/operation-types.ts`、`api/src/routes/admin/logs.ts`、`api/src/routes/logs.ts`、`api/src/routes/monitoring.ts` 等）生成
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 异常指标算法 → 交叉引用

---

## 目录

1. [日志体系总览](#1-日志体系总览)
2. [操作日志系统](#2-操作日志系统)
3. [操作类型管理](#3-操作类型管理)
4. [审计日志](#4-审计日志)
5. [失败分析](#5-失败分析)
6. [异常操作告警](#6-异常操作告警)
7. [系统监控告警](#7-系统监控告警)
8. [异常指标自动高亮](#8-异常指标自动高亮)
9. [日志导出](#9-日志导出)
10. [跨模块数据流](#10-跨模块数据流)

---

## 1. 日志体系总览

### 1.1 日志类型矩阵

| 日志类型 | 表名 | 用途 | 保留策略 | 管理路径 |
|---------|------|------|---------|---------|
| **操作日志** | `operation_logs` | 用户操作轨迹（登录/充值/兑换码等） | 90 天 | `/admin/operation-logs` |
| **审计日志** | `audit_logs` | 管理员操作审计（含 before/after diff） | 永久 | `/admin/audit-logs` |
| **调用日志** | `call_logs` | API 调用完整记录 | 90 天 | `/admin/logs` |
| **监控告警** | `monitoring_alerts` | 系统健康告警 | 30 天 | `/admin/monitoring/alerts` |
| **异常操作告警** | `operation_alerts` | 用户行为异常告警 | 30 天 | `/admin/operation-alerts` |
| **安全事件** | `security_events` | 安全风控事件 | 90 天 | `/admin/security-events` |
| **内容过滤日志** | `filter_logs` | 内容过滤命中记录 | 30 天 | `/admin/content-filters/logs` |

### 1.2 日志架构

```
用户/管理员操作
  ├── 写入 operation_logs（用户操作轨迹）
  ├── 写入 audit_logs（管理员操作 + before/after diff）
  └── 触发异常告警检测
      └── 写入 operation_alerts（如满足规则）

API 调用
  └── 写入 call_logs（完整调用记录）

系统健康检查（定时）
  └── 写入 monitoring_alerts（如触发阈值）

查询层
  ├── 管理端列表查询（分页 + 全文搜索）
  ├── 用户端操作轨迹
  ├── 失败聚类分析
  └── CSV/JSON 导出
```

### 1.3 关键索引策略

- `operation_logs`：按 `userId`、`category`、`action`、`createdAt` 建索引
- `audit_logs`：按 `operatorId`、`action`、`targetType`、`targetId`、`createdAt` 建索引（支持 Diff 保留）
- 日志表采用 **时间分区**（按月）：`operation_logs_202607`、`call_logs_202607`

---

## 2. 操作日志系统

### 2.1 结构

`operation_logs` 表（基础字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 主键 |
| userId | integer FK→users | 操作用户 |
| category | varchar(50) | 分类（auth / api_key / finance / profile / agent / system） |
| action | varchar(50) | 具体操作（login / logout / recharge_submit / ...） |
| detail | jsonb | 操作详情 |
| ip | varchar(45) | 来源 IP |
| userAgent | varchar(500) | 用户代理 |
| metadata | jsonb | 额外元数据 |
| createdAt | timestamptz | 记录时间（索引，按月分区） |

**已记录的 action 标签**（25+ 种）：

| 分类 | actions |
|------|---------|
| auth | login / logout / register / change_password / oauth_bind / oauth_unbind / security_setup |
| api_key | api_key_create / api_key_delete / api_key_rename / api_key_reset |
| finance | recharge_submit / redemption_use / withdraw_request / invoice_apply / refund_apply |
| profile | realname_submit / profile_update |
| agent | agent_client_create / agent_client_update / agent_quota_adjust / agent_withdraw / agent_redemption_create |

### 2.2 API

#### GET `/api/v1/admin/operation-logs` — 操作日志列表

**权限**: `AUDIT_VIEW`

**Query**: `userId`, `category`, `action`, `startDate`, `endDate`, `keyword`, `page`, `pageSize`

**响应**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 50000,
        "userId": 10086,
        "category": "finance",
        "action": "recharge_submit",
        "detail": { "amount": 50000, "method": "alipay" },
        "ip": "117.78.2.66",
        "createdAt": "2026-07-28T10:00:00.000Z"
      }
    ],
    "total": 150000,
    "page": 1,
    "pageSize": 20
  }
}
```

#### GET `/api/v1/admin/operation-logs/export` — 导出 CSV

**Query**: 同上过滤条件（无分页）+ `format=csv`

### 2.3 前端操作日志页面

```
admin → 监控 → 操作日志
├── 筛选栏
│   ├── 操作分类（auth/api_key/finance/profile/agent/system）
│   ├── 操作类型（二级联动：根据分类过滤 action）
│   ├── 用户搜索（ID/昵称/邮箱）
│   ├── 时间范围选择器
│   └── 关键字搜索
│
├── 日志列表（表格）
│   ├── 时间
│   ├── 用户（可点击跳转用户详情）
│   ├── 分类+操作（中文标签+图标）
│   ├── 详情（悬停显示 detail JSON）
│   ├── 来源 IP
│   └── 导出按钮
│
└── 导出弹窗
    ├── 导出范围（当前筛选/全部）
    ├── 导出格式（CSV / JSON）
    └── 导出按钮
```

**OperationLogListProps**：
```typescript
interface OperationLogListProps {
  filters?: {
    userId?: number;
    category?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  };
  onExport?: (filters: OperationLogFilters, format: 'csv' | 'json') => Promise<void>;
}
```

---

## 3. 操作类型管理

### 3.1 作用

管理员可以自定义操作类型和分类，实现操作轨迹的可扩展性。

### 3.2 内置默认类型

**认证类**（auth）：login / logout / password_change / password_reset / two_factor_enable / two_factor_disable

**API Key 类**（api_key）：api_key_create / api_key_delete / api_key_rename / api_key_reset / api_key_export

**财务类**（finance）：recharge_submit / withdrawal_request / refund_apply / invoice_apply / balance_query

**资料类**（profile）：profile_update / email_change / phone_change / avatar_update / realname_submit

**代理类**（agent）：client_create / client_update / quota_adjust / commission_view / withdraw

**系统类**（system）：settings_change / security_config / data_export / data_import

### 3.3 分类配置

```typescript
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  auth:     { label: "认证类", color: "blue" },
  api_key:  { label: "API 类", color: "green" },
  finance:  { label: "财务类", color: "yellow" },
  profile:  { label: "资料类", color: "purple" },
  agent:    { label: "代理类", color: "orange" },
  system:   { label: "系统类", color: "red" },
};
```

### 3.4 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/operation-types` | 类型列表 | CONFIG_VIEW |
| POST | `/api/v1/admin/operation-types` | 创建类型 | CONFIG_EDIT |
| PUT | `/api/v1/admin/operation-types/:id` | 更新类型 | CONFIG_EDIT |
| DELETE | `/api/v1/admin/operation-types/:id` | 删除自定义类型 | CONFIG_EDIT |
| GET | `/api/v1/admin/operation-types/categories` | 分类列表+色值 | CONFIG_VIEW |

### 3.5 前端操作类型管理

```
admin → 监控 → 操作类型管理
├── 分类卡片视图
│   ├── 认证类（蓝色）× N 个操作
│   ├── API 类（绿色）× N 个操作
│   ├── 财务类（黄色）× N 个操作
│   ├── 资料类（紫色）× N 个操作
│   ├── 代理类（橙色）× N 个操作
│   └── 系统类（红色）× N 个操作
│
├── 类型编辑弹窗
│   ├── 类型名称（英文标识）
│   ├── 分类选择
│   ├── 描述
│   └── 启用/禁用
│
└── 恢复默认按钮（重新导入内置类型）
```

---

## 4. 审计日志

### 4.1 结构

`audit_logs` 表：

```typescript
audit_logs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  operatorId: integer("operator_id"),        // 操作人（0 = 系统）
  action: auditActionEnum("action").notNull(), // 40+ 种操作类型
  targetType: varchar("target_type", { length: 50 }), // user/vendor/model/order/...
  targetId: integer("target_id"),            // 目标 ID
  description: text("description"),          // 操作描述
  before: jsonb("before"),                   // 操作前状态
  after: jsonb("after"),                     // 操作后状态
  ip: varchar("ip", { length: 45 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 4.2 审计的操作类型（40+ 种）

**用户操作**：user_create / user_disable / user_enable / user_password_reset / user_update / user_impersonate / balance_adjust / role_change / real_name_approve / real_name_reject

**财务操作**：withdraw_first_approve / withdraw_second_approve / withdraw_approve / withdraw_reject / withdraw_paid / order_cancel / recharge_confirm / recharge_first_confirm / recharge_second_confirm

**代理操作**：agent_create / agent_update

**配置操作**：config_update

**供应商操作**：vendor_create / vendor_update

**模型操作**：model_create / model_update

**其他**：system_maintenance

### 4.3 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/audit-logs` | 审计日志列表 | AUDIT_VIEW |
| GET | `/api/v1/admin/audit-logs/:id` | 详情（含 diff） | AUDIT_VIEW |

**查询参数**：`operatorId`, `action`, `targetType`, `targetId`, `startDate`, `endDate`, `page`, `pageSize`

**响应**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 5000,
        "operatorId": 1,
        "action": "user_disable",
        "targetType": "user",
        "targetId": 10086,
        "description": "禁用用户 张三 (违规操作)",
        "before": { "status": "active", "role": "user" },
        "after": { "status": "disabled", "role": "user" },
        "ip": "117.78.2.66",
        "actionLabel": "禁用用户",
        "targetLabel": "用户",
        "createdAt": "2026-07-28T10:00:00.000Z"
      }
    ],
    "total": 50000,
    "page": 1,
    "pageSize": 20
  }
}
```

### 4.4 前端审计日志页面

```
admin → 监控 → 审计日志
├── 筛选栏
│   ├── 操作人（管理员选择器）
│   ├── 操作类型（下拉，40+ 中文标签）
│   ├── 目标类型（user/vendor/model/order/config/agent）
│   ├── 时间范围
│   └── 关键字搜索
│
├── 日志列表（表格）
│   ├── 时间
│   ├── 操作人
│   ├── 操作类型（中文标签）
│   ├── 目标（类型+ID+描述）
│   └── 展开看详情
│
└── 详情展开行（JSON Diff 视图）
    ├── 操作描述
    ├── 变更前状态
    ├── 变更后状态（差异高亮）
    ├── 来源 IP
    └── 操作人信息
```

**AuditLogListProps**：
```typescript
interface AuditLogListProps {
  filters?: {
    operatorId?: number;
    action?: string;
    targetType?: string;
    targetId?: number;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  };
}
```

---

## 5. 失败分析

### 5.1 API

#### GET `/api/v1/admin/logs/failure-analysis` — 失败聚类分析

**Query**: `days`（默认 7，最大 90）

**响应**：
```json
{
  "code": 0,
  "data": {
    "overview": {
      "totalCalls": 150000,
      "totalFailed": 3450,
      "failureRate": "2.30%",
      "avgDurationMs": 4320
    },
    "byErrorType": [
      { "errorType": "timeout", "count": 1890, "percentage": "54.8%" },
      { "errorType": "rate_limit", "count": 820, "percentage": "23.8%" },
      { "errorType": "auth_failed", "count": 450, "percentage": "13.0%" },
      { "errorType": "model_unavailable", "count": 290, "percentage": "8.4%" }
    ],
    "byModel": [
      { "model": "deepseek-chat", "failed": 1200, "total": 50000, "rate": "2.4%" },
      { "model": "gpt-4o", "failed": 890, "total": 30000, "rate": "3.0%" }
    ],
    "dailyTrend": [
      { "date": "2026-07-21", "total": 21000, "failed": 430 },
      { "date": "2026-07-22", "total": 22500, "failed": 510 }
    ],
    "byVendor": [
      { "vendor": "deepseek", "failed": 1500, "total": 60000, "rate": "2.5%" }
    ]
  }
}
```

#### GET `/api/v1/admin/logs/:id/context` — 调用上下文

返回该次调用的完整上下游信息（前 5 条调用 + 后 5 条调用）。

### 5.2 前端失败分析页面

```
admin → 监控 → 失败分析
├── 概览卡片
│   ├── 总调用次数
│   ├── 失败次数 + 失败率
│   ├── 平均耗时
│   └── 时间范围选择器（近7天/30天/90天）
│
├── 按错误类型分布（饼图/柱状图）
│   ├── timeout
│   ├── rate_limit
│   ├── auth_failed
│   └── model_unavailable
│
├── 按模型分布（表格+柱状图）
│   ├── 模型名 / 失败次数 / 总调用 / 失败率
│   └── 超出阈值高亮（>5% 红框闪烁）
│
├── 按供应商分布
│
└── 每日趋势折线图
    ├── 总调用线（蓝色）
    ├── 失败线（红色）
    └── 失败率（橙色虚线）
```

---

## 6. 异常操作告警

### 6.1 数据表结构

#### `operation_alerts` — 告警记录

```typescript
export const operationAlerts = pgTable("operation_alerts", {
  id: serial("id").primaryKey(),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  // frequent_failure | remote_login | batch_delete | sensitive_operation
  severity: varchar("severity", { length: 20 }).notNull().default("warning"),
  // critical | warning | info
  userId: integer("user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  relatedOperationIds: jsonb("related_operation_ids").$type<number[]>(),
  metadata: jsonb("metadata"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | acknowledged | resolved | ignored
  handledBy: integer("handled_by").references(() => users.id),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  handleNote: text("handle_note"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引：alertType / userId / status / createdAt DESC / severity
```

#### `operation_alert_rules` — 告警规则

```typescript
export const operationAlertRules = pgTable("operation_alert_rules", {
  id: serial("id").primaryKey(),
  ruleType: varchar("rule_type", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  severity: varchar("severity", { length: 20 }).notNull().default("warning"),
  params: jsonb("params").notNull().default("{}"),
  // { "timeWindowMinutes": 10, "threshold": 10 }
  notifyInApp: boolean("notify_in_app").notNull().default(true),
  notifyEmail: boolean("notify_email").notNull().default(false),
  emailRecipients: jsonb("email_recipients").$type<string[]>(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 6.2 告警规则类型

| 规则 | 默认阈值 | 严重等级 | 检测逻辑 |
|------|---------|---------|---------|
| `frequent_failure` | 10 分钟内失败 10 次以上 | warning | 统计 operation_logs 中失败 action 的频率 |
| `remote_login` | 异地 IP 登录 | info | 与用户历史登录 IP 的地理位置对比 |
| `batch_delete` | 一次删除 10 条以上 | warning | 监测 delete 类操作的批量数量 |
| `sensitive_operation` | 单次执行 | critical | 监测特定敏感操作（如用户禁用、余额调整） |

### 6.3 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/operation-alerts` | 告警列表 | AUDIT_VIEW |
| GET | `/api/v1/admin/operation-alerts/:id` | 告警详情 | AUDIT_VIEW |
| PATCH | `/api/v1/admin/operation-alerts/:id` | 处理告警 | SECURITY_ACTION |
| GET | `/api/v1/admin/operation-alerts/rules` | 规则列表 | CONFIG_VIEW |
| PATCH | `/api/v1/admin/operation-alerts/rules/:id` | 更新规则 | CONFIG_EDIT |
| POST | `/api/v1/admin/operation-alerts/scan` | 手动触发扫描 | SECURITY_ACTION |

**处理告警**：
```json
// PATCH /api/v1/admin/operation-alerts/:id
{ "status": "resolved", "handleNote": "已确认用户操作正常" }
```

**更新规则**：
```json
// PATCH /api/v1/admin/operation-alerts/rules/:id
{ "enabled": true, "params": { "timeWindowMinutes": 10, "threshold": 5 }, "severity": "critical" }
```

### 6.4 前端异常告警页面

```
admin → 监控 → 异常告警
├── 概览卡片
│   ├── 待处理告警数
│   ├── 严重告警数
│   └── 今日新增
│
├── 告警列表（表格）
│   ├── 严重等级色标（critical 🔴 / warning 🟡 / info 🟢）
│   ├── 告警类型（中文标签）
│   ├── 关联用户
│   ├── 标题
│   ├── 状态（pending/acknowledged/resolved/ignored）
│   └── 操作（处理/忽略）
│
├── 告警详情弹窗
│   ├── 基本信息
│   ├── 关联操作日志列表
│   ├── 元数据详情
│   └── 处置输入框 + 提交
│
└── 规则配置面板
    ├── 4 种规则卡片
    │   ├── 启用开关
    │   ├── 阈值/时间窗口编辑
    │   ├── 严重等级
    │   └── 通知方式（站内信/邮件）
    └── 手动扫描按钮
```

---

## 7. 系统监控告警

### 7.1 数据表

#### `monitoring_alerts` — 监控告警

```typescript
export const monitoringAlerts = pgTable("monitoring_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  // api_response_time | api_error_rate | database_connection | redis_health | disk_usage | memory_usage
  severity: text("severity").notNull(),  // critical | warning | info
  message: text("message").notNull(),
  value: doublePrecision("value").notNull(),
  threshold: doublePrecision("threshold").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  escalated: boolean("escalated").notNull().default(false),
  escalationLevel: integer("escalation_level").default(0),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### `monitoring_rules` — 监控规则

```typescript
export const monitoringRules = pgTable("monitoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  threshold: doublePrecision("threshold").notNull(),
  severity: text("severity").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  escalationThreshold: integer("escalation_threshold").default(0),
  cooldownMinutes: integer("cooldown_minutes").default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 7.2 监控指标

| 指标类型 | 默认阈值 | 检查频率 | 说明 |
|---------|---------|---------|------|
| api_response_time | 5000ms | 1min | API 平均响应时间 |
| api_error_rate | 5% | 1min | API 错误率 |
| database_connection | 80% | 1min | 数据库连接池使用率 |
| redis_health | — | 1min | Redis ping 响应 |
| disk_usage | 85% | 5min | 磁盘使用率 |
| memory_usage | 80% | 5min | 内存使用率 |

### 7.3 通知配置

```typescript
interface NotificationConfig {
  emailEnabled: boolean;
  emailRecipients: string[];
  webhookEnabled: boolean;
  webhookUrl: string;
  smsEnabled: boolean;
  smsPhoneNumbers: string[];
  pushEnabled: boolean;
  pushTokens: string[];
}
```

### 7.4 前端系统监控页面

```
admin → 运维 → 系统监控
├── 健康状态卡片
│   ├── API 状态（正常/异常）
│   ├── 数据库连接状态
│   ├── Redis 连接状态
│   └── 磁盘/内存使用率
│
├── 告警列表（表格）
│   ├── 类型 / 严重等级 / 消息
│   ├── 当前值 / 阈值
│   ├── 确认状态 / 升级状态
│   └── 操作（确认/解决）
│
└── 规则配置
    ├── 6 种规则卡片（阈值/严重等级/启用/冷却时间）
    └── 通知通道配置（邮件/Webhook/SMS/Push）
```

---

## 8. 异常指标自动高亮

### 8.1 高亮规则

> 应用于管理仪表盘的 KPI 卡片和运营看板

| 指标 | 正常 | 警告（黄框） | 高危（红框闪烁） |
|------|------|-------------|----------------|
| 失败率 | ≤ 3% | 3-5% | > 5% |
| API 响应时间 | ≤ 2000ms | 2000-5000ms | > 5000ms |
| 营收环比变化 | -10% ~ +20% | -20% ~ -10% | < -20% |
| 用户增长 | 正增长 | 零增长（连续 3 天）| 负增长（连续 5 天）|
| 供应商可用率 | ≥ 99% | 95-99% | < 95% |

### 8.2 高亮实现

```
后端：GET /api/v1/admin/operational-kpi
  → 返回每个指标的 `status: "normal" | "warning" | "critical"`
  → 用于前端渲染

前端：
  status=critical → 红框 + 闪烁动画（CSS animation blink）
  status=warning → 黄框
  status=normal → 正常样式
```

---

## 9. 日志导出

### 9.1 导出格式

| 日志类型 | CSV | JSON | 执行路径 |
|---------|-----|------|---------|
| 操作日志 | ✅ | ✅ | `GET /api/v1/admin/operation-logs/export` |
| 审计日志 | ✅ | ✅ | `GET /api/v1/admin/audit-logs/export` |
| 调用日志 | ✅ | ✅ | 通过 admin/logs route |
| 失败分析 | — | ✅ | `GET /api/v1/admin/logs/failure-analysis` |

### 9.2 导出约束

- 单次导出行数上限：**10000 条**
- 超限时提示用户缩小时间范围
- 异步导出方案：超大数据量走后台任务生成 + 下载链接
- 导出列定义跟随当前列表展示列

---

## 10. 跨模块数据流

### 10.1 日志记录链路

```
用户操作
  → operationLogService.record(userId, category, action, detail)
  → INSERT operation_logs
  → 定时任务每分钟检查 operation_alert_rules
  → 如果操作匹配规则 → INSERT operation_alerts

管理员操作
  → auditLogService.record(operatorId, action, targetType, targetId, before, after)
  → INSERT audit_logs（含 before/after JSON 用于 diff）

API 调用
  → proxy 层完成调用后
  → INSERT call_logs（请求/响应/耗时/Token 计数）
```

### 10.2 异常告警扫描链路

```
定时任务（每分钟）
  → operationAlertScheduler.scan()
  → 遍历所有 enabled 规则
  → 统计 operation_logs 在 timeWindow 内符合条件的记录
  → 如果 count >= threshold：
    → 写入 operation_alerts
    → 可选发送通知（站内信/邮件）
  → 去重：同一规则同一 user 在冷却期内不重复告警

手动扫描
  → POST /api/v1/admin/operation-alerts/scan
  → 同上流程（覆盖所有规则）
```

### 10.3 依赖模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `admin/operation-logs.ts` | `routes/admin/` | 操作日志列表+导出 |
| `admin/audit-logs.ts` | `routes/admin/` | 审计日志列表+详情 |
| `admin/log-analysis.ts` | `routes/admin/` | 失败聚类分析 |
| `admin/operation-alerts.ts` | `routes/admin/` | 异常告警管理 |
| `admin/operation-types.ts` | `routes/admin/` | 操作类型管理 |
| `admin/logs.ts` | `routes/admin/` | 调用日志管理 |
| `monitoring.ts` | `routes/` | 系统监控告警 |
| `operation-alert-scheduler.ts` | `schedulers/` | 告警扫描定时任务 |
| `operation-alert.ts` | `db/schema/` | operation_alerts + operation_alert_rules |
| `monitoring.ts` | `db/schema/` | monitoring_alerts + monitoring_rules |

### 10.4 关联文档

| 文档 | 关联内容 |
|------|---------|
| [PRD-README.md §4.7](../PRD-README.md#47-监控与日志精化) | 监控总纲 |
| [ref-4.6-security.md](ref-4.6-security.md) | 安全事件日志 |
| [ref-5.4-alert-rules.md](ref-5.4-alert-rules.md) | 告警规则配置 |
| [ref-4.4-finance.md](ref-4.4-finance.md) | 财务日志 |

### 10.5 关键约束

1. **日志不可物理删除**：操作日志和审计日志只可查询，不可删除
2. **审计日志永久保留**：不设自动清理策略
3. **操作日志 90 天保留**：超过 90 天按分区清理
4. **告警冷却**：同一规则同一用户在 cooldown 内不重复告警
5. **导出上限 10000 条**：超量需缩小时间范围或走异步
6. **失败分析缓存**：聚合结果缓存 5 分钟，避免频繁扫描 call_logs
7. **异常告警去重**：手动扫描不重复已触发的告警

---

> **文档版本**：v1.0 — 2026-07-28
> **编写依据**：`api/src/db/schema/operation-alert.ts`、`api/src/db/schema/monitoring.ts`、`api/src/routes/admin/operation-logs.ts`、`api/src/routes/admin/audit-logs.ts`、`api/src/routes/admin/log-analysis.ts`、`api/src/routes/admin/operation-alerts.ts`、`api/src/routes/admin/operation-types.ts`、`api/src/routes/admin/logs.ts`、`api/src/routes/logs.ts`、`api/src/routes/monitoring.ts`
> **下一步建议**：操作日志按时间分区迁移脚本、异常告警通知链路（邮件/站内信）实装、操作类型管理前端组件
