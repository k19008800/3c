# 功能说明书：§29 资金与对账管理

> **对应文档**：[`PRD-财务模块增强.md`](PRD-财务模块增强.md)、[`PRD-管理后台.md`](PRD-管理后台.md)
> **状态**：草案（仅需求文档）
> **优先级**：P0（资金流水、资金账户管理、对账差异处理）、P1（财务锁账、资金报表、违约金管理）、P2（多币种、自动结转）

---

## 29.0 总览

### 功能描述

资金管理是财务角色在平台上的核心工作。现有模块偏重报表展示和被动查看，缺少从财务人员日常操作出发的主动管理工具：资金流水追踪、资金账户管理、对账差异处理、财务锁账与结转、资金报表等。

### 子模块清单

| 编号 | 模块 | 优先级 | 核心价值 |
|------|------|--------|---------|
| 29.1 | 平台资金流水 | P0 | 财务人员查看每一笔资金的进出明细 |
| 29.2 | 资金账户管理 | P0 | 管理平台自有资金、备付金、冻结资金账户 |
| 29.3 | 对账差异处理工作台 | P0 | 集中处理平台-供应商/平台-代理商对账差异 |
| 29.4 | 财务锁账与结转 | P1 | 月结锁账，锁定后不可修改，生成结转凭证 |
| 29.5 | 资金报表中心 | P1 | 日报/周报/月报自动生成+推送 |
| 29.6 | 违约金与逾期管理 | P1 | 信用额度逾期的罚息计算和催收管理 |
| 29.7 | 多币种结算 | P2 | 支持美元/港币结算的汇率管理和换算 |

---

## 29.1 平台资金流水

### 功能描述

财务人员查看平台上每一笔资金的进出明细，涵盖用户充值、用户消费、代理商佣金结算、供应商结算、退款、提现、平台内部调账等所有资金变动。

### 完成能力 / 展示效果

**管理后台 → 财务 → 资金流水：**

```
资金流水
  ┌──────┬────────┬─────────┬────────┬────────┬───────┬───────┐
  │ 时间  │ 流水号 │ 类型   │ 对方   │ 收入   │ 支出  │ 余额  │
  ├──────┼────────┼─────────┼────────┼────────┼───────┼───────┤
  │14:23 │FL2026  │用户充值 │张三   │+¥100  │—      │¥10,582│
  │14:20 │FL2026  │用户消费 │李四   │—      │¥0.50  │¥10,482│
  │12:00 │FL2026  │代理佣金 │王五   │—      │¥320   │¥10,482│
  │10:00 │FL2026  │供应商   │DeepS  │—      │¥2,500 │¥10,802│
  │09:30 │FL2026  │退款     │赵六   │—      │¥50    │¥13,302│
  │08:00 │FL2026  │提现     │钱七   │—      │¥1,000 │¥13,352│
  └──────┴────────┴─────────┴────────┴────────┴───────┴───────┘

  筛选: [类型 ▼] [时间范围 ▼] [金额范围] [搜索流水号]

  合计: 收入 ¥12,500 | 支出 ¥8,920 | 净流入 ¥3,580
  [导出流水 CSV]
```

**资金流水详情弹窗（点击某行）：**

```
流水详情 — FL20260728-0001
┌────────────────────────────────────────────┐
│  流水号:      FL20260728-0001               │
│  类型:        用户充值                        │
│  时间:         2026-07-28 14:23:45           │
│  金额:         +¥100.00                      │
│  相关用户:     张三 (ID: 42)                 │
│  关联订单:     RE20260728-0001              │
│  支付方式:     微信支付                       │
│  外部支付单号: wechat_20260728142345_xxx     │
│  状态:         ✅ 已完成                      │
│  备注:         —                              │
└────────────────────────────────────────────┘
```

### 资金流水类型

