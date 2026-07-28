# 3cloud 通知与告警 — 可编码深度规格

> **来源**：PRD-README.md §5.4 通知与告警精化  
> **关联模块**：核心引擎 > 监控服务 | 供应商管理 | 用户仪表盘 > 告警中心  
> **版本**：V1.0 | **日期**：2026-07-28  
> **前置依赖表**：`monitoring_rules`、`monitoring_alerts`、`notification_config`、`notification_history`

---

## 目录

1. [数据层：Schema 全文与扩展](#1-数据层schema-全文与扩展)
2. [API 接口清单](#2-api-接口清单)
3. [告警规则配置页面规格](#3-告警规则配置页面规格)
4. [告警命中趋势](#4-告警命中趋势)
5. [交叉引用与调用链](#5-交叉引用与调用链)

---

## 1. 数据层：Schema 全文与扩展

### 1.1 当前表结构

```typescript
// ============================================================
//  monitoring_rules —— 告警规则配置表
// ============================================================
export const monitoringRules = pgTable("monitoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().unique(),    // 告警指标类型
  name: text("name").notNull(),             // 规则名称
  description: text("description"),
  threshold: doublePrecision("threshold").notNull(),
  severity: text("severity").notNull(),     // critical | warning | info
  enabled: boolean("enabled").notNull().default(true),
  duration: integer("duration").default(60),          // 持续判定时间（秒）
  silencePeriod: integer("silence_period").default(300), // 静默期（秒）
  escalationEnabled: boolean("escalation_enabled").default(false),
  escalationAfter: integer("escalation_after").default(3600),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
//  monitoring_alerts —— 告警事件记录表
// ============================================================
export const monitoringAlerts = pgTable("monitoring_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
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

// ============================================================
//  notification_config —— 通知渠道配置表
// ============================================================
export const notificationConfig = pgTable("notification_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailRecipients: jsonb("email_recipients").$type<string[]>(),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url"),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  smsPhoneNumbers: jsonb("sms_phone_numbers").$type<string[]>(),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  pushTokens: jsonb("push_tokens").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
//  notification_history —— 通知发送历史表
// ============================================================
export const notificationHistory = pgTable("notification_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").references(() => monitoringAlerts.id),
  channel: text("channel").notNull(),      // email | webhook | sms | push
  recipient: text("recipient").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),        // sent | failed | pending
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
```

### 1.2 扩展 type 支持（需迁移）

当前 `monitoringRules.type` 的唯一值只有原始 6 种。需扩展为以下 7 项：

| 扩展前 type | 扩展后 type | 说明 | threshold 含义 |
|-------------|-------------|------|---------------|
| `api_response_time` | `api_response_time` | API 响应时间 | 毫秒 |
| `api_error_rate` | `api_error_rate` | API 失败率 | 百分比（如 5 → 5%） |
| `database_connection` | `database_connection` | 数据库连接 | 连接数 |
| `redis_health` | `redis_health` | Redis 健康 | O>K判定 |
| `disk_usage` | `disk_usage` | 磁盘使用率 | 百分比 |
| `memory_usage` | `memory_usage` | 内存使用率 | 百分比 |
| — | `vendor_availability` | 供应商可用率 | 百分比（如 99 → 99%） |
| — | `platform_balance` | 平台余额 | 金额（如 500 → ¥500） |
| — | `user_failure_rate` | 用户失败率 | 百分比 |
| — | `cpu_usage` | CPU 使用率 | 百分比 |

**迁移方案**：将 `monitoring_rules.type` 的 unique constraint 改为普通 index，新增行覆盖 7 个新 type。

```typescript
// 迁移脚本概要
// 1. 删除现有的 unique 约束（需先删除所有依赖的 FK）
// 2. INSERT ... ON CONFLICT ... 插入新 type
// 3. 对现有 6 行增加 name/duration/silencePeriod 字段值
```

---

## 2. API 接口清单

### 2.1 告警规则 CRUD

#### `GET /api/v1/admin/monitoring/rules` — 获取全部规则

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "rules": [
      {
        "id": "uuid-1", "type": "api_error_rate",
        "name": "API 失败率告警", "description": "当 API 失败率超过阈值时触发",
        "threshold": 5, "severity": "critical",
        "enabled": true, "duration": 60, "silencePeriod": 300,
        "escalationEnabled": false, "escalationAfter": 3600,
        "updatedAt": "2026-07-27T10:30:00Z"
      }
    ]
  }
}
```

#### `PUT /api/v1/admin/monitoring/rules/:id` — 更新单条规则

```json
{
  "threshold": 5.0,
  "severity": "critical",
  "enabled": true,
  "duration": 60,
  "silencePeriod": 300
}
```

**响应 200**

```json
{ "status": "ok", "data": { "id": "uuid-1", "updated": true } }
```

#### `POST /api/v1/admin/monitoring/rules` — 新增规则（扩展 type 用）

```json
{
  "type": "vendor_availability",
  "name": "供应商可用率告警",
  "threshold": 99.0,
  "severity": "critical",
  "enabled": true,
  "duration": 120,
  "silencePeriod": 600,
  "metadata": {"vendorId": 1}
}
```

### 2.2 告警事件查询

#### `GET /api/v1/admin/monitoring/alerts` — 告警事件列表

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | string | — | 按 type 过滤 |
| severity | string | — | critical / warning / info |
| acknowledged | boolean | — | true/false |
| resolved | boolean | — | true/false |
| startDate | datetime | — | 起始时间 |
| endDate | datetime | — | 结束时间 |
| limit | int | 20 | 每页条数（最大 100） |
| offset | int | 0 | 偏移量 |

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "alerts": [
      {
        "id": "uuid-a1",
        "type": "api_error_rate",
        "severity": "critical",
        "message": "API 失败率 7.2%（阈值 5%）",
        "value": 7.2, "threshold": 5.0,
        "timestamp": "2026-07-27T12:30:00Z",
        "acknowledged": false,
        "resolved": false,
        "escalated": false
      }
    ],
    "total": 45, "limit": 20, "offset": 0
  }
}
```

#### `POST /api/v1/admin/monitoring/alerts/:id/acknowledge` — 确认告警

#### `POST /api/v1/admin/monitoring/alerts/:id/resolve` — 解决告警

```json
{ "resolvedBy": "admin@3cloud.ai" }
```

#### `POST /api/v1/admin/monitoring/alerts/batch-acknowledge` — 批量确认

```json
{ "ids": ["uuid-a1", "uuid-a2"] }
```

#### `POST /api/v1/admin/monitoring/alerts/batch-resolve` — 批量解决

```json
{ "ids": ["uuid-a1", "uuid-a2"] }
```

### 2.3 告警命中统计

#### `GET /api/v1/admin/monitoring/alert-stats?range=7d` — 告警命中趋势

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "totals": {
      "api_error_rate": 15, "api_response_time": 8,
      "disk_usage": 3, "vendor_availability": 5,
      "platform_balance": 1
    },
    "trend": [
      { "date": "2026-07-21", "count": 3 },
      { "date": "2026-07-22", "count": 5 },
      { "date": "2026-07-23", "count": 1 },
      { "date": "2026-07-24", "count": 7 },
      { "date": "2026-07-25", "count": 4 },
      { "date": "2026-07-26", "count": 2 },
      { "date": "2026-07-27", "count": 6 }
    ]
  }
}
```

### 2.4 通知渠道配置

#### `GET /api/v1/admin/monitoring/notification-configs` — 配置列表

```json
{
  "status": "ok",
  "data": {
    "configs": [
      {
        "id": "uuid-c1",
        "name": "默认管理员通知",
        "emailEnabled": true, "emailRecipients": ["admin@3cloud.ai", "ops@3cloud.ai"],
        "webhookEnabled": true, "webhookUrl": "https://hooks.example.com/alert",
        "smsEnabled": false, "smsPhoneNumbers": [],
        "pushEnabled": false, "pushTokens": [],
        "updatedAt": "2026-07-26T00:00:00Z"
      }
    ]
  }
}
```

#### `PUT /api/v1/admin/monitoring/notification-configs/:id` — 更新配置

```json
{
  "emailEnabled": true,
  "emailRecipients": ["admin@3cloud.ai", "ops@3cloud.ai"],
  "webhookEnabled": true,
  "webhookUrl": "https://hooks.example.com/alert"
}
```

### 2.5 通知发送历史

#### `GET /api/v1/admin/monitoring/notification-history` — 通知记录

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| alertId | string | — | 关联告警 ID |
| channel | string | — | email / webhook / sms / push |
| status | string | — | sent / failed / pending |
| limit | int | 20 | — |
| offset | int | 0 | — |

---

## 3. 告警规则配置页面规格

### 3.1 页面结构

```
/admin/monitoring
├── [告警规则] [告警事件] [通知配置] [通知记录] ← 四个页签
│
├── 告警规则页签
│   ├── 规则表格
│   │   ├── 名称 / 指标类型(中文标签) / 阈值 / 严重等级 / 状态 / 操作
│   │   ├── 操作：[编辑] [启用/禁用开关]
│   │   └── 状态色标：critical=红色 / warning=黄色 / info=灰色
│   └── 编辑弹窗（覆盖全部字段）
│       ├── 名称（输入框）
│       ├── 阈值（数字输入 + 单位标识）
│       ├── 严重等级（下拉选择 critical/warning/info）
│       ├── 持续判定时间（秒，输入框）
│       ├── 静默期（秒，输入框）
│       ├── 启用/禁用（开关）
│       ├── 升级设置（可选）
│       │   ├── 启用升级（开关）
│       │   └── 升级延迟（秒）
│       └── [保存] [取消]
│
├── 告警事件页签
│   ├── 筛选器：类型 / 严重等级 / 已确认 / 已解决 / 时间范围
│   ├── 事件表格
│   │   ├── 时间 / 类型 / 消息 / 实际值/阈值 / 等级 / 状态 / 操作
│   │   └── 操作：[确认] [解决] [查看详情]
│   └── 批量操作工具栏：[批量确认] [批量解决]
│
├── 通知配置页签
│   └── 配置表格 + 编辑弹窗（email + webhook + sms + push 四通道）
│
└── 通知记录页签
    └── 只读表格：时间 / 渠道 / 接收人 / 消息 / 状态 / 错误
```

### 3.2 核心组件 Props

```typescript
// AlertRulesPage — 告警规则管理
interface AlertRule {
  id: string; type: AlertType; name: string; description: string | null;
  threshold: number; severity: 'critical' | 'warning' | 'info';
  enabled: boolean; duration: number; silencePeriod: number;
  escalationEnabled: boolean; escalationAfter: number;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}
type AlertType =
  | 'api_response_time' | 'api_error_rate' | 'database_connection'
  | 'redis_health' | 'disk_usage' | 'memory_usage'
  | 'vendor_availability' | 'platform_balance' | 'user_failure_rate' | 'cpu_usage';

interface AlertRuleTableProps {
  rules: AlertRule[]; loading: boolean;
  onEdit: (rule: AlertRule) => void;
  onToggle: (ruleId: string, enabled: boolean) => void;
}

interface AlertRuleEditDialogProps {
  open: boolean; rule: AlertRule | null;  // null = 新增模式
  onSave: (values: AlertRuleFormValues) => Promise<void>;
  onClose: () => void;
}
interface AlertRuleFormValues {
  name: string; threshold: number; severity: string;
  enabled: boolean; duration: number; silencePeriod: number;
  escalationEnabled: boolean; escalationAfter: number;
}

// AlertEventsPage — 告警事件管理
interface AlertEvent {
  id: string; type: string; severity: string;
  message: string; value: number; threshold: number;
  timestamp: string; acknowledged: boolean; resolved: boolean;
  escalated: boolean;
}
interface AlertEventTableProps {
  events: AlertEvent[]; loading: boolean; total: number;
  onAcknowledge: (eventId: string) => void;
  onResolve: (eventId: string) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}
interface AlertEventFilterBarProps {
  typeFilter: string; severityFilter: string;
  acknowledgedFilter: boolean | undefined;
  resolvedFilter: boolean | undefined;
  dateRange: [string, string];
  onFilterChange: (filters: Partial<AlertEventFilterValues>) => void;
}

// AlertTrendChart — 告警命中趋势柱状图
interface AlertTrendPoint { date: string; count: number; }
interface AlertTrendChartProps {
  data: AlertTrendPoint[]; loading: boolean;
  range: '24h' | '7d' | '30d';
  onRangeChange: (range: string) => void;
}

// NotificationConfigEditDialog — 通知配置编辑弹窗
interface NotificationConfigFormValues {
  emailEnabled: boolean; emailRecipients: string[];
  webhookEnabled: boolean; webhookUrl: string;
  smsEnabled: boolean; smsPhoneNumbers: string[];
  pushEnabled: boolean; pushTokens: string[];
}
interface NotificationConfigEditDialogProps {
  open: boolean; config: NotificationConfigFormValues | null;
  onSave: (values: NotificationConfigFormValues) => Promise<void>;
  onClose: () => void;
}
```

### 3.3 类型与单位映射

```typescript
const alertTypeLabels: Record<AlertType, { label: string; unit: string }> = {
  api_response_time:    { label: 'API 响应时间', unit: 'ms' },
  api_error_rate:      { label: 'API 失败率', unit: '%' },
  database_connection:  { label: '数据库连接', unit: '个' },
  redis_health:        { label: 'Redis 健康', unit: '' },
  disk_usage:          { label: '磁盘使用率', unit: '%' },
  memory_usage:        { label: '内存使用率', unit: '%' },
  vendor_availability: { label: '供应商可用率', unit: '%' },
  platform_balance:    { label: '平台余额', unit: '¥' },
  user_failure_rate:   { label: '用户失败率', unit: '%' },
  cpu_usage:           { label: 'CPU 使用率', unit: '%' },
};

// severity 色标
const severityColors: Record<string, string> = {
  critical: 'var(--color-danger)',  // 红
  warning:  'var(--color-warning)', // 黄
  info:     'var(--color-muted)',   // 灰
};
```

---

## 4. 告警命中趋势

### 4.1 后端聚合查询

```typescript
// 近 7 天告警命中数统计
const alertTrendQuery = db
  .select({
    date: sql<string>`DATE(created_at)::text`,
    count: count(),
  })
  .from(monitoringAlerts)
  .where(
    and(
      gte(monitoringAlerts.createdAt, subDays(new Date(), 7)),
      lte(monitoringAlerts.createdAt, new Date())
    )
  )
  .groupBy(sql`DATE(created_at)`)
  .orderBy(sql`DATE(created_at)`);
```

### 4.2 前端趋势图组件

```typescript
// 柱状图配置（Recharts）
const AlertTrendChart = ({ data, loading, range, onRangeChange }: AlertTrendChartProps) => {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0) return <EmptyState message="暂无告警记录" />;

  return (
    <div>
      <RangeSelector current={range} onChange={onRangeChange} />
      <BarChart width={600} height={300} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </div>
  );
};
```

---

## 5. 交叉引用与调用链

### 5.1 跨模块数据流

```
告警规则配置（/admin/monitoring → 告警规则页签）
│
├── 规则持久化 → monitoring_rules 表
│
├── 告警引擎（定时任务）
│   ├── 读取 monitoring_rules 全部 enabled 规则
│   ├── 周期性采集各指标数值
│   │   ├── api_error_rate → 路由引擎统计（ref-5.1-routing）
│   │   ├── vendor_availability → 供应商健康检查（ref-4.3-vendor-model）
│   │   ├── platform_balance → finance-service 余额统计
│   │   └── disk_usage / cpu_usage → 系统监控
│   ├── 超过阈值 → 写入 monitoring_alerts
│   ├── 关联通知渠道 → 发 email/webhook/sms/push
│   └── 记录 notification_history
│
├── 后台管理端：告警事件页签
│   ├── 管理员查看 → acknowledge / resolve
│   └── 批量操作 → patch 多条
│
├── 用户端仪表盘告警中心（ref-2.2-user-dashboard 区域 12）
│   ├── 读取用户相关的告警（user_id 匹配 metadata.userId）
│   └── 展示 critical + warning 未确认告警
│
└── 告警命中趋势 → 柱状图可视化
```

### 5.2 依赖的外部模块

| 告警模块 | 外部模块 | 依赖类型 | 说明 |
|---------|---------|---------|------|
| api_error_rate | 路由引擎 | 强 | 需从路由统计失败率 |
| api_response_time | 路由引擎 | 强 | 需统计平均响应时间 |
| vendor_availability | 供应商管理 | 强 | 需供应商健康检查状态 |
| platform_balance | 财务 > 余额 | 强 | 需 finance 余额 |
| user_failure_rate | 路由引擎 | 强 | 需按 user 聚合失败率 |
| disk_usage / cpu_usage | 系统监控 | 强 | 服务器层指标 |
| notification 渠道 | 通知服务 | 强 | 发送通知的通道 |

### 5.3 章节交叉引用

| 本模块章节 | 关联 PRD 章节 | 关联文件 |
|-----------|-------------|---------|
| 告警规则配置 | 5.4 通知与告警精化 | `PRD-README.md` §5.4 |
| 告警事件查询 | 5.4.1 告警规则 | `PRD-README.md` §5.4 |
| 告警命中趋势 | 5.4.1 告警统计 | `PRD-README.md` §5.4 |
| 用户端告警中心 | 2.2.1 用户端功能规格（区域 12） | `ref-2.2-user-dashboard.md` |
| 供应商可用率 | 4.3.1 供应商健康检查 | `ref-4.3-vendor-model.md` |
| 熔断关联告警 | 5.1.3 熔断器 | `ref-5.1-routing.md` |
| 通知渠道 | 4.5 通知与告警 | `PRD-README.md` §4.5 |

---

> **关联文档**
> - `PRD-README.md` §5.4 — 通知与告警精化（本文件的基础）
> - `ref-2.2-user-dashboard.md` §区域 12 — 用户端告警中心（告警消费端）
> - `ref-4.3-vendor-model.md` — 供应商可用率依赖
> - `ref-5.1-routing.md` — 熔断器状态告警触发
