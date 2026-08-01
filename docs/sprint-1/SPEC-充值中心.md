# SPEC — 充值中心 /console/recharge

> **对应**：PRD §2.2.6 + ref-2.2.6-recharge.md
> **状态**：✅ 已完成（后端+前端，含验证）
> **发布日期**：2026-08-01
> **完成记录**：后端8 API + 回调幂等 + 冒烟测试12项通过（commit 993790a）；前端 RechargePage 页 + 路由/侧边栏（commit ccf0e50）

---

## 一、页面路由

| 属性 | 值 |
|------|-----|
| 路径 | `/console/recharge` |
| 布局 | ConsoleLayout（侧边栏 + 主内容区）|
| 权限 | 所有已登录用户（role >= user）|

## 二、页面组件树

```
RechargeCenter
├── CurrentBalance (余额卡片)
│   ├── 余额数值 (decimal(10,2))
│   ├── 余额预警底色 (<=¥10黄, <=¥1红)
│   └── [充值] 按钮
│
├── PaymentPanel (支付面板)
│   ├── AmountSelector (金额选择器)
│   │   ├── 快捷金额：¥50/¥100/¥200/¥500/¥1000/¥5000
│   │   ├── 自定义金额输入 (¥1-¥50000, 支持到分)
│   │   └── 充值后余额预览 (当前余额 + 充值金额)
│   ├── PaymentMethodSelector (支付方式)
│   │   ├── 支付宝扫码 (alipay)
│   │   ├── 微信支付 (wechat)
│   │   └── 对公转账 (bank_transfer, 需审核)
│   ├── PromotionBanner (优惠横幅)
│   │   └── 活动倒计时/规则说明 (如 "首充¥100送¥20")
│   └── ConfirmButton (确认充值)
│       └── 金额校验 → 调用 POST /api/v1/me/recharge
│
├── PaymentQrCodeModal (扫码弹窗)
│   ├── 二维码展示 (img src=qrCodeUrl)
│   ├── 金额 + 支付方式
│   ├── 倒计时 (30分钟, 前端setInterval)
│   └── 支付状态轮询 (每5秒 GET order detail)
│
├── PaymentResultDialog (结果弹窗)
│   ├── 成功: 🎉 充值成功！¥XX 已到账
│   ├── 失败: ❌ 支付失败，请重试
│   └── 超时: ⏰ 二维码已过期，请重新发起
│
├── RechargeRecordList (充值记录)
│   ├── RecordTable
│   │   ├── 订单号/金额/支付方式/时间/状态/操作
│   │   └── 状态: success/failed/pending/expired/bank_pending
│   ├── Pagination
│   └── [重新支付] 按钮 (过期订单, 30分钟内有效)
│
├── BankTransferModal (对公转账弹窗)
│   ├── 对公账户信息 (户名/账号/开户行)
│   ├── 凭证上传 (JPG/PNG/PDF ≤5MB)
│   └── 审核说明 (SLA: 工作日T+1)
│
└── TransactionHistory (消费明细)
    ├── FilterBar (时间范围:7d/30d/90d；类型:全部/充值/消费/退款)
    ├── TransactionTable (时间/类型/金额/余额前后/说明)
    └── Pagination
```

### 2.1 Props 类型定义

```typescript
// 充值请求
interface RechargeRequest {
  amount: number;                    // ¥1-¥50000
  paymentMethod: 'alipay' | 'wechat' | 'bank_transfer';
  promotionId?: number;
}

// 充值结果
interface RechargeResult {
  orderId: string;
  status: string;
  qrCodeUrl?: string;
  redirectUrl?: string;
  expiresAt?: string;
  bankInfo?: { accountName: string; accountNumber: string; bankName: string; };
  promotion?: { freeAmount: string };
}

// 充值记录
interface RechargeRecord {
  id: string;
  orderId: string;
  amount: string;
  paymentMethod: string;
  paidAt: string;
  status: 'success' | 'failed' | 'pending' | 'expired' | 'bank_pending';
  promotion?: string;
  canRetry: boolean;
}

// 优惠信息
interface PromotionInfo {
  id: number;
  title: string;
  description: string;
  remainingDays: number;
  rule: string;
  minAmount: number;
  benefit: string;
}

// 消费明细记录
interface TransactionRecord {
  id: number;
  timestamp: string;
  type: 'recharge' | 'consumption' | 'refund' | 'adjustment' | 'promotion';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string;
  orderId?: string;
}
```

## 三、后端 API 清单