| 类型 | 收入/支出 | 说明 |
|------|----------|------|
| `user_recharge` | 收入 | 用户充值到平台 |
| `user_consumption` | 收入 | 用户 API 调用消费（平台收入） |
| `user_refund` | 支出 | 平台退款给用户 |
| `user_recharge_refund` | 支出 | 充值未到账补退 |
| `agent_commission` | 支出 | 代理商佣金结算 |
| `agent_withdraw` | 支出 | 代理商提现 |
| `vendor_settlement` | 支出 | 结算给供应商 |
| `internal_adjust` | ± | 内部调账（人工操作） |
| `platform_fee` | 支出 | 平台运营支出（短信/服务器等） |
| `credit_repayment` | 收入 | 信用额度还款 |

### 数据表结构

```typescript
// platform_ledger — 平台总账（资金流水表）
export const platformLedger = pgTable("platform_ledger", {
  id: serial("id").primaryKey(),
  serialNo: varchar("serial_no", { length: 30 }).notNull().unique(),   // FL20260728-0001
  type: varchar("type", { length: 50 }).notNull(),
    // user_recharge / user_consumption / user_refund / agent_commission /
    // agent_withdraw / vendor_settlement / internal_adjust / platform_fee / credit_repayment
  direction: varchar("direction", { length: 10 }).notNull(),           // 'in' | 'out'
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
  userId: integer("user_id"),
  agentId: integer("agent_id"),
  vendorId: integer("vendor_id"),
  relatedOrderNo: varchar("related_order_no", { length: 50 }),         // 关联的订单号
  externalRef: varchar("external_ref", { length: 100 }),               // 外部支付单号
  paymentChannel: varchar("payment_channel", { length: 30 }),          // wechat / alipay / bank
  status: varchar("status", { length: 20 }).default("completed"),      // completed / pending / failed / reversed
  remark: varchar("remark", { length: 500 }),
  operatorId: integer("operator_id"),                                  // 操作人（人工操作时记录）
  reversedBySerial: varchar("reversed_by_serial", { length: 30 }),     // 冲正关联的流水号
  createdAt: timestamp("created_at").defaultNow(),
});

// 索引: serialNo(unique), type, userId, vendorId, createdAt
```

### API 接口

```
GET  /api/v1/admin/finance/ledger                   — 资金流水列表
GET  /api/v1/admin/finance/ledger/:serialNo         — 流水详情
GET  /api/v1/admin/finance/ledger/summary           — 汇总（总收入/总支出/净流入）
GET  /api/v1/admin/finance/ledger/export            — 导出流水 CSV
POST /api/v1/admin/finance/ledger/adjust            — 内部调账（需二次确认+填写原因）
```

### 前端组件

```tsx
interface LedgerListProps {
  entries: LedgerEntry[]
  filters: LedgerFilters
  onFilterChange: (f: LedgerFilters) => void
  onViewDetail: (serialNo: string) => void
  summary: { totalIn: number; totalOut: number; netFlow: number }
  loading: boolean
  onExport: () => void
}

interface LedgerFilters {
  type?: string
  startDate?: string
  endDate?: string
  userId?: number
  search?: string       // 搜索流水号/关联订单号
  minAmount?: number
  maxAmount?: number
}

interface LedgerEntry {
  serialNo: string
  type: string
  direction: 'in' | 'out'
  amount: number
  balanceAfter: number
  relatedOrderNo?: string
  status: string
  createdAt: string
}

interface LedgerDetailProps {
  entry: LedgerEntry
  relatedInfo: { user?: UserBrief; agent?: AgentBrief; vendor?: VendorBrief }
  onClose: () => void
}
```

### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

1. 资金流水页展示所有类型的资金变动记录，按时间倒序
2. 筛选不同类型（充值/消费/佣金/结算等）→ 只显示对应类型
3. 点击某行 → 弹窗显示完整流水详情（含关联用户/订单/外部单号）
4. 汇总行显示总收入/总支出/净流入
5. 支持导出 CSV

---

## 29.2 资金账户管理

### 功能描述

管理平台的自有资金账户，跟踪平台余额变动，区分可支配资金和冻结资金，支持多账户管理。

### 完成能力 / 展示效果

