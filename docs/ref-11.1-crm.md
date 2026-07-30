# 深化参考：§11.1 CRM 客户管理

> **对应**：[`PRD-业务员支撑.md`](PRD-业务员支撑.md) §11.1
> **关联**：[`ref-11.2-leads.md`](ref-11.2-leads.md)、[`SPEC-§24-代理商增强.md`](SPEC-§24-代理商增强.md)
> **优先级**：P0 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-30

---

## 概述

业务员管理名下客户，目前只能去用户管理列表翻查，没有一个"我的客户"专属视图。客户状态（试用/活跃/流失）、联系记录、标签等信息全部缺失，业务员对客户情况全靠脑子记。

**核心价值**：为业务员提供专属客户管理视图，沉淀客户联系记录，量化客户健康度。

---

## 功能模块

### 1. 我的客户列表

```
我的客户

  [搜索客户名/邮箱]  [按状态 ▼]  [按标签 ▼]  [按消费区间 ▼]

  ┌────┬────────┬────────┬────────┬───────┬────────┬─────────┐
  │  客户名  │ 邮箱    │ 状态    │ 本月消费 │ 余额 │ 最近活跃  │ 标签     │
  ├────┼────────┼────────┼────────┼───────┼────────┼─────────┤
  │ 张三  │ z@xx   │ 活跃    │ ¥1,200  │ ¥500 │ 10分钟前│ 高价值   │
  │ 李四  │ l@xx   │ 沉默    │ ¥0      │ ¥20  │ 30天前  │ 需跟进   │
  │ 王五  │ w@xx   │ 试用    │ ¥50     │ ¥80  │ 2天前   │ 企业客户 │
  └────┴────────┴────────┴────────┴───────┴────────┴─────────┘

  ℹ️ 共 42 个客户 | 活跃 28 | 沉默 10 | 流失 4
```

| 筛选维度 | 可选值 |
|---------|--------|
| 状态 | 全部 / 意向 / 试用 / 活跃 / 沉默 / 流失 |
| 标签 | 企业客户 / 开发者 / 高价值 / 需跟进 / 流失预警 / 已签约 |
| 消费区间 | ¥0 / ¥1-100 / ¥100-1000 / ¥1000+ / 自定义 |
| 搜索 | 客户名/邮箱模糊匹配 |
| 排序 | 最近活跃 ↓ / 消费金额 ↓ / 注册时间 ↓ |

### 2. 客户详情页

```
客户详情 — 张三 (z@xx.com)

  ┌─────────────────────────────────────────────────┐
  │ 基本信息                                          │
  ├────────────┬────────────────────────────────────┤
  │ 用户 ID     │ 42                                 │
  │ 注册时间    │ 2026-01-15                          │
  │ 实名认证    │ ✅ 已认证                           │
  │ 所属代理    │ 张三代理                            │
  │ 当前余额    │ ¥500.00                            │
  │ 本月消费    │ ¥1,200.00                          │
  │ 累计消费    │ ¥8,500.00                          │
  │ 客户状态    │ [活跃 ▼]                           │
  │ 标签        │ [高价值] [企业客户] [+ 添加]       │
  │ 最近活跃    │ 10 分钟前 (IP: 10.0.0.1, 上海)     │
  │ 最近调用    │ deepseek-chat, 2 分钟前             │
  └────────────┴────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ 消费趋势（近 6 月）                                │
  │ [折线图：月度消费金额]                            │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ 联系记录 [新增]                                   │
  ├────────┬────────┬──────────┬────────┬───────────┤
  │ 时间    │ 方式    │ 内容摘要  │ 下次跟进 │ 操作      │
  ├────────┼────────┼──────────┼────────┼───────────┤
  │ 07-28  │ 电话   │ 沟通续费  │ 07-30  │ [编辑]   │
  │ 07-20  │ 微信   │ 发送报价  │ —      │ [编辑]   │
  │ 07-10  │ 邮件   │ 发送发票  │ —      │ [编辑]   │
  └────────┴────────┴──────────┴────────┴───────────┘

  ┌─────────────────────────────────────────────────┐
  │ 调用记录（最近 10 条）                             │
  ├────────┬──────────┬────────┬────────┬───────────┤
  │ 时间    │ 模型      │ Token   │ 费用    │ 状态      │
  ├────────┼──────────┼────────┼────────┼───────────┤
  │ 07-28   │ deepseek │ 12,345 │ ¥0.62  │ ✅       │
  │ ...    │                                          │
  └────────┴──────────┴────────┴────────┴───────────┘

  ┌─────────────────────────────────────────────────┐
  │ 工单历史                                          │
  ├────────┬──────────┬────────┬────────────────────┤
  │ 时间    │ 标题      │ 状态    │                    │
  ├────────┼──────────┼────────┼────────────────────┤
  │ 07-25   │ 无法调用  │ 已解决  │ [查看]             │
  └────────┴──────────┴────────┴────────────────────┘
```

