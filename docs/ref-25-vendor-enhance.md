# 深化参考：§25 供应商增强

> **对应**：[`SPEC-§25-供应商增强.md`](SPEC-§25-供应商增强.md)
> **关联**：[`ref-4.3-vendor-model.md`](ref-4.3-vendor-model.md)、[`ref-4.15-vendor-settlement.md`](ref-4.15-vendor-settlement.md)
> **优先级**：P1 | **状态**：需求文档（待开发）
> **最后更新**：2026-07-31

---

## 概述

在现有供应商管理体系（§4.3 供应商与模型管理）基础上，从供应商视角和管理视角补充 4 项核心能力：结算对账、供应商公告、性能排行、自助结算。其中自助结算提供供应商登录端自行申请结算的流程。

---

## §25.1 结算对账

### 数据表结构

```typescript
// vendor_settlements — 供应商结算对账主表
export const vendorSettlements = pgTable("vendor_settlements", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  periodType: varchar("period_type", { length: 10 }).default("monthly"),
    // 'weekly' | 'monthly' | 'quarterly'
  totalCalls: integer("total_calls").default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).default(0),
  totalAmount: numeric("total_amount", { precision: 20, scale: 4 }).default("0"),
    // 以供应商约定币种计
  currency: varchar("currency", { length: 10 }).default("CNY"),
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'confirmed' | 'disputed' | 'settled' | 'cancelled'
  vendorConfirmedAt: timestamp("vendor_confirmed_at"),
  adminConfirmedAt: timestamp("admin_confirmed_at"),
  disputedAt: timestamp("disputed_at"),
  disputeReason: text("dispute_reason"),
  settledAt: timestamp("settled_at"),
  settledAmount: numeric("settled_amount", { precision: 20, scale: 4 }),
    // 实际结算金额（可能有调整）
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// vendor_settlement_details — 结算明细
export const vendorSettlementDetails = pgTable("vendor_settlement_details", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull().references(() => vendorSettlements.id),
  modelId: integer("model_id").notNull().references(() => models.id),
  calls: integer("calls").default(0),
  tokens: bigint("tokens", { mode: "number" }).default(0),
  amount: numeric("amount", { precision: 20, scale: 4 }).default("0"),
  unitPrice: numeric("unit_price", { precision: 20, scale: 8 }),
    // 该周期的单价
  createdAt: timestamp("created_at").defaultNow(),
});
```

### API 接口

```
// 管理端
GET    /api/v1/admin/vendor/settlements           — 结算列表
  params: { vendorId?, status?, periodStart?, periodEnd?, page, limit }
GET    /api/v1/admin/vendor/settlements/:id       — 结算详情（含模型明细）
POST   /api/v1/admin/vendor/settlements/:id/confirm  — 管理员确认
POST   /api/v1/admin/vendor/settlements/:id/dispute  — 标记争议
  body: { reason: string }
POST   /api/v1/admin/vendor/settlements/:id/settle   — 标记已结算
  body: { settledAmount, notes }
GET    /api/v1/admin/vendor/settlements/export    — 导出对账报表(CSV)

// 供应商端（供应商门户）
GET    /api/v1/vendor/settlements                 — 我的结算列表
GET    /api/v1/vendor/settlements/:id             — 结算详情
POST   /api/v1/vendor/settlements/:id/confirm     — 供应商确认
POST   /api/v1/vendor/settlements/:id/dispute     — 供应商发起争议
  body: { reason }
```

### 前端组件

```tsx
<AdminVendorSettlementList
  settlements: VendorSettlement[]
  filters: { vendorId?, status?, dateRange? }
  onFilterChange: (filters) => void
  onConfirm: (id: number) => Promise<void>
  onDispute: (id: number, reason: string) => Promise<void>
  onSettle: (id: number, amount: number) => Promise<void>
  onExport: () => void
/>

<VendorSettlementDetail
  settlement: VendorSettlementDetail
  detailItems: SettlementDetailItem[]
/>

interface VendorSettlement {
  id: number
  vendorId: number
  vendorName: string
  periodStart: string
  periodEnd: string
  totalCalls: number
  totalTokens: number
  totalAmount: number
  currency: string
  status: 'pending' | 'confirmed' | 'disputed' | 'settled' | 'cancelled'
  createdAt: string
}

interface SettlementDetailItem {
  modelId: number
  modelName: string
  calls: number
  tokens: number
  amount: number
  unitPrice: number
}
```

