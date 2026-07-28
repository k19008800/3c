# 3cloud 计费与结算精化（Billing & Settlement）深化文档

> **对应章节**：PRD-README.md §5.2 计费与结算精化
> **最后更新**：2026-07-28
> **定位**：计费引擎的全链路规格，含价格层级、实时计费、预扣退款、账单周期、自动对账、结算结算

---

## 一、架构总览

```
计费引擎
├── 价格引擎（定价查询）
│   ├── L0 供应商成本价
│   ├── L1 平台标准价
│   ├── L2 模型覆盖价
│   ├── L3 代理折扣价
│   ├── L4 分组定价
│   └── L5 活动价
│
├── 实时计费（请求链路）
│   ├── 计算实际费用
│   ├── 实时扣费
│   ├── 写入日志
│   └── 余额检查（允许小额透支）
│
├── 账单周期（月度）
│   ├── 账单生成
│   ├── PDF 生成
│   └── 通知推送
│
├── 自动对账
│   ├── 精确匹配
│   ├── 模糊匹配
│   └── 差异处理
│
└── 供应商结算
    ├── 结算周期
    ├── 佣金计算
    └── 打款流程
```

---

## 二、价格层级

### 2.1 六层定价体系

| 层级 | 名称 | 说明 | 存储位置 | 优先级 |
|------|------|------|---------|-------|
| L0 | 供应商成本价 | 上游原始报价 | `vendor_models.input_price / output_price` | — |
| L1 | 平台标准价 | L0 × (1 + 全局加价率) | 运行时计算 | 最低 |
| L2 | 模型覆盖价 | 特定模型独立售价 | `models.override_input_price / override_output_price` | 中 |
| L3 | 代理折扣价 | 代理名下用户的专属价格 | `agent_commission.discount_rate` | 中高 |
| L4 | 分组定价 | Key 组专属价格 | `key_group_pricing.unit_price` | 高 |
| L5 | 活动价 | 活动期间临时价格 | `campaign_prices.discount_rate` | 最高 |

### 2.2 定价查询流程

```mermaid
flowchart TD
    A[请求到达] --> B{活动价存在?}
    B -->|是| C[使用 L5 活动价]
    B -->|否| D{分组定价存在?}
    D -->|是| E[使用 L4 分组定价]
    D -->|否| F{用户属于代理?}
    F -->|是| G[使用 L3 代理折扣价]
    F -->|否| H{模型覆盖价存在?}
    H -->|是| I[使用 L2 模型覆盖价]
    H -->|否| J[使用 L1 平台标准价]
```

### 2.3 加价率配置

```
全局加价率：site_configs 中配置 "billing.default_markup_rate"

计算公式：
  标准输入价 = 供应商成本输入价 × (1 + 全局加价率)
  标准输出价 = 供应商成本输出价 × (1 + 全局加价率)

示例：
  供应商成本价: input=¥0.0100, output=¥0.0300
  全局加价率: 50%
  标准价: input=¥0.0150, output=¥0.0450
  
  用户折扣率: 0.8（八折）
  实际扣费: input=¥0.0120, output=¥0.0360
```

---

## 三、实时计费流程

### 3.1 计费执行流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant P as 计费引擎
    participant V as 供应商

    U->>P: ① API 请求（含 model / max_tokens）
    P->>P: ② 查询定价（按优先级取价格）
    P->>P: ③ 计算实际费用 = tokens × 价格 / 1,000,000
    P->>P: ④ 检查余额是否低于停止阈值

    alt 余额不足（余额 ≤ 0 且已透支超过停止阈值）
        P-->>U: ⑤ 返回 402 BALANCE_EXHAUSTED
    else 余额充足（含允许的小额透支范围）
        P->>P: ⑥ 实时扣费（直接扣减余额，允许余额为负但不超过停止阈值）
        P->>P: ⑦ 写入 call_logs（status=success + 实际费用）
        P->>P: ⑧ 写入 balance_logs（consumption）
        P->>V: ⑨ 转发请求给供应商
        V-->>P: ⑩ 返回响应
        P-->>U: ⑪ 返回响应
    end
