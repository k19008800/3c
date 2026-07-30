# 3cloud 用户端仪表盘 — 可编码深度规格

> **来源**：PRD-README.md §2.2.1 用户端功能规格  
> **关联模块**：用户体系 > 仪表盘 | API Key 管理 | 账单计费 | Playground  
> **版本**：V1.0 | **日期**：2026-07-27  
> **前置条件**：确保 `users`、`call_logs`、`api_keys`、`user_quotas`、`login_history`、`notifications` 表已存在

---

## 目录

1. [数据层：Drizzle Schema 补充](#1-数据层drizzle-schema-补充)
2. [API 接口](#2-api-接口)
3. [前端组件树与 Props](#3-前端组件树与-props)
4. [状态管理](#4-状态管理)
5. [区域 1-16 组件规格](#5-区域-1-16-组件规格)
6. [交叉引用与调用链](#6-交叉引用与调用链)

---

## 1. 数据层：Drizzle Schema 补充

### 1.1 现有表字段依赖（确认已存在）

```typescript
// users 表
//   id: serial
//   email: varchar(255) not null
//   nickname: varchar(100)
//   role: varchar(20) default 'user'       // user | admin | agent | finance
//   vip_level: int default 0
//   balance: decimal(15,2) default 0
//   status: varchar(20) default 'active'   // active | disabled | frozen | deleted
//   onboarding_completed: boolean default false
//   deleted_at: timestamp

// call_logs 表
//   id: bigserial
//   user_id: int not null
//   api_key_id: int
//   model: varchar(100)
//   vendor_model_id: int
//   tokens_input: int default 0
//   tokens_output: int default 0
//   cost: decimal(12,6) default 0
//   duration_ms: int default 0
//   status: varchar(20)                     // success | failed | timeout
//   created_at: timestamp not null default now()
//   indexed fields: user_id, created_at, status, model, api_key_id

// api_keys 表
//   id: serial
//   user_id: int not null
//   name: varchar(100)
//   key: varchar(128) not null
//   status: varchar(20) default 'active'
//   last_used_at: timestamp
//   created_at: timestamp not null default now()
//   expires_at: timestamp

// user_quotas 表
//   id: serial
//   user_id: int not null
//   quota_limit: decimal(15,2)
//   daily_free: bigint default 0
//   start_date: date
//   end_date: date

// login_history 表
//   id: bigserial
//   user_id: int not null
//   login_at: timestamp not null default now()
//   ip: varchar(45)
//   user_agent: text
//   status: varchar(20) default 'success'
//   city: varchar(100)
//   province: varchar(100)
//   country: varchar(100)

// balance_logs 表
//   id: bigserial
//   user_id: int not null
//   amount: decimal(15,2) not null
//   type: varchar(20)            // recharge | deduction | refund | commission
//   balance_before: decimal(15,2)
//   balance_after: decimal(15,2)
//   created_at: timestamp not null default now()
```

### 1.2 新增表 — 告警规则用户级覆盖

```typescript
export const userAlertOverrides = pgTable("user_alert_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  customThreshold: decimal("custom_threshold", { precision: 10, scale: 4 }),
  enabled: boolean("enabled").default(true),
  silencedUntil: timestamp("silenced_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqUserAlert: uniqueIndex("uniq_user_alert").on(table.userId, table.alertType),
}));
```

---

## 2. API 接口

### 2.1 仪表盘聚合数据

#### `GET /api/v1/me/dashboard-summary`

获取仪表盘全部区域的聚合数据（一次请求，减少前端多轮请求）。

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| fields | string | (all) | 逗号分隔字段名，如 `welcome,coreMetrics,quota` |

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "welcome": {
      "nickname": "用户昵称",
      "role": "user",
      "vipLevel": 0,
      "balance": 100.50,
      "balanceWarnLevel": "normal",
      "todayTokens": 12345,
      "dailyFreeRemaining": 5000,
      "lastLoginAt": "2026-07-27T23:00:00Z",
      "lastLoginIp": "117.78.2.66",
      "lastLoginLocation": "长沙, 湖南",
      "newUserRemainingDays": 3
    },
    "coreMetrics": {
      "todayCalls": 1234,
      "todaySuccessCalls": 1200,
      "todayFailedCalls": 34,
      "todayTokens": 567890,
      "todayTokensInput": 300000,
      "todayTokensOutput": 267890,
      "todayCost": 12.50,
      "monthCost": 350.20,
      "yesterdayCalls": 1100,
      "yesterdayTokens": 500000,
      "yesterdayCost": 10.80,
      "changeRateCalls": 12.18,
      "changeRateTokens": 13.58,
      "changeRateCost": 15.74
    },
    "quota": {
      "totalQuota": 500.00,
      "used": 350.20,
      "usageRate": 70.04,
      "remaining": 149.80,
      "estimatedDays": 14,
      "hasQuotaLimit": true
    },
    "recentLogins": [
      {
        "loginAt": "2026-07-27T23:00:00Z",
        "ip": "117.78.2.66",
        "location": "长沙, 湖南",
        "device": "Chrome 120 / Windows 10",
        "status": "success",
        "isAbnormal": false,
        "isRemote": false
      }
    ],
    "alerts": [
      {
        "type": "failure_spike",
        "severity": "critical",
        "message": "API 失败率 7.2%（阈值 5%）",
        "triggeredAt": "2026-07-27T12:30:00Z",
        "suggestedAction": "查看详情"
      }
    ],
    "billingCycle": {
      "periodStart": "2026-07-01",
      "periodEnd": "2026-07-31",
      "settledAmount": 890.50,
      "pendingAmount": 123.40,
      "daysUntilNextSettlement": 5
    },
    "onboarding": {
      "completed": false,
      "steps": [
        { "step": 1, "title": "创建 API Key", "done": true },
        { "step": 2, "title": "复制接入代码", "done": false },
        { "step": 3, "title": "测试首次调用", "done": false }
      ]
    },
    "costForecast": {
      "predictedMonthCost": 890.50,
      "currentCost": 450.20,
      "remainingDays": 15,
      "dailyAverage": 30.01,
      "balance": 100.50,
      "balanceDaysRemaining": 3.3,
      "warningLevel": "danger",
      "canPredict": true
    }
  }
}
```

**错误响应**

```json
{ "status": "error", "error": "Unauthorized" }
{ "status": "error", "error": "AccountDisabled", "message": "账户已被禁用" }
{ "status": "error", "error": "InternalError" }
```

### 2.2 用量趋势数据

#### `GET /api/v1/me/stats/usage-trend`

**查询参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| range | string | `7d` | `24h` / `7d` / `30d` / `custom` |
| startDate | string | — | custom 时必填 |
| endDate | string | — | custom 时必填 |
| granularity | string | auto | `hour` / `day` / `week` |
| series | string | `total` | `total` / `input` / `output` |
| compare | boolean | `false` | 是否返回对比基准数据 |

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "range": "7d",
    "granularity": "day",
    "points": [
      { "date": "2026-07-21", "totalTokens": 50000, "inputTokens": 30000, "outputTokens": 20000, "calls": 1000 },
      { "date": "2026-07-22", "totalTokens": 55000, "inputTokens": 32000, "outputTokens": 23000, "calls": 1100 }
    ],
    "comparePoints": [
      { "date": "2026-07-14", "totalTokens": 45000, "calls": 900 },
      { "date": "2026-07-15", "totalTokens": 48000, "calls": 950 }
    ]
  }
}
```

### 2.3 模型分布详情

#### `GET /api/v1/me/stats/by-model?range=today`

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "models": [
      {
        "modelName": "deepseek-chat",
        "vendorName": "DeepSeek",
        "calls": 567,
        "successCalls": 560,
        "failedCalls": 7,
        "tokensTotal": 123456,
        "tokensInput": 70000,
        "tokensOutput": 53456,
        "cost": 2.345,
        "avgLatencyMs": 180
      }
    ],
    "heatmap": {
      "rows": ["deepseek-chat", "gpt-4o"],
      "cols": ["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23"],
      "data": [[0,5,12,8,3,1,15,22,35,50,45,30,20,10,8,5,12,18,25,40,55,60,45,30],[3,7,2,1,0,0,5,10,15,20,25,18,12,8,6,4,8,14,20,30,35,28,18,10]],
      "maxValue": 60
    }
  }
}
```

### 2.4 API Key 对比数据

#### `GET /api/v1/me/keys/compare?range=today`

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "keys": [
      {
        "id": 1,
        "name": "生产环境 Key",
        "createdAt": "2026-06-01T00:00:00Z",
        "lastUsedAt": "2026-07-27T22:30:00Z",
        "todayCalls": 800,
        "successRate": 98.5,
        "cost": 8.50,
        "costPercentage": 68,
        "status": "active",
        "idleStatus": "in_use"
      }
    ],
    "averages": { "avgCalls": 500, "avgSuccessRate": 97.0, "avgCost": 5.00 }
  }
}
```

`idleStatus` 枚举：`in_use` / `inactive` / `unused` / `dormant`

### 2.5 WebSocket 实时活动流

#### `GET /api/v1/me/activity-stream`（WebSocket 升级）

推送消息格式：

```json
{
  "type": "call_event",
  "data": {
    "model": "deepseek-chat",
    "status": "success",
    "tokens": 1234,
    "durationMs": 567,
    "cost": 0.0123,
    "timestamp": "2026-07-26T11:35:00Z"
  }
}
```

**连接管理**：用户离开页面 `onbeforeunload` → `ws.close()`；后端 60 秒无消息自动关闭连接。

### 2.6 优化建议忽略

#### `POST /api/v1/me/optimization-tip/dismiss`

```json
{
  "modelName": "deepseek-chat",
  "recommendedModel": "deepseek-v4-flash"
}
```

**响应 200**

```json
{
  "status": "ok",
  "data": { "dismissed": true, "dismissUntil": "2026-08-03T23:26:00Z" }
}
```

---

## 3. 前端组件树与 Props

### 3.1 组件树

```
UserDashboard                              ← 页面容器（路由 /console）
├── WelcomeCard                            ← 区域 1
├── CoreMetricsCards                        ← 区域 2
├── QuotaProgressBar                        ← 区域 3
├── UsageOverviewPanel                      ← 区域 4（展开面板）
│   ├── UsageSummaryRow                     ← 概要模式
│   └── UsageTabPanel                       ← 展开后的页签
│       ├── UsageOverviewTab                ← 概况
│       ├── UsageTrendTab                   ← 趋势（含图表）
│       ├── ModelDistributionTab            ← 模型分布
│       └── KeyComparisonTab                ← Key 对比
├── TokenConsumptionChart                   ← 区域 5
├── ModelDistributionTable                  ← 区域 6
├── ApiKeyComparisonTable                   ← 区域 7
├── QuickActionsToolbar                     ← 区域 8
├── RecentLoginList                         ← 区域 9
├── OnboardingGuide                         ← 区域 10
├── CostForecastCard                        ← 区域 11
├── AlertCenterCard                         ← 区域 12
├── BillingCycleOverview                    ← 区域 13
├── RealtimeActivityStream                   ← 区域 14
└── OptimizationSuggestions                 ← 区域 15
```

### 3.2 核心 Props 定义

```typescript
// WelcomeCard
interface WelcomeCardProps {
  nickname: string;
  role: string;
  vipLevel: number;
  balance: number;
  balanceWarnLevel: 'normal' | 'warning' | 'danger' | 'overdue';
  todayTokens: number;
  dailyFreeRemaining: number | null;
  lastLoginAt: string | null;
  lastLoginLocation: string | null;
  newUserRemainingDays: number | null;
  onRecharge: () => void;
}

// CoreMetricsCards
interface CoreMetricCard {
  label: string; value: number | string; unit?: string;
  comparisonValue?: number; changeRate?: number | null;
  trend: 'up' | 'down' | 'flat' | 'none'; onClick: () => void;
}
interface CoreMetricsCardsProps {
  cards: CoreMetricCard[]; loading: boolean; error: boolean;
}

// QuotaProgressBar
interface QuotaProgressBarProps {
  totalQuota: number | null; used: number; usageRate: number;
  remaining: number; estimatedDays: number | null;
  onRecharge: () => void;
}

// UsageOverviewPanel
interface UsageOverviewPanelState {
  expanded: boolean;
  activeTab: 'overview' | 'trend' | 'distribution' | 'keyCompare';
}

// TokenConsumptionChart
interface TokenConsumptionChartProps {
  timeRange: '24h' | '7d' | '30d' | 'custom';
  onRangeChange: (range: string) => void;
  granularity: 'hour' | 'day' | 'week';
  series: 'total' | 'input' | 'output';
  compareMode: boolean;
  data: Array<{ date: string; totalTokens: number; inputTokens: number; outputTokens: number; calls: number }>;
  compareData?: Array<{ date: string; totalTokens: number; calls: number }>;
  loading: boolean;
  onExport: (format: 'png' | 'svg' | 'csv') => void;
}

// ModelDistributionTable
interface ModelDistributionRow {
  modelName: string; vendorName: string; calls: number;
  totalTokens: number; cost: number; avgLatencyMs: number;
}
interface ModelDistributionTableProps {
  rows: ModelDistributionRow[]; loading: boolean;
  sortField: string; sortDir: 'asc' | 'desc';
  onSort: (field: string) => void; onRowClick: (modelName: string) => void;
}

// ApiKeyComparisonTable
interface ApiKeyComparisonRow {
  id: number; name: string; createdAt: string; lastUsedAt: string | null;
  todayCalls: number; successRate: number; cost: number;
  costPercentage: number; idleStatus: 'in_use' | 'inactive' | 'unused' | 'dormant';
}
interface ApiKeyComparisonTableProps {
  rows: ApiKeyComparisonRow[];
  averages: { avgCalls: number; avgSuccessRate: number; avgCost: number };
  loading: boolean;
}

// QuickActionsToolbar
interface QuickActionsToolbarProps {
  hasKey: boolean; firstKeyPreview: string;
  onCreateKey: () => void; onRecharge: () => void; onViewLogs: () => void;
}

// RecentLoginList
interface LoginRecord {
  loginAt: string; ip: string; location: string; device: string;
  status: 'success' | 'failed'; isAbnormal: boolean; isRemote: boolean;
}
interface RecentLoginListProps { records: LoginRecord[]; maxItems?: number; }

// OnboardingGuide
interface OnboardingStep { step: number; title: string; done: boolean; action: () => void; actionLabel: string; }
interface OnboardingGuideProps {
  completed: boolean; steps: OnboardingStep[];
  onDismiss: () => void; registeredDays: number; showAsBanner?: boolean;
}

// CostForecastCard
interface CostForecastCardProps {
  predictedMonthCost: number; currentCost: number; remainingDays: number;
  dailyAverage: number; balance: number; balanceDaysRemaining: number;
  warningLevel: 'safe' | 'info' | 'warning' | 'danger' | 'critical' | 'exhausted';
  canPredict: boolean; onRecharge: () => void;
}

// AlertCenterCard
interface AlertItem {
  id: string; type: string; severity: 'critical' | 'warning';
  message: string; triggeredAt: string; suggestedAction: string; read: boolean;
}
interface AlertCenterCardProps {
  criticalCount: number; warningCount: number;
  alerts: AlertItem[]; onRead: (alertId: string) => void; onAction: (alertType: string) => void;
}

// BillingCycleOverview
interface BillingCycleOverviewProps {
  periodStart: string; periodEnd: string; settledAmount: number;
  pendingAmount: number; daysUntilNextSettlement: number; onDownloadHistory: () => void;
}

// RealtimeActivityStream
interface ActivityEvent {
  id: string; model: string; status: 'success' | 'failed' | 'timeout';
  tokens: number; durationMs: number; cost: number; timestamp: string;
}
interface RealtimeActivityStreamProps {
  events: ActivityEvent[]; connected: boolean;
  onPause: () => void; onResume: () => void;
  onEventClick: (eventId: string) => void; paused: boolean;
}

// OptimizationSuggestions
interface OptimizationSuggestion {
  currentModel: string; recommendedModel: string;
  monthlyCalls: number; monthlyTokens: number; estimatedMonthlySaving: number;
}
interface OptimizationSuggestionsProps {
  suggestions: OptimizationSuggestion[];
  onDismiss: (currentModel: string, recommendedModel: string) => void;
  onTest: (recommendedModel: string) => void;
}
```

---

## 4. 状态管理

### 4.1 数据获取时序

```typescript
// 页面加载 → 并行请求
//   ├── dashboardSummary  ← GET /api/v1/me/dashboard-summary
//   ├── usageTrend        ← GET /api/v1/me/stats/usage-trend?range=7d
//   ├── modelDistribution ← GET /api/v1/me/stats/by-model?range=today
//   ├── keyComparison     ← GET /api/v1/me/keys/compare?range=today
//   ├── heatmap           ← GET /api/v1/me/stats/heatmap?range=today
//   └── ws.connect        ← WebSocket /api/v1/me/activity-stream

// 轮询：dashboardSummary 每 10 秒刷新（欢迎卡片/核心指标/告警）
// 条件加载：趋势图、模型分布 → 切换到对应页签时懒加载
```

### 4.2 错误处理

```
所有单个区域数据获取失败时：
  ├── 首次加载：展示 Skeleton 骨架屏
  ├── 已有数据刷新失败：展示 "数据加载失败" × 关闭按钮
  └── 不影响其他区域

全部区域失败 → 页面级错误遮罩 + "重新加载"按钮
401 → 跳转登录页；403 → 页面级提示 "账户已被禁用"
```

---

## 5. 区域 1-16 组件规格

| 区域 | 加载态 | 空状态 | 错误态 | 刷新频率 |
|------|--------|--------|--------|---------|
| 1 欢迎卡片 | Skeleton | — | "数据加载失败" | 10s |
| 2 核心指标 | 4 Skeleton | 0 值 | `--` + 灰色小字 | 10s |
| 3 额度进度条 | Skeleton | "无限制" | 隐藏 + 日志 | 10s |
| 4 用量面板 | Skeleton 概要行 | "暂无数据" | 面板降级仅概要行 | 10s + 切换 |
| 5 Token 趋势 | 图表 Skeleton | "暂无趋势数据" | "图表加载失败"+重试 | 切换范围 |
| 6 模型分布 | 表格 Skeleton | 空状态插图 | "数据加载失败" | 页面加载 |
| 7 Key 对比 | 表格 Skeleton | "暂无 API Key" | "数据加载失败" | 页面加载 |
| 8 快捷操作 | 静态 | — | — | — |
| 9 登录记录 | List Skeleton | "暂无登录记录" | 隐藏 | 页面加载 |
| 10 Onboarding | 按步骤状态 | 已完成隐藏 | — | 页面加载 |
| 11 成本预测 | Skeleton | "数据不足" | 隐藏 | 10s |
| 12 告警中心 | Skeleton | "暂无告警" | 隐藏 | 10s |
| 13 账单概览 | Skeleton | "暂无账单数据" | 隐藏 | 页面加载 |
| 14 实时活动流 | "连接中..." | "暂无实时活动" | 断线重连提示 | WS 实时 |
| 15 优化建议 | Skeleton | "暂无优化建议" | 隐藏 | 7d 一次 |

---

## 6. 交叉引用与调用链

### 6.1 跨模块数据流

```
用户仪表盘（/console）
├── 欢迎卡片 → "立即充值" → /console/recharge
├── 核心指标 → 调用次数 → /console/logs?range=today
├── 核心指标 → Token 消耗 → /console/stats?range=today
├── 核心指标 → 消费金额 → /console/transactions?range=today
├── 额度进度条 → "立即充值" → /console/recharge
├── 用量面板 → 模型分布 → /console/logs?model=xxx&range=today
├── 用量面板 → Key 对比 → /console/keys
├── 模型分布表 → 点击行 → /console/logs?model=xxx&range=today
├── 快捷操作 → 创建 Key → 弹窗
├── 快捷操作 → 查看日志 → /console/logs
├── 快捷操作 → 复制 cURL → 弹窗（内置）
├── 告警中心 → 查看详情 → 对应模块详情页
├── 实时活动流 → 点击消息 → /console/logs?logId=xxx
├── Onboarding → 创建 Key → 弹窗
├── Onboarding → 测试调用 → /playground
├── 优化建议 → 一键测试 → /playground?model=xxx
└── 账单概览 → 历史账单 → /console/billing
```

### 6.2 依赖的外部模块

| 仪表盘区域 | 外部模块 | 依赖类型 | 说明 |
|-----------|---------|---------|------|
| 全部 | Auth | 强 | 认证中间件 |
| 欢迎卡片 | 充值 | 弱 | 充值按钮跳转 |
| 额度进度条 | 配额 | 强 | 需 `user_quotas` |
| Key 对比 | Key 管理 | 强 | 需 `api_keys` + `call_logs` |
| 告警中心 | 告警 | 弱 | 告警获取 + 已读 |
| 实时活动流 | WebSocket | 强 | ws 连接 |
| 成本预测 | 计费 | 弱 | `call_logs` 聚合 |
| 优化建议 | 定价 | 弱 | 全平台价格对比 |

### 6.3 章节交叉引用

| 本模块章节 | 关联 PRD 章节 | 关联文件 |
|-----------|-------------|---------|
| 欢迎卡片余额 | 4.4.1 财务总览 | `PRD-README.md` §4.4 |
| 额度进度条 | 2.2.3 API Key 管理 | `PRD-README.md` §2.2 |
| Key 对比 | 2.2.3 API Key 管理 | `PRD-README.md` §2.2 |
| 告警中心 | 5.4 通知与告警 | `ref-5.4-alert-rules.md` |
| Onboarding | 新手任务 | `PRD-README.md` 补充 |
| 成本预测 | 5.2 计费结算 | `PRD-README.md` §5.2 |
| 优化建议 | 4.3 供应商模型 | `ref-4.3-vendor-model.md` |
| 模型分布 | 4.3.2 模型管理 | `ref-4.3-vendor-model.md` |
| 账单概览 | 4.4 财务管理 | `PRD-README.md` §4.4 |
| 登录记录 | 2.1 角色权限 | `PRD-README.md` §2.1 |

---

> **关联文档**
> - `PRD-README.md` §2.2.1 — 用户端功能规格（本文件的基础）
> - `ref-4.3-vendor-model.md` — 供应商与模型管理
> - `ref-5.4-alert-rules.md` — 告警规则配置
> - `PRD-README.md` §4.4 — 财务管理

---

## 边界条件

### 组件加载场景

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| UDB-001 | 某个区域组件数据加载失败 | 仪表盘 16 个组件中任一组件（如 CoreMetricsCards）后端接口返回 500 | 该组件展示 Skeleton 骨架屏（首次）或「数据加载失败」× 关闭按钮（已有数据刷新），不影响其他 15 个区域 |
| UDB-002 | CostForecast 无历史数据 | 用户注册不足 3 天，`call_logs` 中无足够数据支撑成本预测 | `canPredict: false`，展示「数据不足，预测需要至少 3 天使用记录」空状态 |
| UDB-003 | AlertCenter 空告警 | `alerts` 列表为空数组 | 展示「暂无告警」空状态插图，不显示数字徽标 |
| UDB-004 | BillingCycle 未开始 | 用户当月首次登录，结算周期尚未开始（periodStart 为当月 1 日但无任何消费） | settledAmount: 0, pendingAmount: 0，展示「本月暂无消费记录」|
| UDB-005 | WebSocket 实时流连接失败 | 用户网络受限或浏览器不支持 WebSocket | 降级为 HTTP 轮询（每 30 秒），状态指示器显示「轮询模式」标记 |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| 仪表盘聚合 API 全部失败 | 页面级错误遮罩 +「重新加载」按钮，不清除已缓存的本地数据 |
| 401 认证过期 | 前端检测到 401 后跳转登录页，保留当前仪表盘状态到 sessionStorage |
| 10 秒轮询间隔内页面被切换到后台 | 浏览器 tab 不可见时暂停轮询，恢复可见后立即刷新 |
