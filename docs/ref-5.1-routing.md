# 3cloud 智能路由系统 — 可编码深度规格

> **来源**：PRD-README.md §5.1 智能路由系统  
> **关联模块**：供应商与模型管理 > 供应商-模型映射 | 熔断器配置 | 路由推荐  
> **版本**：V1.0 | **日期**：2026-07-27  
> **前置依赖**：`vendors`、`vendor_models`、`circuit_breaker_configs` 表

---

## 目录

1. [数据层：Drizzle Schema 补充](#1-数据层drizzle-schema-补充)
2. [API 接口清单](#2-api-接口清单)
3. [路由配置管理页面](#3-路由配置管理页面)
4. [手动覆盖机制](#4-手动覆盖机制)
5. [熔断器配置持久化](#5-熔断器配置持久化)
6. [交叉引用与调用链](#6-交叉引用与调用链)

---

## 1. 数据层：Drizzle Schema 补充

### 1.1 熔断器配置持久化表（当前为内存配置，需要持久化）

```typescript
// ============================================================
//  circuit_breaker_configs — 熔断器持久化配置
// ============================================================
export const circuitBreakerConfigs = pgTable("circuit_breaker_configs", {
  id: serial("id").primaryKey(),
  vendorModelId: integer("vendor_model_id")
    .notNull().references(() => vendorModels.id, { onDelete: "cascade" }),
  
  // 熔断配置
  failureThreshold: integer("failure_threshold").notNull().default(5),    // 连续失败次数触发半开
  circuitTimeoutSec: integer("circuit_timeout_sec").notNull().default(30), // 全开→半开等待秒数
  probeCount: integer("probe_count").notNull().default(3),                // 半开探针成功次数→恢复
  probeIntervalSec: integer("probe_interval_sec").notNull().default(10),  // 探针间隔秒数
  
  // 检活配置
  healthCheckEnabled: boolean("health_check_enabled").notNull().default(true),
  healthCheckEndpoint: varchar("health_check_endpoint", { length: 500 }),
  healthCheckMethod: varchar("health_check_method", { length: 10 }).default("GET"),
  healthCheckIntervalSec: integer("health_check_interval_sec").default(30),
  healthCheckTimeoutMs: integer("health_check_timeout_ms").default(5000),
  
  // 生效范围
  scope: varchar("scope", { length: 20 }).notNull().default("vendor_model"), // vendor_model | key_group_item
  
  // 时效字段
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  
}, (table) => ({
  vendorModelUnique: uniqueIndex("circuit_config_vendor_model_idx").on(table.vendorModelId),
}));
```

### 1.2 路由手动覆盖配置表

```typescript
// ============================================================
//  routing_overrides — 路由手动覆盖
//  用途：管理员临时强制将某模型路由到某供应商/Key，覆盖自动路由策略
// ============================================================
export const routingOverrides = pgTable("routing_overrides", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  keyGroupId: integer("key_group_id").references(() => vendorKeyGroups.id, { onDelete: "set null" }),
  
  overrideType: varchar("override_type", { length: 20 }).notNull().default("vendor"), // vendor | key_group
  
  // 有效期
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  isPermanent: boolean("is_permanent").notNull().default(false),
  
  reason: text("reason"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  
}, (table) => ({
  modelOverrideIdx: index("routing_override_model_idx").on(table.modelId),
}));
```

### 1.3 路由推荐结果缓存表

```typescript
// ============================================================
//  routing_recommendations — 智能路由推荐结果缓存
//  每次全量分析结果存在此表，供前端展示
// ============================================================
export const routingRecommendations = pgTable("routing_recommendations", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => models.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  upstreamModelName: varchar("upstream_model_name", { length: 200 }),
  
  // 评分
  costScore: integer("cost_score").notNull(),           // 0-100
  latencyScore: integer("latency_score").notNull(),      // 0-100
  reliabilityScore: integer("reliability_score").notNull(), // 0-100
  overallScore: integer("overall_score").notNull(),      // 0-100
  
  // 原始数据
  avgCostPerCall: numeric("avg_cost_per_call", { precision: 12, scale: 6 }),
  avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
  successRate: numeric("success_rate", { precision: 5, scale: 2 }),
  totalCalls: integer("total_calls").default(0),
  
  calcPeriod: varchar("calc_period", { length: 10 }).default("7d"), // 分析时间范围
  reason: text("reason"),                                              // 推荐理由
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. API 接口清单

### 2.1 路由策略管理

#### `GET /api/v1/admin/routing/config` — 获取全局路由策略配置

```json
{
  "status": "ok",
  "data": {
    "defaultStrategy": "weighted_random",
    "strategies": ["weighted_random", "lowest_price", "least_connections", "manual"],
    "fallbackStrategy": "lowest_price",
    "retryConfig": { "maxRetries": 2, "switchVendorOnRetry": true },
    "modelConfigs": [
      {
        "modelId": 1, "modelName": "deepseek-chat",
        "strategy": "weighted_random",
        "overrideActive": false
      }
    ]
  }
}
```

#### `PUT /api/v1/admin/routing/config` — 更新全局路由策略

```json
{
  "defaultStrategy": "lowest_price",
  "retryConfig": { "maxRetries": 3, "switchVendorOnRetry": true }
}
```

#### `PUT /api/v1/admin/routing/config/models` — 更新特定模型的路由策略

```json
{
  "modelId": 1,
  "strategy": "lowest_price"
}
```

### 2.2 熔断器配置管理

#### `GET /api/v1/admin/routing/circuit-breakers` — 熔断器状态列表

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| status | string | — | closed / degraded / half_open / dead |
| vendorId | int | — | 按供应商筛选 |

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "items": [
      {
        "vendorModelId": 1,
        "vendorId": 1, "vendorName": "DeepSeek",
        "modelName": "deepseek-chat", "upstreamModelName": "deepseek-chat",
        "circuitState": "closed",
        "circuitOpenedAt": null,
        "circuitRetryAfter": null,
        "circuitFailCount": 2,
        "weight": 10,
        "isDown": false,
        "failuresInWindow": 2,
        "config": {
          "failureThreshold": 5,
          "circuitTimeoutSec": 30,
          "probeCount": 3,
          "probeIntervalSec": 10
        }
      }
    ]
  }
}
```

#### `GET /api/v1/admin/routing/circuit-breakers/:vendorModelId` — 单条详情

```json
{
  "status": "ok",
  "data": {
    "vendorModelId": 1,
    "circuitState": "closed",
    "failuresInWindow": 2,
    "config": {
      "failureThreshold": 5,
      "failureThresholdWindowMs": 60000,
      "circuitTimeoutSec": 30,
      "probeCount": 3,
      "probeIntervalSec": 10
    }
  }
}
```

#### `PUT /api/v1/admin/routing/circuit-breakers/:vendorModelId/config` — 更新熔断配置

```json
{
  "failureThreshold": 10,
  "circuitTimeoutSec": 60,
  "probeCount": 5,
  "probeIntervalSec": 15,
  "healthCheckEnabled": true
}
```

#### `POST /api/v1/admin/routing/circuit-breakers/:vendorModelId/reset` — 手动重置熔断

**响应 200**

```json
{
  "status": "ok",
  "data": { "vendorModelId": 1, "previousState": "dead", "newState": "closed", "resetAt": "2026-07-27T23:00:00Z" }
}
```

#### `POST /api/v1/admin/routing/circuit-breakers/:vendorModelId/manual-open` — 手动熔断（管理员强制下线）

```json
{ "reason": "由于供应商故障，手动熔断", "estimatedRecoveryMinutes": 30 }
```

### 2.3 路由覆盖

#### `GET /api/v1/admin/routing/overrides` — 路由覆盖列表

```json
{
  "status": "ok",
  "data": {
    "items": [
      {
        "id": 1,
        "modelId": 1, "modelName": "deepseek-chat",
        "vendorId": 2, "vendorName": "OspreyAI",
        "keyGroupId": null,
        "overrideType": "vendor",
        "startAt": "2026-07-27T00:00:00Z",
        "endAt": "2026-07-28T00:00:00Z",
        "isPermanent": false,
        "reason": "DeepSeek 维护期间切换到 OspreyAI",
        "createdBy": "admin@3cloud.ai"
      }
    ]
  }
}
```

#### `POST /api/v1/admin/routing/overrides` — 创建路由覆盖

```json
{
  "modelId": 1,
  "vendorId": 2,
  "overrideType": "vendor",
  "startAt": "2026-07-27T00:00:00Z",
  "endAt": "2026-07-28T00:00:00Z",
  "reason": "DeepSeek 维护期间切换到 OspreyAI"
}
```

**条件**：`endAt` 和 `isPermanent` 至少有一个。`endAt` 到期的覆盖自动失效。

#### `DELETE /api/v1/admin/routing/overrides/:id` — 删除路由覆盖

#### `GET /api/v1/admin/routing/overrides/active` — 获取当前生效的覆盖

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "activeOverrides": [
      { "modelId": 1, "modelName": "deepseek-chat", "forcedVendor": "OspreyAI" }
    ]
  }
}
```

### 2.4 路由推荐

#### `GET /api/v1/admin/routing/recommendations` — 智能路由推荐分析

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| modelId | int | — | 指定模型的分析 |
| period | string | `7d` | 分析时间范围 |

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "recommendations": [
      {
        "vendorId": 1, "vendorName": "DeepSeek",
        "modelName": "deepseek-chat", "upstreamModelName": "deepseek-chat",
        "costScore": 95, "latencyScore": 85, "reliabilityScore": 99,
        "overallScore": 93,
        "avgCostPerCall": 0.0012, "avgLatencyMs": 180,
        "successRate": 99.8, "totalCalls": 56789,
        "reason": "成本低、延迟适中、可靠性高，推荐优先选用"
      },
      {
        "vendorId": 2, "vendorName": "OspreyAI",
        "modelName": "deepseek-chat", "upstreamModelName": "deepseek-chat",
        "costScore": 70, "latencyScore": 95, "reliabilityScore": 95,
        "overallScore": 87,
        "avgCostPerCall": 0.0018, "avgLatencyMs": 120,
        "successRate": 99.5, "totalCalls": 23456,
        "reason": "延迟最低，成本略高，适合对延迟敏感的业务"
      }
    ],
    "analyzedAt": "2026-07-27T10:00:00Z"
  }
}
```

#### `POST /api/v1/admin/routing/recommendations/apply` — 应用推荐配置

```json
{
  "applyItems": [
    { "modelId": 1, "vendorId": 1, "action": "increase_weight", "newWeight": 15 }
  ]
}
```

---

## 3. 路由配置管理页面

### 3.1 页面结构

```
/admin/routing
├── [策略配置] [熔断器状态] [路由覆盖] [路由推荐]  ← 四个页签
│
├── 策略配置页签
│   ├── 全局策略：下拉选择器 [weighted_random ▼] + 编辑按钮
│   ├── 模型级策略列表（表格）
│   │   ├── 模型名 / 当前策略 / 是否有覆盖 / 操作[编辑]
│   └── 重试配置：最大重试次数 / 是否切换供应商 / 超时时间
│
├── 熔断器状态页签
│   ├── 状态筛选器：[全部 ▼] [closed ▼] [degraded] [half_open] [dead]
│   ├── 熔断器列表（表格）
│   │   ├── 供应商 / 模型 / 状态(色标) / 失败次数 / 熔断时间 / 操作
│   │   ├── 操作：[查看配置] [重置熔断] [手动熔断]
│   └── 熔断器配置编辑弹窗
│
├── 路由覆盖页签
│   ├── 当前生效覆盖列表（高亮行）
│   ├── 已过期覆盖列表（灰色行）
│   └── [新建覆盖] 按钮 → 弹窗
│
└── 路由推荐页签
    ├── 模型选择器 / 分析周期
    ├── 推荐结果卡片（每模型 2-3 个供应商评分卡片）
    └── [应用推荐] 按钮
```

### 3.2 核心组件 Props

```typescript
// CircuitBreakerList — 熔断器状态表格
interface CircuitBreakerItem {
  vendorModelId: number; vendorName: string; modelName: string;
  circuitState: CircuitStateV2; circuitOpenedAt: string | null;
  circuitFailCount: number; failuresInWindow: number;
  config: CircuitBreakerConfig;
}
interface CircuitBreakerListProps {
  items: CircuitBreakerItem[]; loading: boolean;
  statusFilter: CircuitStateV2 | 'all';
  onViewConfig: (vendorModelId: number) => void;
  onReset: (vendorModelId: number) => void;
  onManualOpen: (vendorModelId: number) => void;
}

// CircuitBreakerConfigDialog — 熔断配置编辑弹窗
interface CircuitBreakerConfigFormValues {
  failureThreshold: number;
  circuitTimeoutSec: number;
  probeCount: number;
  probeIntervalSec: number;
  healthCheckEnabled: boolean;
}
interface CircuitBreakerConfigDialogProps {
  open: boolean; vendorModelId: number;
  currentConfig: CircuitBreakerConfigFormValues;
  onSave: (config: CircuitBreakerConfigFormValues) => Promise<void>;
  onClose: () => void;
}

// RoutingOverrideDialog — 新建路由覆盖弹窗
interface RoutingOverrideFormValues {
  modelId: number; vendorId: number;
  overrideType: 'vendor' | 'key_group'; keyGroupId?: number;
  startDate: string; endDate?: string; isPermanent: boolean;
  reason: string;
}
interface RoutingOverrideDialogProps {
  open: boolean;
  onSave: (values: RoutingOverrideFormValues) => Promise<void>;
  onClose: () => void;
}

// RecommendationCard — 路由推荐评分卡片
interface RecommendationItem {
  vendorName: string; modelName: string;
  overallScore: number; costScore: number;
  latencyScore: number; reliabilityScore: number;
  avgCostPerCall: number; avgLatencyMs: number;
  successRate: number; reason: string;
}
interface RecommendationCardProps {
  recommendation: RecommendationItem;
  onApply: () => void;
}
```

---

## 4. 手动覆盖机制

### 4.1 覆盖生效规则

```typescript
// 路由选择时的手动覆盖优先级
// 1. routing_overrides 表中当前时间在 startAt~endAt 范围内（或 isPermanent=true）
// 2. 如果 overrideType='vendor' → 直接选该供应商
// 3. 如果 overrideType='key_group' → 用该 Key 分组
// 4. 有多个覆盖时，最近的 createdAt 优先
// 5. 无覆盖 → 走正常的权重/策略选择
// 6. 覆盖的供应商/Key 熔断时 → 回退到正常路由（覆盖视为失效）
```

### 4.2 覆盖冲突处理

```
场景：管理员 A 和 B 同时对同一模型创建覆盖
  → 后创建的覆盖优先生效（createdAt 较新）
  → 前一个覆盖自动失效（endAt 不变）
```

### 4.3 覆盖到期自动移除

```
cron 定时任务（每小时）：
  → 扫描 routing_overrides 表
  → endAt < now() 且 isPermanent=false → 标记为 inactive（不是物理删除）
  → 前端查询时自动过滤 inactive
```

---

## 5. 熔断器配置持久化

### 5.1 后端逻辑变更

```typescript
// ============================================================
//  当前熔断器逻辑（内存）→ 改为从 circuit_breaker_configs 表读取
// ============================================================

// 启动时：
//   1. 从 circuit_breaker_configs 读取全部活跃配置
//   2. 加载到内存 cache
//   3. 前端更新配置时，写表 + 更新 cache

// 路由选择时：
//   const config = circuitCache.get(vendorModelId);
//   if (config) {
//     failureThreshold = config.failureThreshold;
//     circuitTimeoutSec = config.circuitTimeoutSec;
//     probeCount = config.probeCount;
//     probeIntervalSec = config.probeIntervalSec;
//   } else {
//     failureThreshold = 5; // 默认值
//     circuitTimeoutSec = 30;
//     probeCount = 3;
//     probeIntervalSec = 10;
//   }

// 新增 vendorModels 时自动创建默认配置：
//   1. vendorModels 新增一行后
//   2. 自动 INSERT circuit_breaker_configs (vendorModelId, 默认值)
//   3. 确保无 vendorModel 遗漏配置
```

### 5.2 配置继承规则

```typescript
// 供应商级默认值 → 模型级覆盖 → Key 级覆盖
// 1. 查询 vendor_models 行时，先查 circuit_breaker_configs
// 2. 如果无配置 → 取该 vendor 的所有 model 的配置平均值作为默认值
// 3. 如果供应商也无可参考配置 → 使用全局默认值
```

### 5.3 前端配置页面的数据流

```
管理员打开熔断器配置弹窗
  → GET /api/v1/admin/routing/circuit-breakers/:vendorModelId
  → 展示当前配置
  → 管理员修改后提交
  → PUT .../config
  → 后端写表 + 更新 cache
  → 返回成功
  → 弹窗关闭 + 表格行刷新
```

---

## 6. 交叉引用与调用链

### 6.1 跨模块数据流

```
路由系统（/admin/routing）
│
├── 策略配置 → 影响路由选择引擎的 strategy 参数
├── 熔断器状态 → 后端熔断器引擎读取 + 写入 vendor_models.circuitState
│
├── 路由覆盖 → 路由引擎选择时检查 override
│   └── 覆盖到期 → cron 定时清理
│
├── 路由推荐 → 读取 call_logs 历史数据
│   └── 应用推荐 → 更新 vendor_models.weight
│
└── 供应商管理
    ├── vendors 状态切换 → 自动创建路由覆盖 / 影响推荐评分
    └── vendor-models 权重 → 路由推荐建议修改
```

### 6.2 依赖的外部模块

| 路由模块 | 外部模块 | 依赖类型 | 说明 |
|---------|---------|---------|------|
| 策略选择 | 供应商-模型映射 | 强 | 从 vendor_models 选路线 |
| 熔断器 | 健康检查 | 强 | health_check_* 字段 |
| 熔断器 | 限流引擎 | 弱 | 限流打分可纳入熔断判断 |
| 路由覆盖 | 供应商管理 | 弱 | 覆盖指向 vendor |
| 路由推荐 | call_logs | 强 | 历史数据聚合分析 |
| 路由推荐 | 供应商管理 | 弱 | 供应商价格作为评分依据 |

### 6.3 章节交叉引用

| 本模块章节 | 关联 PRD 章节 | 关联文件 |
|-----------|-------------|---------|
| 路由策略配置 | 5.1.2 负载均衡算法 | `PRD-README.md` §5.1 |
| 熔断器配置 | 5.1.3 熔断器状态机 | `PRD-README.md` §5.1 |
| 路由覆盖 | 4.3.3 供应商-模型映射 | `ref-4.3-vendor-model.md` |
| 路由推荐 | 4.3 供应商模型管理 | `ref-4.3-vendor-model.md` |
| 熔断器健康检查 | 4.3.1 供应商健康检查配置 | `ref-4.3-vendor-model.md` |
| 限流交互 | 5.3 限流引擎 | `PRD-README.md` §5.3 |
| 余额预检查 | 5.2 计费结算 | `PRD-README.md` §5.2 |

---

> **关联文档**
> - `PRD-README.md` §5.1 — 智能路由系统（本文件的基础）
> - `ref-4.3-vendor-model.md` — 供应商与模型管理（路由依赖的映射/价格）
> - `ref-5.4-alert-rules.md` — 告警规则配置（熔断触发告警）
> - `PRD-README.md` §5.3 — 限流引擎
