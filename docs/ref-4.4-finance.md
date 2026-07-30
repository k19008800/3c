# 财务管理 — 深化参考文档

> **对应章节**：[PRD-README.md §4.4 财务管理](../PRD-README.md#44-财务管理) + [§5.2 计费与结算精化](../PRD-README.md#52-计费与结算精化)
> **状态**：基于现有后端代码（`api/src/db/schema/billing.ts`、`api/src/db/schema/finance.ts`、`api/src/routes/admin/finance/*.ts`、`api/src/services/billing/`、`api/src/services/reconciliation/`）生成
> **粒度**：Schema 字段定义 → API 接口 → 前端组件 Props → 商业逻辑 → 交叉引用

---

## 目录

1. [价格引擎与计费链路](#1-价格引擎与计费链路)
2. [充值管理（多通道）](#2-充值管理)
3. [发票管理](#3-发票管理)
4. [退款管理](#4-退款管理)
5. [财务仪表盘](#5-财务仪表盘)
6. [自动对账引擎](#6-自动对账引擎)
7. [账单与财务日报](#7-账单与财务日报)
8. [跨模块数据流](#8-跨模块数据流)

---

## 1. 价格引擎与计费链路

### 1.1 价格层级六层实现

#### L0 — 供应商成本价

**`vendor_models` 表字段**：
```typescript
inputPrice: numeric("input_price", { precision: 18, scale: 6 })  // ¥/token
outputPrice: numeric("output_price", { precision: 18, scale: 6 }) // ¥/token
```

#### L1 — 平台标准价

**`site_configs`**：`default_markup` — 全局加价率（百分比）
```
标准售价 = 成本价 × (1 + markup_rate)
```
如：`inputPrice=0.000001`, `markup=50%` → `sellPrice=0.0000015 `

#### L2 — 模型覆盖价

**`vendor_models` 表字段**：
```typescript
sellPriceInput: numeric("sell_price_input", { precision: 18, scale: 6 })
sellPriceOutput: numeric("sell_price_output", { precision: 18, scale: 6 })
```
不为 null 时覆盖 L1 计算值。

#### L3 — Key 组内 Key 独立售价

**`vendor_key_group_items` 表**（每个 Key 自己的 sellPrice）：
```typescript
sellPriceInput: numeric("sell_price_input", { precision: 18, scale: 6 })
sellPriceOutput: numeric("sell_price_output", { precision: 18, scale: 6 })
```
不为 null 时覆盖 L2。

#### L4 — Key-Model 交叉定价

**`vendor_key_group_model_prices` 表**：
```typescript
type: varchar("type", { length: 10 })    // "percent" | "absolute"
// percent: 在 vendor_model sellPrice 上打折
//   inputValue: 折扣率（如 0.80 = 8折）
// absolute: 直接固定售价
inputValue: numeric("input_value", { precision: 18, scale: 6 })
outputValue: numeric("output_value", { precision: 18, scale: 6 })
```

#### L5 — 活动价

**`campaign_prices` 表**（同一模型在活动期间的特殊价格）。

### 1.2 优先级计算

```
L5 活动价 > L4 Key-Model 交叉价 > L3 Key 独立价 > L2 模型覆盖价 > L1 标准价
```

实现参考 `api/src/services/billing/pricing.ts`：
```typescript
function resolveSellPrice(vendorModel, keyItem, keyModelPrice, campaignPrice) {
  // 优先级链：活动价 → Key-Model交叉价 → Key独立价 → 模型覆盖价 → 标准价
  if (campaignPrice) return { input: campaignPrice.input, output: campaignPrice.output, source: 'campaign' };
  if (keyModelPrice?.type === 'absolute') return { input: keyModelPrice.inputValue, output: keyModelPrice.outputValue, source: 'key_model_absolute' };
  if (keyModelPrice?.type === 'percent') return { input: vendorModel.sellPrice * keyModelPrice.inputValue, output: vendorModel.sellPrice * keyModelPrice.outputValue, source: 'key_model_percent' };
  if (keyItem?.sellPriceInput) return { input: keyItem.sellPriceInput, output: keyItem.sellPriceOutput, source: 'key_item' };
  if (vendorModel.sellPriceInput) return { input: vendorModel.sellPriceInput, output: vendorModel.sellPriceOutput, source: 'model' };
  return { input: costPrice * (1 + defaultMarkup), output: costPrice * (1 + defaultMarkup), source: 'standard' };
}
```

### 1.3 实时计费链路

```
用户请求 → ① 解析 model
        → ② resolveSellPrice() 确定实际售价（来源标记：model/key_item/key_model/campaign）
        → ③ 预估费用 = max_tokens × inputPrice + max_tokens × outputPrice
        → ④ 预扣余额（转余额表 balance_logs, type="pre_charge"）
        → ⑤ 转发请求到上游
        → ⑥ 获取响应（含实际 tokens）
        → ⑦ 实际费用 = input_tokens × inputPrice + output_tokens × outputPrice（降级为非流式计算）
        → ⑧ 多退少补（type="charge_adjust"）
        → ⑨ 写入 call_logs（含 priceSource / keySellPriceInput / discountType 等价格溯源字段）
        → ⑩ 更新用户余额

call_logs 价格溯源字段：
  - priceSource: "vendor_model" | "key_item" | "key_model" | "campaign"
  - priceSourceId: 上述表的对应 ID
  - discountType: "percent" | "absolute" | null
  - keySellPriceInput: 实际生效的输入售价
  - keySellPriceOutput: 实际生效的输出售价
```

### 1.4 用户折扣

**`user_discounts` 表**：
```typescript
export const userDiscounts = pgTable("user_discounts", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).notNull().default("1.0000"), // 1.0000 = 无折扣
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```
作用：对特定用户的整体折扣率（如 VIP 用户 8 折 = 0.8000）。在价格优先级链末尾应用。

### 1.5 API 接口

#### GET `/api/v1/admin/pricing/profit-records?period=2026-07` — 利润分析

**响应**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "vendorModelId": 1,
        "modelName": "deepseek-chat",
        "vendorName": "DeepSeek",
        "totalCalls": 12345,
        "totalTokens": 56789012,
        "totalUserCost": "23450.000000",
        "totalCostPrice": "15826.000000",
        "grossProfit": "7624.000000",
        "grossMargin": "32.500000"
      }
    ],
    "summary": {
      "totalUserCost": "54321.000000",
      "totalCostPrice": "40876.500000",
      "grossProfit": "13444.500000",
      "grossMargin": "24.750000"
    }
  }
}
```

#### GET `/api/v1/admin/finance/dashboard` — 财务总览

**响应**：
```json
{
  "code": 0,
  "data": {
    "income": {
      "monthTotal": "54321.000000",
      "monthComparison": 12.3,
      "todayTotal": "1890.500000",
      "todayComparison": -2.1,
      "breakdown": {
        "recharge": { "amount": "45000.000000", "ratio": 82.8 },
        "agentRecharge": { "amount": "8000.000000", "ratio": 14.7 },
        "other": { "amount": "1321.000000", "ratio": 2.4 }
      },
      "topModels": [
        { "modelName": "deepseek-chat", "amount": "23450.000000", "ratio": 43.2 }
      ]
    },
    "expense": {
      "monthTotal": "40876.500000",
      "incomeRatio": 75.2,
      "breakdown": [
        { "vendorName": "DeepSeek", "amount": "25600.000000", "ratio": 62.6 }
      ]
    },
    "profit": {
      "grossProfit": "13444.500000",
      "grossMargin": 24.8,
      "modelMargins": [
        { "modelName": "deepseek-chat", "grossMargin": 32.5, "tag": "high" }
      ]
    },
    "monthTrend": [
      { "date": "2026-07-01", "income": 1800, "expense": 1300, "profit": 500 }
    ]
  }
}
```

---

## 2. 充值管理

### 2.1 充值表结构（`recharge_orders`）

```typescript
export const rechargeOrders = pgTable("recharge_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  orderNo: varchar("order_no", { length: 64 }).notNull().unique(),   // 格式：RCH-YYYYMMDD-XXXXX
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  channel: payChannelEnum("channel").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),

  // 在线支付
  channelOrderNo: varchar("channel_order_no", { length: 128 }),      // 微信/支付宝订单号
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // 对公转账
  voucherImage: varchar("voucher_image", { length: 500 }),           // 转账凭证图片
  voucherNo: varchar("voucher_no", { length: 32 }),                 // 凭证号
  payerAccountName: varchar("payer_account_name", { length: 128 }), // 付款方户名
  payerAccountNo: varchar("payer_account_no", { length: 64 }),      // 付款方账号
  transferRemark: varchar("transfer_remark", { length: 256 }),      // 转账备注
  bankTxId: varchar("bank_tx_id", { length: 64 }),                  // 银行流水号
  bankTxCheckedAt: timestamp("bank_tx_checked_at", { withTimezone: true }),

  // 双审确认（对公）
  firstConfirmedBy: integer("first_confirmed_by").references(() => users.id),
  firstConfirmedAt: timestamp("first_confirmed_at", { withTimezone: true }),
  secondConfirmedBy: integer("second_confirmed_by").references(() => users.id),
  secondConfirmedAt: timestamp("second_confirmed_at", { withTimezone: true }),

  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**索引**：
- `recharge_orders_order_no_idx` (unique) — 订单号快速检索
- `recharge_orders_user_created_at_idx` — 用户充值历史
- `recharge_orders_status_idx` — 按状态筛选

### 2.2 充值通道

| 通道 | enum 值 | 到账方式 | 审核要求 |
|------|---------|---------|---------|
| 支付宝在线 | `alipay` | 支付宝支付 → 回调自动到账 | 自动 |
| 微信在线 | `wechat` | 微信支付 → 回调自动到账 | 自动 |
| 对公转账 | `bank_transfer` | 人工审核凭证 → 双审确认 | 财务双审 |

**对公转账双审流程**：
```
用户上传转账凭证
  → 财务初审（firstConfirm）：核对金额、户名、备注
  → 财务复审（secondConfirm）：再次确认、关联银行流水
  → 余额到账（更新 user balance + balance_logs）
```

### 2.3 API 接口

#### POST `/api/v1/recharge` — 发起充值

**请求**（在线支付）：
```json
{
  "amount": "100.000000",
  "channel": "alipay"
}
```

**请求**（对公转账）：
```json
{
  "amount": "5000.000000",
  "channel": "bank_transfer",
  "voucherImage": "https://...upload.jpg",
  "payerAccountName": "某某某",
  "payerAccountNo": "6222021234567890",
  "transferRemark": "3cloud 充值"
}
```

#### POST `/api/v1/admin/recharge-orders/:id/first-confirm` — 初审

```json
{ "action": "approve", "remark": "金额核对一致" }
```

#### POST `/api/v1/admin/recharge-orders/:id/second-confirm` — 复审（到账）

```json
{ "action": "approve", "bankTxId": "BOC20260726XXXX" }
```

#### POST `/api/v1/admin/recharge-orders/:id/force-complete` — 补单（异常订单）

```json
{ "reason": "支付成功回调未到" }
```

#### GET `/api/v1/admin/recharge-orders` — 充值订单列表

**Query**: `page`, `pageSize`, `status`, `channel`, `startDate`, `endDate`, `search`

**响应**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "orderNo": "RCH-20260726-00001",
        "userId": 10086,
        "nickname": "张三",
        "amount": "100.000000",
        "channel": "alipay",
        "status": "success",
        "createdAt": "2026-07-26T11:35:00.000Z",
        "paidAt": "2026-07-26T11:35:02.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

#### GET `/api/v1/admin/recharge-orders/:id` — 订单详情（含审计信息）

### 2.4 前端充值管理页面

```
admin → 财务 → 充值订单
├── 筛选栏（状态/通道/时间/搜索）
│
├── 统计卡片
│   ├── 今日充值笔数
│   ├── 今日充值总额
│   └── 待确认对公笔数
│
├── 订单列表（表格）
│   ├── 订单号
│   ├── 用户昵称
│   ├── 金额
│   ├── 通道（标签：支付宝/微信/对公）
│   ├── 状态（成功/待审核/待支付/异常/已过期）
│   ├── 创建时间
│   └── 操作（详情/补单/退款）
│
└── 订单详情弹窗
    ├── 订单信息
    ├── 支付信息（通道订单号/凭证图片/付款方信息）
    ├── 双审日志时间线
    ├── 异常补单操作
    └── 退款操作（仅已支付订单）
```

**RechargeOrderDetailModal Props**：
```typescript
interface RechargeOrderDetailModalProps {
  open: boolean;
  onClose: () => void;
  orderId: number;
  onUpdated: () => void;
}

interface RechargeOrderDetail {
  id: number;
  orderNo: string;
  userId: number;
  nickname: string;
  amount: string;
  channel: "alipay" | "wechat" | "bank_transfer";
  status: OrderStatus;  // pending | success | failed | expired | abnormal
  channelOrderNo?: string;
  paidAt?: string;
  // 对公特有
  voucherImage?: string;
  payerAccountName?: string;
  payerAccountNo?: string;
  transferRemark?: string;
  bankTxId?: string;
  firstConfirmedBy?: number;
  firstConfirmedAt?: string;
  secondConfirmedBy?: number;
  secondConfirmedAt?: string;
  // 退款
  refundedAt?: string;
  createdAt: string;
}

type OrderStatus = "pending" | "success" | "failed" | "expired" | "abnormal";
```

---

## 3. 发票管理

### 3.1 发票表结构（`invoice_requests`）

```typescript
export const invoiceRequests = pgTable("invoice_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  invoiceType: varchar("invoice_type", { length: 10 }).notNull().default("normal"), // normal | special | electronic
  invoiceTitle: varchar("invoice_title", { length: 255 }).notNull(),                // 发票抬头
  invoiceTaxId: varchar("invoice_tax_id", { length: 50 }),                          // 税号
  bankName: varchar("bank_name", { length: 255 }),                                  // 开户行
  bankAccount: varchar("bank_account", { length: 100 }),                            // 银行账号
  companyAddress: varchar("company_address", { length: 500 }),                      // 地址
  companyPhone: varchar("company_phone", { length: 20 }),                           // 电话
  refOrderId: integer("ref_order_id").references(() => rechargeOrders.id),          // 关联充值订单

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending → reviewing → approved → issued → delivered
  //                      → rejected

  reviewerId: integer("reviewer_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),

  invoiceNo: varchar("invoice_no", { length: 64 }),               // 发票号码
  invoiceFileUrl: varchar("invoice_file_url", { length: 500 }),   // 发票文件（PDF/图片）
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  issuedBy: integer("issued_by").references(() => users.id),

  expressCompany: varchar("express_company", { length: 100 }),    // 快递公司
  expressNo: varchar("express_no", { length: 100 }),              // 快递单号

  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**发票状态流转**：
```
pending → reviewing → approved → issued → delivered
                      → rejected（退回原因）
```

### 3.2 API 接口

#### POST `/api/v1/invoices` — 申请发票

**请求**：
```json
{
  "amount": "5000.000000",
  "invoiceType": "normal",
  "invoiceTitle": "某某科技有限公司",
  "invoiceTaxId": "91440101MA5XXXXXX",
  "bankName": "中国工商银行广州分行",
  "bankAccount": "3602XXXXXXXXXXX",
  "companyAddress": "广州市天河区XXX",
  "companyPhone": "020-XXXXXXXX",
  "refOrderId": 123
}
```

**校验**：
- 已开票金额 ≤ 已消费/充值金额（防止超额开票）
- 同一订单不能多次开票

#### GET `/api/v1/invoices` — 我的发票列表

#### GET `/api/v1/admin/invoices` — 管理员发票列表

**Query filters**: `status`, `userId`, `invoiceType`, `startDate`, `endDate`, `search`

#### POST `/api/v1/admin/invoices/:id/review` — 审核

```json
{ "action": "approve" | "reject", "rejectReason": "抬头信息不全" }
```

#### POST `/api/v1/admin/invoices/:id/issue` — 开票

```json
{ "invoiceNo": "12345678", "invoiceFileUrl": "https://...", "expressCompany": "顺丰", "expressNo": "SF1234567890" }
```

### 3.3 前端发票管理页面

```
admin → 财务 → 发票管理
├── 状态标签（全部/待审核/已通过/已开票/已送达）
├── 列表（表格）
│   ├── 申请人
│   ├── 金额
│   ├── 类型（普通/专用/电子）
│   ├── 抬头/税号
│   ├── 状态
│   ├── 申请时间
│   └── 操作（审核/开票/查看）
│
└── 开票弹窗
    ├── 发票信息确认
    ├── 发票号码输入
    ├── 发票文件上传
    └── 快递信息
```

---

## 4. 退款管理

### 4.1 退款表结构（`refund_requests`）

```typescript
export const refundRequests = pgTable("refund_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
  refundType: varchar("refund_type", { length: 20 }).notNull(),
  // fee_refund | order_refund | api_refund
  reason: text("reason").notNull(),
  refCallLogId: integer("ref_call_log_id"),      // 调用退款
  refOrderId: integer("ref_order_id").references(() => rechargeOrders.id), // 充值退款

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending → reviewing → approved → completed
  //                      → rejected

  reviewerId: integer("reviewer_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**退款类型**：
| 类型 | 说明 | 退到哪里 |
|------|------|---------|
| `fee_refund` | 余额退费 | 退回用户余额 |
| `order_refund` | 充值订单退款 | 原路退回（通道）+ 余额回滚 |
| `api_refund` | API 调用退款（失败计费） | 退回用户余额 |

### 4.2 API 接口

#### POST `/api/v1/admin/refunds/:id/review` — 审核退款

```json
{ "action": "approve" | "reject", "rejectReason": "...", "refundToBalance": true }
```

#### POST `/api/v1/admin/refunds/:id/execute` — 执行退款

**操作**：
1. 更新 refundRequests.status → completed
2. 如果是调用的退款 → `updateHealthAfterCall` + 调整用户余额
3. 如果是充值订单退款 → 标记 `rechargeOrders.refundedAt`
4. 写入 `balance_logs` (type=refund)

### 4.3 前端退款管理页面

```
admin → 财务 → 退款管理
├── 状态筛选
├── 列表（表格）
│   ├── 退款类型
│   ├── 用户
│   ├── 金额
│   ├── 原因
│   ├── 状态
│   └── 操作
│
└── 审核弹窗
    ├── 退款详情
    ├── 用户账户状况
    ├── 审核操作（通过/拒绝）
    └── 执行退款（审核通过后）
```

---

## 5. 财务仪表盘

### 5.1 API 路由

```
GET /api/v1/admin/finance/dashboard           — 收入/支出/利润总览
GET /api/v1/admin/finance/dashboard/trends     — 近 30 天趋势
GET /api/v1/admin/finance/dashboard/top-models — 按模型收入 Top N
GET /api/v1/admin/profit/records?period=2026-07 — 利润明细
```

### 5.2 已实现指标

| 指标 | API 来源 | 聚合粒度 |
|------|---------|---------|
| 本月收入 | `call_logs.cost` SUM | 月度 |
| 今日收入 | `call_logs.cost` SUM（当天）| 当天 |
| 收入构成（充值/代理/其他） | `recharge_orders.channel` + `agents` | 月度 |
| 按模型收入 Top 5 | `call_logs.modelName` GROUP BY | 月度 |
| 本月支出 | `call_logs.cost` SUM（成本价）| 月度 |
| 支出构成（按供应商） | `call_logs.vendorName` GROUP BY | 月度 |
| 毛利润 | 用户收入 - 供应商成本 | 月度 |
| 毛利率趋势 | `finance_profit_records` 表 | 近 12 个月 |
| 按模型毛利率 | `finance_profit_records` 表 | 月度 |

### 5.3 利润分析表（`finance_profit_records`）

```typescript
export const financeProfitRecords = pgTable("finance_profit_records", {
  period: varchar("period", { length: 7 }).notNull(),    // "2026-07"
  vendorModelId: integer("vendor_model_id"),
  modelId: integer("model_id"),
  vendorId: integer("vendor_id"),
  totalCalls: integer("total_calls"),
  totalTokens: bigint("total_tokens", { mode: "number" }),
  totalUserCost: numeric("total_user_cost", { precision: 18, scale: 6 }),   // 用户总付费
  totalCostPrice: numeric("total_cost_price", { precision: 18, scale: 6 }), // 供应商总成本
  grossProfit: numeric("gross_profit"),    // 毛利润 = totalUserCost - totalCostPrice
  grossMargin: numeric("gross_margin"),    // 毛利率 = grossProfit / totalUserCost * 100
  totalCommission: numeric("total_commission"), // 佣金总支出
  computedAt: timestamp("computed_at"),
});
```

### 5.4 前端仪表盘组件规格

```
admin → 财务总览
├── 收入分析面板
│   ├── 本月收入 ¥（同比箭头）
│   ├── 今日收入 ¥（环比箭头）
│   ├── 收入构成饼图（充值/代理/其他）
│   ├── 按模型收入 Top 5 条形图
│   └── 收入趋势折线图（近 30 天）
│
├── 支出分析面板
│   ├── 本月支出 ¥（占收入比 %）
│   ├── 支出构成饼图（按供应商）
│   └── 支出趋势折线图
│
└── 利润分析面板
    ├── 本月毛利润 ¥
    ├── 毛利率 %
    ├── 按模型毛利率（带颜色标注：绿/黄/红）
    └── 毛利率趋势柱状图（近 12 个月）
```

**FinanceDashboardProps**：
```typescript
interface FinanceDashboardProps {
  income: {
    monthTotal: number;
    monthComparison: number;     // 同比百分比
    todayTotal: number;
    todayComparison: number;     // 环比百分比
    breakdown: { label: string; amount: number; ratio: number }[];
    topModels: { modelName: string; amount: number; ratio: number }[];
    trend: { date: string; amount: number }[];
  };
  expense: {
    monthTotal: number;
    incomeRatio: number;
    breakdown: { vendorName: string; amount: number; ratio: number }[];
    trend: { date: string; amount: number }[];
  };
  profit: {
    grossProfit: number;
    grossMargin: number;
    modelMargins: { modelName: string; grossMargin: number; tag: 'high' | 'average' | 'low' }[];
    marginTrend: { date: string; margin: number }[];
  };
  onRefresh: () => void;
}
```

---

## 6. 自动对账引擎

### 6.1 对账表结构

#### `daily_recon_summary` — 日报对账汇总

```typescript
export const dailyReconSummary = pgTable("daily_recon_summary", {
  reportDate: varchar("report_date", { length: 10 }).notNull().unique(),
  // 佣金
  commissionCount: integer("commission_count"),
  commissionTotal: numeric("commission_total"),
  commissionFee: numeric("commission_fee"),
  commissionNet: numeric("commission_net"),
  // 提现
  withdrawCount: integer("withdraw_count"),
  withdrawTotal: numeric("withdraw_total"),
  withdrawFee: numeric("withdraw_fee"),
  withdrawActual: numeric("withdraw_actual"),
  // 充值
  rechargeCount: integer("recharge_count"),
  rechargeTotal: numeric("recharge_total"),
  // 消耗
  consumptionTotal: numeric("consumption_total"),
  // 资金平衡校验
  balanceDiff: numeric("balance_diff"),    // 差异 = 充值 + 消耗 + 提现 + 佣金
  isBalanced: boolean("is_balanced"),      // 是否平衡
  version: integer("version"),            // 乐观锁
  computedAt: timestamp("computed_at"),
});
```

#### `reconciliation_reports` — 对账报告

```typescript
export const reconciliationReports = pgTable("reconciliation_reports", {
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  totalOrders: integer("total_orders"),
  matchedOrders: integer("matched_orders"),
  mismatchedOrders: integer("mismatched_orders"),
  totalAmount: numeric("total_amount"),
  difference: numeric("difference"),
  reconType: varchar("recon_type", { length: 20 }),  // full | recharge | balance | commission
  status: varchar("status", { length: 20 }),          // pending | running | completed | failed
  mismatches: jsonb("mismatches"),                    // 异常记录
});
```

#### `reconciliation_mismatches` — 异常明细

```typescript
export const reconciliationMismatches = pgTable("reconciliation_mismatches", {
  reportId: integer("report_id").references(() => reconciliationReports.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  refType: varchar("ref_type", { length: 50 }),        // recharge_order | balance_log | commission_log | payment_callback
  refId: integer("ref_id"),
  mismatchType: varchar("mismatch_type", { length: 50 }), // status_mismatch | amount_mismatch | missing_record | calculation_error
  expectedValue: numeric("expected_value"),
  actualValue: numeric("actual_value"),
  reason: text("reason"),
  severity: varchar("severity", { length: 10 }),        // low | medium | high | critical
  resolved: boolean("resolved"),
});
```

### 6.2 对账流程

```
每日 02:00 定时运行（cron）：
1. 拉取前一天所有数据（call_logs / recharge_orders / withdraw_orders / commission_logs）
2. 计算资金平衡校验公式：
   期初余额A + 充值 - 消耗 - 提现 - 佣金支出 - 退款 = 期末余额B
   balanceDiff = |A - B|
3. 生成 daily_recon_summary（如果 balanceDiff > 0.01 则 isBalanced=false）
4. 更新 reconciliation_reports 汇总

每月 5 日：
1. 执行上月份完整对账
2. 生成 reconciliation_mismatches
3. 通知管理员处理异常
```

### 6.3 API 接口

#### GET `/api/v1/admin/finance/reconciliation` — 对账报告列表

**Query**: `reconType`, `startDate`, `endDate`, `status`

#### GET `/api/v1/admin/finance/reconciliation/:id` — 报告详情（含异常明细）

#### POST `/api/v1/admin/finance/reconciliation/create` — 手动触发对账

```json
{ "startDate": "2026-07-01", "endDate": "2026-07-26", "reconType": "full" }
```

#### PATCH `/api/v1/admin/finance/reconciliation/mismatch/:id/resolve` — 处理异常

```json
{ "resolutionNote": "已确认，是支付回调延迟导致" }
```

### 6.4 前端对账页面

```
admin → 财务 → 自动对账
├── 对账报告列表
│   ├── 报告时段
│   ├── 对账类型
│   ├── 总订单 / 匹配 / 异常
│   ├── 状态（pending/running/completed/failed）
│   └── 操作（查看详情/导出）
│
├── 报告详情
│   ├── 汇总卡片（总金额、差异、匹配率）
│   ├── 异常列表
│   │   ├── 异常类型标签（金额不一致/状态不匹配/缺失记录）
│   │   ├── 期望值 vs 实际值
│   │   ├── 严重等级（低/中/高/严重）
│   │   └── 操作（标记已处理/忽略）
│   └── 资金平衡验证结果（✅ 平衡 / ❌ 差异 ¥X）
│
└── 手动触发对账按钮
```

---

## 7. 账单与财务日报

### 7.1 账单 PDF 生成

**API**：`POST /api/v1/admin/billing/generate-pdf`

**实现参考**：`api/src/services/billing-pdf.ts`

**账单内容结构**：
```
1. 头部：3cloud 标识 + 账单周期
2. 汇总：总消费 / 总调用 / 总 Token
3. 按模型汇总（含占比百分比）
4. 按日汇总折线图
5. 消费明细表（每笔 call_logs）
6. 末尾：生成时间、联系方式
```

### 7.2 财务日报自动生成

**每日定时任务**（`daily-summary.ts`）：

```typescript
// 每天 00:15 执行
async function generateDailySummary(date: string) {
  // 1. 清算当日 call_logs 总额
  // 2. 清算当日充值总额
  // 3. 清算当日佣金总额
  // 4. 获取用户余额变动
  // 5. 写入 daily_recon_summary
  // 6. 资金平衡校验
  // 7. 如有差异 → 创建 reconciliation_mismatches
}
```

### 7.3 API

#### GET `/api/v1/admin/finance/daily-summary?startDate=&endDate=` — 日报查询

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "reportDate": "2026-07-25",
      "commissionTotal": "1234.56",
      "withdrawTotal": "500.00",
      "rechargeTotal": "8000.00",
      "consumptionTotal": "4567.89",
      "isBalanced": true,
      "balanceDiff": "0.000000"
    }
  ]
}
```

---

## 8. 跨模块数据流

### 8.1 财务核心调用链

```
充值（recharge_orders → balance_logs）
  ├── 在线支付：用户支付 → 回调 → 余额增加
  └── 对公转账：上传凭证 → 初审 → 复审 → 余额增加
        │
        ▼
用户消费（call_logs → billing 服务）
  ├── 预扣余额 → 转发请求 → 实际计费 → 多退少补
  ├── 写入 call_logs（含价格溯源字段）
  └── 触发佣金计算（billing/commission.ts）
        │
        ▼
佣金（commission_logs → agent_settlements）
  ├── 每次消费触发佣金记录（pending）
  ├── 结算周期触发 → 转为 settled
  └── 代理可提现余额增加
        │
        ▼
提现（withdraw_orders）
  ├── 代理发起 → 初审 → 复审 → 打款
  └── 标记 paid → 更新 agent 财务字段
        │
        ▼
每日对账（daily_recon_summary）
  └── 验证：充值 - 消耗 - 提现 - 佣金 = 余额变动
```

### 8.2 依赖模块

| 模块 | 依赖 | 说明 |
|------|------|------|
| `billing/index.ts` | `call_logs`, `balance_logs`, `agent_clients` | 计费核心 |
| `billing/commission.ts` | `commission_rules`, `commission_logs` | 佣金计算 |
| `billing-pdf.ts` | `call_logs`, `models` | 账单 PDF 生成 |
| `recharge-service/` | `recharge_orders`, `balance_logs` | 充值服务 |
| `invoice-service/` | `invoice_requests` | 发票服务 |
| `refund-service/` | `refund_requests`, `balance_logs` | 退款服务 |
| `reconciliation/` | 所有财务表 | 对账引擎 |
| `daily-summary/` | `daily_recon_summary` | 日报生成 |
| `profit-service/` | `finance_profit_records` | 利润分析 |
| `payment-adapter/` | 支付通道回调 | 支付适配器 |
| `payment-security.ts` | 支付风控 | 风控检查 |

### 8.3 关联文档

| 文档 | 关联内容 |
|------|---------|
| [PRD-README.md §4.4](../PRD-README.md#44-财务管理) | 财务总纲 |
| [PRD-README.md §5.2](../PRD-README.md#52-计费与结算精化) | 计费/账单/对账 |
| [ref-3-agent-system.md](ref-3-agent-system.md) | 代理佣金与提现 |
| [ref-5.1-routing.md](ref-5.1-routing.md) | 路由 - 转发计费前提 |
| [sprint-1/03-settlement-overview.md](sprint-1/03-settlement-overview.md) | 结算对账原始需求 |

### 8.4 关键约束

1. **价格溯源性**：每笔 call_logs 必须记录 `priceSource` + `priceSourceId`，支持财务审计回溯
2. **乐观锁**：`daily_recon_summary.version` 防止并发重复生成
3. **资金平衡校验**：每日必须通过公式验证，差异 > ¥0.01 标记异常
4. **退款不可超额**：退款金额 ≤ 充值金额 - 已消费金额
5. **对公转账双审**：必须两岗确认，不能同一人初审+复审
6. **预扣安全性**：预扣金额 ≥ ¥0.01，防止零元订单绕过余额检查
7. **发票限额**：已开票总金额 ≤ 用户实际累计充值/消费金额（按发票类型）

---

> **文档版本**：v1.0 — 2026-07-28  
> **编写依据**：`api/src/db/schema/billing.ts`, `api/src/db/schema/finance.ts`, `api/src/routes/admin/finance/*.ts`, `api/src/services/billing/`, `api/src/services/reconciliation/`, `api/src/services/billing-pdf.ts`  
> **下一步建议**：添加发票/退款/对账的前端页面组件实现

---

## 边界条件

### 模块概述

财务管理模块涵盖价格引擎与计费链路、充值管理、发票管理、退款管理、财务仪表盘、自动对账引擎、账单与财务日报等。

### 边界条件清单

| # | 场景 | 触发条件 | 预期行为 | 影响范围 | 优先级 |
|---|------|---------|---------|---------|--------|
| FIN-001 | 账务不平自动检测 | 对账引擎发现账户流水与供应商账单之间的金额不一致 | 自动标记差异记录为 `RECONCILE_MISMATCH`，生成对账差异报告；差异 < 0.01 元的自动按舍入处理；差异 >= 0.01 元的创建异常工单通知财务团队 | 该对账周期 | P0 |
| FIN-002 | 多币种汇率过期 | 系统使用的汇率数据超过有效期（如 24h 未更新） | 冻结使用过期汇率进行的新交易，已有进行中的交易使用过期汇率完成；触发汇率更新任务，若 1h 内仍未更新则通知管理员 | 涉及该币种的全部交易 | P0 |
| FIN-003 | 财务报表导出数据一致性 | 生成报表过程中有新交易发生 | 报表使用快照隔离级别（`SERIALIZABLE` 或 `REPEATABLE READ`），基于导出时刻的一致性快照，不受后续交易影响 | 该报表 | P0 |
| FIN-004 | 余额并发扣减（防止通兑超扣） | 多个不相关的消费操作同时并发扣减同一账户余额 | 使用行级锁（`SELECT ... FOR UPDATE`）保证原子性；若扣减后余额为负，事务回滚并返回错误 | 该账户 | P0 |
| FIN-005 | 退款时账户余额不足 | 用户申请退款时账户可用余额小于退款金额 | 支持负余额退款（平台先行垫付），记录为"负余额"状态，用户下次充值时优先抵扣；退款金额需从平台运营账户划扣 | 退款流程 | P0 |
| FIN-006 | 发票重复开具 | 同一笔交易被误操作重复申请开票 | 每笔交易增加 `invoice_status` 字段 + `invoice_id` 唯一约束；重复申请时返回"该交易已开具发票"错误 | 开票流程 | P0 |
| FIN-007 | 自动对账引擎停摆 | 对账引擎因依赖服务（如供应商 API）不可用而无法完成对账 | 标记该供应商对账为 `PENDING`，继续处理其他供应商；对账任务设置超时（默认 30 分钟），超时后标记为 `TIMEOUT` 并通知管理员手动处理 | 该供应商对账 | P1 |
| FIN-008 | 财务日报计算超时 | 当日交易量过大导致财务日报计算超过预定时长 | 日报计算设置超时（默认 10 分钟），超时后暂停计算；采取增量计算策略：按小时粒度预汇总，日报时合并小时汇总结果 | 日报 | P1 |

### 详细边界说明

#### FIN-001: 账务不平自动检测

**对账差异处理**:
```
差异金额 < 0.01 元 → 自动按舍入处理 → 对账日志记录
差异金额 >= 0.01 元 → 创建差异记录 → 状态: UNRESOLVED
  → 自动重对比（重试 2 次，间隔 5 分钟）
  → 仍不平 → 创建工单 → 通知财务团队
  → 工单处理周期：P0 级 4 小时内响应
```

**差异来源分析**:
- 时间差异（服务时间 vs 供应商结算时间 T+1）
- 舍入差异（不同系统计数精度不一致）
- 价格变更差异（历史计价 vs 新价格）
- 汇率差异（多币种结算）

#### FIN-004: 余额并发扣减

**技术实现**:
```sql
-- 使用行级锁保证原子扣减
BEGIN;
SELECT balance, version FROM user_balances WHERE user_id = ? FOR UPDATE;
-- 校验 balance >= amount
UPDATE user_balances SET balance = balance - ?, version = version + 1
  WHERE user_id = ? AND version = old_version;
-- 若 affected_rows = 0，说明并发修改，回滚
COMMIT;
```

### 异常流程汇总

| 场景 | 恢复策略 | 是否通知 |
|------|---------|---------|
| 账务不平 | 自动标记 + 创建工单 | 财务团队通知 |
| 汇率过期 | 冻结 + 强制更新 | P1 运维告警 |
| 并发扣减 | 行级锁 + 事务回滚 | 无（正常竞态） |
| 余额不足退款 | 负余额垫付 | 操作日志 |
| 对账引擎停摆 | 跳过 + 手动处理 | P0 通知 |
| 日报超时 | 增量预汇总 | 操作日志 |