```

### 3.2 计费计算公式

```
Prompt 费用 = prompt_tokens × input_price / 1,000,000
Completion 费用 = completion_tokens × output_price / 1,000,000
总费用 = Prompt 费用 + Completion 费用
实际扣费 = 总费用 × discount_rate（用户折扣率）
```

**精度规则**：
- 费用计算保留 6 位小数
- 最低扣费 ¥0.000001（不足 1 token 的场景）
- 余额以 0 为边界：`Math.max(0, balanceBefore - cost)` 确保余额不会低于 0 写入
- 但请求检查允许小额透支：余额低于 0 但高于 `-alert_stop_balance`（默认 -10 元）时仍可继续消费
- 余额低于 `-alert_stop_balance` 时返回 402 BALANCE_EXHAUSTED

### 3.3 缓存策略

```
价格缓存：LRU 缓存，最多 1000 条
缓存 key：user_id:model_id:key_group_id:campaign_id
TTL：5 分钟（价格变更后最多 5 分钟生效）
```

---

## 四、账单周期

### 4.1 周期定义

| 项目 | 值 |
|------|-----|
| 周期 | 每月 1 日 00:00 ~ 月底 23:59:59 (UTC+8) |
| 生成时间 | 次月 5 日 00:00 |
| 通知方式 | 站内通知 + 邮件（PDF 附件） |
| 下载格式 | PDF（打印版）/ CSV（分析版）|

### 4.2 账单内容结构

```json
{
  "bill": {
    "user_id": 10086,
    "user_name": "张三",
    "period": "2026-07",
    "generated_at": "2026-08-05T00:00:00+08:00",
    "summary": {
      "total_cost": 890.50,
      "total_calls": 123456,
      "total_tokens": 56789012,
      "total_prompt_tokens": 34567890,
      "total_completion_tokens": 22221122
    },
    "by_model": [
      { "model": "deepseek-chat", "cost": 450.20, "percentage": 50.6 },
      { "model": "gpt-4o", "cost": 280.30, "percentage": 31.5 }
    ],
    "by_day": [
      { "date": "2026-07-01", "cost": 12.30, "calls": 1234 },
      { "date": "2026-07-02", "cost": 45.60, "calls": 4567 }
    ],
    "details": [
      { "date": "2026-07-01 10:30", "model": "gpt-4o", "tokens": 1234, "cost": 0.12 }
    ]
  }
}
```

### 4.3 账单 PDF 布局

```
┌────────────────────────────────────────────┐
│  3cloud 账单                                │
│  Bill for July 2026                         │
├────────────────────────────────────────────┤
│  用户: 张三 (user_10086)                     │
│  周期: 2026-07-01 ~ 2026-07-31              │
│  生成时间: 2026-08-05                       │
├────────────────────────────────────────────┤
│  汇总                                       │
│  总消费:  ¥890.50                           │
│  总调用:  123,456 次                        │
│  总 Token: 56,789,012                       │
│  平均单价: ¥0.0000157 / token                │
├────────────────────────────────────────────┤
│  按模型汇总                                  │
│  deepseek-chat (50.6%)  ¥450.20             │
│   调用: 62,345 次    Token: 28,734,567       │
│  gpt-4o (31.5%)       ¥280.30               │
│   调用: 31,234 次    Token: 17,890,123       │
│  deepseek-coder(18.0%) ¥160.00              │
│   调用: 29,877 次    Token: 10,164,322       │
├────────────────────────────────────────────┤
│  按日汇总                                    │
│  07-01  ¥12.30   07-02  ¥45.60  07-03  ¥... │
│  07-04  ...                                 │
├────────────────────────────────────────────┤
│  🔗 下载 CSV 完整明细: [链接]                 │
│  ** 如有疑问请于 2026-08-15 前联系客服 **     │
└────────────────────────────────────────────┘
```

### 4.4 对账差异处理

```
差异类型 → 处理流程：