| # | 方法 | 路径 | 说明 | 权限 | 状态码 |
|---|------|------|------|------|--------|
| 1 | GET | `/api/v1/me/balance` | 查询余额 | user | 200 |
| 2 | POST | `/api/v1/me/recharge` | 发起充值 | user | 201 |
| 3 | GET | `/api/v1/me/recharge-orders` | 充值记录列表 | user | 200 |
| 4 | GET | `/api/v1/me/recharge-orders/:id` | 订单详情 | user | 200 |
| 5 | POST | `/api/v1/me/recharge-orders/:id/retry` | 重新支付 | user | 201 |
| 6 | POST | `/api/v1/me/recharge-orders/bank-transfer` | 上传对公凭证 | user | 201 |
| 7 | GET | `/api/v1/me/transactions` | 消费明细 | user | 200 |
| 8 | GET | `/api/v1/me/promotions` | 可用优惠列表 | user | 200 |

### 3.1 POST /api/v1/me/recharge 请求/响应

```json
// Request
{ "amount": 100.00, "payment_method": "alipay", "promotion_id": 1 }

// Response 201
{
  "order_id": "recharge_20260801_xxxxx",
  "status": "pending",
  "amount": "100.00",
  "pay_amount": "100.00",
  "promotion": { "free_amount": "20.00" },
  "qr_code_url": "https://pay.unmisa.com/qr/xxx",
  "expires_at": "2026-08-01T07:30:00+08:00",
  "bank_info": null
}
```

### 3.2 支付回调（外部通知）

```json
POST /api/v1/me/recharge/callback
{
  "order_id": "recharge_20260801_xxxxx",
  "trade_no": "alipay_20260801_xxxxx",
  "pay_amount": "100.00",
  "status": "success",
  "signature": "..."
}
```

校验签名 → 幂等检查 → 更新订单 → 增加余额 → 写入 balance_logs → 写入 operation_logs → 发送通知

## 四、DB Schema

```typescript
// recharge_orders 表
export const rechargeOrders = pgTable("recharge_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id", { length: 64 }).notNull().unique(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  payAmount: numeric("pay_amount", { precision: 18, scale: 2 }),     // 实付
  actualAmount: numeric("actual_amount", { precision: 18, scale: 2 }), // 到账
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  tradeNo: varchar("trade_no", { length: 128 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  promotionId: integer("promotion_id"),
  freeAmount: numeric("free_amount", { precision: 18, scale: 2 }),
  voucherPath: varchar("voucher_path", { length: 255 }),             // 对公凭证
  reviewNote: varchar("review_note", { length: 500 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// balance_logs 关联：type='recharge' | 'promotion' | 'manual_fix'
// balance_logs.recharge_order_id → recharge_orders.id
```

## 五、核心逻辑

### 5.1 支付流程

```
用户选金额+支付方式 → POST /me/recharge → 创建订单(pending)
  → 支付宝/微信: 请求支付网关二维码 → 返回 qrCodeUrl
  → 前端展示二维码弹窗 + 30min倒计时 + 每5秒轮询 GET order
  → 用户扫码支付 → 支付渠道异步回调 → 校验签名
  → 更新订单(success) → 增加用户余额 → 写 balance_logs → 通知用户
  → 30分钟未支付: 订单自动过期(expired)
```

### 5.2 对公转账流程

```
用户选对公转账 → 填写金额 + 上传凭证 → POST bank-transfer
  → 订单状态 bank_pending
  → 财务后台审核 → 审核通过 → 增加余额 + 通知
  → 审核驳回 → 通知用户 + 可修改重新提交
```

### 5.3 金额约束

| 规则 | 值 |
|------|-----|
| 最低充值 | ¥1 |
| 最高单笔 | ¥50,000 |
| 单日上限 | ¥100,000（对公不受限）|
| 自定义金额 | 支持到分 ¥0.01 |

### 5.4 优惠计算

```
实际到账 = 支付金额 + 优惠赠送金额
balance_logs 记录两条:
  - type=recharge, 金额=+¥支付金额
  - type=promotion, 金额=+¥赠送金额
```

## 六、异常处理

### 6.1 回调超时重试

| 参数 | 默认值 |
|------|--------|
| 回调等待超时 | 30秒 |
| 轮询间隔 | 5秒 |
| 最大轮询次数 | 360次 (30min) |
| 重试次数 | 3次 |
| 重试间隔 | 30秒 |

### 6.2 人工补单

管理后台 API：
- `POST /api/v1/admin/finance/recharge/manual-fix` — 手动补单（需 finance_admin）
- `GET /api/v1/admin/finance/recharge/manual-fix/history`

### 6.3 渠道熔断

| 场景 | 前端处理 |
|------|---------|
| 微信不可用 | 隐藏微信，仅展示支付宝+转账 |
| 支付宝不可用 | 隐藏支付宝，仅展示微信+转账 |
| 双渠道不可用 | 仅展示对公转账 |

## 七、交叉引用

| 文档 | 关联内容 |
|------|---------|
| ref-4.4-finance.md | 充值订单管理/对账 |
| ref-4.5-marketing.md | 充值优惠活动配置 |
| data-dictionary.md §3.1 | 余额计算规则 |
| flowcharts/01-recharge.md | 充值流程泳道图 |
| supplement/03-充值退款状态机.md | 充值状态流转 |