**管理后台 → 财务 → 资金账户：**

```
资金账户
  ┌────────────────────────────────────────────┐
  │  平台总余额: ¥125,680.50                    │
  │  可用余额:   ¥98,230.20                     │
  │  冻结资金:   ¥27,450.30                     │
  │                                              │
  │  ── 冻结资金明细 ──                          │
  │  代理待结算佣金:     ¥12,500.00              │
  │  未确认充值:         ¥8,200.00               │
  │  进行中提现:         ¥5,650.00               │
  │  退款待处理:         ¥1,100.30               │
  └────────────────────────────────────────────┘

  资金变动趋势（近 30 天）:
  [折线图: 平台总余额 / 可用余额 / 冻结资金 三条线]
```

**资金账户构成：**

```
平台资金总览：
├── 用户充值总额: ¥XXX,XXX.XX     ← 所有用户累计充值
├── 用户消费总额: ¥XXX,XXX.XX     ← 所有用户累计消费
├── 已结算给供应商: ¥XXX,XXX.XX   ← 已支付给供应商
├── 待结算给供应商: ¥XXX,XXX.XX   ← 未到结算周期的供应商费用
├── 已发放代理佣金: ¥XXX,XXX.XX   ← 已发放给代理
├── 待结算代理佣金: ¥XXX,XXX.XX   ← 代理已计提但未提现/未结算
├── 平台毛利:     ¥XXX,XXX.XX     ← 用户消费 - 供应商成本 - 佣金
└── 平台毛利率:   XX.X%           ← 毛利 / 用户消费
```

### API 接口

```
GET /api/v1/admin/finance/accounts        — 资金账户总览
GET /api/v1/admin/finance/accounts/trend  — 资金变动趋势
```

### 前端组件

```tsx
interface AccountOverviewProps {
  totalBalance: number
  availableBalance: number
  frozenBalance: number
  frozenDetail: { label: string; amount: number }[]
  userRechargeTotal: number
  userConsumptionTotal: number
  settledToVendor: number
  pendingVendorSettlement: number
  agentCommissionPaid: number
  agentCommissionPending: number
  platformGrossProfit: number
  platformGrossMargin: number
  trend: { date: string; total: number; available: number; frozen: number }[]
}
```

### 验收标准

1. 资金账户页显示平台总余额和可用余额
2. 冻结资金显示明细（代理佣金/未确认充值/进行中提现等）
3. 资金变动趋势折线图展示近 30 天变化
4. 显示完整的资金构成（充值/消费/供应商结算/佣金/毛利）

---

## 29.3 对账差异处理工作台

### 功能描述

集中处理平台与供应商之间、平台与代理商之间的对账差异。当自动对账发现不一致时，财务人员在工作台中查看差异详情、分析原因、标记处理。

### 完成能力 / 展示效果

**管理后台 → 财务 → 对账差异处理：**

```
对账差异处理
  [平台 vs 供应商 ▼]  [全部状态 ▼]  [搜索订单号...]

  ┌──────┬──────────┬──────────┬──────────┬────────┬──────────┐
  │ 时间  │ 对账类型 │ 对方     │ 差异金额 │ 状态   │ 操作      │
  ├──────┼──────────┼──────────┼──────────┼────────┼──────────┤
  │07/28 │供应商    │ DeepSeek │ +¥23.50  │待处理  │ [处理]   │
  │07/28 │供应商    │ OpenAI   │ -¥12.00  │待处理  │ [处理]   │
  │07/27 │代理佣金  │ 张三     │ +¥5.00   │已处理  │ [查看]   │
  │07/27 │供应商    │ GLM      │ ¥0.00    │已对平  │ [查看]   │
  └──────┴──────────┴──────────┴──────────┴────────┴──────────┘

  待处理差异: 2 项 | 总差异金额: ¥35.50
```

**差异处理弹窗：**

