# 代理商操作流程

> 对应：4.8 代理商体系 / 前端路由 `/agent/*` / 管理后台 `/admin/agents`、`/admin/withdraws`
> 关联表：`agents`、`agent_clients`、`commission_logs`、`withdraw_orders`

---

## 一、角色定义

| 角色 | 说明 |
|------|------|
| **超级管理员** | 创建/管理代理商，审核提现 |
| **管理员** | 同上（权限一致） |
| **代理商 (Agent)** | 名下绑定客户，按客户消费总额按月获得分佣 |
| **普通用户** | 可由管理员升级为代理商 |

---

## 二、完整业务流程图

```
┌─────────────────────────────────────────────────────────┐
│                    管理员（后台操作）                      │
│                                                         │
│  1. 创建代理商                                           │
│     ├─ 新建用户并升级为 agent 角色                         │
│     └─ 将已有 user 升级为 agent                           │
│     ※ 需设置分佣比例 (0~1)                                │
│                                                         │
│  2. 客户分配                                             │
│     └─ 将平台用户绑定到代理商名下                           │
│                                                         │
│  3. 系统配置                                             │
│     ├─ agent_min_withdraw: 最低提现金额（默认 50）         │
│     └─ agent_daily_withdraw_limit: 每日提现次数上限        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    用户调用 API                           │
│                                                         │
│  用户请求 → Token 代理转发 → 计费引擎扣费                  │
│                                                         │
│  计费完成后：                                            │
│  ┌─ 判断该用户是否属于某个代理商（agent_clients）          │
│  ├─ 是 → 计算分佣 = 消费金额 × 代理商分佣比例              │
│  │   ├─ 写入 commission_logs（status = pending，待结算）  │
│  │   ├─ 累加 agents.total_commission                      │
│  │   └─ 累加 agents.pending_withdraw（可提现余额）         │
│  └─ 否 → 不分佣，流程结束                                 │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    代理商（控制台操作）                    │
│                                                         │
│  1️⃣ 总览页面 /agent/dashboard                           │
│     ├─ 客户总数                                          │
│     ├─ 本月消费（所有客户）                                │
│     ├─ 累计分佣                                          │
│     └─ 可提现金额                                        │
│                                                         │
│  2️⃣ 客户列表 /agent/clients                              │
│     ├─ 查看名下所有客户（邮箱/昵称/余额/注册时间）          │
│     └─ 查看客户消费明细（调用量/费用）                     │
│                                                         │
│  3️⃣ 分佣记录 /agent/commissions                          │
│     ├─ 按时间/状态筛选                                    │
│     ├─ 查看每笔佣金（来源客户/金额/状态）                  │
│     └─ CSV 导出                                          │
│                                                         │
│  4️⃣ 提现 /agent/withdraw                                │
│     ├─ 发起提现（金额 ≥ 最低提现额）                       │
│     ├─ 系统校验：                                        │
│     │   ├─ 不可超过可提现余额                              │
│     │   └─ 今日提现次数未达上限                            │
│     ├─ 扣减 pending_withdraw                              │
│     └─ 生成 withdraw_orders（status = pending_review）    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│               管理员审核提现（后台操作）                    │
│                                                         │
│  提现列表 /admin/withdraws                               │
│                                                         │
│  审核前检查：                                            │
│  ├─ 查看该代理商的客户近 30 天消费流水                     │
│  ├─ 检查异常：刷单/大量失败/自刷                          │
│  └─ 确认无误后操作                                       │
│                                                         │
│  ┌─────── 审核 ───────┐                                 │
│  ▼                      ▼                                │
│ ✅ 通过                   ❌ 拒绝                           │
│  ├─ status = approved   ├─ status = rejected             │
│  ├─ 记录审核人/时间      ├─ 填写驳回原因                   │
│  └─ 待财务打款          └─ 金额退回 pending_withdraw      │
│                                                         │
│  打款（线下）                                            │
│  └─ 微信企业付款到零钱                                    │
│     └─ 登记 wechat_pay_no                                │
│        └─ status = paid                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 三、状态迁移说明

### 3.1 提现订单状态

```
pending_review ──┬──→ approved ──→ paid
                 │
                 └──→ rejected（金额退回可提现余额）
