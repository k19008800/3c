# 代理商体系 — 深化参考文档

> **对应章节**：[PRD-README.md §3 代理商体系](../PRD-README.md#三代理商体系精化摘要)
> **状态**：基于现有后端代码（`api/src/db/schema/agents.ts`、`api/src/routes/admin/agents.ts`、`api/src/routes/admin/finance/withdraws.ts`、`api/src/routes/agent/*.ts`）及前端组件分析生成
> **粒度**：Drizzle Schema → API 接口 → 前端组件 Props → 业务流程图 → 交叉引用

---

## 目录

1. [三级审核与等级晋升](#1-三级审核与等级晋升)
2. [佣金规则配置](#2-佣金规则配置)
3. [代理端仪表盘](#3-代理端仪表盘)
4. [提现双审流程](#4-提现双审流程)
5. [结算周期与对账](#5-结算周期与对账)
6. [跨模块数据流](#6-跨模块数据流)

---

## 1. 三级审核与等级晋升

### 1.1 等级体系（enum: `agent_level_enum`）

| 枚举值 | 层级 | 准入条件 | 权益 | 审核方 | 默认佣金率 |
|--------|------|---------|------|--------|-----------|
| `preparatory` | 预备 | 注册+实名 | 查看佣金规则，**不能提现** | 自动 | 0% |
| `primary` | 一级 | 实名+资质审核 | 全功能面板、自定义佣金、可提现 | `agent_mgr` 审核 | 10% |
| `advanced` | 高级 | 月调用 > 100 万 Token | 专属客户经理、优先支持、阶梯佣金 | `super_admin` 审批 | 12-18% |

### 1.2 审核状态流转（enum: `agent_audit_status_enum`）

```
pending ──→ approved    (审核通过，升级)
     └──→ rejected      (审核拒绝，退回预备)
```

### 1.3 现有表结构（`agents` 表）

```typescript
// api/src/db/schema/agents.ts — agents 表（等级审核相关字段）
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),

  // 等级与审核
  level: agentLevelEnum("level").notNull().default("preparatory"),
  auditStatus: agentAuditStatusEnum("audit_status").notNull().default("approved"),
  auditRemark: text("audit_remark"),
  auditedBy: integer("audited_by").references(() => users.id),
  auditedAt: timestamp("audited_at", { withTimezone: true }),

  // 团队层级（子代理）
  parentAgentId: integer("parent_agent_id").references((): AnyPgColumn => agents.id),
  teamDepth: integer("team_depth").default(0),

  // 高级代理专有
  accountManager: varchar("account_manager", { length: 128 }),
  prioritySupport: boolean("priority_support").notNull().default(false),

  // ...财务字段见下文
}, (table) => ({
  userIdIdx: uniqueIndex("agents_user_id_idx").on(table.userId),
  parentIdx: index("agents_parent_idx").on(table.parentAgentId),
  levelIdx: index("agents_level_idx").on(table.level),
}));
```

### 1.4 API 接口

#### POST `/api/v1/admin/agents/:id/audit` — 等级审核

**请求**：
```json
{
  "action": "approve" | "reject",
  "level": "primary" | "advanced",  // approve 时必填
  "remark": "审核备注（可选）"
}
```

**响应（approve）**：
```json
{
  "code": 0,
  "data": { "agentId": 123, "level": "primary", "auditStatus": "approved" },
  "message": "代理已晋升为 primary"
}
```

**响应（reject）**：
```json
{
  "code": 0,
  "data": { "agentId": 123, "auditStatus": "rejected" },
  "message": "已拒绝代理晋升申请"
}
```

**权限**：`AGENT_MANAGE`（agent_mgr/admin/super_admin）

**校验逻辑**：
1. 代理不存在 → 404
2. `auditStatus !== "pending"` → 400（不在待审核状态）
3. reject 时自动将 `level` 回退到 `preparatory`（**注意**：当前实现只改 `auditStatus` 不改 `level`，需补全）

#### GET `/api/v1/admin/agents/:agentId` — 代理详情

**响应扩展字段**：
```json
{
  "id": 123,
  "userId": 456,
  "level": "preparatory",
  "auditStatus": "pending",
  "auditRemark": null,
  "auditedBy": null,
  "auditedAt": null,
  "accountManager": null,
  "prioritySupport": false,
  "totalCommission": "0.000000",
  "settledCommission": "0.000000",
  "pendingWithdraw": "0.000000",
  "frozenAmount": "0.000000",
  "minWithdrawAmount": "10.000000",
  "withdrawCooldownHours": 24,
  "withdrawFreezeDays": 7
}
```

### 1.5 前端审核操作组件

```
AgentLevelTab.tsx (agent-detail/AgentLevelTab.tsx)
├── 审核状态标签（pending/approved/rejected）
├── 当前等级显示
├── 升级操作按钮（仅 pending 时启用）
│   ├── "通过并升级为一级代理"
│   ├── "通过并升级为高级代理"
│   └── "拒绝申请" + 备注输入框
└── 审核记录（auditedBy 用户名 / auditedAt 时间轴）
```

**Props**：
```typescript
interface AgentLevelTabProps {
  agent: {
    id: number;
    level: "preparatory" | "primary" | "advanced";
    auditStatus: "pending" | "approved" | "rejected";
    auditRemark?: string | null;
    auditedBy?: number | null;
    auditedAt?: string | null;
    accountManager?: string | null;
    prioritySupport?: boolean;
  };
  onAuditResult: () => void;  // 刷新回调
}
```

### 1.6 运营视角

- **预备 → 一级**：财务岗（`agent_mgr`）审核资质材料，需展示预备代理的注册时间、实名状态、邀请码来源
- **一级 → 高级**：`super_admin` 审批，需展示近 30 天消费趋势、客户数量、佣金产出
- **审核超时处理**：pending 超过 7 天自动降级为预备（或发通知提醒管理员）
- **批量审核**：当前无批量审核接口，运营建议增加 POST `/api/v1/admin/agents/batch-audit`

---

## 2. 佣金规则配置

### 2.1 现有表结构

#### `commission_rules` 表

```typescript
export const commissionRules = pgTable("commission_rules", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  ruleType: varchar("rule_type", { length: 20 }).notNull(),
  // 'sale' | 'renewal' | 'team' | 'activity'

  rate: numeric("rate", { precision: 5, scale: 4 }).notNull().default("0.0000"),
  isEnabled: boolean("is_enabled").notNull().default(true),

  // 条件约束
  minTriggerAmount: numeric("min_trigger_amount", { precision: 18, scale: 6 }),
  maxCap: numeric("max_cap", { precision: 18, scale: 6 }),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),

  // 活动专用
  activityName: varchar("activity_name", { length: 255 }),
  activityType: varchar("activity_type", { length: 50 }),
  fixedAmount: numeric("fixed_amount", { precision: 18, scale: 6 }),

  // 团队专用
  teamLevelLimit: integer("team_level_limit").default(1),

  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentTypeIdx: uniqueIndex("commission_rules_agent_type_idx").on(table.agentId, table.ruleType),
}));
```

### 2.2 四种计算方式（PRD §3.2 实现对照）

| 方式 | 实现 | 对应 `ruleType` | 关键字段 |
|------|------|----------------|---------|
| **固定比例** | `用户消费 × rate` | `sale` | `rate` |
| **阶梯比例** | 按月消费区间分段，`minTriggerAmount` 作为阶梯阈值 | `sale`（多条规则） | `rate` + `minTriggerAmount` + `maxCap` |
| **固定金额** | 每笔消费 × `fixedAmount` | `sale` | `fixedAmount`（替代 `rate`） |
| **混合** | 按模型/场景分别设置规则 | 多条不同 `ruleType` | 组合使用 |

**阶梯比例实现约定**：
- 同一代理多条 `ruleType='sale'` 的规则，通过 `minTriggerAmount` 分段
- 计算时：取 `minTriggerAmount <= 月消费` 的最大阶梯规则应用
- `maxCap` 表示该阶梯的最高佣金上限（防止大额单笔佣金过高）

### 2.3 API 接口

#### GET `/api/v1/admin/agents/:agentId/commission-rules` — 获取佣金规则列表

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "ruleType": "sale",
      "rate": "0.1000",
      "isEnabled": true,
      "minTriggerAmount": "0.000000",
      "maxCap": null,
      "validFrom": null,
      "validUntil": null,
      "fixedAmount": null,
      "createdAt": "2026-07-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "ruleType": "sale",
      "rate": "0.1200",
      "isEnabled": true,
      "minTriggerAmount": "1000.000000",
      "maxCap": "500.000000"
    }
  ]
}
```

#### POST/PUT `/api/v1/admin/agents/:agentId/commission-rules` — 创建/更新佣金规则

**请求**（upsert 语义）：
```json
{
  "ruleType": "sale",
  "rate": "0.1000",
  "isEnabled": true,
  "minTriggerAmount": "0.000000",
  "maxCap": null,
  "validFrom": null,
  "validUntil": null
}
```

**响应**：
```json
{ "code": 0, "data": { "id": 1, ... }, "message": "佣金规则已保存" }
```

#### DELETE `/api/v1/admin/agents/:agentId/commission-rules/:ruleId` — 删除佣金规则

#### GET `/api/v1/agent/commission-rules` — 代理端查看自己的佣金规则

### 2.4 前端组件规格

#### 管理员佣金配置页

```
AgentDetail → CommissionTab.tsx / CommissionModal.tsx
├── 规则列表（表格）
│   ├── 规则类型（销售/续费/团队/活动）
│   ├── 费率/金额
│   ├── 阶梯阈值
│   ├── 上限
│   ├── 有效期
│   ├── 启用开关
│   └── 操作（编辑/删除）
│
├── 新增规则（CommissionModal.tsx）
│   ├── 规则类型下拉（sale/renewal/team/activity）
│   ├── 费率输入（百分比，格式 xxx.xxxx%）
│   ├── 阶梯阈值（仅 sale 显示）
│   ├── 上限金额（可选）
│   ├── 有效期起止（可选）
│   ├── 固定金额输入（仅 activity）
│   └── 团队层级限制（仅 team）
│
└── 规则变更审计日志（操作前→操作后，操作人，时间）
```

**CommissionModal Props**：
```typescript
interface CommissionModalProps {
  open: boolean;
  onClose: () => void;
  agentId: number;
  rule?: CommissionRule;            // 编辑模式；undefined 为新增
  onSaved: () => void;             // 保存成功回调
}

interface CommissionRule {
  id?: number;
  ruleType: "sale" | "renewal" | "team" | "activity";
  rate: number;                     // 百分比格式（0.1000 = 10%）
  isEnabled: boolean;
  minTriggerAmount?: number;        // 阶梯阈值
  maxCap?: number;                  // 上限
  validFrom?: string;
  validUntil?: string;
  fixedAmount?: number;             // 固定金额
  teamLevelLimit?: number;          // 团队层级限制
}
```

#### 代理端佣金设置页

```
agent/commissions/CommissionSettings.tsx
├── 当前生效规则摘要
│   ├── 销售佣金率：10%（阶梯：0-1000 5%, 1000+ 8%）
│   └── 续费佣金率：5%
├── 修改申请（二级代理 → 上级代理审批）
└── 规则生效时间："立即生效" / "下个结算周期"
```

### 2.5 佣金计算引擎要点

参考 `api/src/services/billing/commission.ts`：

```
用户消费产生 call_log → billing 模块扣费
  → 查询用户的代理绑定关系（agent_clients）
  → 查询该代理的 commission_rules（按优先级：activity > team > renewal > sale）
  → 计算佣金金额 = 消费 × rate（或 fixedAmount）
  → 写入 commission_logs（状态 pending）
  → 更新 agents.total_commission
```

**关键优先级**（高→低）：
1. `activity` 活动佣金（固定金额或特别费率）
2. `team` 团队佣金（上级代理从子代理佣金中分润）
3. `renewal` 续费佣金（老客户续费）
4. `sale` 标准销售佣金

---

## 3. 代理端仪表盘

### 3.1 现有 API

#### GET `/api/v1/agent/commissions/summary` — 佣金汇总

**响应**：
```json
{
  "code": 0,
  "data": {
    "totalCommission": "12345.678900",
    "settledCommission": "8000.000000",
    "pendingCommission": "3000.000000",
    "pendingWithdraw": "1000.000000",
    "frozenAmount": "345.678900",
    "monthCommission": "2500.000000",
    "monthConsumption": "25000.000000",
    "clientCount": 15,
    "monthNewClients": 2
  },
  "message": "ok"
}
```

#### GET `/api/v1/agent/commissions` — 佣金历史（带筛选）

**Query**：`page`, `pageSize`, `status`, `commissionType`, `startDate`, `endDate`, `customerSearch`

#### GET `/api/v1/agent/commissions/:id` — 佣金明细

#### GET `/api/v1/agent/commissions/export` — CSV 导出

### 3.2 前端仪表盘组件规格

```
agent/commissions/CommissionStatsCards.tsx
├── 总客户数（本月新增）
├── 本月总消费 ¥
├── 本月佣金收入 ¥
├── 待结算金额 ¥
├── 可提现余额 ¥
└── 概览走势图（近 7 天）
```

**Props**：
```typescript
interface AgentDashboardStats {
  clientCount: number;
  monthNewClients: number;
  monthConsumption: number;     // 本月总消费
  monthCommission: number;      // 本月佣金
  pendingCommission: number;    // 待结算
  pendingWithdraw: number;      // 提现中
  withdrawable: number;         // 可提现 = settledCommission - pendingWithdraw - frozenAmount
}

interface AgentDashboardProps {
  stats: AgentDashboardStats;
  trends?: {
    date: string;
    consumption: number;
    commission: number;
  }[];
  onRefresh: () => void;
}
```

### 3.3 趋势图规格

```
├── 近 7 日消费趋势（柱状图）
│   ├── X 轴：日期
│   ├── Y 轴：消费金额
│   └── Tooltip：当日消费 + 佣金
│
├── 近 7 日佣金趋势（折线图，叠在柱状图上）
│
└── 客户增长趋势（折线图）
    ├── X 轴：日期
    └── Y 轴：累计客户数
```

### 3.4 客户列表（代理端）

```
agent-clients list
├── 列表（表格）
│   ├── 客户名称
│   ├── 绑定时间
│   ├── 累计消费
│   ├── 本月消费
│   └── 操作（查看详情/解绑）
│
├── 搜索/筛选（按名称、绑定时间范围）
└── 邀请链接 / 邀请码复制按钮
```

---

## 4. 提现双审流程

### 4.1 状态机（enum: `withdraw_status_enum`）

```
pending_first_review ──→ pending_second_review ──→ pending_payment ──→ paid
                      └→ rejected                      └→ cancelled
                              ↑                               ↑
                        任一审核拒绝                   打款失败取消
```

### 4.2 一级审核流程

```
代理发起 → ① 系统风控检查（riskCheckResult → JSON 存储）
         → ② 财务岗初审（first_review）
             ├── 通过 → pending_second_review
             └── 拒绝 → rejected（冻结期+记录原因）

初审展示信息：
  - 代理信息：名称、等级、注册时间、总交易量
  - 账户状况：余额、可提现、冻结金额
  - 提现历史：已完成 N 笔，总额 ¥X
  - 本次提现：金额、银行卡号/银行名、微信企业付款号
  - 近 7 日消费趋势：是否有异常下降
```

### 4.3 二级审核流程

```
复审（second_review）
├── 通过 → pending_payment（需标记打款凭证 URL）
│   └── 财务岗标记"已打款"（mark_paid）
│       └── paid（更新 agent 余额：减少 pendingWithdraw、增加 settledCommission）
└── 拒绝 → rejected
```

### 4.4 现有 API

#### POST `/api/v1/agent/withdraw` — 代理发起提现

**请求**：
```json
{
  "amount": "500.000000",
  "bankCardNo": "6222021234567890",
  "bankName": "中国工商银行"
}
```

**校验**：
- 仅一级/高级代理可提现（`preparatory` 不允许）
- 提现金额 ≥ `agents.minWithdrawAmount`（默认 ¥10）
- 提现金额 ≤ 可提现余额
- 距上次提现 ≥ `withdrawCooldownHours`（默认 24h）
- 佣金产生后 ≥ `withdrawFreezeDays`（默认 7 天）

#### GET `/api/v1/agent/withdraws` — 提现记录

#### POST `/api/v1/admin/withdraws/:id/first-review` — 初审

**请求**：
```json
{ "action": "approve" | "reject", "rejectReason": "资质不全" }
```

#### POST `/api/v1/admin/withdraws/:id/second-review` — 复审

**请求**：
```json
{ "action": "approve" | "reject", "rejectReason": "", "bankVoucherUrl": "https://..." }
```

#### POST `/api/v1/admin/withdraws/:id/mark-paid` — 标记打款

#### POST `/api/v1/admin/withdraws/batch-review` — 批量审核

**请求**：
```json
{ "ids": [1, 2, 3], "action": "approve" | "reject", "rejectReason": "批量拒绝原因" }
```

**响应**：
```json
{ "code": 0, "data": { "approved": 2, "rejected": 1, "errors": [] }, "message": "..." }
```

#### GET `/api/v1/admin/withdraws/stats` — 按状态统计

```json
{
  "code": 0,
  "data": [
    { "status": "pending_first_review", "count": 5, "totalAmount": "3500.000000" },
    { "status": "pending_second_review", "count": 2, "totalAmount": "1200.000000" },
    { "status": "paid", "count": 20, "totalAmount": "15000.000000" }
  ]
}
```

#### GET `/api/v1/admin/withdraws/export` — CSV 导出

### 4.5 前端审核页面规格

#### 审核列表（Admin → 财务 → 提现审核）

```
WithdrawList.tsx / WithdrawReview.tsx
├── 状态筛选标签（全部/初审待审/复审待审/已完成/已拒绝）
├── 统计卡片（待审笔数 + 总金额）
├── 列表（表格）
│   ├── 提现单号（voucherNo）
│   ├── 代理名称
│   ├── 金额 / 手续费 / 实到
│   ├── 审核状态（标签：待初审/待复审/已完成）
│   ├── 创建时间
│   └── 操作（审核/详情）
│
├── 审核弹窗（详情 + 审核操作）
│   ├── 代理信息卡片
│   ├── 提现详情
│   ├── 账户状况
│   ├── 近 7 日消费趋势（折线图，异常标注）
│   └── 审核按钮（通过/拒绝 + 原因）
│
└── 批量操作工具栏（选中多笔 → 批量审核）
```

**WithdrawReviewModal Props**：
```typescript
interface WithdrawReviewModalProps {
  open: boolean;
  onClose: () => void;
  withdrawId: number;
  reviewLevel: "first" | "second";       // 初审/复审
  onReviewed: () => void;                 // 审核成功回调
}

interface WithdrawDetail {
  id: number;
  agentId: number;
  userId: number;
  email: string;
  nickname: string;
  voucherNo: string;
  amount: string;
  feeAmount: string;
  actualAmount: string;
  bankCardNo: string;
  bankName: string;
  bankVoucherUrl: string | null;
  wechatPayNo: string | null;
  status: WithdrawStatus;
  riskCheckResult: any | null;
  firstAuditorId: number | null;
  firstAuditedAt: string | null;
  secondAuditorId: number | null;
  secondAuditedAt: string | null;
  paidOperatorId: number | null;
  createdAt: string;
  paidAt: string | null;
}
```

### 4.6 提现限制配置

| 配置项 | 表字段 | 默认值 | 管理端操作 |
|-------|--------|--------|-----------|
| 最低提现金额 | `agents.minWithdrawAmount` | ¥10 | 管理员修改 |
| 提现冷却时间 | `agents.withdrawCooldownHours` | 24h | 管理员修改 |
| 佣金冻结期 | `agents.withdrawFreezeDays` | 7天 | 管理员修改 |

---

## 5. 结算周期与对账

### 5.1 结算表结构

#### `settlement_cycles` — 结算周期定义

```typescript
export const settlementCycles = pgTable("settlement_cycles", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  // open / closed / settled
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### `agent_settlements` — 代理结算账单

```typescript
export const agentSettlements = pgTable("agent_settlements", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => settlementCycles.id),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  totalCommission: numeric("total_commission", { precision: 18, scale: 4 }),
  settledAmount: numeric("settled_amount", { precision: 18, scale: 4 }),
  adjustmentAmount: numeric("adjustment_amount", { precision: 18, scale: 4 }),
  adjustmentReason: text("adjustment_reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending / confirmed / auto_confirmed / settled
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});
```

#### `settlement_details` — 结算明细

```typescript
export const settlementDetails = pgTable("settlement_details", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull().references(() => agentSettlements.id, { onDelete: "cascade" }),
  commissionId: integer("commission_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }),
  clientUserId: integer("client_user_id").notNull().references(() => users.id),
  consumptionId: integer("consumption_id"),
  model: varchar("model", { length: 100 }),
  tokens: integer("tokens"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
});
```

#### `settlement_confirm_logs` — 对账确认日志

```typescript
export const settlementConfirmLogs = pgTable("settlement_confirm_logs", {
  settlementId: integer("settlement_id").notNull().references(() => agentSettlements.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(),
  // generate / confirm / auto_confirm / adjust / settle
  operatorId: integer("operator_id").references(() => users.id),
  operatorRole: varchar("operator_role", { length: 20 }),
  detail: text("detail"),
});
```

### 5.2 结算周期配置

代理的 `settlementCycle` 支持：

| 周期 | 值 | 说明 |
|------|----|------|
| 手动结算 | `manual` | 管理员手动触发 |
| 按周结算 | `weekly` | 每周一凌晨结算上周期 |
| 按月结算 | `monthly` | 每月 1 日结算上周期 |
| 按季结算 | `quarterly` | 每季度首日结算 |

### 5.3 结算流程

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│ 周期截止 │ →  │ 自动结账   │ →  │ 代理确认  │ →  │ 管理员确认│ → 完成
└─────────┘     └───────────┘     └──────────┘     └──────────┘
                     │                  │
                settlement_cycles  agent_settlements.status:
                .status → closed       pending → confirmed
                                       （48h 未操作 → auto_confirmed）
```

### 5.4 API 接口

#### POST `/api/v1/admin/agents/:id/settlement-config` — 配置结算周期

```json
{ "settlementCycle": "weekly" }
```

#### POST `/api/v1/admin/agents/:id/settle` — 手动结算

#### GET `/api/v1/admin/agents/settlement-history?agentId=123` — 结算历史

**响应**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "cycleId": 1,
        "periodStart": "2026-07-01",
        "periodEnd": "2026-07-07",
        "totalCommission": "1234.5600",
        "settledAmount": "1234.5600",
        "status": "settled",
        "confirmedAt": "2026-07-08T10:00:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
}
```

### 5.5 前端结算管理页面

```
admin/finance/AgentSettlement.tsx
├── 结算周期筛选
├── 结算列表（表格）
│   ├── 结算周期
│   ├── 佣金总额
│   ├── 调整金额
│   ├── 结算金额
│   ├── 状态（pending/confirmed/settled）
│   └── 操作（确认/查看详情）
│
├── 结算详情弹窗
│   ├── 汇总信息
│   ├── 明细列表（模型/用户/Token/佣金率/金额）
│   ├── 调整功能（调整金额 + 原因）
│   └── 确认按钮
│
└── 结算确认日志时间线
```

**SettlementPage Props**：
```typescript
interface SettlementItem {
  id: number;
  cycleId: number;
  periodStart: string;
  periodEnd: string;
  totalCommission: number;
  settledAmount: number;
  adjustmentAmount: number;
  adjustmentReason?: string;
  status: "pending" | "confirmed" | "auto_confirmed" | "settled";
  confirmedAt?: string;
}

interface SettlementListProps {
  items: SettlementItem[];
  agentId: number;
  onConfirm: (settlementId: number) => void;
}
```

---

## 6. 跨模块数据流

### 6.1 核心调用链

```
[calling log created]
      ↓
[billing/commission.ts]
  1. 查询用户是否绑定了 agent（agent_clients）
  2. 查询该 agent 的 commission_rules（按优先级排序）
  3. 计算佣金金额
  4. 写入 commission_logs（status=pending）
  5. 更新 agents.total_commission
      ↓
[commission_logs 每日聚合]
  写入 commission_daily_rollup
      ↓
[结算触发（手动/自动）]
  1. 拉取 period 内 pending 状态的 commission_logs
  2. 写入 settlement_cycles / agent_settlements / settlement_details
  3. 标记 commission_logs.status = settled
  4. 更新 agents.settled_commission
      ↓
[代理发起提现]
  1. 风控检查 → riskCheckResult 存入 withdraw_orders
  2. 初审 → 复审 → 打款
  3. 更新 agents.pending_withdraw / frozen_amount
```

### 6.2 依赖模块

| 模块 | 依赖关系 | 说明 |
|------|---------|------|
| `billing/commission.ts` | → `agent_clients` / `commission_rules` / `commission_logs` | 每次消费触发佣金计算 |
| `agent-finance.ts` | → `agents` / `commission_logs` / `withdraw_orders` | 代理财务摘要 |
| `agent-settlement.ts` | → `commission_logs` / `settlement_cycles` / `agent_settlements` | 结算引擎 |
| `agent-withdraw.ts` | → `agents` / `withdraw_orders` / `users` | 提现审核流 |
| `stats-usage-service/agent.ts` | → `call_logs` / `agent_clients` | 代理端统计 |

### 6.3 关联文档

| 文档 | 关联内容 |
|------|---------|
| [PRD-README.md §3](../PRD-README.md#三代理商体系精化摘要) | 代理商体系总纲 |
| [PRD-README.md §4.4 财务管理](../PRD-README.md#44-财务管理) | 充值/提现/发票 |
| [PRD-README.md §5.2 计费与结算精化](../PRD-README.md#52-计费与结算精化) | 计费链路、价格层级 |
| [ref-4.4-finance.md](ref-4.4-finance.md) | 财务深化（待创建）|
| [sprint-1/03-settlement-overview.md](sprint-1/03-settlement-overview.md) | 结算对账原始需求 |

### 6.4 关键约束

1. **佣金冻结期**：佣金产生后 `withdrawFreezeDays` 内不能提现，防止退款扣回
2. **可提现余额公式**：`settledCommission - pendingWithdraw - frozenAmount - redemptionLocked`
3. **审核不可逆**：reject 操作需记录原因，且不自动恢复 agent 余额冻结
4. **结算独立于提现**：结算只是将佣金从 pending 转为 settled，提现是另一条审批链路
5. **子代理分润**：`team` 类型佣金 = 子代理佣金的 N%（由 `teamLevelLimit` 和上级 `commission_rules` 决定）

---

> **文档版本**：v1.0 — 2026-07-28  
> **编写依据**：`api/src/db/schema/agents.ts` + `api/src/db/schema/agent-settlement.ts` + `api/src/routes/admin/agents.ts` + `api/src/routes/admin/finance/withdraws.ts` + `api/src/routes/agent/*.ts`  
> **下一步建议**：补充 `commission_logs` 分区迁移脚本 + 结算自动化 cron job