### 3. 客户状态与流转

```
客户状态机：
  lead（线索）
    ↓ 注册
  trial（试用）
    ↓ 首次充值/消费
  active（活跃）
    ↕ 连续 30 天有消费 → 保持活跃
    ↓ 连续 30 天无消费
  silent（沉默）
    ↓ 连续 60 天无消费
  churned（流失）
```

| 状态变更 | 触发条件 | 通知 |
|---------|---------|------|
| trial → active | 用户首次充值或消费 | 站内通知业务员 |
| active → silent | 无消费 > 30 天 | 跟进提醒触发 |
| silent → churned | 无消费 > 60 天 | 流失预警 |
| silent → active | 用户再次消费 | 站内通知业务员 |
| churned → active | 用户再次消费 | 站内通知业务员 |

状态可手动变更（业务员在客户详情页调整），手动变更记录到 `customer_status_log`。

### 4. 联系记录

每次与客户沟通后，业务员记录沟通信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | integer FK | 客户 |
| salespersonId | integer FK | 业务员（自动填充当前用户） |
| contactMethod | enum | phone / wechat / email / meeting / other |
| summary | text | 沟通内容摘要（最多 500 字） |
| nextFollowUp | timestamptz | 下次跟进时间（可选） |
| createdAt | timestamptz | 记录时间 |

### 5. 客户标签

业务员可为客户添加/删除标签。

**预置标签**：企业客户 / 开发者 / 高价值 / 需跟进 / 流失预警 / 已签约 / VIP

**自定义标签**：业务员可创建自定义标签（全局可见，管理员审核后生效）。

一个客户最多 5 个标签。

### 6. 批量操作

| 操作 | 说明 |
|------|------|
| 批量添加标签 | 选中多个客户，统一添加标签 |
| 批量修改状态 | 选中多个客户，统一变更客户状态 |
| 批量导出 | 选中客户，导出为 CSV（含基本信息和消费数据） |
| 批量转移归属 | 将选中的客户批量转移给其他业务员（需管理员/组长确认） |

---

## 数据表 Schema

```typescript
// customer_notes — 客户联系记录
export const customerNotes = pgTable("customer_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  salespersonId: integer("salesperson_id").notNull().references(() => users.id),
  contactMethod: varchar("contact_method", { length: 20 }).notNull(),
  summary: text("summary").notNull(),
  nextFollowUp: timestamp("next_follow_up", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// customer_tags — 客户标签
export const customerTags = pgTable("customer_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  tag: varchar("tag", { length: 50 }).notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// 唯一约束：(userId, tag)

// customer_status_log — 客户状态变更记录
export const customerStatusLog = pgTable("customer_status_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  fromStatus: varchar("from_status", { length: 20 }),
  toStatus: varchar("to_status", { length: 20 }).notNull(),
  changedBy: integer("changed_by").notNull().references(() => users.id),
  reason: varchar("reason", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 客户状态枚举（users 表扩展字段）
// user.customer_status: lead | trial | active | silent | churned
// user.assigned_salesperson_id: integer — 所属业务员 ID（已有代理归属关系可共用）
```

---

## API 接口

### 业务员端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/agent/customers?status=&tag=&minConsumption=&search=&page=&limit=&sort=` | 名下客户列表 | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/:userId` | 客户详情（含基本+消费+余额） | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/:userId/stats?months=6` | 客户消费统计 | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/:userId/call-logs?page=&limit=` | 客户调用记录 | 业务员/代理 |
| `PATCH` | `/api/v1/agent/customers/:userId/status` | 变更客户状态 | 业务员/代理 |
| `POST` | `/api/v1/agent/customers/:userId/notes` | 添加联系记录 | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/:userId/notes?page=&limit=` | 联系记录列表 | 业务员/代理 |
| `PATCH` | `/api/v1/agent/customers/:userId/notes/:id` | 编辑联系记录 | 业务员/代理（仅本人） |
| `POST` | `/api/v1/agent/customers/:userId/tags` | 添加标签（body: { tag }） | 业务员/代理 |
| `DELETE` | `/api/v1/agent/customers/:userId/tags/:tag` | 删除标签 | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/tags` | 可用标签列表 | 业务员/代理 |
| `POST` | `/api/v1/agent/customers/batch/tags` | 批量添加标签 | 业务员/代理 |
| `POST` | `/api/v1/agent/customers/batch/status` | 批量修改状态 | 业务员/代理 |
| `GET` | `/api/v1/agent/customers/export?ids=` | 批量导出 CSV | 业务员/代理 |

