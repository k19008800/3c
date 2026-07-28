# 计费对账 PRD — 运营级规格说明书

> **对应章节**：[PRD-README.md §4.4 财务管理](../PRD-README.md#44-财务管理) / [ref-4.4-finance.md](ref-4.4-finance.md#6-自动对账引擎)
> **状态**：基于现有源码 `api/src/services/reconciliation/` + `api/src/db/schema.ts` + `api/src/routes/admin/finance/reconciliation.ts`
> **粒度**：运营级规格，包含字段级定义、配置项、边界条件、运营策略、数据追踪
> **版本**：v1.0 — 2026-07-28

---

## 目录

1. [对账目标与范围](#1-对账目标与范围)
2. [对账引擎规格](#2-对账引擎规格)
3. [对账比对逻辑](#3-对账比对逻辑)
4. [对账报告](#4-对账报告)
5. [差异处理流程](#5-差异处理流程)
6. [运营策略](#6-运营策略)
7. [边界条件](#7-边界条件)
8. [管理端界面规格](#8-管理端界面规格)
9. [数据字典总表](#9-数据字典总表)

---

## 1. 对账目标与范围

### 1.1 对账定义

对账（Reconciliation）是指将 3Cloud 平台的内部账务记录与外部凭据（银行流水、支付通道回调、供应商账单、日志审计）进行交叉比对，发现差异并驱动修复的过程。

**三大核心校验等式：**

```
等式 1（资金平衡）：期初余额 + 充值总额 - 消费总额 - 提现总额 - 佣金支出 ≈ 期末余额（容差 ¥0.01）
等式 2（充值闭环）：recharge_orders.amount(+) ⇔ 支付通道回调金额 ⇔ balance_logs(type=recharge).amount(+)
等式 3（消费闭环）：call_logs.cost(-) ⇔ balance_logs(type=consumption).amount(-)（绝对值一致）
```

### 1.2 对账范围

| 对账维度 | 平台侧数据 | 外部/对端数据 | 比对颗粒度 | 基准 |
|----------|-----------|--------------|-----------|------|
| 充值对账 | `recharge_orders` 表 | 微信/支付宝支付回调（`channel_order_no`）、银行流水（`bank_tx_id`）| 每笔订单 | 外部凭据为准 |
| 消费对账 | `call_logs` 表 | `balance_logs` 中 type=consumption 的扣款记录 | 每次 API 调用 | 逐笔匹配 |
| 佣金对账 | `commission_logs` 表 | `call_logs` 关联调用的成本 + `commission_rules` 费率 | 每笔佣金 | 公式验算 |
| 提现对账 | `withdraw_orders` 表 | `balance_logs` 中 type=withdraw 的扣款记录 | 每笔提现 | 金额绝对值一致 |
| 余额对账 | `balance_logs` 表 | `users.balance` 当前值 | 每个活跃用户 | 期初+Σ变动=期末 |

### 1.3 对账精度分层

```
日切对账（每日 T+1 02:00）
  └── 精准至每个订单/每笔调用，以 UTC+8 自然日为颗粒度
      ├── 充值：按 paidAt / confirmedAt 归属
      ├── 消费：按 created_at 归属
      ├── 佣金：按 created_at 归属
      └── 提现：按 paidAt 归属

实时对账（管理端手动触发）
  └── 任意时间范围，用于即时排查
      ├── 支持过去 7 天快速对账（预设快捷按钮）
      └── 支持自定义时间范围（限制 ≤90 天，防止全量扫描 OOM）

深度对账（每月 5 日 03:00）
  └── 上个月完整对账 + 资金平衡表 + 趋势分析
```

---

## 2. 对账引擎规格

### 2.1 对账触发方式

#### 方式 A：定时调度（Cron）

| 调度名称 | 表达式 | 范围 | 对账类型 | 备注 |
|---------|--------|------|---------|------|
| `daily-recon` | `0 2 * * *`（每日 02:00）| 前一日（T-1） | `full` | 标准日切 |
| `weekly-deep` | `0 3 * * 0`（周日 03:00）| 上周一 ~ 周日 | `full` | 周深度对账含趋势 |
| `monthly-full` | `0 4 5 * *`（每月 5 日 04:00）| 上月1日 ~ 上月最后1日 | `full` | 月结完整对账 |

**配置项（`site_configs` 或环境变量）：**

```typescript
interface ReconScheduleConfig {
  dailyEnabled: boolean;           // 默认 true
  dailyTime: string;               // "02:00"
  weeklyEnabled: boolean;          // 默认 true
  weeklyDay: number;               // 0=周日
  monthlyEnabled: boolean;         // 默认 true
  monthlyDay: number;              // 5
  reconRetentionDays: number;      // 报告保留天数，默认 365
  maxCustomRangeDays: number;      // 手动对账最大范围，默认 90
}
```

#### 方式 B：手动触发（管理端）

**入口**：管理端 → 财务 → 自动对账 → 「运行对账」按钮

**支持参数：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `startDate` | string(YYYY-MM-DD) | 是 | — | 对账起始日期 |
| `endDate` | string(YYYY-MM-DD) | 是 | — | 对账结束日期 |
| `reconType` | enum | 否 | `full` | `full` / `recharge` / `balance` / `commission` / `withdraw` / `consumption` |

**校验逻辑：**

```
1. startDate ≤ endDate
2. endDate - startDate ≤ maxCustomRangeDays（默认 90）
3. endDate ≤ 当前日期（不可对账未来日期）
4. 同一 (startDate, endDate, reconType) 不允许并行运行
   → 加 Redis 分布式锁：recon:lock:{startDate}:{endDate}:{reconType}，TTL=600s
```

#### 方式 C：API 触发

```http
POST /api/v1/admin/finance/reconciliation/run
Content-Type: application/json

{
  "startDate": "2026-07-01",
  "endDate": "2026-07-27",
  "reconType": "full"
}
```

**权限**：`Perm.RECONCILIATION_VIEW`

**响应**：

```json
{
  "code": 0,
  "data": {
    "reportId": 42,
    "summary": {
      "totalOrders": 15820,
      "matchedOrders": 15815,
      "mismatchedOrders": 5,
      "totalAmount": "123456.789000",
      "difference": "0.050000"
    },
    "mismatches": [...],
    "status": "completed"
  }
}
```

### 2.2 对账引擎执行流程

```
┌─────────────────────────────────────────────────────────┐
│                  runAutoReconciliation()                  │
├─────────────────────────────────────────────────────────┤
│ 1. 分布式锁（Redis）                                       │
│ 2. 创建 reconciliation_reports 记录（status=running）     │
│ 3. 分类型执行比对（按 reconType 路由）                      │
│    ├── checkRechargeOrders()    ↔ 充值对账                │
│    ├── checkConsumptionRecords() ↔ 消费对账               │
│    ├── checkCommissionAccuracy()  ↔ 佣金对账               │
│    ├── checkWithdrawRecords()   ↔ 提现对账                 │
│    ├── checkBalanceConsistency() ↔ 余额连续性              │
│    └── checkUserBalanceConsistency() ↔ 用户期初期末        │
│ 4. 汇总计算 + 资金平衡校验                                  │
│ 5. 写入 reconciliation_mismatches（差异明细）               │
│ 6. 更新报告 status=completed                               │
│ 7. 发送告警（严重级别过滤）                                  │
│ 8. 释放分布式锁                                            │
└─────────────────────────────────────────────────────────┘
```

### 2.3 引擎超时与熔断

| 配置项 | 默认值 | 说明 |
|-------|--------|------|
| 单次对账超时 | 300s | 超过标记为 failed |
| Redis 锁 TTL | 600s | 防止死锁 |
| 最大异常数写入 | 500 条 | 超标则截断并记录告警 |
| 内存保护 | 分页查询，每页 1000 条 | 防止单次全表扫 |

---

## 3. 对账比对逻辑

### 3.1 充值对账：`checkRechargeOrders()`

**目标**：确认每笔已确认的充值订单在 `balance_logs` 中有正确的入账记录。

**比对公式：**

```
recharge_orders.status = 'confirmed'
  AND recharge_orders.amount(+) 
    ⇔ balance_logs(userId, refType='order', refId=order.id, type='recharge').amount(+)
```

**差异检测类型：**

| 差异类型 | 检测逻辑 | 严重级别 | 自动修复 |
|---------|---------|---------|---------|
| `missing_record` | balance_logs 无对应入账 | high | 否（需人工确认） |
| `amount_mismatch` | 充值金额 ≠ balance_logs 金额 | critical | 否 |
| `orphan_balance` | balance_logs 有入账但 orders 非 confirmed | high | 否 |
| `duplicate_balance` | 同一订单有多个入账记录 | high | 可自动撤销多余记录 |

**字段级比对：**

```
对比维度:       recharge_orders              balance_logs
─────────────  ───────────────────────────  ───────────────────────────
用户ID          user_id                      user_id
金额            amount(+)                    amount(+)
关联ID          id                           ref_id / ref_type='order'
时间戳          paidAt / confirmedAt          createdAt
```

**边界条件：**

- 对公转账订单（`bank_transfer`）以双审完成时间（`secondConfirmedAt`）为确认时点
- 在线支付订单以 `paidAt` 为确认时点
- 退款订单排除（`refundedAt` 不为空时标记并跳过）

### 3.2 消费对账：`checkConsumptionRecords()`

**目标**：确认每笔已完成 API 调用在 `balance_logs` 中有正确的扣款记录。

**比对公式：**

```
call_logs.status = 'completed' AND call_logs.userId 存在
  ⇔ balance_logs(userId, refType='call', refId=call.id, type='consumption').amount(-)
```

**差异检测类型：**

| 差异类型 | 检测逻辑 | 严重级别 | 自动修复 |
|---------|---------|---------|---------|
| `missing_record` | 调用扣费但 balance_logs 无对应记录 | high | 是（调用补扣） |
| `amount_mismatch` | 扣费金额与 balance_logs 不一致 | critical | 否 |
| `double_charge` | 同一调用有两条扣费记录 | critical | 自动撤销一条 |
| `zombie_call` | call_logs 完成但 cost=0 或 null | low | 自动补 0 标记 |

**费用计算复核：**

```
预期扣费 = actualInputTokens × sellPriceInput + actualOutputTokens × sellPriceOutput
         × userDiscountRate（如有）
记录扣费 = call_logs.costAmount（绝对值）

差额 = |预期扣费| - |记录扣费|
容差 = ¥0.01
```

**预扣/实扣对账：**

```
调用流：预扣（pre_charge）→ 实扣（charge_adjust）
对账确认点：
  1. 每条 call_logs 必须有且仅有一条对应的 charge_adjust balance_logs
  2. 预扣金额 ≥ 实扣金额（多退少补，退=补正记录）
  3. 预扣与实扣的 userId / refType / refId 一致
```

### 3.3 佣金对账：`checkCommissionAccuracy()`

**目标**：验证每笔佣金计算的准确性，确保代理商应收金额无误。

**比对公式：**

```
expectedCommission = callCost × feeRate
actualCommission = commissionLogs.commissionAmount
差额 = |expectedCommission - actualCommission| ≤ ¥0.01（容差）
```

**差异检测类型：**

| 差异类型 | 检测逻辑 | 严重级别 | 自动修复 |
|---------|---------|---------|---------|
| `calculation_error` | 佣金计算值与公式不符 | high | 是（用公式值覆盖） |
| `missing_record` | 佣金记录关联的代理商不存在 | critical | 否 |
| `orphan_commission` | 佣金有关联 call_log_id 但 call_logs 不存在 | high | 否 |
| `rate_mismatch` | 佣金使用的费率与当前规则不一致 | medium | 否（标记待人工） |

**佣金公式验算明细：**

```
验证项：
  ├── callCost = 关联 call_logs.costAmount（平台成本价）
  ├── feeRate = commissionLogs.feeRate（存储在佣金记录中）
  ├── commissionAmount = callCost × feeRate
  ├── feeAmount（手续费）= commissionAmount × platformFeeRate
  └── netAmount = commissionAmount - feeAmount

检查点：
  ├── feeRate 是否匹配 commission_rules 中生效的费率（按时间范围）
  ├── 关联 call_log 是否存在（防孤立）
  └── 代理商是否仍在活跃状态（已停用的应标记）
```

### 3.4 提现对账：`checkWithdrawRecords()`

**目标**：确认每笔已支付的提现订单在 `balance_logs` 中有对应的扣款记录。

**比对公式：**

```
withdraw_orders.status = 'paid'
  ⇔ balance_logs(userId, refType='withdraw', refId=withdraw.id, type='withdraw').amount(-)
```

**差异检测类型：**

| 差异类型 | 检测逻辑 | 严重级别 | 自动修复 |
|---------|---------|---------|---------|
| `missing_record` | 提现已支付但无余额扣款 | critical | 否 |
| `amount_mismatch` | 提现金额与 balance_logs 绝对值不一致 | critical | 否 |
| `calculation_error` | 实付金额 ≠ 提现金额 - 手续费 | high | 自动修正 |
| `overdue_withdraw` | 提现完成但超过 X 天未对平 | medium | 标记待确认 |

**金额链校验：**

```
提现金额 = withdraw_orders.amount
手续费   = withdraw_orders.feeAmount（或 0）
实付金额 = withdraw_orders.actualAmount（或 amount）

校验链：
  1. amount + feeAmount ≥ actualAmount（防止超额）
  2. |balance_logs.amount| ≥ actualAmount（余额扣款已覆盖实际打款）
  3. 确认已打款金额 ≤ 代理商可提现余额（此时点）
```

### 3.5 余额对账：`checkBalanceConsistency()` + `checkUserBalanceConsistency()`

#### 3.5.1 余额连续性检查（逐条日志）

**目标**：确保 `balance_logs` 中的每笔记录的前后余额连续。

**比对公式（逐条）：**

```
balanceAfter[i] = balanceAfter[i-1] + amount[i]
```

逐用户、按 `createdAt` 排序后校验。

#### 3.5.2 用户期初期末检查

**目标**：确认用户当前余额 = 期初余额 + 期间所有变动之和。

**比对公式：**

```
currentBalance = startBalance + Σ(income) - Σ(expense)

其中：
  收入（+）：recharge, refund, charge_adjust（正数）
  支出（-）：consumption, withdraw, pre_charge, commission
```

**资金平衡表（系统级）：**

```
┌──────────────────────┬────────────────────┐
│ 收入侧               │ 支出侧              │
├──────────────────────┼────────────────────┤
│ 充值总额 (A)         │ 消费总额 (B)        │
│ （recharge_orders    │ （call_logs.cost）  │
│  已确认）            │                    │
├──────────────────────┼────────────────────┤
│ 退款总额 (C)         │ 提现总额 (D)        │
│ （refund_requests    │ （withdraw_orders   │
│  已执行）            │  已支付）           │
├──────────────────────┼────────────────────┤
│                      │ 佣金支出 (E)        │
│                      │ （commission_logs   │
│                      │  settled）          │
├──────────────────────┼────────────────────┤
│ 收入小计: A + C      │ 支出小计: B + D + E │
├──────────────────────┼────────────────────┤
│ 平台利润: (A+C) - (B+D+E)                 │
│ 容差：¥0.01                                │
└──────────────────────┴────────────────────┘
```

### 3.6 异常检测汇总

| 异常类型 | 检测来源 | 说明 | 自动修复能力 |
|---------|---------|------|------------|
| `missing_record` | 充值/消费/提现 | 平台有记录但对方无 | 部分（消费补扣） |
| `orphan_record` | 佣金/充值 | 记录关联 ID 指向不存在的对象 | 否 |
| `amount_mismatch` | 全部 | 金额不一致 | 否 |
| `calculation_error` | 佣金/余额 | 公式计算错误 | 中（容差内自动） |
| `duplicate_record` | 充值/消费 | 重复入账/扣款 | 是（撤销一条） |
| `frequent_withdraw` | 提现 | 同一天 >=3 笔拆分风险 | 否（标记风控） |
| `zombie_record` | 消费 | 完成但 cost=0 的调用 | 否 |

---

## 4. 对账报告

### 4.1 报告数据结构

#### `reconciliation_reports` 表（对账报告）

```typescript
export const reconciliationReports = pgTable("reconciliation_reports", {
  id: serial("id").primaryKey(),
  startDate: varchar("start_date", { length: 10 }),           // 对账起始日期
  endDate: varchar("end_date", { length: 10 }),               // 对账结束日期
  reconType: varchar("recon_type", { length: 20 }),           // full|recharge|balance|commission|withdraw|consumption
  status: varchar("status", { length: 20 }),                  // pending|running|completed|failed
  
  // 汇总字段
  totalOrders: integer("total_orders"),                        // 总订单数
  matchedOrders: integer("matched_orders"),                    // 匹配成功数
  mismatchedOrders: integer("mismatched_orders"),              // 异常数
  totalAmount: numeric("total_amount", { precision: 18, scale: 6 }),  // 总金额
  difference: numeric("difference", { precision: 18, scale: 6 }),     // 差额
  
  // 各维度汇总（JSON 存储，避免频繁 join）
  rechargeSummary: jsonb("recharge_summary"),                  // { count, total }
  withdrawSummary: jsonb("withdraw_summary"),                  // { count, total, feeTotal, actualTotal }
  consumptionSummary: jsonb("consumption_summary"),            // { count, total }
  balanceCheck: jsonb("balance_check"),                        // 资金平衡校验结果
  
  // 元数据
  mismatches: jsonb("mismatches"),                             // 异常列表（精简）
  createdBy: integer("created_by"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  
  // 审计
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 索引
// - reconciliation_reports_type_status_idx: (reconType, status)
// - reconciliation_reports_date_idx: (startDate, endDate)
// - reconciliation_reports_created_at_idx: (createdAt DESC)
```

#### `reconciliation_mismatches` 表（差异明细）

```typescript
export const reconciliationMismatches = pgTable("reconciliation_mismatches", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull()
    .references(() => reconciliationReports.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),                                // 关联订单 ID（可选）
  refType: varchar("ref_type", { length: 50 }),                // 关联类型：recharge_order|balance_log|commission_log|call_log|withdraw_order|user_balance
  refId: integer("ref_id"),                                    // 关联 ID
  mismatchType: varchar("mismatch_type", { length: 50 }),      // missing_record|amount_mismatch|calculation_error|duplicate_record|orphan_record|rate_mismatch
  expectedValue: varchar("expected_value", { length: 50 }),    // 期望值
  actualValue: varchar("actual_value", { length: 50 }),        // 实际值
  reason: text("reason"),                                      // 差异原因
  severity: varchar("severity", { length: 10 }),               // low|medium|high|critical
  
  // 处理状态
  status: varchar("status", { length: 20 }).default("pending"), // pending|processing|resolved|false_positive|ignored
  resolutionNote: text("resolution_note"),                     // 处理备注
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 4.2 ReconciliationReport（内存类型）

```typescript
interface ReconciliationReport {
  date: string;                    // "2026-07-27" | "2026-07-01 ~ 2026-07-27"
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';

  summary: {
    commission: { count: number; totalCommission: string; totalFee: string; totalNet: string };
    withdraw: { count: number; totalAmount: string; totalFee: string; totalActual: string };
    recharge: { count: number; totalAmount: string };
  };

  dimensions: {
    byAgent: Array<{ label: string; count: number; totalAmount: string }>;
    byStatus: Record<string, { label: string; count: number; totalAmount: string; feeAmount?: string; netAmount?: string }>;
    byCommissionType: Array<{ label: string; count: number; totalAmount: string }>;
  };

  balanceCheck: {
    totalIncome: string;           // 充值总额
    totalExpense: string;          // 消费总额
    totalCommission: string;       // 佣金支出
    totalWithdraw: string;         // 提现总额
    platformProfit: string;        // 平台利润 = 收入 - 支出
    diff: string;                  // 差额
    isBalanced: boolean;           // 是否平衡
  };

  anomalies: Array<{
    id: number;
    type: string;                  // 异常类型
    severity: string;              // 严重级别
    description: string;           // 描述
    relatedId: number | null;
    amount: string | null;
    createdAt: string;
  }>;

  trends: Array<{
    date: string;
    commissionAmount: string;      // 佣金总额
    commissionCount: number;       // 佣金笔数
    withdrawAmount: string;        // 提现总额
    withdrawCount: number;         // 提现笔数
    rechargeAmount: string;        // 充值总额
    rechargeCount: number;         // 充值笔数
  }>;
}
```

### 4.3 报告存储与导出

| 导出格式 | 实现方式 | 内容 |
|---------|---------|------|
| JSON（API） | `GET /reports/:id` | 完整报告数据 |
| CSV 下载 | `GET /export/:id` | 汇总 + 异常明细（UTF-8 BOM） |
| PDF | `generateReconciliationPDF()` | HTML → PDF（含样式、表格、状态徽标） |

**CSV 导出内容结构：**
```
"3cloud 对账报告"
"报告ID",42
"时间范围","2026-07-01 ~ 2026-07-27"
"对账类型","full"
"状态","completed"

"汇总数据"
"总订单数","匹配订单数","异常订单数","总金额","差额"
15820,15815,5,"123456.789000","0.050000"

"异常明细"
"ID","关联类型","关联ID","异常类型","期望值","实际值","原因","严重级别","是否已解决"
...
```

---

## 5. 差异处理流程

### 5.1 差异标记状态流转

```
        ┌──────────┐
        │  pending  │ ◄── 引擎自动创建
        └────┬─────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
processing resolved  false_positive
             │              │
             ▼              ▼
             └─────► done ◄─┘ (标记为最终状态)
             
ignored (运营主动忽略)
```

| 状态 | 含义 | 入口 | 权限 |
|------|------|------|------|
| `pending` | 未处理，待确认 | 对账引擎自动创建 | — |
| `processing` | 处理中，运营正在确认 | 人工标记 | `FINANCE_COMMISSION` |
| `resolved` | 已修复（自动/手动） | 人工标记或自动修复 | `FINANCE_COMMISSION` |
| `false_positive` | 误报（非真实差异） | 人工标记 | `FINANCE_COMMISSION` |
| `ignored` | 运营主动忽略 | 人工标记 | `FINANCE_COMMISSION` |

### 5.2 每种差异的处理流程

#### 5.2.1 Missing Record（少账）

```
发现：平台有记录但外部无对应（充值无入账/消费无扣款）
                                        
场景 A：充值少账
  1. 运营方先登录支付通道后台，确认订单是否真实支付
  2. 已支付 → 人工补单（POST /recharge-orders/:id/force-complete）
  3. 未支付 → 标记为 false_positive，联系用户确认

场景 B：消费少账（调用已扣费但 balance_logs 没扣到）
  1. 运营确认 call_logs 状态为 completed
  2. 人工补扣：调用 updateHealthAfterCall + -costAmount
  3. 记录操作日志
  
场景 C：提现少账（已支付但余额未扣）
  1. 运营确认 withdraw_orders.status = 'paid'
  2. 人工补扣：写入 balance_logs(type=withdraw, -amount)
  3. 记录操作日志
```

#### 5.2.2 Amount Mismatch（金额不匹配）

```
发现：双方金额不一致（差异 > ¥0.000001）

处理流程：
  1. 运营查看双方原始记录
  2. 金额差异 ≤ ¥1.00 且平台方多扣 → 自动补退差额（balance_logs 补正）
  3. 金额差异 ≤ ¥1.00 且平台方少扣 → 自动补扣（balance_logs 补扣）
  4. 金额差异 > ¥1.00 → 标记 pending，人工介入
  5. 人工确认后手动操作：补单 / 退款 / 金额调整

自动修复条件：
  ├── 差异金额 ≤ ¥1.00
  ├── 非涉及外部支付通道（仅平台内 log-vs-log）
  └── 该用户无历史争议记录
```

#### 5.2.3 Calculation Error（计算错误）

```
发现：佣金公式计算值与记录值不一致

处理流程：
  1. 引擎自动用公式值覆盖记录值（容差 ¥0.01 内）
  2. 超出容差 → 标记 pending
  3. 运营确认费率设置是否变更（commission_rules 历史版本）
  4. 如属规则变更导致 → 标记 false_positive
  5. 如属 bug → 修复数据后标记 resolved
```

#### 5.2.4 Duplicate Record（重复记录）

```
发现：同一订单/调用有两条以上 balance_logs

处理流程：
  1. 自动撤销最后一条重复记录（写入负值 balance_logs）
  2. 记录撤销日志到 resolutionNote
  3. 多条重复 → 标记 pending 待人工确认保留哪条
```

#### 5.2.5 Orphan Record（孤儿记录）

```
发现：佣金/充值关联的对象不存在

处理流程：
  1. commission_logs.clientCallLogId 指向不存在的 call_logs
     → 标记 pending，确认是否是数据清理导致
     → 如果 call_logs 确实已删除 → 标记 false_positive
     → 实际是 bug → 修复关联后标记 resolved
     
  2. recharge_orders 已确认但 balance_logs 无入账
     → 走 missing_record 流程
```

### 5.3 人工修复操作清单

| 操作 | API 端点 | 说明 |
|------|---------|------|
| 补单 | `POST /recharge-orders/:id/force-complete` | 充值补单 + 入账 |
| 退款调整 | `POST /refunds/:id/review` + `POST /refunds/:id/execute` | 退款退回余额 |
| 差额调整 | `POST /finance/adjust-balance` | 直接调整用户余额（需登记原因） |
| 标记已解决 | `POST /reconciliation/mismatches/:id/resolve` | 异常标记 resolved |
| 标记忽略 | `POST /reconciliation/mismatches/:id/resolve`（note 中注明 ignore） | 运营主动忽略 |
| 撤销记录 | `POST /reconciliation/undo-duplicate` | 撤销重复的 balance_logs |

### 5.4 通知策略

| 差异级别 | 通知方式 | 接收人 | 说明 |
|---------|---------|--------|------|
| `critical` | 平台内告警 + 钉钉/飞书 Webhook | 财务主管 | 资金异常，需立即处理 |
| `high` | 平台内告警 | 财务 | 需当日处理 |
| `medium` | 平台内通知 | 财务 | 需本周处理 |
| `low` | 仅记录到报告 | — | 备份参考 |

**告警去重**：同类型同用户的差异，24 小时内不重复发送告警。

---

## 6. 运营策略

### 6.1 对账频率建议

| 频率 | 时间 | 范围 | 目的 | 预期处理时长 |
|------|------|------|------|------------|
| 每日 | 02:00-02:10 | 前一日 | 日常核验，发现遗漏扣费 | 10min |
| 每周 | 周日 03:00 | 上周 | 周综合对账 + 趋势 | 20min |
| 每月 | 5 日 04:00 | 上月整月 | 月结 + 资金平衡 + 利润核算 | 30min |
| 季末 | 次月 5 日 | 整季 | 季度财务核对 + 审计数据 | 1h |

### 6.2 异常告警配置

```typescript
interface ReconAlertConfig {
  // 金额阈值（绝对值超过此值触发告警）
  amountThreshold: {
    critical: number;    // 默认 ¥1000.00
    high: number;        // 默认 ¥100.00
    medium: number;      // 默认 ¥10.00
  };
  
  // 差异率阈值
  diffRateThreshold: {
    warning: number;     // 差异率超过 0.1% 告警
    critical: number;    // 差异率超过 1% 严重告警
  };
  
  // 连续失败告警
  consecutiveFailureAlert: number;  // 连续 3 天对账失败
  
  // 告警静默期（同一类型不重复告警）
  alertCooldownMinutes: number;     // 默认 1440 (24h)
  
  // Webhook 通知
  webhookUrl?: string;
  webhookEnabled: boolean;
}
```

### 6.3 对账暂停/恢复

| 场景 | 操作 | 影响 |
|------|------|------|
| 系统升级维护 | 暂停定时调度 | 跳过的时段在恢复后手动触发补充 |
| 重大故障 | 暂停 + 标记 | 修复后对受影响时段重跑 |
| 日常维护 | 单次跳过 | cron 自动跳过当日 |

**暂停操作**：
- 管理端 → 系统设置 → 对账调度 → 暂停
- 暂停支持设定自动恢复时间（如 `2026-08-01T06:00:00Z`）

### 6.4 资金差异归因流程

```
发现资金不平衡（isBalanced = false）
  │
  ▼
1. 定位时间范围和涉及用户
  │
  ▼
2. 按对账类型展开各维度差异
  │
  ▼
3. 归因分析：
  ├── 充值差异 → 检查支付通道回调日志
  ├── 消费差异 → 检查计费链路（预扣/实扣）
  ├── 佣金差异 → 检查 commission_rules 变更历史
  └── 提现差异 → 检查银行打款记录
  │
  ▼
4. 制定修复方案
  │
  ▼
5. 执行修复 → 重跑对账 → 确认平衡
  │
  ▼
6. 记录复盘文档
```

---

## 7. 边界条件

### 7.1 跨天订单归属

| 订单类型 | 归属日期字段 | 策略 | 说明 |
|---------|-------------|------|------|
| 在线充值 | `paidAt`（支付成功时间）| 以用户实际付款日期为准 | 创建日≠归属日 |
| 对公转账 | `secondConfirmedAt`（复审时间）| 以财务双审完成为准 | 初审不算入账 |
| API 消费 | `createdAt`（创建时间）| 以调用发起时间为准 | 排除跨天场景 |
| 佣金 | `createdAt`（创建时间）| 以佣金产生时间为准 | 与消费时间一致 |
| 提现 | `paidAt`（打款时间）| 以实际打款时间为准 | 创建日≠打款日 |

**日切执行要点：**
```sql
-- 不要用 createdAt 做充值对账，要用 paidAt/confirmedAt
WHERE paidAt >= '2026-07-27 00:00:00+08'
  AND paidAt <  '2026-07-28 00:00:00+08'
```

### 7.2 充值中但未完成的订单

| 状态 | 对账处理 | 说明 |
|------|---------|------|
| `pending`（待支付） | 跳过不参加对账 | 未完成交易 |
| `failed`（支付失败） | 跳过不参加对账 | 无资金变动 |
| `expired`（超时失效） | 跳过不参加对账 | 同上 |
| `abnormal`（异常） | 标记 anomaly | 支付成功但回调异常，需人工介入 |

**处理规则**：对账引擎 `WHERE status = 'confirmed'` 排除非完成态订单。

### 7.3 退款订单的对账

```
退款流程：
  充值退款：refund_requests(completed) → 标记 recharge_orders.refundedAt
  API 退款：refund_requests(completed) → balance_logs(type=refund, +amount)

对账处理：
  1. 已退款充值订单从充值对账中排除（refundedAt 不为空）
  2. 退款金额计入资金平衡表收入侧（与充值同等对待）
  3. 退款对应的 balance_logs 参与余额连续性校验

退款超额检查（对账发现）：
  Σ(refund_amount) - Σ(recharge_amount) > 0 → 异常标记
```

### 7.4 系统升级期间的账单

| 场景 | 对账影响 | 处理措施 |
|------|---------|---------|
| 升级导致 call_logs 写入延迟 | 当日对账缺少末尾记录 | T+1 日对账自动包含 | 
| 升级导致 balance_logs 未写入 | 消费无扣款记录 | 对账标记 `missing_record` |
| 数据库迁移（表结构调整） | 可能丢失关联 | 迁移前检查并备份对账配置 |
| Redis 缓存清空 | 缓存命中率下降 | 回退到直接查库 |

### 7.5 多币种/汇率差异

当前 3Cloud 仅支持 **CNY（人民币）** 单币种，以下为预留规格：

```typescript
interface MultiCurrencyConfig {
  enabled: boolean;            // 默认 false
  baseCurrency: string;        // "CNY"
  supportedCurrencies: string[]; // ["CNY", "USD", "HKD"]
  
  // 汇率策略
  rateSource: string;          // "daily_fix" | "realtime"
  ratePrecision: number;       // 6（6 位小数）
  
  // 对账
  currencyMismatchThreshold: number;  // 汇率差阈值，默认 0.01
}
```

**多币种对账注意事项：**
- 统一转化为 `baseCurrency` 进行比较
- 使用每日固定汇率（央行中间价）或实时汇率
- 汇率差异 ≤ ¥0.01 可自动忽略

---

## 8. 管理端界面规格

### 8.1 对账工作台页面

```
admin → 财务 → 对账管理（左侧导航）

┌─────────────────────────────────────────────────────────────┐
│  对账管理                                        [运行对账] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ 昨日对账     │ 本周对账     │ 本月对账     │ 待处理异常   │  │
│  │ ✅ 已完成    │ ✅ 已完成    │ ⏳ 待执行    │ ⚠️ 3 条     │  │
│  │ 匹配率 99.9% │ 匹配率 99.8% │ 5 日 04:00  │ 含 1 条严重 │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
│                                                              │
│  快速操作：                                                   │
│  [📅 昨日对账] [📅 本周对账] [📅 自定义...]                    │
│                                                              │
│  ────────────────────────────────────────────────             │
│  对账报告列表                                    [筛选 ▼]     │
│                                                              │
│  ┌──────┬──────────┬──────────┬──────┬──────┬──────┬──────┐  │
│  │ 报告ID│ 时间范围  │ 对账类型 │ 总订单│ 异常 │ 状态 │ 操作 │  │
│  ├──────┼──────────┼──────────┼──────┼──────┼──────┼──────┤  │
│  │ #42  │ 07/01-27 │ full    │ 15820│ 5    │ ✅   │ 详情 │  │
│  │ #41  │ 07/27    │ full    │ 530  │ 1    │ ✅   │ 详情 │  │
│  │ #40  │ 07/26    │ recharge│ 120  │ 0    │ ✅   │ 详情 │  │
│  │ ...  │ ...      │ ...     │ ...  │ ...  │ ❌   │ 查看 │  │
│  └──────┴──────────┴──────────┴──────┴──────┴──────┴──────┘  │
│                                                              │
│  共 120 条                                     < 1 2 3 ... > │
└─────────────────────────────────────────────────────────────┘
```

**运行对账弹窗：**

```
┌────────────────────────────────────┐
│  运行对账                           │
├────────────────────────────────────┤
│  对账类型:  [全部对账 ▼]            │
│            - 全部对账 (full)        │
│            - 充值对账 (recharge)    │
│            - 余额检查 (balance)     │
│            - 佣金验证 (commission)  │
│            - 提现对账 (withdraw)    │
│            - 消费对账 (consumption) │
│                                     │
│  时间范围:  [📅 2026-07-01]         │
│            至                       │
│            [📅 2026-07-27]          │
│                                     │
│  ⚠️ 范围超过 90 天请分批次执行       │
│                                     │
│         [取消]  [开始对账]           │
└────────────────────────────────────┘
```

### 8.2 对账报告详情页

```
┌─────────────────────────────────────────────────────────────┐
│  对账报告 #42                           [导出 CSV] [导出 PDF] │
│  2026-07-01 ~ 2026-07-27 | 全部对账                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─ 汇总卡片 ───────────────────────────────────────────┐   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │   │
│  │  │ 总订单  │ │ 匹配 ✅  │ │ 异常 ⚠️  │ │ 差额    │       │   │
│  │  │ 15,820 │ │ 15,815 │ │ 5      │ │ ¥0.05  │       │   │
│  │  │ -      │ │ 99.97% │ │ 0.03%  │ │ 已平衡  │       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ 资金平衡校验 ────────────────────────────────────────┐   │
│  │  收入:  充值          ¥89,234.00                     │   │
│  │         退款          ¥1,200.00                       │   │
│  │  支出:  消费          ¥76,543.21    ├───████████───┤   │
│  │         佣金          ¥8,900.00     ├───███───────┤   │
│  │         提现          ¥4,990.79     ├───██───────┤   │
│  │  平台利润:              ¥88.00                        │   │
│  │  资金状态:  ✅ 已平衡（差额 ¥0.05，容差内）          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ 异常明细 ──────────────── [批量操作 ▼] ───────────┐   │
│  │                                                      │   │
│  │  筛选: [全部严重级别 ▼] [全部类型 ▼] [全部状态 ▼]   │   │
│  │                                                      │   │
│  │  ┌────┬──────┬─────────┬──────┬────────┬────────┐   │   │
│  │  │ ID │ 严重 │ 类型    │ 原因 │ 期望值 │ 实际值 │   │   │
│  │  ├────┼──────┼─────────┼──────┼────────┼────────┤   │   │
│  │  │ 1  │ 🔴   │ 金额    │ 充值 │ ¥100   │ ¥99.95 │   │   │
│  │  │    │ 严重 │ 不匹配  │ #123 │        │        │   │   │
│  │  ├────┼──────┼─────────┼──────┼────────┼────────┤   │   │
│  │  │ 2  │ 🟡   │ 记录    │ 佣金 │ ¥0.05  │ ¥0.00  │   │   │
│  │  │    │ 高   │ 缺失    │ #456 │        │        │   │   │
│  │  └────┴──────┴─────────┴──────┴────────┴────────┘   │   │
│  │                                                      │   │
│  │  每页 20 条                                   < 1/1 >│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ 趋势图 ─────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  日趋势（近 30 天）                                   │   │
│  │  ¥ │                                                │   │
│  │ 3k├─╮   ╱╲                                            │   │
│  │ 2k├─╲─╱─╲─╱─╲                                         │   │
│  │ 1k├─ ─ ─ ─ ─ ─                                        │   │
│  │  └──────────────────────────                           │   │
│  │    07/01  07/07  07/14  07/21  07/27                  │   │
│  │                                                      │   │
│  │  ── 充值  ── 消费  ── 佣金  - - 提现                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 差异处理面板

```
点击异常行 → 弹出处理侧边栏：

┌────────────────────────────────┐
│  异常 #1   待处理               │
├────────────────────────────────┤
│  关联: 充值订单 #123            │
│  类型: 金额不匹配                │
│  严重: 🔴 严重                  │
│                                 │
│  ┌──────────────────────────┐   │
│  │ 平台金额: ¥100.00        │   │
│  │ 入账金额: ¥99.95         │   │
│  │ 差额:     ¥0.05          │   │
│  └──────────────────────────┘   │
│                                 │
│  📋 原始数据:                   │
│  - recharge_orders #123        │
│    → amount: 100.000000        │
│    → status: confirmed         │
│  - balance_logs #456           │
│    → amount: 99.950000         │
│                                 │
│  🔍 建议操作: 补录差额 ¥0.05   │
│                                 │
│  ────────────────────────────   │
│  处理方式:                       │
│  ○ 标记已修复                    │
│  ● 自动补录差额                  │
│  ○ 标记误报                      │
│  ○ 标记忽略                      │
│                                 │
│  备注:                           │
│  [ 支付通道费率差异导致 ¥0.05 ]  │
│                                 │
│  ┌───────────┐ ┌────────────┐   │
│  │   取消    │ │  确认处理   │   │
│  └───────────┘ └────────────┘   │
└────────────────────────────────┘
```

### 8.4 前端组件 Props 定义

```typescript
// 对账工作台
interface ReconciliationWorkbenchProps {
  onRunRecon: (params: RunReconParams) => Promise<void>;
  onViewReport: (reportId: number) => void;
  dailyStatus: ReconStatus | null;   // 昨日对账状态
  weeklyStatus: ReconStatus | null;  // 本周对账状态
  pendingCount: number;              // 待处理异常数
}

interface RunReconParams {
  startDate: string;
  endDate: string;
  reconType: ReconType;
}

type ReconType = 'full' | 'recharge' | 'balance' | 'commission' | 'withdraw' | 'consumption';

interface ReconStatus {
  reportId: number;
  isCompleted: boolean;
  matchRate: number;           // 匹配率百分比
  mismatchCount: number;
  hasCritical: boolean;
  date: string;
}

// 报告详情
interface ReconciliationReportDetailProps {
  reportId: number;
  report: ReconciliationReportApiData; // 来自 API
  mismatches: MismatchItem[];
  onExport: (format: 'csv' | 'pdf') => void;
  onResolveMismatch: (mismatchId: number, action: ResolveAction) => Promise<void>;
}

interface MismatchItem {
  id: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mismatchType: string;
  refType: string;
  refId: number;
  expectedValue: string | null;
  actualValue: string | null;
  reason: string;
  status: 'pending' | 'processing' | 'resolved' | 'false_positive' | 'ignored';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

interface ResolveAction {
  action: 'resolve' | 'auto_fix' | 'false_positive' | 'ignore';
  note?: string;
  autoFixType?: 'balance_adjust' | 'deduct_retroactively' | 'reverse_duplicate';
}

// 资金平衡可视化
interface BalanceCheckVisualProps {
  data: {
    totalIncome: string;
    totalExpense: string;
    totalCommission: string;
    totalWithdraw: string;
    platformProfit: string;
    diff: string;
    isBalanced: boolean;
  };
}

// 趋势图
interface TrendChartProps {
  data: Array<{
    date: string;
    commissionAmount: number;
    rechargeAmount: number;
    consumptionTotal: number;
    withdrawAmount: number;
  }>;
  granularity: 'day' | 'week' | 'month';
}
```

---

## 9. 数据字典总表

### 9.1 对账表关系

```
                        ┌─────────────────┐
                        │ reconciliation_  │
                        │ reports          │
                        │ (对账报告主表)    │
                        └────────┬────────┘
                                 │ 1
                                 │
                                 │ N
                        ┌────────▼────────┐
                        │ reconciliation_ │
                        │ mismatches      │
                        │ (差异明细表)     │
                        └─────────────────┘

对账涉及的业务表：
  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
  │ recharge_     │   │ balance_logs  │   │ call_logs     │
  │ orders        │   │ (余额变动)     │   │ (调用记录)    │
  │ (充值订单)    │   │               │   │               │
  └───────────────┘   └───────────────┘   └───────────────┘
  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
  │ commission_   │   │ withdraw_     │   │ daily_recon_  │
  │ logs          │   │ orders        │   │ summary       │
  │ (佣金流水)    │   │ (提现订单)     │   │ (日报汇总)    │
  └───────────────┘   └───────────────┘   └───────────────┘
```

### 9.2 API 接口总表

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `POST` | `/api/v1/admin/finance/reconciliation/run` | `RECONCILIATION_VIEW` | 执行对账 |
| `GET` | `/api/v1/admin/finance/reconciliation/reports` | `RECONCILIATION_VIEW` | 对账报告列表 |
| `GET` | `/api/v1/admin/finance/reconciliation/reports/:id` | `RECONCILIATION_VIEW` | 报告详情（含异常） |
| `GET` | `/api/v1/admin/finance/reconciliation/export/:id` | `RECONCILIATION_VIEW` | 导出 CSV |
| `POST` | `/api/v1/admin/finance/reconciliation/mismatches/:id/resolve` | `FINANCE_COMMISSION` | 标记异常已解决 |
| `GET` | `/api/v1/admin/finance/daily-summary` | `RECONCILIATION_VIEW` | 日报查询 |
| `GET` | `/api/v1/admin/finance/dashboard` | `FINANCE_VIEW` | 财务总览 |

### 9.3 配置项总表

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `recon.daily.enabled` | boolean | true | 每日对账开关 |
| `recon.daily.time` | string | "02:00" | 每日对账时间 |
| `recon.daily.type` | string | "full" | 每日对账类型 |
| `recon.weekly.enabled` | boolean | true | 周对账开关 |
| `recon.weekly.day` | number | 0 | 周对账日（0=周日）|
| `recon.monthly.enabled` | boolean | true | 月对账开关 |
| `recon.monthly.day` | number | 5 | 月对账日 |
| `recon.maxCustomRange` | number | 90 | 手动对账最大天数 |
| `recon.alert.criticalAmount` | number | 1000 | 严重告警金额阈值 |
| `recon.alert.highAmount` | number | 100 | 高告警金额阈值 |
| `recon.alert.diffRate` | number | 0.1 | 差异率告警阈值（%）|
| `recon.alert.consecutiveFail` | number | 3 | 连续失败告警次数 |
| `recon.alert.cooldownMin` | number | 1440 | 告警静默期（分钟）|
| `recon.lock.ttl` | number | 600 | 分布式锁 TTL（秒）|
| `recon.query.pageSize` | number | 1000 | 分页查询每页数 |
| `recon.retention.days` | number | 365 | 报告保留天数 |
| `recon.autoFix.enabled` | boolean | true | 自动修复开关 |
| `recon.autoFix.maxAmount` | number | 1.00 | 自动修复最大金额 |

---

### 附录：与现有源码的映射

| PRD 章节 | 现有源码文件 | 说明 |
|---------|-------------|------|
| 2.2 引擎流程 | `auto-reconciliation.ts` `runAutoReconciliation()` | 已实现入口 |
| 3.1 充值对账 | `auto-reconciliation.ts` `checkRechargeOrders()` | 已实现 |
| 3.2 消费对账 | `auto-reconciliation.ts` `checkConsumptionRecords()` | 已实现 |
| 3.3 佣金对账 | `auto-reconciliation.ts` `checkCommissionAccuracy()` | 已实现 |
| 3.4 提现对账 | `auto-reconciliation.ts` `checkWithdrawRecords()` | 已实现 |
| 3.5 余额对账 | `auto-reconciliation.ts` `checkBalanceConsistency()` + `checkUserBalanceConsistency()` | 已实现 |
| 4.1 报告结构 | `reconciliation-types.ts` `ReconciliationReport` | 已定义 |
| 4.2 资金平衡 | `reconciliation-utils.ts` `checkBalance()` | 已实现 |
| 4.3 PDF 导出 | `pdf-export.ts` `generateReconciliationPDF()` | 已实现 |
| 4.3 CSV 导出 | `reconciliation-core.ts` `streamExportReconCsv()` + routes | 已实现 |
| 5.3 标记已解决 | `auto-reconciliation.ts` `resolveMismatch()` | 已实现 |
| 5.4 告警通知 | `auto-reconciliation.ts` `sendReconciliationAlert()` | 骨架已实现（TODO）|
| 8.0 管理端路由 | `reconciliation.ts` routes | 已实现 |
| 差异状态机 | 未实现（当前只有 resolved boolean） | 需扩展为 status 字段 |

### 附录：待增强项

1. **差异状态机**：当前 `reconciliation_mismatches` 只有 `resolved` boolean，需扩展为 `status` 枚举（pending/processing/resolved/false_positive/ignored）+ `resolvedAt`/`resolvedBy`/`resolutionNote`
2. **自动修复执行器**：差分自动修复脚本（`autoFixMissingRecord()`, `autoAdjustAmount()`），需要在 `FINANCE_COMMISSION` 权限下安全执行
3. **Webhook 告警集成**：完成 `sendReconciliationAlert()` 中的钉钉/飞书推送
4. **趋势图表数据**：前端 TrendChart 组件所需的折线图数据已就绪，需补充前端实现
5. **异步流程调度**：长对账任务（月结）可采用后台任务（TaskFlow），避免 HTTP 请求超时
6. **运维审计日志**：所有人工修复操作（补单、调额、撤销）需写入操作审计表