### 状态流转

```
                   管理员生成结算单
                         │
                    ┌────▼──────┐
                    │ 待确认     │
                    │ (pending) │◄────────────────────┐
                    └──┬────┬───┘                     │
                       │    │                         │
                 供应商确认  供应商争议                  │
                       │    │                         │
                  ┌────▼──┐ │                         │
                  │ 确认  │ └──► ┌────────────┐       │
                  │confirmed│     │ 争议中      │       │
                  └──┬─────┘     │ (disputed) │───────┘
                     │           └────────────┘ 解决争议
                     │                     │
               管理员结算            未解决→人工介入
                     │
                 ┌───▼────┐
                 │ 已结算  │
                 │(settled)│
                 └────────┘
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 25.1-1 | 管理员对账确认 | 查看供应商结算数据、核对各模型明细 |
| 25.1-2 | 供应商确认结算 | 在供应商门户确认结算单 |
| 25.1-3 | 争议处理 | 供应商发起争议→管理员审核→调整或驳回 |
| 25.1-4 | 完成结算 | 标记已结算，记入付款台账 |
| 25.1-5 | 导出对账报表 | CSV 格式含标题行、结算聚合、模型明细 |

---

## §25.2 供应商公告

### 数据表结构

```typescript
// vendor_announcements — 供应商公告
export const vendorAnnouncements = pgTable("vendor_announcements", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 30 }).default("general"),
    // 'general' | 'price_change' | 'maintenance' | 'upgrade' | 'incident'
  priority: varchar("priority", { length: 10 }).default("normal"),
    // 'low' | 'normal' | 'high'
  isPinned: boolean("is_pinned").default(false),
  expiresAt: timestamp("expires_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// vendor_announcement_reads — 公告已读记录
export const vendorAnnouncementReads = pgTable("vendor_announcement_reads", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull().references(() => vendorAnnouncements.id),
  userId: integer("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at").defaultNow(),
});
```

### API 接口

```
// 管理端
GET    /api/v1/admin/vendor/announcements         — 公告列表（管理端）
POST   /api/v1/admin/vendor/announcements         — 创建公告
  body: { vendorId, title, content, category, priority, isPinned, expiresAt }
PUT    /api/v1/admin/vendor/announcements/:id     — 编辑公告
DELETE /api/v1/admin/vendor/announcements/:id     — 删除公告

// 供应商端
GET    /api/v1/vendor/announcements               — 公告列表（供应商端，仅自己的）
GET    /api/v1/vendor/announcements/unread-count  — 未读公告数
POST   /api/v1/vendor/announcements/:id/read      — 标记已读
```

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 25.2-1 | 管理员发布公告 | 指定目标供应商、分类、优先级 |
| 25.2-2 | 供应商查看公告 | 显示所有面向自己的公告，置顶优先 |
| 25.2-3 | 未读计数 | 公告未读时右上角小红点提示 |
| 25.2-4 | 公告过期 | 过期公告自动隐藏，不显示 |

---

## §25.3 性能排行（已存在）

### 数据来源

```
厂商健康检查 → vendor_health_check_records → F1 评分聚合 → 排名
```

### 排行指标

| 指标 | 权重 | 数据源 | 更新频率 |
|------|------|--------|---------|
| API 可用率（本月）| 40% | health_check_records | T+1 |
| 平均响应时间 | 25% | api_call_logs | 实时/日汇总 |
| 错误率（本月）| 20% | api_call_logs | T+1 |
| 并发支持能力 | 10% | 供应商上报/实测 | 月度 |
| 合规与稳定性 | 5% | 运营手动评估 | 月度 |

### API 接口

```
GET    /api/v1/admin/vendor/ranking               — 供应商综合排行
  params: { periodType: 'weekly'|'monthly', page, limit }
GET    /api/v1/admin/vendor/ranking/:vendorId     — 某供应商评分详情
GET    /api/v1/vendor/ranking                     — 供应商端查看自己排名+维度评分
```

### 前端组件（管理端已存在）

```tsx
<AdminVendorRanking
  rankings: VendorRank[]
  periodType: 'weekly' | 'monthly'
  onPeriodChange: (type) => void
  onVendorClick: (id: number) => void  // 查看评分详情
