# 用户额度预算系统 — 设计文档

> **对应章节**：PRD-README.md §5.5 长期能力 — 用户额度预算
> **状态**：完整设计 ✅ | **版本**：v1.0 | **最后更新**：2026-07-28
> **定位**：为企业级用户提供可配置的额度预算管理能力，支持月/季/年额度、消费预警、超限控制、审批流。
> **设计原则**：额度是"消费上限"，不是"预充值"。额度与余额独立，但消费时优先消耗余额，额度是第二道防线。
> **粒度**：数据模型 → 预算策略 → 消费控制 → 预警 → 审批流 → API → 组件 → 配置 → 边界 → 验收

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [预算策略模型](#2-预算策略模型)
3. [消费控制引擎](#3-消费控制引擎)
4. [预警与通知](#4-预警与通知)
5. [审批流设计](#5-审批流设计)
6. [运营后台功能](#6-运营后台功能)
7. [API 接口规格](#7-api-接口规格)
8. [前端组件 Props](#8-前端组件-props)
9. [运营配置项](#9-运营配置项)
10. [边界条件](#10-边界条件)
11. [验收标准](#11-验收标准)
12. [交叉引用](#12-交叉引用)

---

## 1. 数据表结构

### 1.1 `user_quotas` — 用户额度

```typescript
export const userQuotas = pgTable("user_quotas", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // 预算周期
  budgetType: varchar("budget_type", { length: 10 }).notNull(),  // monthly | quarterly | yearly
  budgetAmount: bigint("budget_amount", { mode: "number" }).notNull(),  // 预算额度(分)
  usedAmount: bigint("used_amount", { mode: "number" }).notNull().default(0),  // 已使用(分)
  remainingAmount: bigint("remaining_amount", { mode: "number" }).notNull(),  // 剩余(分)

  // 周期时间
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

  // 预警阈值
  warnThreshold1: integer("warn_threshold_1").notNull().default(80),  // 第一级预警 (百分比)
  warnThreshold2: integer("warn_threshold_2").notNull().default(95),  // 第二级预警 (百分比)

  // 超限策略
  overLimitAction: varchar("over_limit_action", { length: 16 }).notNull().default("deny"),
  // deny | warn_only | request_approval | auto_extend

  // 自动延期
  autoExtendPercent: integer("auto_extend_percent").default(20),  // 自动延期增加百分比
  autoExtendMaxTimes: integer("auto_extend_max_times").default(1),

  // 状态
  status: varchar("status", { length: 16 }).notNull().default("active"),
  // active | exhausted | suspended | closed

  // 审批
  needsApproval: boolean("needs_approval").notNull().default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),

  // 备注
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_quotas_user_id_idx").on(table.userId),
  periodIdx: index("user_quotas_period_idx").on(table.periodStart, table.periodEnd),
  statusIdx: index("user_quotas_status_idx").on(table.status),
}));
```

### 1.2 `quota_usage_logs` — 额度使用记录

```typescript
export const quotaUsageLogs = pgTable("quota_usage_logs", {
  id: serial("id").primaryKey(),
  quotaId: integer("quota_id").notNull().references(() => userQuotas.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  requestId: varchar("request_id", { length: 64 }),    // 关联请求 ID
  amount: bigint("amount", { mode: "number" }).notNull(),  // 本次消费(分)
  balanceBefore: bigint("balance_before", { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  usagePercent: integer("usage_percent").notNull(),     // 使用后额度占比
  action: varchar("action", { length: 16 }).notNull(),  // consume | warn | deny | approval
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  quotaIdIdx: index("quota_usage_logs_quota_id_idx").on(table.quotaId),
  createdAtIdx: index("quota_usage_logs_created_at_idx").on(table.createdAt.desc()),
}));
```

### 1.3 `quota_approval_requests` — 额度审批请求

```typescript
export const quotaApprovalRequests = pgTable("quota_approval_requests", {
  id: serial("id").primaryKey(),
  quotaId: integer("quota_id").notNull().references(() => userQuotas.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  requestType: varchar("request_type", { length: 20 }).notNull(),
  // extend_quota | increase_limit | override_deny
  requestedAmount: bigint("requested_amount", { mode: "number" }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  // pending | approved | rejected | cancelled
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  quotaIdIdx: index("quota_approval_requests_quota_id_idx").on(table.quotaId),
  statusIdx: index("quota_approval_requests_status_idx").on(table.status),
}));
```

### 1.4 `quota_templates` — 额度模板

```typescript
export const quotaTemplates = pgTable("quota_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  budgetType: varchar("budget_type", { length: 10 }).notNull(),
  budgetAmount: bigint("budget_amount", { mode: "number" }).notNull(),
  overLimitAction: varchar("over_limit_action", { length: 16 }).notNull(),
  warnThreshold1: integer("warn_threshold_1").notNull().default(80),
  warnThreshold2: integer("warn_threshold_2").notNull().default(95),
  autoExtendPercent: integer("auto_extend_percent").default(20),
  autoExtendMaxTimes: integer("auto_extend_max_times").default(1),
  needsApproval: boolean("needs_approval").notNull().default(false),
  applicableUserLevels: integer("applicable_user_levels").array(),  // 适用用户等级
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. 预算策略模型

### 2.1 预算周期

```
月度预算 (monthly):
  └─ 每月 1 日 00:00 自动重置
  └─ 上月未用完额度不累积

季度预算 (quarterly):
  └─ 每季度初自动重置
  └─ 周期: Q1(1-3月), Q2(4-6月), Q3(7-9月), Q4(10-12月)

年度预算 (yearly):
  └─ 每年 1 月 1 日自动重置
  └─ 适用于大客户合约

预算重置逻辑:
  └─ 定时任务: 每日 00:05 检查过期周期
  └─ 自动创建新周期的额度记录
  └─ 旧周期记录保留为历史
```

### 2.2 超限策略

| 策略 | 代码 | 行为 | 适用场景 |
|------|------|------|---------|
| 拒绝 | `deny` | 超限后拒绝新请求 | 严格预算控制 |
| 仅警告 | `warn_only` | 允许继续消费但记录告警 | 宽松监控 |
| 申请审批 | `request_approval` | 超限后需管理员审批 | 企业预算管控 |
| 自动延期 | `auto_extend` | 超限后自动增加一定比例额度 | 弹性预算 |

### 2.3 额度模板

```
预置模板:
  └─ 基础版: 月度 ¥5000, deny, 预警 80%/95%
  └─ 标准版: 月度 ¥20000, deny, 预警 80%/95%
  └─ 企业版: 季度 ¥100000, request_approval, 预警 70%/90%
  └─ 旗舰版: 年度 ¥500000, request_approval, 预警 60%/85%, auto_extend 20%

运营可自定义模板并关联到用户等级:
  └─ 新用户自动分配基础版
  └─ 升级后自动切换对应模板
```

---

## 3. 消费控制引擎

### 3.1 消费判定流程

```
用户发起 API 调用
    │
    └─ QuotaControlEngine.check(userId, amount)
        │
        ├─ Step 1: 查找当前周期的活跃额度记录
        │   ├─ 存在 → 获取
        │   └─ 不存在 → 应用默认模板创建额度
        │
        ├─ Step 2: 计算消费后额度
        │   ├─ newUsed = usedAmount + amount
        │   └─ newPercent = (newUsed / budgetAmount) × 100
        │
        ├─ Step 3: 判定
        │   ├─ newPercent < warnThreshold1 → ✅ 允许
        │   ├─ newPercent < warnThreshold2 → ⚠️ 预警 + 允许
        │   ├─ newPercent < 100 → ⚠️ 第二级预警 + 允许
        │   └─ newPercent >= 100 → 执行超限策略
        │       ├─ deny → ❌ 拒绝
        │       ├─ warn_only → ⚠️ 允许 + 告警
        │       ├─ request_approval → 检查是否有待审批
        │       │   ├─ 有已批准的 → ✅ 允许
        │       │   └─ 无 → ❌ 拒绝 + 提示申请
        │       └─ auto_extend → 自动延期
        │           ├─ 延期次数 < max → 延期 + ✅ 允许
        │           └─ 延期次数 >= max → ❌ 拒绝
        │
        └─ Step 4: 记录使用日志
```

### 3.2 消费控制拦截点

```
拦截点: 计费服务中，实际扣费前
  └─ 位置: billing/billing-engine.ts 中
  └─ 逻辑: 
    if (userQuotaEnabled) {
      const result = await quotaControl.check(userId, amount);
      if (!result.allowed) {
        throw new QuotaExceededError(result.message, result.quotaUsage);
      }
    }
```

### 3.3 自动延期逻辑

```typescript
function autoExtend(quota: UserQuota): UserQuota {
  const extendAmount = Math.floor(quota.budgetAmount * (quota.autoExtendPercent / 100));
  const newBudget = quota.budgetAmount + extendAmount;
  const newRemaining = quota.remainingAmount + extendAmount;

  // 更新记录
  await db.update(userQuotas)
    .set({
      budgetAmount: newBudget,
      remainingAmount: newRemaining,
      autoExtendCount: quota.autoExtendCount + 1,
    })
    .where(eq(userQuotas.id, quota.id));

  // 记录日志
  await db.insert(quotaUsageLogs).values({
    quotaId: quota.id,
    userId: quota.userId,
    amount: extendAmount,
    action: "auto_extend",
    balanceBefore: quota.remainingAmount,
    balanceAfter: newRemaining,
    usagePercent: Math.floor((quota.usedAmount / newBudget) * 100),
  });

  return { ...quota, budgetAmount: newBudget, remainingAmount: newRemaining };
}
```

---

## 4. 预警与通知

### 4.1 预警级别

| 级别 | 触发条件 | 通知方式 | 频率 |
|------|---------|---------|------|
| info | 使用率 > 50% | 无 | — |
| warn_1 | 使用率 > warnThreshold1 (默认 80%) | 站内信 | 每日一次 |
| warn_2 | 使用率 > warnThreshold2 (默认 95%) | 站内信 + 邮件 | 每次触发 |
| critical | 使用率 = 100% (超限) | 站内信 + 邮件 + 企微 | 立即 |

### 4.2 通知内容

```typescript
interface QuotaAlertNotification {
  type: "quota_warning" | "quota_exceeded" | "quota_reset" | "quota_extended";
  userId: number;
  quota: {
    budgetAmount: number;
    usedAmount: number;
    remainingAmount: number;
    usagePercent: number;
    periodStart: string;
    periodEnd: string;
  };
  message: string;
  // 示例: "您的 7 月消费额度已使用 85%，剩余 ¥750"
}
```

### 4.3 预警定时任务

```
每日 09:00:
  └─ 扫描所有活跃额度
  └─ 使用率 > 80% → 发送预警
  └─ 使用率 > 95% → 发送二级预警

每月 1 日 00:05:
  └─ 创建本月新额度
  └─ 发送"新周期额度已重置"通知
```

---

## 5. 审批流设计

### 5.1 审批类型

| 类型 | 触发条件 | 申请人 | 审批人 |
|------|---------|-------|--------|
| 额度延期 | 超限 + auto_extend 次数用完 | 用户 | 运营/财务 |
| 限额提升 | 用户主动申请提高额度 | 用户 | 财务 |
| 违规豁免 | 安全策略触发后恢复 | 用户 | 安全/运营 |

### 5.2 审批流程

```
用户发起审批请求
    │
    └─ 创建 quota_approval_requests (status=pending)
        │
        ├─ 通知审批人 (站内信 + 邮件)
        │
        ├─ 审批人查看详情
        │   ├─ 用户当前消费情况
        │   ├─ 历史额度使用
        │   └─ 申请原因
        │
        ├─ 审批操作
        │   ├─ 批准 → status=approved
        │   │   ├─ 延期: 增加额度
        │   │   ├─ 提升: 修改 budgetAmount
        │   │   └─ 豁免: 清除限制
        │   │
        │   └─ 拒绝 → status=rejected
        │       └─ 通知申请人
        │
        └─ 通知申请人审批结果
```

### 5.3 审批通知

```
审批人收到通知:
  └─ 站内信: "用户 X 申请额度延期，已使用 105%，请审批"
  └─ 邮件: 同上 + 链接跳转审批页

申请人收到通知:
  └─ 批准: "您的额度延期申请已批准，额度增加 ¥X"
  └─ 拒绝: "您的额度延期申请被拒绝，原因: X"
```

---

## 6. 运营后台功能

### 6.1 额度管理页面

```
页面路径: /admin/finance/quotas

功能:
  └─ 用户额度列表 (可搜索/筛选)
  └─ 查看用户额度详情 (历史周期 + 使用趋势)
  └─ 手动调整额度 (需要审批)
  └─ 批量设置额度模板
  └─ 导出额度使用报告

额度列表字段:
  ┌──────┬─────────┬─────────┬─────────┬──────────┬────────┬──────┐
  │ 用户 │ 周期   │ 额度   │ 已使用 │ 剩余     │ 使用率 │ 状态 │
  ├──────┼─────────┼─────────┼─────────┼──────────┼────────┼──────┤
  │ A    │ 7月    │ ¥5000  │ ¥4,200 │ ¥800    │ 84%    │ ⚠️  │
  │ B    │ 7月    │ ¥10000 │ ¥9,800 │ ¥200    │ 98%    │ 🔴  │
  │ ...  │ ...    │ ...    │ ...    │ ...     │ ...    │ ...  │
  └──────┴─────────┴─────────┴─────────┴──────────┴────────┴──────┘
```

### 6.2 额度模板管理

```
页面路径: /admin/finance/quotas/templates
功能:
  └─ 模板列表 (CRUD)
  └─ 设置默认模板
  └─ 设置用户等级 → 模板映射
```

### 6.3 审批管理

```
页面路径: /admin/finance/quotas/approvals
功能:
  └─ 待审批列表
  └─ 审批详情 + 操作
  └─ 审批历史
```

---

## 7. API 接口规格

### 7.1 额度管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/quotas` | 额度列表 | finance:read |
| GET | `/api/v1/admin/quotas/:userId` | 用户额度详情 | finance:read |
| POST | `/api/v1/admin/quotas/:userId/adjust` | 手动调整额度 | finance:write |
| POST | `/api/v1/admin/quotas/:userId/reset` | 重置额度周期 | finance:write |
| GET | `/api/v1/admin/quotas/:userId/history` | 历史周期 | finance:read |
| GET | `/api/v1/admin/quotas/:userId/usage-trend` | 使用趋势 | finance:read |

### 7.2 额度模板

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/quotas/templates` | 模板列表 | finance:read |
| POST | `/api/v1/admin/quotas/templates` | 创建模板 | finance:write |
| PATCH | `/api/v1/admin/quotas/templates/:id` | 编辑模板 | finance:write |
| DELETE | `/api/v1/admin/quotas/templates/:id` | 删除模板 | finance:write |
| POST | `/api/v1/admin/quotas/templates/:id/set-default` | 设为默认 | finance:write |

### 7.3 审批

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/quotas/approvals` | 审批列表 | finance:read |
| GET | `/api/v1/admin/quotas/approvals/:id` | 审批详情 | finance:read |
| POST | `/api/v1/admin/quotas/approvals/:id/approve` | 批准 | finance:write |
| POST | `/api/v1/admin/quotas/approvals/:id/reject` | 拒绝 | finance:write |

### 7.4 用户端

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/v1/user/quota` | 当前额度状态 | User JWT |
| GET | `/api/v1/user/quota/history` | 历史额度 | User JWT |
| POST | `/api/v1/user/quota/request-approval` | 申请审批 | User JWT |

---

## 8. 前端组件 Props

### 8.1 QuotaDashboard — 用户端额度看板

```typescript
interface QuotaDashboardProps {
  userId: number;
}

// 展示:
// ┌─ 我的额度 ─────────────────────────────┐
// │ 本月额度: ¥5,000   已使用: ¥4,200 (84%) │
// │ [████████████████░░░░░░░░░░░░] 84%     │
// │ 剩余: ¥800   周期: 7/1 - 7/31          │
// │ 状态: ⚠️ 已使用 80% 以上               │
// │ [申请提高额度]                           │
// └──────────────────────────────────────────┘
```

### 8.2 QuotaAdminList — 管理端额度列表

```typescript
interface QuotaAdminListProps {
  // 路由页面
}

interface QuotaRowProps {
  userId: number;
  userName: string;
  period: string;
  budgetAmount: number;
  usedAmount: number;
  remainingAmount: number;
  usagePercent: number;
  status: string;
  onViewDetail: (userId: number) => void;
  onAdjust: (userId: number) => void;
}
```

### 8.3 QuotaAdjustForm — 额度调整表单

```typescript
interface QuotaAdjustFormProps {
  userId: number;
  initialData: {
    budgetAmount: number;
    overLimitAction: string;
    warnThreshold1: number;
    warnThreshold2: number;
  };
  onSave: (data: QuotaAdjustData) => Promise<void>;
  onCancel: () => void;
}

interface QuotaAdjustData {
  budgetAmount: number;
  overLimitAction: string;
  warnThreshold1: number;
  warnThreshold2: number;
  reason: string;
}
```

### 8.4 QuotaTemplateManager — 额度模板管理

```typescript
interface QuotaTemplateManagerProps {
  // 路由页面
}

interface QuotaTemplateFormProps {
  initialData?: QuotaTemplateFormData;
  onSave: (data: QuotaTemplateFormData) => Promise<void>;
  onCancel: () => void;
}

interface QuotaTemplateFormData {
  name: string;
  description: string;
  budgetType: string;
  budgetAmount: number;
  overLimitAction: string;
  warnThreshold1: number;
  warnThreshold2: number;
  autoExtendPercent: number;
  autoExtendMaxTimes: number;
  needsApproval: boolean;
  applicableUserLevels: number[];
}
```

### 8.5 QuotaApprovalList — 审批列表

```typescript
interface QuotaApprovalListProps {
  // 路由页面
}

interface QuotaApprovalCardProps {
  id: number;
  userName: string;
  requestType: string;
  requestedAmount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onViewDetail: (id: number) => void;
}
```

### 8.6 QuotaUsageChart — 使用趋势图

```typescript
interface QuotaUsageChartProps {
  userId: number;
  period?: "3m" | "6m" | "12m";
}

// 展示: 月度额度使用趋势柱状图
// 使用 Recharts BarChart
// X轴: 月份, Y轴: 金额
// 叠加: 预算线 + 实际使用量
```

---

## 9. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 额度系统启用 | `site_configs.quota.enabled` | boolean | false | 全局开关（默认关闭） |
| 默认额度模板 | `site_configs.quota.default_template_id` | int | null | 新用户自动应用的模板 |
| 重置定时 | `site_configs.quota.reset_cron` | string | `0 5 1 * *` | 每月 1 日 00:05 |
| 预警定时 | `site_configs.quota.warn_cron` | string | `0 0 9 * * *` | 每日 09:00 |
| 预警通知频率 | `site_configs.quota.warn_frequency_hours` | int | 24 | 同级别预警最小间隔(h) |
| 审批超时 | `site_configs.quota.approval_timeout_hours` | int | 72 | 审批超时自动拒绝 |

---

## 10. 边界条件

### 10.1 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 用户无额度记录 | 应用默认模板创建额度 |
| B2 | 预算金额为 0 或负数 | 视为不限额度（overLimitAction = always_allow）|
| B3 | 同时创建 N 个用户的额度 | 批量插入，事务提交 |
| B4 | 额度记录跨越多年 | 按周期自动分片，yearly 类型支持多年度 |

### 10.2 消费控制边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B5 | 消费处于额度边界（刚好 100%）| 精确计算，100% 时执行超限策略 |
| B6 | 同时发起大量并发请求 | 乐观锁，只允许一个请求通过 |
| B7 | 自动延期后额度仍然不足 | 超限策略降级为 deny |
| B8 | 周期切换时正在处理的请求 | 使用旧周期额度记录，不阻断请求 |

### 10.3 审批边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B9 | 用户重复提交审批请求 | 已有 pending 状态时禁止重复提交 |
| B10 | 审批人长时间未处理 | 72h 超时自动拒绝，通知申请人 |
| B11 | 审批人拒绝后用户再次申请 | 允许，但需间隔 24h |

### 10.4 预警边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B12 | 同时触发多个预警级别 | 只发送最高级别的预警 |
| B13 | 短时间多次触发预警 | 按配置频率去重，不重复发送 |
| B14 | 用户已注销 | 忽略额度预警 |

---

## 11. 验收标准

### 11.1 额度管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 额度创建 | 新用户自动应用默认模板，创建额度记录 |
| AC2 | 消费扣减 | 每次消费正确扣减 remainingAmount |
| AC3 | 周期重置 | 下月 1 日自动创建新周期，上周期保留 |
| AC4 | 超限拒绝 | 超限后调用返回 403 + 额度提示 |
| AC5 | 自动延期 | 超限后自动扩容，记录延期日志 |

### 11.2 预警

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC6 | 第一级预警 | 使用率 > 80% 时发送站内信 |
| AC7 | 第二级预警 | 使用率 > 95% 时发送站内信 + 邮件 |
| AC8 | 预警去重 | 同级别预警不重复发送（24h 内）|

### 11.3 审批

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC9 | 审批流程 | 用户 → 提交 → 审批 → 通知，流程完整 |
| AC10 | 审批超时 | 72h 未处理自动拒绝 |
| AC11 | 重复提交 | 已有 pending 时禁止重复提交 |

### 11.4 模板

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC12 | 模板 CRUD | 创建/编辑/删除正常 |
| AC13 | 默认模板 | 设为默认后新用户自动应用 |
| AC14 | 等级映射 | 不同等级用户自动分配不同模板 |

---

## 12. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 计费引擎 | `ref-5.2-billing.md` | 消费控制拦截点位于计费引擎 |
| 用户体系 | — | 额度与用户等级关联 |
| 通知规则 | `ref-4.14.5-notification-rules.md` | 额度预警通知通道 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 额度调整操作记录 |
| 系统配置 | `ref-4.8-system-config.md` | 额度配置存储在 site_configs |
| 供应商管理 | `ref-4.3-vendor-model.md` | 企业用户额度影响供应商路由 |
| 开放 API | `ref-4.19-open-api-platform.md` | 额度查询可作为开放 API 端点 |