```
处理对账差异 — DeepSeek (2026-07-28)
┌────────────────────────────────────────────┐
│  平台记录: ¥12,500.00                       │
│  供应商账单: ¥12,523.50                      │
│  差异: +¥23.50（平台少记）                  │
│                                             │
│  差异明细:                                    │
│  ┌──────────────────────────────────┐       │
│  │ 订单号         平台  供应商  差异  │       │
│  │ INV-20260728-01  500    523  +23 │       │
│  │ 合计差异:              +23      │       │
│  └──────────────────────────────────┘       │
│                                             │
│  处理方式:                                    │
│  ○ 以平台记录为准（无需操作）                │
│  ○ 以供应商账单为准（补登 ¥23.50）           │
│  ○ 标记为待核实                             │
│                                             │
│  备注: [________________]                    │
│                                             │
│  [确认] [取消]                                │
└────────────────────────────────────────────┘
```

### API 接口

```
GET    /api/v1/admin/finance/reconciliation/differences   — 对账差异列表
GET    /api/v1/admin/finance/reconciliation/differences/:id — 差异详情
POST   /api/v1/admin/finance/reconciliation/differences/:id/resolve  — 处理差异
GET    /api/v1/admin/finance/reconciliation/differences/stats  — 差异统计
GET    /api/v1/admin/finance/reconciliation/differences/export  — 导出差异报告
```

### 验收标准

1. 对账差异工作台展示所有自动检测到的差异项
2. 每个差异项显示平台 vs 对方的具体差异金额和明细
3. 财务人员选择处理方式（补登/忽略/待核实）→ 状态变更
4. 差异统计显示待处理数量和总差异金额
5. 支持导出差异报告

---

## 29.4 财务锁账与结转（P1）

### 功能描述

每月财务结账时，可将该月数据锁定，锁定后该月的充值/消费/对账数据不可修改。锁账后自动生成结转凭证，进入下个会计期间。

### 完成能力 / 展示效果

**管理后台 → 财务 → 结账管理：**

```
结账管理

  当前会计期间: 2026-07-01 ~ 2026-07-31
  结账状态: ⏳ 未结账

  本期汇总:
  收入总额:     ¥128,500.00
  支出总额:     ¥95,200.00
  本期毛利:     ¥33,300.00
  毛利率:       25.9%

  [开始结账]

  点击[开始结账] →
  ┌──────────────────────────────────────────┐
  │  结账确认                                  │
  │  确认锁定 2026 年 7 月的所有财务数据？      │
  │  锁定后该月数据将不可修改。                  │
  │                                            │
  │  ☑ 确认所有对账已完成                      │
  │  ☑ 确认所有退款已处理                      │
  │  ☑ 确认所有发票已开具                      │
  │                                            │
  │  [确认结账] [取消]                          │
  └──────────────────────────────────────────┘
```

**已结账月份列表：**

```
  历史结账记录
  期间         结账时间         收入         支出       毛利    状态
  2026-06   2026-07-05 10:00  ¥112,000    ¥83,000   ¥29,000  ✅ 已锁账
  2026-05   2026-06-05 09:30  ¥105,000    ¥78,000   ¥27,000  ✅ 已锁账
  2026-04   2026-05-05 10:15  ¥98,000     ¥72,000   ¥26,000  ✅ 已锁账
```

**锁账后效果：**

```
├── 该月的充值记录不可撤销
├── 该月的消费记录不可退款
├── 该月的对账状态锁定
├── 该月的佣金计算不可重算
├── 该月的发票不可作废
└── 结账后自动生成该月的会计期间结转凭证
```

### API 接口

```
GET  /api/v1/admin/finance/close/status        — 当前结账状态
POST /api/v1/admin/finance/close/execute        — 执行结账
GET  /api/v1/admin/finance/close/history        — 历史结账记录
POST /api/v1/admin/finance/close/:period/unlock — 解锁（超管权限，限时 1 小时）
```

### 验收标准

1. 财务人员点击"开始结账" → 显示结账确认清单 → 确认后锁定
2. 锁账后该月所有数据不可修改
3. 历史结账记录按月份列表展示
4. 超管可临时解锁已结账月份（1 小时后自动重新锁定）

