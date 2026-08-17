# 供应商结算管理 — 深化参考文档

> **对应章节**：[PRD-README.md §4.4 财务管理](../PRD-README.md#44-财务管理) — 深化模块
> **状态**：已深化完成 ✅ | **版本**：v2.0 | **最后更新**：2026-07-28
> **定位**：平台向供应商采购 API 能力的月度结算对账体系，包含结算单生成、对账确认、争议处理、付款管理全流程。
> **设计原则**：与用户侧计费引擎共享调用数据源，结算数据可作为供应商对账的官方依据。
> **粒度**：数据模型 → 结算流程 → API → 组件 Props → 运营配置 → 边界条件 → 验收标准

---

## 目录

1. [数据表结构](#1-数据表结构)
2. [结算周期管理](#2-结算周期管理)
3. [结算单生成引擎](#3-结算单生成引擎)
4. [结算对账工作流](#4-结算对账工作流)
5. [争议处理全流程](#5-争议处理全流程)
6. [供应商付款管理](#6-供应商付款管理)
7. [汇率与多币种处理](#7-汇率与多币种处理)
8. [API 接口规格](#8-api-接口规格)
9. [前端组件 Props](#9-前端组件-props)
10. [运营配置项](#10-运营配置项)
11. [边界条件](#11-边界条件)
12. [验收标准](#12-验收标准)
13. [交叉引用](#13-交叉引用)

---

## 1. 数据表结构

### 1.1 `vendor_settlement_cycles` — 供应商结算周期

```typescript
export const vendorSettlementCycles = pgTable("vendor_settlement_cycles", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  period: varchar("period", { length: 7 }).notNull(),              // "2026-07"
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending → generating → generated → confirming → confirmed → disputing → disputed → settling → settled → closed
  totalCost: bigint("total_cost", { mode: "number" }).notNull().default(0),      // 总成本(分)
  platformProfit: bigint("platform_profit", { mode: "number" }).notNull().default(0), // 平台毛利(分)，结算时对照
  totalCalls: integer("total_calls").notNull().default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
  exchangeRate: decimal("exchange_rate", { precision: 12, scale: 6 }).notNull().default("1.000000"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  settledBy: integer("settled_by").references(() => users.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  disputedAt: timestamp("disputed_at", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
  disputeResolution: text("dispute_resolution"),
  disputeResolvedAt: timestamp("dispute_resolved_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  vendorPeriodUnique: uniqueIndex("uk_vendor_period").on(table.vendorId, table.period),
  vendorSettlementCyclesStatusIdx: index("vendor_settlement_cycles_status_idx").on(table.status),
  vendorSettlementCyclesVendorIdx: index("vendor_settlement_cycles_vendor_idx").on(table.vendorId),
}));
```

### 1.2 `vendor_settlement_details` — 结算明细

```typescript
export const vendorSettlementDetails = pgTable("vendor_settlement_details", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => vendorSettlementCycles.id, { onDelete: "cascade" }),
  vendorModelId: integer("vendor_model_id").notNull().references(() => vendorModels.id),
  modelName: varchar("model_name", { length: 128 }).notNull(),     // 冗余，快照值
  modelProvider: varchar("model_provider", { length: 64 }),        // 冗余，供应商侧模型名
  totalCalls: integer("total_calls").notNull().default(0),
  successCalls: integer("success_calls").notNull().default(0),
  failedCalls: integer("failed_calls").notNull().default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  cachedTokens: bigint("cached_tokens", { mode: "number" }).notNull().default(0),  // 缓存命中 Token
  freeTokens: bigint("free_tokens", { mode: "number" }).notNull().default(0),      // 免费额度部分
  unitPriceInput: bigint("unit_price_input", { mode: "number" }).notNull(),        // 输入单价(分/1K tokens)
  unitPriceOutput: bigint("unit_price_output", { mode: "number" }).notNull(),      // 输出单价(分/1K tokens)
  unitPriceCache: bigint("unit_price_cache", { mode: "number" }).notNull().default(0), // 缓存单价(分/1K tokens)
  costInput: bigint("cost_input", { mode: "number" }).notNull().default(0),        // 输入成本
  costOutput: bigint("cost_output", { mode: "number" }).notNull().default(0),      // 输出成本
  costCache: bigint("cost_cache", { mode: "number" }).notNull().default(0),        // 缓存成本
  costTotal: bigint("cost_total", { mode: "number" }).notNull().default(0),        // total = costInput + costOutput - costCache
  discount: integer("discount").default(0),                                        // 折扣金额(分)
  discountReason: varchar("discount_reason", { length: 256 }),
  finalCost: bigint("final_cost", { mode: "number" }).notNull().default(0),        // 折后成本 = costTotal - discount
  currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
}, (table) => ({
  vendorSettlementDetailsCycleIdx: index("v_settlement_details_cycle_idx").on(table.cycleId),
  vendorSettlementDetailsModelIdx: index("v_settlement_details_model_idx").on(table.vendorModelId),
}));
```

### 1.3 `vendor_payments` — 供应商付款记录

```typescript
export const vendorPayments = pgTable("vendor_payments", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  cycleIds: integer("cycle_ids").array().notNull().default([]),     // 关联的结算单ID列表（支持多单合并付款）
  amount: bigint("amount", { mode: "number" }).notNull(),           // 支付金额(分)
  amountCurrency: varchar("amount_currency", { length: 8 }).notNull().default("CNY"),
  exchangeRate: decimal("exchange_rate", { precision: 12, scale: 6 }).notNull().default("1.000000"),
  paymentMethod: varchar("payment_method", { length: 32 }).notNull(), // bank_transfer | alipay | wechat | crypto | other
  paymentReference: varchar("payment_reference", { length: 128 }),    // 银行流水号/支付凭证号
  proofUrl: varchar("proof_url", { length: 1024 }),                   // 支付凭证附件URL
  proofFileId: integer("proof_file_id").references(() => uploadFiles.id), // 文件ID
  note: text("note"),
  status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | processing | completed | failed | refunded
  paidAt: timestamp("paid_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  vendorPaymentsVendorIdx: index("vendor_payments_vendor_idx").on(table.vendorId),
  vendorPaymentsCycleIdx: index("vendor_payments_cycle_idx").on(table.cycleIds),
  vendorPaymentsStatusIdx: index("vendor_payments_status_idx").on(table.status),
}));
```

### 1.4 `vendor_settlement_disputes` — 争议记录

```typescript
export const vendorSettlementDisputes = pgTable("vendor_settlement_disputes", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => vendorSettlementCycles.id, { onDelete: "cascade" }),
  round: integer("round").notNull().default(1),                     // 第几轮争议
  raisedBy: integer("raised_by").notNull().references(() => users.id),
  disputeType: varchar("dispute_type", { length: 32 }).notNull(),   // call_count | token_count | unit_price | discount | other
  description: text("dispute_description").notNull(),
  evidence: varchar("evidence", { length: 1024 }),                  // 证据附件URL
  expectedAdjustment: bigint("expected_adjustment", { mode: "number" }).default(0), // 期望调整金额(分)
  resolution: text("resolution"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  status: varchar("status", { length: 16 }).notNull().default("open"), // open | resolved | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 1.5 `vendor_settlement_snapshots` — 结算快照（审计用）

用于记录结算单生成时点的关键数据快照，供后续审计追溯。

```typescript
export const vendorSettlementSnapshots = pgTable("vendor_settlement_snapshots", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => vendorSettlementCycles.id, { onDelete: "cascade" }),
  snapshotType: varchar("snapshot_type", { length: 24 }).notNull(), // call_logs_checkpoint | vendor_prices_checkpoint
  snapshotData: jsonb("snapshot_data").notNull(),                   // 快照内容
  checksum: varchar("checksum", { length: 64 }),                    // SHA-256 校验和
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. 结算周期管理

### 2.1 结算频次

| 频次 | 说明 | 适用场景 | 配置项 |
|------|------|---------|--------|
| 月度 | 每月 1 日自动生成上月结算单 | 默认，多数供应商 | `settlement_frequency` |
| 半月度 | 每月 1 日和 16 日生成 | 高流水供应商 | 按供应商设置 |
| 周度 | 每周一生成 | 大流量供应商需快速对账 | 按供应商设置 |
| 手动 | 管理员手动触发 | 新接入供应商测试期 | 按供应商设置 |

**优先级**：按供应商配置 > 全局默认（月度）

### 2.2 结算周期生成

**触发方式**：
- **自动**：cron 按配置频次执行（默认每月 1 日 00:05）
- **手动**：管理员在结算列表页点击"生成结算单"

**生成逻辑**（完整执行步骤）：

```
Step 1: 确定周期
  └─ periodStart = 上周期末(或月初), periodEnd = 当前日期前一日 23:59:59

Step 2: 检查重复
  └─ 查询 vendor_settlement_cycles (vendorId, period) 是否已存在
  └─ 已存在 → 跳过该供应商（如需重新生成需先删除旧单）

Step 3: 创建周期记录
  └─ INSERT vendor_settlement_cycles (status='generating')

Step 4: 记录调用快照
  └─ 记录当前 call_logs 中该供应商最后一条记录的时间戳和 ID
  └─ 写入 vendor_settlement_snapshots (type='call_logs_checkpoint')

Step 5: 数据聚合
  └─ SELECT * FROM call_logs
  └─ WHERE vendor_id = X AND created_at BETWEEN periodStart AND periodEnd
  └─ AND status IN ('success', 'failed')
  └─ GROUP BY vendor_model_id

Step 6: 成本计算
  └─ 读取 vendor_models 表中各模型的 inputPrice / outputPrice（成本价）
  └─ 缓存价格快照到 vendor_settlement_snapshots (type='vendor_prices_checkpoint')
  └─ costInput = round(inputTokens / 1000.0 * unitPriceInput)
  └─ costOutput = round(outputTokens / 1000.0 * unitPriceOutput)
  └─ costTotal = costInput + costOutput
  └─ 汇率换算：非CNY供应商 × exchangeRate

Step 7: 写入明细
  └─ 逐模型 INSERT vendor_settlement_details

Step 8: 汇总更新
  └─ UPDATE vendor_settlement_cycles SET
      totalCost = SUM(details.finalCost),
      totalCalls = SUM(details.totalCalls),
      totalTokens = SUM(details.totalTokens),
      status = 'generated',
      generatedAt = now()

Step 9: 平台毛利对照
  └─ 查询同期用户消费总金额（consumption_logs）
  └─ platformProfit = 用户总收入 - 供应商成本
  └─ 写入 vendor_settlement_cycles.platformProfit

Step 10: 通知
  └─ 站内信通知财务管理员："XX供应商YY月度结算单已生成，金额¥ZZZ"
```

---

## 3. 结算单生成引擎

### 3.1 引擎架构

```
结算定时任务(cron)
    │
    ├─ SettlementGenerator.run()
    │   ├─ 遍历所有活跃供应商
    │   ├─ 检查频次是否到期
    │   ├─ 调用 generateForVendor(vendorId, period)
    │   └─ 结果写入 events_queue
    │
    └─ 手动触发接口
        └─ POST /api/v1/admin/finance/vendor-settlements/generate
            └─ 支持参数：vendorIds[], period
```

### 3.2 数据类型补充

**生成引擎输入**：

```typescript
interface GenerateSettlementInput {
  vendorIds?: number[];           // 不传则全量
  period?: string;                // "2026-07"，不传则自动计算
  forceRegenerate?: boolean;      // 是否覆盖已有结算单（默认false）
}
```

**生成引擎输出**：

```typescript
interface GenerateSettlementResult {
  totalVendors: number;
  succeeded: number;
  failed: number;
  results: {
    vendorId: number;
    vendorName: string;
    cycleId: number;
    status: "created" | "skipped" | "error";
    error?: string;
    totalCost?: number;
    totalCalls?: number;
  }[];
}
```

### 3.3 性能考虑

- 单供应商单周期聚合查询必须在 5 秒内完成
- 前置建索引：`call_logs(vendor_id, created_at, vendor_model_id)`
- 调用量极大的供应商（月 > 1000 万条），自动分片查询（按周分片再合并）
- 生成过程中如遇供应商 API 成本价未配置，标记为 `error` 并跳过

---

## 4. 结算对账工作流

### 4.1 完整状态机

```
                    ┌───────────────────────────────────────┐
                    │                                       │
                    │          ┌───────────┐               │
                    │    ┌────│  pending   │               │
                    │    │    └─────┬─────┘               │
                    │    │          │ 生成结算单           │
                    │    │          ▼                     │
                    │    │    ┌───────────┐               │
                    │    │    │ generating│               │
                    │    │    └─────┬─────┘               │
                    │    │          │ 完成生成             │
                    │    │          ▼                     │
                    │    │    ┌───────────┐               │
                    │    ├───│ generated │────┐           │
                    │    │    └─────┬─────┘   │           │
                    │    │          │         │           │
                    │    │    ┌─────┴─────┐   │           │
                    │    │    │           │   │           │
                    │    │    ▼           ▼   │           │
                    │    │ ┌────────┐ ┌──────────┐        │
                    │    │ │confirm-│ │disputing│         │
                    │    │ │ ing    │ └────┬─────┘        │
                    │    │ └────┬───┘      │              │
                    │    │      │         │              │
                    │    │      ▼         ▼              │
                    │    │ ┌────────┐ ┌──────────┐       │
                    │    │ │confirm-│ │ disputed │       │
                    │    │ │ ed     │ └────┬─────┘       │
                    │    │ └────┬───┘      │             │
                    │    │      │         │ 解决争议      │
                    │    │      ▼         ▼             │
                    │    │ ┌────────┐ ┌──────────┐       │
                    │    │ │settling│ │ confirmed │      │
                    │    │ └────┬───┘ └──────────┘       │
                    │    │      │                        │
                    │    │      ▼                        │
                    │    │ ┌──────────┐                  │
                    │    └─│ settled  │                  │
                    │       └────┬─────┘                 │
                    │            │                       │
                    │            ▼                       │
                    │       ┌──────────┐                 │
                    │       │  closed  │                 │
                    │       └──────────┘                 │
                    └───────────────────────────────────────┘
```

### 4.2 各状态操作权限

| 状态 | 可执行操作 | 操作角色 | 触发动作 |
|------|-----------|---------|---------|
| pending | 生成结算单 | finance / admin | POST generate |
| generating | 无（系统处理中） | — | 完成后自动到 generated |
| generated | 确认 / 标记争议 / 重新生成 | finance | POST confirm / dispute |
| confirming | 无（系统处理中） | — | 完成后到 confirmed |
| confirmed | 记录付款 / 发送供应商确认 | finance | POST payment / POST notify-vendor |
| disputing | 无（系统处理中） | — | 完成后到 disputed |
| disputed | 解决争议 / 拒绝争议 | finance / admin | POST resolve-dispute / reject-dispute |
| settling | 无（系统处理中） | — | 完成后到 settled |
| settled | 关闭 | finance / admin | POST close |
| closed | 仅查看 | finance / admin | — |

### 4.3 确认流程

**自动确认条件**（可直接跳过人工确认）：

```
符合以下所有条件 → 系统自动标记 confirmed：
  1. 结算金额 < ¥10,000
  2. 调用成功率 > 95%
  3. 无未处理的争议
  4. 该供应商已连续结算 3 次以上无争议
  
否则 → 需 finance 角色人工确认
```

**人工确认步骤**：

```
1. 打开结算单详情，核对模型明细数据
2. 如数据无误 → 点击"确认结算单"
3. 系统弹出二次确认弹窗，展示汇总数据
4. 点击"确认" → 状态变为 confirmed
5. 系统记录 operatorId、confirmedAt
```

### 4.4 结算单通知供应商

**通知方式**：
- 系统自动发送结算单摘要邮件至供应商联系人邮箱（需在 vendor 表中配置 `contactEmail`）
- 邮件内容：结算周期、总金额、模型明细摘要、PDF 附件
- 供应商可回复争议或通过平台入口查看

---

## 5. 争议处理全流程

### 5.1 争议触发场景

| 场景 | 典型原因 | 处理策略 |
|------|---------|---------|
| 调用量差异 | 平台统计与供应商对账单不一致 | 核对 call_logs，以平台数据为准，若供应商有证据则按证据调整 |
| Token 计量差异 | 双方 Token 计数算法不同 | 按供应商计价规范重新核算 |
| 单价不符 | 合同价格与系统配置价不一致 | 检查 vendor_models 配置，如配置错误需修正后重新生成 |
| 折扣未生效 | 双方约定的批量折扣未体现在结算单 | 补充 discount 字段记录，需审批确认 |
| 缓存计费 | 缓存命中的 Token 按不同单价计算 | 检查 `vendor_pricing.cache_discount_rate`（模型级）与 `system_config.billing.cache_hit_discount`（全局默认 0.1）是否与合同一致 |

### 5.2 争议处理流程（完整版）

```
Step 1: 管理员标记争议
  └─ 在结算单详情页点击"标记争议"
  └─ 填写：争议类型、描述、证据附件URL、期望调整金额
  └─ INSERT vendor_settlement_disputes (round=1)
  └─ 状态变为 disputed

Step 2: 内部核实
  └─ 管理员查看争议详情
  └─ 查询原始 call_logs 数据验证
  └─ 如平台数据正确 → 驳回争议（记录驳回理由）
  └─ 如确实有误 → 进入调整

Step 3: 调整处理
  └─ 管理员在结算单详情页手动修改模型明细
  └─ 可选：调整具体模型的 cost / discount
  └─ 修改原因必须填写（写入 operation_logs）
  └─ 系统自动重算 totalCost

Step 4: 争议关闭
  └─ 选择 resolved（接受调整）或 rejected（驳回）
  └─ 填写 resolution 描述
  └─ UPDATE dispute SET status, resolvedAt
  └─ 如 unresolved → 允许发起第二轮争议（round++）

Step 5: 续争议（Round 2+）
  └─ 如双方对第一轮结果不满，可发起第二轮
  └─ 需要 super_admin 介入仲裁
  └─ round = previousRound + 1

Step 6: 状态恢复
  └─ 争议解决后 → 管理员点击"确认结算单"
  └─ 进入 confirmed 状态
  └─ 通知双方争议解决结果
```

### 5.3 争议中的货款处理

```
争议金额 < 总金额 20%：
  └─ 非争议部分先行付款
  └─ 争议部分冻结，待解决后支付

争议金额 >= 总金额 20%：
  └─ 整单冻结，待争议解决后全额支付
```

---

## 6. 供应商付款管理

### 6.1 付款工作流

```
确认结算单(confirmed)
    │
    ├─ 管理员记录付款信息
    │   ├─ 支付方式：银行转账 / 支付宝 / 微信 / 加密币
    │   ├─ 金额（支持多币种）
    │   ├─ 银行流水号/支付凭证号
    │   ├─ 上传支付凭证截图/文件
    │   └─ 备注（可选）
    │
    ├─ 插入 vendor_payments (status='pending')
    │
    ├─ 线下执行转账
    │
    ├─ 管理员标记"已完成"
    │   ├─ 状态 → completed
    │   └─ 记录 paidAt
    │
    ├─ 自动更新结算单
    │   ├─ vendor_settlement_cycles.status → settled
    │   ├─ settledAt = now()
    │   └─ settledBy = operatorId
    │
    └─ 通知
        └─ 财务通知："XX供应商YY月结算 ¥ZZZ 已付款"
```

### 6.2 合并付款

支持多期结算单合并一笔支付：

```
操作：
  └─ 在付款记录编辑页勾选多期结算单（checkboxes）
  └─ 合并金额 = SUM(各期结算单 totalCost)
  └─ 填写一笔支付信息
  └─ cycleIds = [id1, id2, ...]
  
后续处理：
  └─ 各关联结算单状态均变为 settled
  └─ 付款记录 page 展示"关联结算单"链接
```

### 6.3 部分付款

支持对单张结算单分批付款：

```typescript
interface PartialPayment {
  amount: number;           // 本次支付金额(分)
  paymentMethod: string;
  paymentReference: string;
  note: string;             // 注明"第一批/第二批"
}
```

部分付款后结算单仍为 `confirmed` 状态，全部付清后自动变为 `settled`。

### 6.4 付款统计

**路径**：`/admin/finance/vendor-payments/stats`

| 指标 | 计算方式 | 图表类型 |
|------|---------|---------|
| 月度应付总额 | SUM(confirmed 结算单 totalCost) | 柱状图(月度) |
| 月度已付总额 | SUM(completed 付款记录 amount) | 柱状图(月度) |
| 待付余额 | 应付 - 已付 | 数字卡片 |
| 各供应商应付分布 | 按供应商 GROUP BY | 饼图 |
| 逾期未付 | 结算单 confirmed 超过 30 天未 settled | 红色告警列表 |
| 月均付款周期 | 从 generated 到 completed 平均天数 | 趋势折线图 |

---

## 7. 汇率与多币种处理

### 7.1 汇率管理

**汇率来源**：
- 优先使用供应商合同约定的固定汇率（写入 vendors.agreedExchangeRate）
- 未约定则使用系统配置默认汇率（site_configs.default_exchange_rate）
- 支持手动输入当期汇率

**汇率使用时机**：
- 结算单生成时，统一按生成日的汇率折算为人民币记账
- 付款时按实际付款日的汇率计算

**汇率记录**：
- 每次结算单生成时冻结当时汇率（snapshot）
- 汇率写入 vendor_settlement_cycles.exchangeRate

### 7.2 多币种结算约束

| 币种 | 支持程度 | 说明 |
|------|---------|------|
| CNY | ✅ 全支持 | 默认结算币种 |
| USD | ✅ 支持 | 需要配置 `vendor.currency='USD'` + 汇率 |
| EUR | ⚠️ 支持 | 同 USD，需汇率 |
| HKD | ⚠️ 支持 | 同 USD，需汇率 |
| 加密币 | ❌ 不支持 | 结算单仍以法币计价，支付时可兑换 |

### 7.3 汇兑损益处理

```
场景：结算时汇率与付款时汇率不一致
处理：
  └─ 差异金额 < ¥50 或 < 总金额 0.1% → 忽略，以结算单金额为准
  └─ 差异超过阈值 → 在付款备注中注明汇兑损益
  └─ 汇兑损益分录入账（positive = 收益, negative = 损失）
```

---

## 8. API 接口规格

### 8.1 结算周期管理

| 方法 | 路径 | 说明 | 权限 | 分页 | 缓存 |
|------|------|------|------|------|------|
| GET | `/api/v1/admin/finance/vendor-settlements` | 结算单列表 | FINANCE_VIEW | ✅ 20/页 | — |
| POST | `/api/v1/admin/finance/vendor-settlements/generate` | 手动生成结算单 | FINANCE_EDIT | — | TTL 0 |
| GET | `/api/v1/admin/finance/vendor-settlements/:id` | 结算单详情 | FINANCE_VIEW | — | TTL 60s |
| GET | `/api/v1/admin/finance/vendor-settlements/:id/export` | 导出PDF | FINANCE_VIEW | — | — |
| GET | `/api/v1/admin/finance/vendor-settlements/stats` | 结算统计 | FINANCE_VIEW | — | TTL 300s |

**GET 结算单列表参数**：

```typescript
interface QueryVendorSettlements {
  vendorId?: number;
  period?: string;         // "2026-07"
  status?: string;         // pending | generated | confirmed | disputed | settled | closed
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}
```

**响应格式**：

```typescript
interface VendorSettlementListResponse {
  items: {
    id: number;
    vendorId: number;
    vendorName: string;
    period: string;
    totalCost: number;         // 分
    totalCostDisplay: string;  // "¥45,678.90"
    totalCalls: number;
    totalTokens: number;
    status: string;
    statusLabel: string;       // "待结算" / "已生成" / "已确认" / "争议中" / "已结算" / "已关闭"
    generatedAt: string;
    confirmedAt?: string;
    disputedAt?: string;
    settledAt?: string;
    currency: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
}
```

### 8.2 结算单确认与争议

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/finance/vendor-settlements/:id/confirm` | 确认结算单 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-settlements/:id/dispute` | 标记争议 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-settlements/:id/resolve-dispute` | 解决争议 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-settlements/:id/settle` | 标记已结算 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-settlements/:id/close` | 关闭（不可逆）| FINANCE_EDIT |

**POST confirm 请求体**：

```typescript
interface ConfirmSettlementInput {
  note?: string;               // 确认备注
}
```

**POST dispute 请求体**：

```typescript
interface DisputeSettlementInput {
  disputeType: "call_count" | "token_count" | "unit_price" | "discount" | "other";
  description: string;
  evidence?: string;           // 附件URL
  expectedAdjustment?: number; // 期望调整金额(分)
}
```

### 8.3 付款管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/finance/vendor-payments` | 付款记录列表 | FINANCE_VIEW |
| POST | `/api/v1/admin/finance/vendor-payments` | 创建付款记录 | FINANCE_EDIT |
| PATCH | `/api/v1/admin/finance/vendor-payments/:id` | 编辑付款记录 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-payments/:id/complete` | 标记已完成 | FINANCE_EDIT |
| POST | `/api/v1/admin/finance/vendor-payments/:id/fail` | 标记失败 | FINANCE_EDIT |
| DELETE | `/api/v1/admin/finance/vendor-payments/:id` | 删除付款记录 | FINANCE_EDIT |
| GET | `/api/v1/admin/finance/vendor-payments/stats` | 付款统计 | FINANCE_VIEW |

**POST 创建付款记录**：

```typescript
interface CreatePaymentInput {
  vendorId: number;
  cycleIds: number[];
  amount: number;
  amountCurrency?: string;      // 默认 CNY
  exchangeRate?: number;
  paymentMethod: string;
  paymentReference?: string;
  proofFileId?: number;
  note?: string;
}
```

### 8.4 争议记录

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/finance/vendor-settlements/:id/disputes` | 争议记录列表 | FINANCE_VIEW |
| POST | `/api/v1/admin/finance/vendor-settlements/:id/disputes` | 新增争议 | FINANCE_EDIT |

### 8.5 汇率管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/finance/exchange-rates` | 汇率列表 | FINANCE_VIEW |
| POST | `/api/v1/admin/finance/exchange-rates` | 设置汇率 | FINANCE_EDIT |

---

## 9. 前端组件 Props

### 9.1 VendorSettlementList — 结算单列表

```typescript
interface VendorSettlementListProps {
  // 页面级路由组件
}

interface SettlementFilterBarProps {
  vendors: { id: number; name: string }[];
  statuses: { value: string; label: string }[];
  onFilter: (filters: SettlementFilters) => void;
}

interface SettlementFilters {
  vendorId?: number;
  period?: string;
  status?: string;
  dateRange?: [string, string];
}

interface SettlementTableProps {
  items: VendorSettlementItem[];
  loading: boolean;
  onGenerate: () => void;
  onViewDetail: (id: number) => void;
}

interface VendorSettlementItem {
  id: number;
  vendorName: string;
  period: string;
  totalCostDisplay: string;
  totalCalls: number;
  totalTokens: number;
  status: string;
  statusLabel: string;
  statusColor: string;       // 状态颜色
  generatedAt: string;
  confirmedAt?: string;
}

// 状态颜色映射
const SETTLEMENT_STATUS_COLORS: Record<string, string> = {
  pending:    "#909399",    // 灰色
  generated:  "#409EFF",    // 蓝色
  confirmed:  "#67C23A",    // 绿色
  disputed:   "#E6A23C",    // 橙色
  settled:    "#67C23A",    // 绿色
  closed:     "#909399",    // 灰色
};
```

### 9.2 VendorSettlementDetail — 结算单详情

```typescript
interface VendorSettlementDetailProps {
  cycleId: number;
}

interface SettlementSummaryCardProps {
  vendorName: string;
  period: string;
  status: string;
  statusLabel: string;
  totalCostDisplay: string;
  totalCalls: number;
  totalTokens: number;
  platformProfit: number;
  currency: string;
  generatedAt: string;
  confirmedAt?: string;
  settledAt?: string;
  disputeStatus?: string;
}

interface SettlementDetailTableProps {
  details: SettlementDetailItem[];
  loading: boolean;
  onEditDiscount: (detailId: number) => void;
}

interface SettlementDetailItem {
  id: number;
  modelName: string;
  modelProvider?: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  unitPriceInput: number;     // 分/1K tokens
  unitPriceOutput: number;
  costInput: number;
  costOutput: number;
  costTotal: number;
  discount: number;
  discountReason?: string;
  finalCost: number;
  currency: string;
}

interface PaymentRecordsCardProps {
  payments: PaymentRecordItem[];
  onAddPayment: () => void;
  onEditPayment: (paymentId: number) => void;
  onCompletePayment: (paymentId: number) => void;
}

interface PaymentRecordItem {
  id: number;
  amount: number;
  amountDisplay: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  paymentReference?: string;
  proofUrl?: string;
  status: string;
  statusLabel: string;
  paidAt?: string;
  note?: string;
}

interface DisputeTimelineProps {
  disputes: DisputeRecord[];
  onAddDispute: () => void;
}

interface DisputeRecord {
  id: number;
  round: number;
  disputeType: string;
  disputeTypeLabel: string;
  description: string;
  evidence?: string;
  expectedAdjustment?: number;
  status: string;
  raisedByName: string;
  createdAt: string;
  resolution?: string;
  resolvedAt?: string;
}
```

### 9.3 VendorPaymentEditor — 付款编辑

```typescript
interface VendorPaymentEditorProps {
  mode: "create" | "edit";
  initialData?: Partial<VendorPaymentFormData>;
  onSave: (data: VendorPaymentFormData) => Promise<void>;
  onCancel: () => void;
}

interface VendorPaymentFormData {
  vendorId: number;
  cycleIds: number[];
  amount: number;                   // 元
  amountCurrency: string;
  exchangeRate?: number;
  paymentMethod: string;
  paymentReference?: string;
  proofFileId?: number;
  note?: string;
}

// 支付方式选项
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "银行转账" },
  { value: "alipay", label: "支付宝" },
  { value: "wechat", label: "微信" },
  { value: "other", label: "其他" },
];
```

### 9.4 SettlementDisputeEditor — 争议编辑组件

```typescript
interface SettlementDisputeEditorProps {
  cycleId: number;
  currentRound: number;
  onSubmitted: () => void;
  onCancel: () => void;
}

interface DisputeFormData {
  disputeType: string;
  description: string;
  evidence?: string;
  expectedAdjustment?: number;
}

const DISPUTE_TYPES = [
  { value: "call_count",    label: "调用量差异" },
  { value: "token_count",   label: "Token 计量差异" },
  { value: "unit_price",    label: "单价不符" },
  { value: "discount",      label: "折扣未生效" },
  { value: "other",         label: "其他" },
];
```

### 9.5 ExchangeRateEditor — 汇率编辑

```typescript
interface ExchangeRateEditorProps {
  rates: ExchangeRateItem[];
  onSave: (rates: ExchangeRateItem[]) => Promise<void>;
}

interface ExchangeRateItem {
  currency: string;
  currencyLabel: string;    // "CNY - 人民币"
  rate: number;
  validFrom: string;
  source: "contract" | "manual" | "auto";
}
```

---

## 10. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 全局结算频次 | `site_configs.settlement.frequency` | enum | `monthly` | monthly / biweekly / weekly |
| 自动结算日 | `site_configs.settlement.auto_day` | int | 1 | 每月第几天触发自动结算 |
| 自动结算时间 | `site_configs.settlement.auto_time` | string | `00:05` | HH:mm 格式 |
| 自动确认阈值 | `site_configs.settlement.auto_confirm_threshold` | int | 10000 | 低于此金额自动确认(元) |
| 逾期天数 | `site_configs.settlement.overdue_days` | int | 30 | 超过此天数未付标记逾期 |
| 争议占比冻结线 | `site_configs.settlement.dispute_freeze_ratio` | decimal | 0.20 | 争议金额超过此比例整单冻结 |
| 默认汇率 | `site_configs.settlement.default_exchange_rate` | decimal | 1.000000 | USD→CNY |
| 汇兑损益忽略阈值 | `site_configs.settlement.fx_ignore_amount` | decimal | 50 | 汇兑损益低于此忽略(元) |
| 结算通知收件人 | `site_configs.settlement.notify_emails` | json | `[]` | 接收结算通知的邮箱列表 |

---

## 11. 边界条件

### 11.1 数据边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 结算周期内供应商无调用记录 | 跳过生成，不在列表中展示 |
| B2 | 供应商某模型成本价未配置 | 标记该模型为 error，结算单整体标记 warning，不影响其他模型 |
| B3 | 调用日志数据量极大（月 > 1 亿条） | 分片查询，按周聚合再合并，单次生成不超过 60 秒 |
| B4 | 同一供应商多期结算单 pending | 只允许生成最新一期，历史未生成的需要手动补齐 |

### 11.2 流程边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B5 | 结算单已 closed 后发现数据错误 | 不可修改，通过审批流程新建"补充结算单"（special 类型）|
| B6 | 结算单 disputed 超过 60 天未解决 | 系统自动告警 super_admin，标记为 escalation |
| B7 | 供应商已删除/禁用 | 只展示历史结算单，不可生成新结算单 |
| B8 | 结算周期跨越供应商变更 | 按 vendor_model 归属周期内的 vendorId 为准 |

### 11.3 支付边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B9 | 付款金额 > 结算单总额 | 不允许，前端校验 + 后端校验 |
| B10 | 付款金额 = 0 | 不允许创建付款记录 |
| B11 | 同一结算单重复付款 | 禁止，后端检查 cycleId 是否已有 completed 付款 |
| B12 | 付款记录误操作 | 允许删除 pending 状态的记录，completed 记录只能标记 refunded |

### 11.4 并发与安全

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B13 | 多人同时操作同一结算单 | 乐观锁（updatedAt 比对），后操作返回冲突提示 |
| B14 | 生成结算单时系统异常中断 | 状态回退到 pending，自动重试最多 3 次 |
| B15 | 恶意请求批量生成结算单 | 限制手动生成间隔 60 秒，单次最多 10 个供应商 |

---

## 12. 验收标准

### 12.1 结算单生成

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 自动周期生成 | cron 按配置时间执行，生成所有活跃供应商的上月结算单 |
| AC2 | 手动生成 | 指定供应商+周期，生成成功，结果正确 |
| AC3 | 重复生成保护 | 已存在结算单的周期返回跳过，forceRegenerate 需先删除旧单 |
| AC4 | 汇总数据正确性 | 随机抽取 5 条明细，手动计算验证 totalCalls/totalTokens/cost 正确 |
| AC5 | 快照记录 | 生成时记录 call_logs 快照和价格快照，checksum 可验证 |
| AC6 | 空周期处理 | 无调用数据的供应商跳过生成 |

### 12.2 确认与争议

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC7 | 确认/争议 | 结算单状态可正常流转 generated → confirmed / disputed |
| AC8 | 多轮争议 | 支持 round++ 多轮，超 2 轮需 super_admin 介入 |
| AC9 | 争议解决后恢复 | 争议关闭后结算单回到 confirmed，金额更新正确 |
| AC10 | 争议批量处理 | 争议金额 < 20% 可部分付款 |

### 12.3 付款管理

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC11 | 单笔付款 | 创建 → 标记完成 → 结算单自动 settled |
| AC12 | 合并付款 | 勾选多期 → 合并金额 = SUM → 全部关联结算单变为 settled |
| AC13 | 部分付款 | 分批付 → 最后一笔付清后变为 settled |
| AC14 | 付款凭证上传 | 支持上传图片/PDF 作为凭证 |
| AC15 | 付款统计 | 应付/已付/待付/逾期数据正确 |

### 12.4 导出与通知

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC16 | PDF 导出 | 结算单 PDF 含页眉/供应商信息/模型明细/金额合计/页脚 |
| AC17 | 结算通知 | 结算单确认后自动通知配置的邮箱 |

---

## 13. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 供应商管理 | `ref-4.3-vendor-model.md` | 供应商基本信息、模型定价数据源、结算联系人配置 |
| 财务对账 | `ref-4.4.5-reconciliation-prd.md` | 与用户侧对账引擎共享调用数据，结算时对照 platformProfit |
| 运维监控 | `ref-4.7-monitor-logs.md` | `call_logs` 是结算数据来源，需确保正确性 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 结算单所有关键操作（确认/争议/付款）写入操作日志 |
| 文件上传 | — | payment proof 文件上传复用现有文件上传服务 |
| 通知服务 | `ref-5.4-alert-rules.md` | 结算逾期/争议超时告警事件对接通知系统 |
| 邮件模板 | `ref-4.17-template-library.md` | 结算通知邮件使用模板库的邮件模板 |
| 用户端财务 | `ref-4.4-finance.md` | 用户侧计费与供应商侧结算构成完整闭环 |

---

## 附录：结算单 PDF 模板规格

**页面规格**：A4 (210mm × 297mm)

**页眉区域**：
```
┌─────────────────────────────────────────┐
│  [平台Logo]    3cloud 供应商结算单       │
│                 Settlement Invoice       │
├─────────────────────────────────────────┤
│ 编号：ST-2026-08-DS-001                  │
│ 生成日期：2026-08-01                     │
└─────────────────────────────────────────┘
```

**供应商信息**：
```
供应商：DeepSeek (ID: 3)
联系人：support@deepseek.com
结算周期：2026-07-01 ~ 2026-07-31
结算币种：CNY
```

**汇总区**：
```
┌──────────────┬──────────────┐
│ 总调用次数    │ 1,234,567   │
│ 总 Token      │ 890,456,789 │
│ 总成本        │ ¥45,678.90  │
│ 折扣          │ -¥500.00    │
│ 折后合计      │ ¥45,178.90  │
└──────────────┴──────────────┘
```

**模型明细表**（接续页可跨页）：

```
| 模型名        | 调用次数 | 输入Token  | 输出Token  | 单价(入/出)    | 成本    | 折扣    | 折后价   |
|---------------|---------|------------|------------|---------------|---------|---------|----------|
| deepseek-chat | 500,000 | 200,000,000| 300,000,000| ¥0.18/¥0.72 | ¥36,000| ¥300    | ¥35,700  |
| deepseek-v4   | 300,000 | 100,000,000| 150,000,000| ¥0.10/¥0.40 | ¥15,000| ¥200    | ¥14,800  |
```

**页脚**：
```
平台签章：3cloud（自动生成，无需人工签字）
本结算单基于系统调用日志自动生成，如需争议请联系 finance@3cloud.ai
```