平台有 - 供应商无（漏报）：
  1. 系统自动标记
  2. 财务逐笔核查 call_logs 原始记录
  3. 确认平台确实有此消费
  4. 联系供应商补录或折扣处理

供应商有 - 平台无（超收）：
  1. 系统自动标记
  2. 检查是否为供应商重复计费
  3. 联系供应商冲正
  4. 记录为供应商待确认

金额不一致：
  1. 检查定价配置是否在周期内变更
  2. 确认用户折扣率是否生效
  3. 按平台记录为准发起争议
```

---

## 五、Drizzle Schema

### 5.1 价格相关字段

```typescript
// vendor_models 表中的价格字段
inputPrice: numeric("input_price", { precision: 18, scale: 6 }).notNull().default("0"),
outputPrice: numeric("output_price", { precision: 18, scale: 6 }).notNull().default("0"),
costInputPrice: numeric("cost_input_price", { precision: 18, scale: 6 }),   // L0 供应商成本
costOutputPrice: numeric("cost_output_price", { precision: 18, scale: 6 }),

// models 表中的覆盖价格
overrideInputPrice: numeric("override_input_price", { precision: 18, scale: 6 }),  // L2 模型覆盖价
overrideOutputPrice: numeric("override_output_price", { precision: 18, scale: 6 }),

// users 表中的折扣率
discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).default("1.0000"),
```

### 5.2 计费日志表

```typescript
export const billingLogs = pgTable("billing_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  callLogId: integer("call_log_id").references(() => callLogs.id),

  // 定价信息
  priceSource: varchar("price_source", { length: 20 }),    // model_price / key_price / campaign
  inputPrice: numeric("input_price", { precision: 18, scale: 6 }),
  outputPrice: numeric("output_price", { precision: 18, scale: 6 }),
  discountRate: numeric("discount_rate", { precision: 5, scale: 4 }),

  // 费用
  estimatedCost: numeric("estimated_cost", { precision: 18, scale: 6 }),  // 预扣金额
  actualCost: numeric("actual_cost", { precision: 18, scale: 6 }),        // 实际费用
  refundAmount: numeric("refund_amount", { precision: 18, scale: 6 }),    // 退还金额

  // 余额
  balanceBefore: numeric("balance_before", { precision: 18, scale: 6 }),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 6 }),

  // 元数据
  status: varchar("status", { length: 20 }).notNull().default("pending"),  // pending / settled / refunded
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 5.3 账单表

```typescript
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  period: varchar("period", { length: 7 }).notNull(),  // YYYY-MM

  // 汇总
  totalCost: numeric("total_cost", { precision: 18, scale: 6 }).notNull(),
  totalCalls: bigint("total_calls", { mode: "number" }).notNull().default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),

  // PDF
  pdfUrl: varchar("pdf_url", { length: 500 }),
  csvUrl: varchar("csv_url", { length: 500 }),

  // 状态
  status: varchar("invoice_status", { length: 20 }).notNull().default("pending"), // pending / generated / sent
  sentAt: timestamp("sent_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 六、API 接口

### 6.1 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/me/balance` | 查询余额 |
| `GET` | `/api/v1/me/balance-logs` | 余额变动流水 |
| `GET` | `/api/v1/me/invoices` | 账单列表 |
| `GET` | `/api/v1/me/invoices/:id/pdf` | 下载账单 PDF |
| `GET` | `/api/v1/me/invoices/:id/csv` | 下载账单 CSV |