---

## 29.5 资金报表中心（P1）

### 功能描述

自动生成日报/周报/月报资金报表，支持定时推送和 PDF 下载。替代财务人员手动汇总数据。

### 完成能力 / 展示效果

**管理后台 → 财务 → 资金报表：**

```
资金报表
  今日资金报表          [生成] [下载 PDF]
  本周资金报表          [生成] [下载 PDF]
  本月资金报表          [生成] [下载 PDF]

  报表内容（以日报为例）:
  ┌────────────────────────────────────────────┐
  │  3Cloud 资金日报 — 2026-07-28              │
  ├────────────────────────────────────────────┤
  │                                            │
  │  一、收入                                    │
  │  用户充值:          ¥12,500.00              │
  │  用户消费（平台收入）: ¥8,920.00             │
  │  信用还款:          ¥500.00                 │
  │  收入合计:          ¥21,920.00              │
  │                                            │
  │  二、支出                                    │
  │  供应商结算:        ¥5,800.00               │
  │  代理佣金:          ¥1,200.00               │
  │  提现:              ¥2,000.00               │
  │  退款:              ¥350.00                 │
  │  支出合计:          ¥9,350.00               │
  │                                            │
  │  三、净流入          ¥12,570.00             │
  │  平台余额:          ¥125,680.50             │
  │                                            │
  │  四、对比（vs 昨日）                          │
  │  充值: +12.3% │ 消费: -2.1% │ 净流入: +8.5%│
  └────────────────────────────────────────────┘
```

**定时推送配置：**

```
自动推送配置
  日报: [已启用]  每天 09:00  接收人: [财务@..., boss@...]  [编辑]
  周报: [已启用]  每周一 09:00 接收人: [boss@...]            [编辑]
  月报: [已启用]  每月 1 日 10:00 接收人: [boss@..., 财务@...] [编辑]
```

### API 接口

```
POST /api/v1/admin/finance/reports/generate    — 生成报表
  { type: 'daily' | 'weekly' | 'monthly', date?: string }
  → { reportUrl: '/reports/daily-2026-07-28.pdf' }

POST /api/v1/admin/finance/reports/schedule    — 配置定时推送
  { type, enabled, cronExpr, recipients: string[] }
```

### 验收标准

1. 点击"生成日报" → 显示完整资金日报内容 → 支持 PDF 下载
2. 配置定时推送 → 每天 09:00 自动生成并推送到指定邮箱
3. 月报包含本月完整财务数据

---

## 29.6 违约金与逾期管理（P1）

### 功能描述

管理信用额度授信用户的逾期还款，包括罚息计算、催收通知、逾期分级处理。

### 完成能力 / 展示效果

**管理后台 → 财务 → 逾期管理：**

```
逾期管理
  ┌──────┬────────┬────────┬────────┬────────┬──────────┬───────┐
  │ 用户  │ 额度   │ 已用   │ 逾期天数│ 逾期金额│ 罚息    │ 状态  │
  ├──────┼────────┼────────┼────────┼────────┼──────────┼───────┤
  │ 张三  │¥50,000 │¥30,000 │ 15 天  │¥30,000 │¥450.00  │ 催收中│
  │ 李四  │¥20,000 │¥5,000  │ 3 天   │¥5,000  │¥15.00   │ 提醒中│
  │ 王五  │¥100,000│¥80,000 │ 32 天  │¥80,000 │¥2,400.00│ 已暂停│
  └──────┴────────┴────────┴────────┴────────┴──────────┴───────┘
```

**逾期处理策略：**

```
逾期 1-7 天:  自动发送提醒通知 + 每日罚息 0.05%
逾期 8-15 天: 提高罚息至 0.1%/天 + 客服人工催收
逾期 16-30 天:暂停信用额度（仅允许余额支付） + 法务通知
逾期 >30 天: 冻结账号 + 上报征信（如适用）
```

### API 接口