### 管理员端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/customers/transfer` | 批量转移客户归属 | 管理员/组长 |
| `POST` | `/api/v1/admin/customer-tags` | 创建自定义标签 | 管理员 |
| `GET` | `/api/v1/admin/customer-tags` | 标签列表 | 管理员 |
| `DELETE` | `/api/v1/admin/customer-tags/:id` | 删除标签 | 管理员 |
| `GET` | `/api/v1/admin/customers/summary` | 全局客户分布概览（按状态） | 管理员 |

---

## 前端组件 Props

```tsx
// 我的客户列表
interface CustomerListProps {
  customers: CustomerSummary[];
  filters: CustomerFilters;
  onFilterChange: (filters: Partial<CustomerFilters>) => void;
  onSearch: (q: string) => void;
  onCustomerClick: (userId: number) => void;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onBatchAction: (action: 'tags' | 'status' | 'export' | 'transfer', data?: any) => void;
  pagination: { page: number; total: number; limit: number };
  loading: boolean;
}

// 客户详情页
interface CustomerDetailProps {
  userId: number;
  customer: CustomerDetail;
  stats: CustomerStats;
  notes: ContactNote[];
  callLogs: CallLog[];
  tickets: TicketSummary[];
  onAddNote: (note: Partial<ContactNote>) => Promise<void>;
  onEditNote: (id: number, note: Partial<ContactNote>) => Promise<void>;
  onChangeStatus: (status: string, reason?: string) => Promise<void>;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
}

// 联系记录表单
interface ContactNoteFormProps {
  onSubmit: (note: Partial<ContactNote>) => Promise<void>;
  initial?: Partial<ContactNote>;
  onCancel: () => void;
}
```

---

## 边界条件

| 场景 | 处理方式 |
|------|---------|
| 客户未被任何业务员分配 | 不显示在"我的客户"列表中；管理员先分配归属 |
| 客户被多个业务员同时操作 | 不限制并发编辑，联系记录追加而非覆盖 |
| 客户注销账户 | 客户列表仍保留记录，标记为"已注销"状态 |
| 业务员离职 | 管理员批量转移客户，交接日志完整记录 |
| CSV 导出数据量 > 10000 行 | 异步生成 → 站内通知下载（限 1 小时内下载） |
| 客户标签数超 5 个 | 不允许继续添加，提示"已达上限（5 个）" |

---

## 验收标准

1. 业务员登录后"我的客户"显示自己名下的客户列表
2. 支持按状态/标签/消费区间筛选 + 关键词搜索
3. 客户详情页整合基本信息、消费趋势、联系记录、调用记录、工单历史
4. 业务员可添加/编辑联系记录，设置下次跟进时间
5. 客户标签添加/删除/批量操作正常
6. 客户状态可手动变更，记录变更日志
7. 批量选择客户后可批量添加标签/修改状态/导出 CSV
8. 管理员可将客户批量转移给其他业务员，交接日志可追溯

---

## 关联模块

| 模块 | 关联方式 |
|------|---------|
| §11.2 线索管理 | 线索跟踪用户注册后自动关联为名下客户 |
| §11.3 跟进提醒 | 基于联系记录的 nextFollowUp 触发跟进提醒 |
| §11.5 业绩看板 | 客户数据是业绩看板的来源 |
| §11.8 客户交接 | 客户转移依赖 CRM 客户归属数据 |

---

### [?] 页面帮助
**页面名称**：客户管理（CRM）
**核心操作**：查看名下客户、添加联系记录、管理标签、变更状态、导出数据
**注意事项**：客户转移操作不可逆，转移前请确认目标业务员；状态变更会影响跟进提醒触发

### [?] 按钮级帮助对照表
| 按钮/操作 | 帮助说明 |
|----------|---------|
| 搜索 | 按客户名或邮箱模糊搜索名下客户 |
| 筛选 | 按状态/标签/消费区间筛选客户列表 |
| 添加标签 | 为客户添加标签（最多 5 个），便于分类管理 |
| 添加联系记录 | 记录与客户的沟通内容，设置下次跟进时间 |
| 变更状态 | 手动调整客户阶段（线索/试用/活跃/沉默/流失） |
| 批量导出 | 选中客户后导出为 CSV 文件 |
| 转移客户 | 管理员：将选中客户批量转移给其他业务员 |