### 6.2 管理端

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/billing/prices` | 价格配置列表 | finance_ops 以上 |
| `PUT` | `/api/v1/admin/billing/markup-rate` | 修改全局加价率 | admin 以上 |
| `PUT` | `/api/v1/admin/billing/model-price` | 修改模型价格 | finance_ops 以上 |
| `GET` | `/api/v1/admin/billing/invoices` | 全部账单列表 | finance_ops 以上 |
| `POST` | `/api/v1/admin/billing/invoices/generate` | 手动生成账单 | finance_ops 以上 |
| `GET` | `/api/v1/admin/billing/reconciliation` | 对账结果 | finance_ops 以上 |
| `GET` | `/api/v1/admin/billing/reconciliation/detail` | 对账差异详情 | finance_ops 以上 |
| `POST` | `/api/v1/admin/billing/reconciliation/resolve` | 处理对账差异 | finance_ops 以上 |

---

## 七、前端组件

### 7.1 价格配置页

```
┌─ 价格管理 ──────────────────────────────────────────┐
│                                                       │
│ 全局加价率: [50%] (L0 → L1 的计算系数)                │
│ 修改后影响全部模型的标准售价                            │
│                                                       │
│ ┌─ 供应商价格 ─────────────────────────────────────┐ │
│ │ 模型名称   | 成本价(in/out) | 标准价(in/out) | 覆盖价 | │
│ │ gpt-4o     | 0.01/0.03     | 0.015/0.045   | —    │ │
│ │ deepseek   | 0.001/0.002   | 0.0015/0.003  | —    │ │
│ │ claude-3   | 0.015/0.045   | 0.0225/0.0675 | —    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ 编辑模型覆盖价:                                       │
│ 模型: [gpt-4o                     ▼]                 │
│ 覆盖输入价: [0.0200] ¥/1K tokens（空=使用标准价）     │
│ 覆盖输出价: [0.0500] ¥/1K tokens                     │
│ [保存]                                                │
└──────────────────────────────────────────────────────┘
```

### 7.2 对账结果展示

```
┌─ 对账结果 (2026-07-27) ─────────────────────────────┐
│                                                       │
│ 对账状态: ✅ 已完成  |  运行时间: 2026-07-28 02:00:03 │
│                                                       │
│ ┌─ 汇总 ──────────────────────────────────────────┐  │
│ │ 总匹配: 12,345 笔                               │  │
│ │ ✅ 精确匹配: 12,200 笔 (98.8%)                   │  │
│ │ ✅ 模糊匹配: 100 笔 (0.8%)                       │  │
│ │ ❌ 存在差异: 45 笔 (0.4%)                        │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ ┌─ 差异明细 ─────────────────────────────────────┐   │
│ │ 类型         | 笔数 | 金额      | 操作            │  │
│ │ 平台有-供应商无 | 23   | ¥123.45  | [核查]  [确认]  │  │
│ │ 供应商有-平台无 | 15   | ¥89.00   | [核查]  [忽略]  │  │
│ │ 金额不一致   | 7     | ¥12.30   | [查看]  [修正]  │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ [导出对账报告]                                         │
└──────────────────────────────────────────────────────┘
```

---

## 八、计费偏差与异常处理

| 场景 | 检测方式 | 处理流程 |
|------|---------|---------|
| 计费金额异常（> 预估 2 倍） | 实时检查 | 记录告警，冻结该比交易，人工核查 |
| 计费引擎异常 | 事务回滚 | 自动回滚，不扣费 |
| 价格为负数 | 更新时校验 | 拒绝更新，触发告警 |
| 用户折扣率变动影响历史计费 | 版本控制 | 折扣率仅在变动后生效（timestamp） |
| 供应商价格变动同步延迟 | 版本控制 | 价格在配置时生效，不追溯历史 |

---

## 九、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| PRD-README.md §5.2 | 计费结算精化总纲 |
| ref-4.4-finance.md | 财务管理深化（充值/发票/退款） |
| ref-4.4.5-reconciliation-prd.md | 对账引擎深化 |
| ref-5.3-rate-limiter.md | 限流引擎（影响计费的限流判定） |
| ref-4.5-marketing.md | 活动价（L5） |
| data-dictionary.md §2.2 | call_logs 字段定义 |
| data-dictionary.md §3.1 | 余额计算规则 |
| flowcharts/05-auto-reconciliation.md | 自动对账泳道图 |