```
GET  /api/v1/admin/finance/overdue/list         — 逾期列表
GET  /api/v1/admin/finance/overdue/stats        — 逾期统计
POST /api/v1/admin/finance/overdue/:id/waive    — 减免罚息
POST /api/v1/admin/finance/overdue/:id/suspend  — 暂停额度
POST /api/v1/admin/finance/overdue/notify       — 批量催收通知
```

### 验收标准

1. 逾期列表显示所有信用额度逾期的用户及逾期天数
2. 罚息自动计算并展示
3. 管理员可减免罚息、暂停额度
4. 自动催收通知按逾期天数分阶段发送

---

## 29.7 多币种结算（P2）

### 功能描述

支持美元/港币等多币种结算，自动汇率换算，适配海外供应商结算需求。

### 完成能力 / 展示效果

**管理后台 → 财务 → 多币种管理：**

```
汇率管理
  币种    当前汇率        更新日期        状态
  USD    7.25 CNY/USD   2026-07-28     ✅ 自动更新
  HKD    0.93 CNY/HKD   2026-07-28     ✅ 自动更新

  [手动更新汇率] [汇率历史]

币种结算配置
  供应商        结算币种    最近结算额    汇率影响
  OpenAI        USD        $8,500.00    ¥61,625.00
  Anthropic     USD        $3,200.00    ¥23,200.00
```

### 功能规格

```
├── 汇率管理: 每日自动获取离岸汇率，支持手动修正
├── 多币种计价: 供应商可设定美元/港币报价
├── 换算规则: 按结算当日汇率换算为人民币入账
├── 汇率差异: 汇率波动超过 2% 时标记告警
└── 供应商端: 供应商可查看本币结算金额
```

### API 接口

```
GET  /api/v1/admin/finance/rates               — 汇率列表
POST /api/v1/admin/finance/rates               — 手动更新汇率
GET  /api/v1/admin/finance/rates/history       — 汇率历史
```

### 验收标准

1. 汇率管理展示当前各币种汇率
2. 汇率每日自动获取
3. 供应商结算时可看到本币金额和人民币换算金额

---

## 资金管理模块总览

| 模块 | 优先级 | 核心价值 | 已有功能参考 |
|------|--------|---------|------------|
| 资金流水 | P0 | 每一笔资金进出可追溯 | 现有 finance 模块缺乏流水总账 |
| 资金账户管理 | P0 | 平台总余额/可用/冻结清晰可见 | 现有 dashboard 只显示简版余额 |
| 对账差异处理 | P0 | 系统性处理对账发现的差异 | 现有 reconciliation 只有对账无差异处理工作台 |
| 财务锁账与结转 | P1 | 月结锁账保障数据一致性 | 完全缺失 |
| 资金报表中心 | P1 | 自动生成+推送日报/周报/月报 | 现有仅 PRD 有日报告，规格不完整 |
| 逾期管理 | P1 | 信用额度逾期的系统化管理 | 现有信用额度体系无逾期管理配套 |
| 多币种结算 | P2 | 海外供应商结算支持 | 完全缺失 |


---

### [?] 页面帮助

**页面名称**：功能说明书：§29 资金与对账管理

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 功能说明书：§29 资金与对账管理 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。


### 提现二审角色配置

通过 `site_configs.withdraw_second_review_role` 配置，决定提现二审由哪个角色执行：

| 配置值 | 角色 | 说明 |
|-------|------|------|
| `agent_mgr` | 代理管理岗 | 默认值，由代理管理员二审 |
| `operator` | 运营岗 | 由运营人员二审 |

**配置项：** `site_configs.withdraw_second_review_role`

```typescript
// site_configs 表新增字段
withdrawSecondReviewRole: varchar("withdraw_second_review_role", { length: 20 }).default("agent_mgr");
// 可选值: 'agent_mgr' | 'operator'
```

**权限矩阵影响：** 当 `withdraw_second_review_role = 'operator'` 时，运营角色获得提现二审权限（`withdraw:second_review`）。

**流程图对应：** 泳道图 2（代理提现双审流程）中的"复审审核员"角色根据此配置动态变化。


### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