/>

interface VendorRank {
  vendorId: number
  vendorName: string
  rank: number
  prevRank: number
  score: number
  availability: number
  avgResponseTime: number
  errorRate: number
  concurrentSupport: number
  stability: number
}
```

---

## §25.4 自助结算

### 数据表结构

```typescript
// vendor_self_settlement_requests — 自助结算申请
export const vendorSelfSettlementRequests = pgTable("vendor_self_settlement_requests", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  settlementId: integer("settlement_id").references(() => vendorSettlements.id),
  requestType: varchar("request_type", { length: 20 }).default("auto"),
    // 'auto' | 'manual'  — auto: 系统按账期自动生成员; manual: 供应商手动申请
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  totalCalls: integer("total_calls").default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).default(0),
  estimatedAmount: numeric("estimated_amount", { precision: 20, scale: 4 }),
  status: varchar("status", { length: 20 }).default("pending"),
    // 'pending' | 'approved' | 'rejected' | 'cancelled'
  adminNote: text("admin_note"),
  processedBy: integer("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### API 接口

```
GET    /api/v1/vendor/self-settlement/eligibility  — 查看结算资格（最低金额/上次结算日）
POST   /api/v1/vendor/self-settlement              — 发起自助结算申请
GET    /api/v1/vendor/self-settlement/history      — 自助结算历史
  params: { status?, page, limit }

// 管理端审核
GET    /api/v1/admin/vendor/self-settlement        — 自助结算申请列表
POST   /api/v1/admin/vendor/self-settlement/:id/approve  — 批准
POST   /api/v1/admin/vendor/self-settlement/:id/reject   — 拒绝（填理由）
```

### 资格规则

| 条件 | 说明 |
|------|------|
| 最低结算金额 | 供应商累计待结算金额 ≥ ¥100 |
| 结算周期 | 距上次结算至少 30 天 |
| 供应商状态 | 供应商状态为 active（非暂停/下线）|
| 争议工单 | 无未处理争议 |
| 合作时长 | 入驻 ≥ 30 天 |
| 数据完整 | 最近 7 天无计费异常 |

### 验收标准

| # | 用例 | 预期 |
|---|------|------|
| 25.4-1 | 供应商查看结算资格 | 显示是否满足条件，不满足时提示原因 |
| 25.4-2 | 供应商发起结算申请 | 系统计算预估金额，提交审核 |
| 25.4-3 | 管理员审核申请 | 查看结算数据→批准或拒绝 |
| 25.4-4 | 申请被拒 | 供应商查看拒绝原因，可调整后重新申请 |
| 25.4-5 | 自动结算 | 到账期后系统自动生成结算单 |

---

## 边界条件

| # | 场景 | 处理方式 |
|---|------|---------|
| VEN-001 | 结算有争议时同时执行了批次确认 | 已确认的结算不可争议；需走手动调整流程 |
| VEN-002 | 供应商在结算期间发生价格变更 | 结算按合同单价计算，价格变更从下一周期生效 |
| VEN-003 | 公告发布后供应商已读率低于设置阈值 | 管理员收到通知，可选追加公告或单独联系 |
| VEN-004 | 自助结算金额远低于供应商期望 | 展示详细计算过程和调用明细供核对 |
| VEN-005 | 结算对账数据量过大（百万级记录） | 使用异步汇总任务生成结算单，不可前端实时计算 |
| VEN-006 | 供应商同时申请多个账期 | 仅允许申请距最后结算日最近的一个账期 |
| VEN-007 | 公告发布时供应商为 inactive | 不发送通知；供应商重新激活后看到历史公告 |

---

## 上下游关系

```
§25 供应商增强:
  ├── §25.1 结算对账: vendorSettlements/details → §5.2 计费引擎 → 对账工作台
  ├── §25.2 供应商公告: vendorAnnouncements → 通知服务 → 站内+邮件
  ├── §25.3 性能排行: ref-4.3 健康检查数据 → 评价聚合服务
  ├── §25.4 自助结算: vendorSelfSettlement → §25.1 结算单 → §4.4 财务管理
  └── 管理端: admin API → ref-4.15-vendor-settlement（现有管理端结算功能）
```
