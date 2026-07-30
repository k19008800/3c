# 工单与客服系统 — 深化参考文档

> **对应章节**：[PRD-README.md §4 管理后台精化](../PRD-README.md) — 新增模块
> **状态**：新功能，尚未实现。本文档为运营平台深化需求规格。
> **定位**：支持用户提交工单、客服接单处理、管理员管理工单分类和 SLA 策略，形成完整的客服闭环。
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 工作流 → 交叉引用

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [工单类型与分类](#2-工单类型与分类)
3. [工单全生命周期](#3-工单全生命周期)
4. [用户端工单流程](#4-用户端工单流程)
5. [管理端工单处理](#5-管理端工单处理)
6. [SLA 策略配置](#6-sla-策略配置)
7. [客服排班与分配](#7-客服排班与分配)
8. [工单统计分析](#8-工单统计分析)
9. [API 接口规格](#9-api-接口规格)
10. [前端组件 Props](#10-前端组件-props)

---

## 1. 数据表结构

### 1.1 `ticket_categories` — 工单分类

```typescript
export const ticketCategories = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => ticketCategories.id), // 二级分类
  description: varchar("description", { length: 256 }),
  slaType: varchar("sla_type", { length: 16 }).notNull().default("normal"), // normal | urgent | low
  defaultAssignee: integer("default_assignee").references(() => users.id), // 默认分配人
  autoAssign: boolean("auto_assign").notNull().default(true), // 是否自动分配
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  icon: varchar("icon", { length: 32 }), // Lucide icon name
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
ticket_categories_parent_idx — on(parentId)
```

**预置分类**：

| 一级分类 | 二级分类 | SLA | 说明 |
|---------|---------|-----|------|
| 账户问题 | 实名认证 | normal | 实名审核进度、信息修改 |
| | 密码/登录 | urgent | 忘记密码、账号被盗 |
| | 账号注销 | normal | 注销进度、撤销注销 |
| | 权限变更 | normal | 角色/权限申请 |
| 充值/财务 | 充值问题 | urgent | 充值未到账、金额错误 |
| | 退款申请 | normal | 退款进度、退款原因 |
| | 发票问题 | normal | 发票申请、信息修改 |
| | 余额异常 | urgent | 余额被多扣、不明消费 |
| 技术问题 | API 调用异常 | urgent | 接口报错、响应异常 |
| | 模型问题 | normal | 模型不可用、输出异常 |
| | Key 管理 | normal | Key 创建/禁用/权限 |
| | 接入咨询 | low | 文档、SDK、示例代码 |
| 商务合作 | 企业接入 | low | 企业定制、批量采购 |
| | 代理加盟 | low | 代理申请、政策咨询 |
| | 其他合作 | low | 商务拓展、联合推广 |
| 投诉建议 | 服务投诉 | urgent | 客服态度、服务质量 |
| | 功能建议 | low | 新功能、优化建议 |
| | 投诉其他 | normal | 其他投诉 |

### 1.2 `tickets` — 工单

```typescript
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",         // 待接单
  "in_progress",  // 处理中
  "waiting_user", // 等待用户回复
  "pending_review", // 待一审/复审
  "resolved",     // 已解决
  "closed",       // 已关闭
  "reopened",     // 已重开
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",      // 低
  "normal",   // 中
  "high",     // 高
  "urgent",   // 紧急
]);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNo: varchar("ticket_no", { length: 20 }).notNull().unique(), // TK-260728-0001
  userId: integer("user_id").notNull().references(() => users.id),
  categoryId: integer("category_id").notNull().references(() => ticketCategories.id),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),                                  // HTML (富文本)
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("normal"),
  priorityReason: varchar("priority_reason", { length: 256 }),        // 紧急原因
  assigneeId: integer("assignee_id").references(() => users.id),       // 指派人
  slaDeadline: timestamp("sla_deadline", { withTimezone: true }),     // SLA 截止时间
  slaBreached: boolean("sla_breached").notNull().default(false),      // 是否超时
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolution: text("resolution"),                                      // 解决方案
  satisfaction: integer("satisfaction"),                              // 满意度 1-5
  satisfactionComment: text("satisfaction_comment"),
  tags: jsonb("tags").$type<string[]>(),                              // 标签
  relatedUserId: integer("related_user_id").references(() => users.id), // 关联的其他用户
  source: varchar("source", { length: 16 }).notNull().default("web"),  // web | api | admin
  isInternal: boolean("is_internal").notNull().default(false),         // 内部工单
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusPriorityIdx: index("tickets_status_priority_idx").on(table.status, table.priority),
  assigneeIdx: index("tickets_assignee_idx").on(table.assigneeId),
  userIdIdx: index("tickets_user_idx").on(table.userId),
}));
```

**工单号生成规则**：

```
格式: TK-YYYYMMDD-NNNN
  TK: Ticket前缀
  日期: 创建日期
  序号: 当日自增4位（当日第1个=0001）
```

### 1.3 `ticket_replies` — 工单回复

```typescript
export const ticketReplies = pgTable("ticket_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  userType: varchar("user_type", { length: 16 }).notNull(), // user | admin | system
  content: text("content").notNull(),                        // HTML (富文本)
  attachments: jsonb("attachments").$type<Attachment[]>(),   // 附件
  isInternal: boolean("is_internal").notNull().default(false), // 内部备注
  quotedReplyId: integer("quoted_reply_id").references((): AnyPgColumn => ticketReplies.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

// 索引
ticket_replies_ticket_idx — on(ticketId)
```

### 1.4 `ticket_history` — 工单操作记录

```typescript
export const ticketHistories = pgTable("ticket_histories", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  action: varchar("action", { length: 32 }).notNull(), // 操作类型
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  comment: varchar("comment", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
ticket_histories_ticket_idx — on(ticketId)
```

**action 枚举**：

| action | 说明 |
|--------|------|
| `created` | 创建工单 |
| `assigned` | 分配处理人 |
| `claimed` | 客服接单 |
| `replied` | 回复（客服/用户） |
| `status_changed` | 状态变更 |
| `priority_changed` | 优先级变更 |
| `category_changed` | 分类变更 |
| `reopened` | 重开工单 |
| `resolved` | 标记解决 |
| `closed` | 关闭工单 |

### 1.5 `ticket_sla_policies` — SLA 策略

```typescript
export const ticketSlaPolicies = pgTable("ticket_sla_policies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  priority: ticketPriorityEnum("priority").notNull(),      // 适用优先级
  categoryIds: jsonb("category_ids").$type<number[]>(),    // 适用分类（null=全部）
  firstResponseMinutes: integer("first_response_minutes").notNull(),  // 首次响应时限(分钟)
  resolutionMinutes: integer("resolution_minutes").notNull(),         // 解决时限(分钟)
  businessHoursOnly: boolean("business_hours_only").notNull().default(true), // 仅计算工作时间
  escalationEnabled: boolean("escalation_enabled").notNull().default(true), // 启用升级
  escalationThresholdPercent: integer("escalation_threshold_percent").notNull().default(80), // 达此百分比时升级
  escalateToUserId: integer("escalate_to_user_id").references(() => users.id), // 升级到
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**预置 SLA 策略**：

| 策略名 | 优先级 | 首次响应 | 解决时限 | 说明 |
|--------|--------|---------|---------|------|
| 紧急策略 | urgent | 30分钟 | 4小时 | 服务中断、充值异常类 |
| 标准策略 | high | 1小时 | 8小时 | API异常、投诉类 |
| 普通策略 | normal | 4小时 | 24小时 | 账户/财务/技术问题 |
| 非紧急策略 | low | 8小时 | 72小时 | 咨询/建议/合作 |

**SLA 截止时间计算**：

```
businessHoursOnly = true:
  工作时间: 周一至周五 9:00-18:00
  示例: 周五 17:00 提交，首次响应 4h = 下周一 11:00
  跳过: 午休时段(12:00-13:30)、周末、节假日(配置)

businessHoursOnly = false:
  按自然时间计算
```

### 1.6 `ticket_auto_assign_rules` — 自动分配规则

```typescript
export const ticketAutoAssignRules = pgTable("ticket_auto_assign_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  categoryIds: jsonb("category_ids").$type<number[]>(),       // 适用分类
  strategy: varchar("strategy", { length: 32 }).notNull(),    // 分配策略
  assigneePool: jsonb("assignee_pool").$type<number[]>(),     // 可分配人员池
  maxPerAgent: integer("max_per_agent").default(10),          // 每人最大待处理数
  loadBalanceWeight: jsonb("load_balance_weight").$type<Record<string, number>>(), // 负载权重
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. 工单类型与分类

### 2.1 分类管理

管理端可自定义工单分类（一级/二级）：

| 操作 | 权限 | 说明 |
|------|------|------|
| 查看分类树 | USER_VIEW | 树形展示所有分类 |
| 新增分类 | USER_EDIT | 一级/二级分类 |
| 编辑分类 | USER_EDIT | 名称/SLA类型/默认分配人/图标/排序 |
| 启用/停用 | USER_EDIT | 停用后用户无法选择该分类 |
| 删除分类 | USER_EDIT | 无关联工单时可删除 |

### 2.2 分类与 SLA 映射

每个分类关联一个 slaType（对应 SLA 策略的 priority）：
- 当工单创建时根据分类自动确定初始 priority
- 运营可手动调整单个工单的 priority

---

## 3. 工单全生命周期

### 3.1 状态机

```
        ┌──────────┐
        │  open    │ ← 用户/管理员创建
        │  待接单   │
        └────┬─────┘
             │ 客服接单(claim) / 管理员分配
        ┌────▼─────┐
        │in_progress│ ← 客服处理中
        │  处理中    │
        └────┬─────┘
             ├──→ waiting_user (客服回复后等待用户确认)
             │         │
             │         └──→ in_progress (用户回复后回到处理中)
             │
             ├──→ resolved (客服标记已解决)
             │         │
             │         ├──→ closed (用户确认/7天自动)
             │         └──→ reopened (用户不满意重新打开)
             │
             └──→ closed (直接关闭，如重复工单)

open → in_progress / closed (关单:重复、无效)
in_progress → waiting_user / resolved / closed
waiting_user → in_progress / closed (用户7天未回复自动关闭)
resolved → closed / reopened
reopened → in_progress
```

**关闭规则**：

| 场景 | 自动关闭条件 |
|------|------------|
| 等待用户回复 | 7天未回复 → 自动 close，附系统消息 |
| 已解决 | 用户7天未确认 → 自动 close |
| 超时未处理 | SLA 超时 3 倍仍未处理 → 升级给 escalateToUserId |

### 3.2 操作权限矩阵

| 操作 | user | agent | admin/support | super_admin |
|------|------|-------|--------------|-------------|
| 创建工单 | ✅ | ✅ | ✅ | ✅ |
| 查看自己的工单 | ✅ | ✅ | ✅ | ✅ |
| 查看所有人的工单 | ❌ | ❌ | ✅ | ✅ |
| 回复工单 | ✅(自己的) | ✅(自己的) | ✅ | ✅ |
| 接单 | ❌ | ❌ | ✅ | ✅ |
| 分配处理人 | ❌ | ❌ | ✅ | ✅ |
| 变更优先级 | ❌ | ❌ | ✅ | ✅ |
| 变更分类 | ❌ | ❌ | ✅ | ✅ |
| 标记已解决 | ❌ | ❌ | ✅ | ✅ |
| 关闭工单 | ❌ | ❌ | ✅ | ✅ |
| 重开工单 | ✅(自己的已解决) | ✅(自己的已解决) | ✅ | ✅ |
| 评价满意度 | ✅(自己的已解决) | ✅(自己的已解决) | ❌ | ❌ |
| 管理分类/SLA | ❌ | ❌ | ❌ | ✅ |

---

## 4. 用户端工单流程

### 4.1 创建工单

**入口**：用户端导航栏 →「帮助中心」→「提交工单」

**创建表单**：

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| 工单分类 | ✅ | 级联选择（一级→二级） | 根据系统配置可用分类 |
| 标题 | ✅ | text(256) | 简明扼要描述问题 |
| 详细描述 | ✅ | 富文本编辑器 | 支持文本格式、列表、代码块 |
| 优先级 | ❌ | select | 用户可选 normal/high，系统定级 urgent 需额外理由 |
| 附件 | ❌ | 文件上传 | 支持图片/PDF/文本，单文件≤10MB，总≤5个 |

**创建后行为**：
```
工单创建成功 → 页面跳转到工单详情
  → 系统自动：
    ① 生成工单号 TK-YYYYMMDD-NNNN
    ② 根据分类确定初始 priority
    ③ 触发自动分配规则（如有）
    ④ 计算 SLA 截止时间
    ⑤ 记录创建事件到 ticket_history
    ⑥ 发送站内通知给分配客服
```

### 4.2 我的工单列表

**页面路径**：`/console/tickets`

| 列 | 说明 |
|----|------|
| 工单号 | TK-260728-0001，可点击进入详情 |
| 标题 | 截断显示 |
| 分类 | 二级分类名 |
| 状态 | 彩色标签（open黄色/in_progress蓝色/resolved绿色/closed灰色） |
| 优先级 | 彩色标签（urgent红/high橙/normal蓝/low灰） |
| 创建时间 | — |
| 最后更新 | 最近一条回复+时间 |
| 满意度 | 已闭环的显示评分 |

**筛选器**：状态 / 分类 / 创建时间范围 / 关键词搜索

### 4.3 工单详情页（用户端）

对话式布局：顶部显示工单项信息（工单号/标题/状态/分类/优先级/时间），下方展示对话记录（用户→客服→系统消息），底部富文本编辑区+附件上传+发送按钮。

### 4.4 满意度评价

**触发时机**：客服标记 `resolved` 后，用户可见评价入口。
**评价维度**：满意度(1-5星) + 选填评语。写入 `tickets.satisfaction` 和 `satisfaction_comment`。

---

## 5. 管理端工单处理

### 5.1 工单工作台

**页面路径**：`/admin/tickets`

**顶部统计栏**（实时轮询）：

| 指标 | 数据源 |
|------|--------|
| 待接单 | status=open COUNT |
| 处理中 | status=in_progress COUNT |
| 等待用户 | status=waiting_user COUNT |
| 今日已解决 | resolvedAt 在今天 |
| SLA 超期 | slaBreached=true 且未解决 |

**列表列**：工单号/标题(含优先级色标)/用户(昵称+ID)/分类/状态/处理人/SLA倒计时(🟢>4h 🟡1-4h 🔴<1h)/创建时间/操作(接单/分配/查看)

**快速视图切换**：我的工单 | 未分配 | 全部 | 已解决 | 已关闭

### 5.2 工单详情页（管理端）

右侧操作面板：状态/优先级/分类变更、处理人分配/接单、SLA 倒计时、操作按钮(等待用户回复/标记解决/关闭)、内部备注、关联用户、操作历史时间线。内部备注仅管理员可见（黄色背景）。

### 5.3 批量操作

批量分配/批量关闭（须为resolved状态）/批量变更分类。单次最多 100 个。

---

## 6. SLA 策略配置

**页面路径**：`/admin/config/ticket-sla`

| 字段 | 说明 |
|------|------|
| 策略名 | 如"紧急策略" |
| 适用优先级 | urgent/high/normal/low |
| 首次响应时限 | 数字+单位 |
| 解决时限 | 数字+单位 |
| 仅计算工作时间 | 开关(工作日 9:00-18:00) |
| 启用自动升级 | 开关 + 升级阈值% + 升级对象 |

**SLA 超时检测**：cron 每 5 分钟扫描 → 标记 slaBreached=true → 记录事件 → 发送通知。

---

## 7. 客服排班与分配

**分配策略**：round_robin(轮流)、least_busy(最少待处理)、weighted(加权)、category_based(按分类)、manual(手动)
**负载保护**：每客服最多 maxPerAgent 个待处理工单，满载时保持 open 状态

---

## 8. 工单统计分析

**路径**：`/admin/tickets/analytics`
**核心指标**：工单总量/解决率/平均解决时间/平均首次响应/SLA达标率/满意度/重开率
**图表**：创建量vs解决量趋势/各分类分布(饼图)/客服绩效对比(条形图)

---

## 9. API 接口规格

### 9.1 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/me/tickets` | 我的工单列表 |
| POST | `/api/v1/me/tickets` | 创建工单 |
| GET | `/api/v1/me/tickets/:id` | 工单详情(含全部回复) |
| POST | `/api/v1/me/tickets/:id/replies` | 回复工单 |
| POST | `/api/v1/me/tickets/:id/reopen` | 重开工单 |
| POST | `/api/v1/me/tickets/:id/satisfaction` | 评价满意度 |

### 9.2 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/tickets` | 工单列表(分页+筛选) |
| GET | `/api/v1/admin/tickets/:id` | 工单详情 |
| POST | `/api/v1/admin/tickets` | 管理员代为创建 |
| POST | `/api/v1/admin/tickets/:id/replies` | 回复(含内部备注) |
| PATCH | `/api/v1/admin/tickets/:id` | 更新(状态/优先级/分类/处理人) |
| POST | `/api/v1/admin/tickets/:id/claim` | 接单 |
| POST | `/api/v1/admin/tickets/:id/assign` | 分配处理人 |
| POST | `/api/v1/admin/tickets/batch` | 批量操作 |
| GET | `/api/v1/admin/tickets/stats` | 工单统计 |
| GET | `/api/v1/admin/tickets/analytics` | 分析报表 |
| GET | `/api/v1/admin/tickets/categories` | 分类列表(树形) |
| POST | `/api/v1/admin/tickets/categories` | 创建分类 |
| PATCH | `/api/v1/admin/tickets/categories/:id` | 编辑分类 |
| DELETE | `/api/v1/admin/tickets/categories/:id` | 删除分类 |

### 9.3 SLA 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/ticket-sla` | SLA策略列表 |
| POST | `/api/v1/admin/ticket-sla` | 创建策略 |
| PATCH | `/api/v1/admin/ticket-sla/:id` | 编辑策略 |
| DELETE | `/api/v1/admin/ticket-sla/:id` | 删除策略 |
| PATCH | `/api/v1/admin/ticket-sla/:id/toggle` | 启用/停用 |

---

## 10. 前端组件 Props

### 10.1 TicketList — 工单列表（共用）

```typescript
interface TicketListProps {
  mode: "user" | "admin" | "agent";
  initialFilters?: TicketFilters;
  onTicketClick?: (ticketId: number) => void;
}

interface TicketFilters {
  status?: string[];
  priority?: string[];
  categoryId?: number;
  assigneeId?: number;
  myTickets?: boolean;
  slaBreached?: boolean;
  keyword?: string;
  dateRange?: [string, string];
}
```

### 10.2 TicketDetail — 工单详情

```typescript
interface TicketDetailProps {
  ticketId: number;
  mode: "user" | "admin";
  onStatusChange?: (newStatus: string) => void;
}

interface TicketDetailData {
  ticket: {
    id: number; ticketNo: string; title: string; content: string;
    status: string; priority: string;
    category: { id: number; name: string; parentName: string };
    assignee: { id: number; nickname: string; avatar?: string } | null;
    user: { id: number; nickname: string; email: string };
    slaDeadline: string; slaBreached: boolean;
    satisfaction: number | null;
    createdAt: string; updatedAt: string;
  };
  replies: { id: number; userId: number; userType: string; userNickname: string;
             content: string; isInternal: boolean; createdAt: string }[];
  history: { id: number; action: string; comment?: string; operatorNickname: string; createdAt: string }[];
}
```

### 10.3 TicketWorkbench — 客服工作台

```typescript
interface TicketWorkbenchState {
  activeView: "my" | "unassigned" | "all" | "resolved" | "closed";
  stats: { openCount: number; inProgressCount: number; waitingUserCount: number;
           resolvedToday: number; createdToday: number; slaBreached: number };
}
```

### 10.4 SLAPolicyEditor — SLA编辑

```typescript
interface SLAPolicyFormData {
  name: string; priority: string; categoryIds: number[];
  firstResponseMinutes: number; resolutionMinutes: number;
  businessHoursOnly: boolean;
  escalationEnabled: boolean; escalationThresholdPercent: number; escalateToUserId: number | null;
}
```

---

## 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 用户管理 | PRD-README.md §2 | 工单关联用户，用户详情页查看工单历史 |
| 通知系统 | PRD-README.md §2.2 | 新工单/状态变更/SLA超期通知 |
| 操作日志 | ref-4.7-monitor-logs.md | 工单操作记录汇入全局操作日志 |
| 角色权限 | ref-2.1-roles-permissions.md | 新增 support 角色工单权限 |
| 运营总纲 | ref-1-operational-summary.md | 工单统计汇入运营 KPI |

---

## 边界条件

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| TK-001 | 工单转交死循环 | 客服 A 将工单转交给客服 B，客服 B 又将工单转回给客服 A，或多人间形成转交环 | 系统检测转交链路，若目标处理人过去 7 天内曾持有该工单，则阻止转交并提示"该工单不可重复转交给此前处理人"；转交记录超过 5 次时自动上报管理员人工介入 |
| TK-002 | 工单状态变更冲突 | 客服 A 和处理人 B 同时对同一工单执行状态变更操作（如 A 标记 resolved，B 同时执行 reopen） | 后端使用乐观锁（version 字段），后提交者收到冲突提示"该工单状态已被变更，请刷新后重试"；前端通过 WebSocket 推送实时状态同步，降低并发冲突概率 |
| TK-003 | 附件上传失败 | 用户或客服在回复工单时上传附件，文件大小超限（单文件 > 10MB / 总数 > 5 个）或格式不受支持 | 前端在文件选择时即校验大小和格式，超过限制立即提示不可选择；上传超时（30s）或网络中断时显示失败状态，允许用户重新上传；已上传成功的附件在发送前可删除替换 |
| TK-004 | 工单关闭后再次回复 | 用户或客服在工单已标记为 "closed" 状态后尝试新增回复内容 | 工单关闭后回复输入框置灰并提示"该工单已关闭，如需继续咨询请重开工单或提交新工单"；系统提供"重开工单"快捷入口，重开后自动将工单状态设为 "reopened" 并记录操作历史 |
| TK-005 | SLA 超时检测遗漏 | cron 扫描周期内（每 5 分钟）因集群节点故障导致部分工单的 SLA 截止时间未被扫描到 | 补偿机制：每次扫描时除检查当前到期工单外，还检查上次扫描周期内遗漏的工单；SLA 超时检测支持手动触发全量扫描；超时记录不可逆，避免重复标记导致状态翻转 |
| TK-006 | 自动分配满载无可用客服 | 所有在线客服的待处理工单数均达到 maxPerAgent 上限，新工单无人可分配 | 新建工单保持 "open" 状态，不自动分配；工单列表顶部展示橙色提示"当前客服满载，工单暂未分配"；排班中即将上班的客服或休息时间结束的客服将被标记为"即将可用"并优先分配 |

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| 用户 7 天未回复工单自动关闭 | 自动关闭前 24 小时发送站内通知提醒用户；关闭后用户仍可重开工单 |
| 工单分类被删除后仍有关联工单 | 分类删除改为软删除（不可见但保留数据），关联工单显示"已删除分类"占位；新建工单不再可选该分类 |
| 满意度评价数据为空 | 标记 resolved 后用户未评价时，7 天后自动关闭，satisfaction 字段留空统计中不计入，不强制用户评价 |
| 工单查看权限越界 | 用户只能查看和操作自己的工单；管理员/客服只能查看权限范围内的工单（按角色和分类过滤）；内部备注仅管理员可见 |