```

| 状态 | 含义 | 谁操作 |
|------|------|--------|
| `pending_review` | 待审核（代理商提交后） | 自动 |
| `approved` | 审核通过，待打款 | 管理员 |
| `paid` | 已打款（微信付款到零钱） | 财务线下操作后更新 |
| `rejected` | 已驳回（金额退回） | 管理员 |

### 3.2 佣金状态

| 状态 | 含义 |
|------|------|
| `pending` | 待结算（计费后自动生成） |
| `settled` | 已结算（可按时间段批量结算） |

> 当前设计：佣金在生成时直接累加到 `pending_withdraw`，不区分 pending/settled。
> 如需月结模式，可在 `commission_logs` 中增加 `settled_at` 字段并做批量结算定时任务。

---

## 四、数据库操作一览

### 4.1 管理员 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/admin/agents` | 代理商列表 |
| `POST` | `/api/v1/admin/agents` | 创建代理商（指定 userId + 分佣比例） |
| `PATCH` | `/api/v1/admin/agents/:id` | 更新分佣比例/状态 |
| `GET` | `/api/v1/admin/withdraws` | 提现订单列表 |
| `POST` | `/api/v1/admin/withdraws/:id/review` | 审核提现（approve / reject） |

> ⚠️ **待实现（PRD 第 16 项决策）：** 审核页面应展示该代理商名下客户近 30 天消费流水，帮助管理员核验是否存在异常消费。

### 4.2 代理商 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/agent/dashboard` | 代理商面板 |
| `GET` | `/api/v1/agent/clients` | 客户列表 |
| `GET` | `/api/v1/agent/commissions` | 佣金历史（支持 status 筛选） |
| `POST` | `/api/v1/agent/withdraw` | 发起提现 |
| `GET` | `/api/v1/agent/withdraws` | 提现记录（支持 status 筛选） |

---

## 五、关键校验规则

### 提现发起

```
1. 金额 > 0
2. 金额 ≥ agent_min_withdraw（系统配置，默认 50 元）
3. 金额 ≤ pending_withdraw（可提现余额）
4. 今日提现次数 < agent_daily_withdraw_limit
   → 通过：扣减 pending_withdraw，生成 pending_review 订单
```

### 提现审核（拒绝时）

```
1. 订单状态必须为 pending_review
2. 拒绝 → 退还金额至 pending_withdraw
   UPDATE agents SET pending_withdraw = pending_withdraw + amount
3. 拒绝 → 记录 reject_reason
```

---

## 六、分佣计算时机

分佣发生在 **Token 代理调用的计费环节**之后：

```
用户调用 API → 计费引擎扣费 → 判断是否有归属代理商
   ↓
有代理商 → commission = call_cost × agent.commission_rate
   ↓
INSERT INTO commission_logs (agent_id, call_cost, commission_amount, status, created_at)
UPDATE agents SET total_commission += commission, pending_withdraw += commission
```

> 当前代码中 **分佣写入尚未实现**，需要计入计费引擎 (`billing.ts`)。

---

## 七、待开发项（P2）

| # | 任务 | 优先级 | 参考 |
|---|------|--------|------|
| 1 | 计费引擎中触发分佣写入 | P2 | 在 `billing.ts` 完成扣费后查询 `agent_clients` 并写 `commission_logs` |
| 2 | 审核页面：展示代理商客户近 30 天流水 | P2 | PRD 第 16 项决策 |
| 3 | 分佣记录批量结算定时任务（可选月结） | P3 | 可选 |
| 4 | 微信企业付款到零钱接口对接 | P3 | 支付后更新 `paid` 状态 |
| 5 | 前端 4 页（AgentLayout）开发 | P2 | `/agent/dashboard`、`/clients`、`/commissions`、`/withdraw` |
| 6 | 管理后台前端（代理商管理 + 提现审核） | P2 | `/admin/agents`、`/admin/withdraws` |

---

## 八、相关配置项

| 配置 key | 默认值 | 说明 |
|----------|--------|------|
| `agent_min_withdraw` | `50` | 最低提现金额（元） |
| `agent_daily_withdraw_limit` | `3` | 每日提现次数上限 |
| `admin_notify_email` | — | 提现事件通知邮箱 |

---

*文档版本：v1.0 / 2026-06-28*
