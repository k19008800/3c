# 代理结算对账 — 业务概述 + 后端 API 规格

> **所属 Sprint**：Sprint 1 | **优先级**：P0 | **版本**：V1.5

---

## 1. 业务规则

### 1.1 核心规则

| 规则 | 说明 | 背景 |
|------|------|------|
| 月结制度 | 每月 1 日 02:00 自动关账上月佣金 | 资金结算周期明确 |
| 仅汇总已结算佣金 | status='settled' 的佣金日志才纳入 | 未结算的不算 |
| 3 天自动确认 | 关账后 3 天未确认→系统自动确认 | 避免资金滞留 |
| 管理员可调整 | 调整金额可为正可为负，需填原因 | 处理退款/纠纷 |
| 分批关账 | 每批 50 个代理一个事务 | 避免长时间锁表 |
| 财务数据不可删 | 结算单/明细/日志永久保留 | 审计合规 |

### 1.2 全流程时间线

```
每月 1 日 02:00
  │
  ├── 查 settlement_auto_enabled 开关
  │     └── false → 跳过，等管理员手动关账
  │
  ├── 计算上月周期（periodStart=上月1日, periodEnd=上月最后一天）
  │
  ├── generateSettlementCycle()
  │     ├── 检查周期唯一性（已 closed → 409 跳过）
  │     ├── 创建 cycle 记录
  │     ├── 分批 50 个代理
  │     │     └── 每批一个事务
  │     │           ├── 查 settled 佣金日志
  │     │           ├── 汇总总额
  │     │           ├── 写入 agent_settlements
  │     │           ├── 批量写入 settlement_details（每批 100 条）
  │     │           └── 写入 settlement_confirm_logs（action=generate）
  │     └── 关账 UPDATE cycle SET status='closed'
  │
  └── 代理端可见 → 代理确认 or 3 天自动确认

代理确认 / 自动确认
  ├── 验证状态 = pending
  ├── 事务：
  │     ├── UPDATE settlement SET status='settled'
  │     ├── UPDATE agents SET settled_commission += amount
  │     ├── 查更新后余额
  │     ├── INSERT agent_balance_ledger（changeType='commission_settlement'）
  │     └── INSERT settlement_confirm_logs（action=confirm/auto_confirm）
  └── 检查 cycle 是否全部 settled → UPDATE cycle SET status='settled'
```

### 1.3 状态机

```
              创建
               │
         ┌─────▼─────┐
         │   open     │ 周期已创建但未关账
         └─────┬──────┘
               │ 关账（手动/自动）
         ┌─────▼─────┐
         │  closed    │ 已关账，账单已生成，等待代理确认
         └─────┬──────┘
               │ 所有代理确认/自动确认
         ┌─────▼─────┐
         │  settled   │ 所有账单已结算（终态）
         └────────────┘

结算单状态：
    pending（待确认）
      ├── 代理确认 → settled
      └── 3 天自动确认 → settled
    settled（已结算）— 终态
```

---

## 2. 数据表 — 完整 Drizzle Schema

### 2.1 settlement_cycles — 结算周期定义

```typescript
export const settlementCycles = pgTable('settlement_cycles', {
  /** 自增主键 */
  id: serial('id').primaryKey(),

  /** 周期开始日期（YYYY-MM-DD），不可重复 */
  periodStart: date('period_start').notNull(),

  /** 周期结束日期（YYYY-MM-DD），必须 > periodStart */
  periodEnd: date('period_end').notNull(),

  /**
   * 周期状态：
   * - open: 已创建但未关账
   * - closed: 已关账，账单已生成，等待代理确认
   * - settled: 所有账单已结算
   */
  status: varchar('status', { length: 20 }).notNull().default('open'),

  /** 关账时间（status→closed 时设置） */
  generatedAt: timestamp('generated_at', { withTimezone: true }),

  /** 全部结算完成时间（status→settled 时设置） */
  settledAt: timestamp('settled_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // 同一周期不可重复创建
  uniquePeriod: uniqueIndex('idx_settlement_cycle_period').on(table.periodStart, table.periodEnd),
}));
```

### 2.2 agent_settlements — 代理结算账单

```typescript
export const agentSettlements = pgTable('agent_settlements', {
  id: serial('id').primaryKey(),

  /** FK → settlement_cycles.id */
  cycleId: integer('cycle_id').notNull()
    .references(() => settlementCycles.id),

  /** FK → agents.id */
  agentId: integer('agent_id').notNull()
    .references(() => agents.id),

  /** 周期内已结算佣金总额（精度 18,4） */
  totalCommission: decimal('total_commission', { precision: 18, scale: 4 }).notNull().default('0'),

  /** 管理员调整金额（正=加，负=减） */
  adjustmentAmount: decimal('adjustment_amount', { precision: 18, scale: 4 }).notNull().default('0'),

  /** 调整原因（≥5字符），adjustmentAmount≠0 时必填 */
  adjustmentReason: text('adjustment_reason'),

  /** 实际结算金额 = totalCommission + adjustmentAmount */
  settledAmount: decimal('settled_amount', { precision: 18, scale: 4 }).notNull().default('0'),

  /**
   * 结算单状态：
   * - pending: 待代理确认
   * - settled: 已确认/已结算（终态）
   */
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  /** 代理确认时间（手动确认时设置） */
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

  /** 结算完成时间（余额转入完成） */
  settledAt: timestamp('settled_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // 同一周期同一代理只有一张账单
  uniqueCycleAgent: uniqueIndex('idx_settlement_cycle_agent').on(table.cycleId, table.agentId),
  // 按代理查询
  agentIdx: index('idx_settlement_agent').on(table.agentId),
  // 按状态查询（自动确认 cron 用）
  statusIdx: index('idx_settlement_status').on(table.status),
}));
```

### 2.3 settlement_details — 结算明细

```typescript
export const settlementDetails = pgTable('settlement_details', {
  id: serial('id').primaryKey(),

  /** FK → agent_settlements.id */
  settlementId: integer('settlement_id').notNull()
    .references(() => agentSettlements.id, { onDelete: 'cascade' }),

  /** FK → agent_commission_logs.id */
  commissionId: integer('commission_id').notNull(),

  /** 本笔佣金金额（精度 18,8，原佣金精度） */
  amount: decimal('amount', { precision: 18, scale: 8 }).notNull().default('0'),

  /** FK → users.id（消费的客户） */
  clientUserId: integer('client_user_id').notNull()
    .references(() => users.id),

  /** 消费记录 ID（consumption_logs.id） */
  consumptionId: integer('consumption_id'),

  /** 模型名称（如 gpt-4, claude-3-opus） */
  model: varchar('model', { length: 100 }),

  /** Token 数量 */
  tokens: integer('tokens').default(0),

  /** 佣金比例（如 10.00 表示 10%） */
  commissionRate: decimal('commission_rate', { precision: 5, scale: 2 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  settlementIdx: index('idx_settlement_detail_sid').on(table.settlementId),
}));
```

### 2.4 settlement_confirm_logs — 对账确认日志

```typescript
export const settlementConfirmLogs = pgTable('settlement_confirm_logs', {
  id: serial('id').primaryKey(),

  /** FK → agent_settlements.id */
  settlementId: integer('settlement_id').notNull()
    .references(() => agentSettlements.id, { onDelete: 'cascade' }),

  /**
   * 操作类型：
   * - generate: 关账生成
   * - confirm: 代理手动确认
   * - auto_confirm: 3 天系统自动确认
   * - adjust: 管理员调整金额
   */
  action: varchar('action', { length: 20 }).notNull(),

  /** 操作人 ID（system 时为 null） */
  operatorId: integer('operator_id').references(() => users.id),

  /** 操作人角色（system / agent / admin） */
  operatorRole: varchar('operator_role', { length: 20 }).notNull(),

  /** 详细描述 */
  detail: text('detail'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  settlementIdx: index('idx_settlement_log_sid').on(table.settlementId),
}));
```

### 2.5 迁移 SQL

```sql
-- 2026-07-27-agent-settlement.sql

CREATE TABLE IF NOT EXISTS settlement_cycles (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  generated_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_settlement_cycle_period ON settlement_cycles(period_start, period_end);

CREATE TABLE IF NOT EXISTS agent_settlements (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES settlement_cycles(id),
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  total_commission DECIMAL(18,4) NOT NULL DEFAULT '0',
  adjustment_amount DECIMAL(18,4) NOT NULL DEFAULT '0',
  adjustment_reason TEXT,
  settled_amount DECIMAL(18,4) NOT NULL DEFAULT '0',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  confirmed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_settlement_cycle_agent ON agent_settlements(cycle_id, agent_id);
CREATE INDEX idx_settlement_agent ON agent_settlements(agent_id);
CREATE INDEX idx_settlement_status ON agent_settlements(status);

CREATE TABLE IF NOT EXISTS settlement_details (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  commission_id INTEGER NOT NULL,
  amount DECIMAL(18,8) NOT NULL DEFAULT '0',
  client_user_id INTEGER NOT NULL REFERENCES users(id),
  consumption_id INTEGER,
  model VARCHAR(100),
  tokens INTEGER DEFAULT 0,
  commission_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_settlement_detail_sid ON settlement_details(settlement_id);

CREATE TABLE IF NOT EXISTS settlement_confirm_logs (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  operator_id INTEGER REFERENCES users(id),
  operator_role VARCHAR(20) NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_settlement_log_sid ON settlement_confirm_logs(settlement_id);
```

---

## 3. Service 层 — 核心函数

### 3.1 关账 `generateSettlementCycle`

```typescript
/**
 * 创建结算周期并生成所有代理的账单
 * @param periodStart 周期开始日期 'YYYY-MM-DD'
 * @param periodEnd   周期结束日期 'YYYY-MM-DD'
 * @returns { cycleId, periodStart, periodEnd, agentBillCount }
 */
export async function generateSettlementCycle(periodStart: string, periodEnd: string) {
  // ── 校验 ──
  if (periodEnd <= periodStart) {
    throw new HttpError(400, 'VALIDATION_ERROR', '结束日期必须大于开始日期');
  }

  // 周期跨度不超过 366 天
  const daysDiff = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000;
  if (daysDiff > 366) {
    throw new HttpError(400, 'VALIDATION_ERROR', '结算周期不能超过 366 天');
  }

  // ── 幂等检查 ──
  const existing = await db.query.settlementCycles.findFirst({
    where: and(
      eq(settlementCycles.periodStart, periodStart),
      eq(settlementCycles.periodEnd, periodEnd),
    ),
  });
  if (existing && existing.status !== 'open') {
    throw new HttpError(409, 'CYCLE_ALREADY_CLOSED', `结算周期 ${periodStart}~${periodEnd} 已关账`);
  }

  let cycle = existing;
  if (!cycle) {
    [cycle] = await db.insert(settlementCycles).values({
      periodStart, periodEnd, status: 'open',
    }).returning();
  }

  // ── 查全部正式活跃代理 ──
  const formalAgents = await db.query.agents.findMany({
    where: and(
      eq(agents.level, 'formal'),
      eq(agents.status, 'active'),
    ),
    columns: { id: true },
  });

  let billCount = 0;

  // ── 分批处理（50 个代理/事务） ──
  for (let batchIdx = 0; batchIdx < formalAgents.length; batchIdx += 50) {
    const batch = formalAgents.slice(batchIdx, batchIdx + 50);

    await db.transaction(async (tx) => {
      for (const agent of batch) {
        // 查该代理在周期内的已结算佣金
        const logs = await tx.query.agentCommissionLogs.findMany({
          where: and(
            eq(agentCommissionLogs.agentId, agent.id),
            eq(agentCommissionLogs.status, 'settled'),
            gte(agentCommissionLogs.createdAt, new Date(periodStart + 'T00:00:00Z')),
            lt(agentCommissionLogs.createdAt, new Date(periodEnd + 'T23:59:59Z')),
          ),
        });

        // 零佣金跳过
        if (logs.length === 0) continue;

        // 汇总
        const total = logs.reduce((sum, l) => sum + parseFloat(l.commission || '0'), 0);

        // 写结算单
        const [settlement] = await tx.insert(agentSettlements).values({
          cycleId: cycle!.id,
          agentId: agent.id,
          totalCommission: total.toFixed(4),
          settledAmount: total.toFixed(4),
          adjustmentAmount: '0.0000',
          status: 'pending',
        }).returning({ id: agentSettlements.id });

        // 批量写明细（每批 100 条）
        for (let i = 0; i < logs.length; i += 100) {
          await tx.insert(settlementDetails).values(
            logs.slice(i, i + 100).map(l => ({
              settlementId: settlement.id,
              commissionId: l.id,
              amount: l.commission,
              clientUserId: l.clientUserId,
              consumptionId: l.consumptionId ?? null,
              model: l.model ?? null,
              tokens: l.tokens ?? 0,
              commissionRate: l.rate ?? null,
            }))
          );
        }

        // 写日志
        await tx.insert(settlementConfirmLogs).values({
          settlementId: settlement.id,
          action: 'generate',
          operatorRole: 'system',
          detail: `结算周期关账: ${periodStart} ~ ${periodEnd}, 佣金笔数: ${logs.length}`,
        });

        billCount++;
      }
    });
  }

  // ── 关账 ──
  await db.update(settlementCycles)
    .set({ status: 'closed', generatedAt: new Date() })
    .where(eq(settlementCycles.id, cycle!.id));

  console.log(`[SettlementCycle] 关账完成: ${periodStart}~${periodEnd}, ${billCount}/${formalAgents.length} 个代理生成账单`);
  return { cycleId: cycle!.id, periodStart, periodEnd, agentBillCount: billCount };
}
```

### 3.2 确认结算 `confirmSettlement`

```typescript
/**
 * 代理确认 / 系统自动确认结算单
 * @param settlementId 结算单 ID
 * @param userId      操作人用户 ID（自动确认传 0）
 * @param autoConfirm  true=系统自动确认
 */
export async function confirmSettlement(settlementId: number, userId: number, autoConfirm = false) {
  const settlement = await db.query.agentSettlements.findFirst({
    where: eq(agentSettlements.id, settlementId),
  });
  if (!settlement) throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', '结算单不存在');
  if (settlement.status !== 'pending') {
    throw new HttpError(400, 'SETTLEMENT_STATUS_MISMATCH', `结算单状态为 ${settlement.status}，无法确认`);
  }

  // 非自动确认时验证归属
  if (!autoConfirm) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.userId, userId),
      columns: { id: true },
    });
    if (!agent || agent.id !== settlement.agentId) {
      throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', '结算单不存在');
    }
  }

  const settledAmount = parseFloat(settlement.settledAmount || '0');

  // ── 事务 ──
  await db.transaction(async (tx) => {
    // 1. 更新结算单
    await tx.update(agentSettlements)
      .set({
        status: 'settled',
        confirmedAt: new Date(),
        settledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentSettlements.id, settlementId));

    // 2. 增加代理可提现余额
    await tx.update(agents)
      .set({
        settledCommission: sql`${agents.settledCommission} + ${settledAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, settlement.agentId));

    // 3. 查更新后余额（用于账本流水 balanceAfter）
    const [agentAfter] = await tx.select({ balance: agents.settledCommission })
      .from(agents).where(eq(agents.id, settlement.agentId));

    // 4. 写入余额账本
    await tx.insert(agentBalanceLedger).values({
      agentId: settlement.agentId,
      changeType: 'commission_settlement',
      changeAmount: settledAmount.toFixed(4),
      balanceAfter: agentAfter.balance,
      description: `结算单 #${settlementId} ${autoConfirm ? '自动' : '手动'}确认入账`,
      operatorId: autoConfirm ? null : userId,
    });

    // 5. 写操作日志
    await tx.insert(settlementConfirmLogs).values({
      settlementId,
      action: autoConfirm ? 'auto_confirm' : 'confirm',
      operatorId: autoConfirm ? null : userId,
      operatorRole: autoConfirm ? 'system' : 'agent',
      detail: autoConfirm
        ? `3 天未确认，系统自动确认。金额 ¥${settledAmount.toFixed(2)}`
        : `代理手动确认。金额 ¥${settledAmount.toFixed(2)}`,
    });
  });

  // ── 检查周期是否可标记 settled ──
  await checkSettleCycle(settlement.cycleId);
}
```

### 3.3 调整金额 `adjustSettlement`

```typescript
/**
 * 管理员调整结算金额
 * @param settlementId    结算单 ID
 * @param adjustmentAmount 调整金额（正=加，负=减）
 * @param reason          调整原因（≥5 字符）
 * @param adminUserId     操作管理员 ID
 */
export async function adjustSettlement(
  settlementId: number,
  adjustmentAmount: number,
  reason: string,
  adminUserId: number,
) {
  // ── 校验 ──
  const settlement = await db.query.agentSettlements.findFirst({
    where: eq(agentSettlements.id, settlementId),
  });
  if (!settlement) throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', '结算单不存在');
  if (settlement.status !== 'pending') {
    throw new HttpError(400, 'SETTLEMENT_STATUS_MISMATCH', '仅待确认状态的结算单可调整');
  }
  if (!reason || reason.trim().length < 5) {
    throw new HttpError(400, 'VALIDATION_ERROR', '调整原因最少 5 个字符');
  }
  if (reason.trim().length > 500) {
    throw new HttpError(400, 'VALIDATION_ERROR', '调整原因不能超过 500 字符');
  }

  const currentSettled = parseFloat(settlement.settledAmount || '0');
  const newAmount = currentSettled + adjustmentAmount;

  if (newAmount < 0) {
    throw new HttpError(400, 'SETTLEMENT_AMOUNT_NEGATIVE',
      `调整后金额 ¥${newAmount.toFixed(2)} 不能为负数（当前 ¥${currentSettled.toFixed(2)} + 调整 ¥${adjustmentAmount.toFixed(2)}）`);
  }

  await db.transaction(async (tx) => {
    await tx.update(agentSettlements)
      .set({
        adjustmentAmount: adjustmentAmount.toFixed(4),
        adjustmentReason: reason.trim(),
        settledAmount: newAmount.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(agentSettlements.id, settlementId));

    await tx.insert(settlementConfirmLogs).values({
      settlementId,
      action: 'adjust',
      operatorId: adminUserId,
      operatorRole: 'admin',
      detail: `调整: ¥${currentSettled.toFixed(2)} → ¥${newAmount.toFixed(2)}（${adjustmentAmount > 0 ? '+' : ''}¥${adjustmentAmount.toFixed(2)}）, 原因: ${reason.trim()}`,
    });
  });

  return {
    settlementId,
    originalAmount: settlement.settledAmount,
    adjustmentAmount: adjustmentAmount.toFixed(4),
    newSettledAmount: newAmount.toFixed(4),
  };
}
```

### 3.4 周期标记 `checkSettleCycle`

```typescript
/**
 * 检查周期内所有账单是否已结算完毕
 * 如果全部 settled，将周期标记为 settled
 */
async function checkSettleCycle(cycleId: number) {
  const [pending] = await db.select({ cnt: sql<number>`count(*)::int` })
    .from(agentSettlements)
    .where(and(
      eq(agentSettlements.cycleId, cycleId),
      eq(agentSettlements.status, 'pending'),
    ));

  if (pending.cnt === 0) {
    await db.update(settlementCycles)
      .set({ status: 'settled', settledAt: new Date() })
      .where(and(
        eq(settlementCycles.id, cycleId),
        eq(settlementCycles.status, 'closed'),  // 只从 closed → settled
      ));
    console.log(`[SettlementCycle] 周期 #${cycleId} 全部结算完成，标记 settled`);
  }
}
```

---

## 4. 路由 — 管理端（7 个 API）

### 4.1 GET /api/v1/admin/finance/settlement-cycles — 周期列表

**Query 参数**：

| 参数 | 类型 | 必填 | 默认 | 最大 | 校验 |
|------|------|------|------|------|------|
| status | string | 否 | — | — | 枚举 open/closed/settled，其他值忽略 |
| limit | integer | 否 | 20 | 100 | ≤0→20, >100→100 |
| offset | integer | 否 | 0 | — | <0→0 |

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "rows": [
      {
        "id": 3,
        "periodStart": "2026-07-01",
        "periodEnd": "2026-07-31",
        "status": "closed",
        "generatedAt": "2026-08-01T02:00:00.000Z",
        "settledAt": null,
        "totalBills": 48,
        "pendingBills": 8,
        "settledBills": 40
      },
      {
        "id": 2,
        "periodStart": "2026-06-01",
        "periodEnd": "2026-06-30",
        "status": "settled",
        "generatedAt": "2026-07-01T02:00:00.000Z",
        "settledAt": "2026-07-04T03:00:00.000Z",
        "totalBills": 50,
        "pendingBills": 0,
        "settledBills": 50
      }
    ],
    "total": 3
  }
}
```

### 4.2 POST /api/v1/admin/finance/settlement-cycles/generate — 手动关账

**请求体**：
```json
{
  "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31"
}
```

**字段校验**：

| 字段 | 类型 | 必填 | 格式 | 无效值 |
|------|------|------|------|--------|
| periodStart | string | ✅ | YYYY-MM-DD（正则 `^\d{4}-\d{2}-\d{2}$`） | 400 VALIDATION_ERROR |
| periodEnd | string | ✅ | 同上 | 同上 |

**完整响应枚举**：

| 场景 | HTTP | error | message | data |
|------|------|-------|---------|------|
| 创建成功 | 200 | — | "结算周期创建成功" | {cycleId, periodStart, periodEnd, agentBillCount} |
| 日期格式错误 | 400 | VALIDATION_ERROR | Fastify schema 自动校验 | — |
| periodEnd ≤ periodStart | 400 | VALIDATION_ERROR | "结束日期必须大于开始日期" | — |
| 跨度 > 366 天 | 400 | VALIDATION_ERROR | "结算周期不能超过 366 天" | — |
| 周期已关账 | 409 | CYCLE_ALREADY_CLOSED | "结算周期 X~Y 已关账" | — |
| 权限不足 | 403 | FORBIDDEN | "权限不足" | — |

**成功响应**：
```json
{
  "code": 0,
  "message": "结算周期创建成功",
  "data": {
    "cycleId": 4,
    "periodStart": "2026-07-01",
    "periodEnd": "2026-07-31",
    "agentBillCount": 48
  }
}
```

### 4.3 GET /api/v1/admin/finance/settlements — 结算单列表

**Query 参数**：

| 参数 | 类型 | 必填 | 默认 | 最大 | 校验 |
|------|------|------|------|------|------|
| cycle_id | integer | ✅ | — | — | 非整数 → 解析错误 |
| status | string | 否 | — | — | 枚举 pending/settled |
| search | string | 否 | — | 50 字符 | 超长截断到 50 |
| limit | integer | 否 | 20 | 100 | ≤0→20, >100→100 |
| offset | integer | 否 | 0 | — | <0→0 |

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "rows": [
      {
        "id": 15,
        "cycleId": 3,
        "agentId": 5,
        "agentName": "张三代理",
        "totalCommission": "3456.7800",
        "settledAmount": "3433.2800",
        "adjustmentAmount": "-23.5000",
        "adjustmentReason": "客户退款扣除佣金",
        "status": "pending",
        "confirmedAt": null,
        "settledAt": null,
        "createdAt": "2026-08-01T02:00:00.000Z"
      }
    ],
    "total": 48
  }
}
```

### 4.4 GET /api/v1/admin/finance/settlements/:id — 结算单详情

**Path 参数**：`:id` → 结算单 ID

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "settlement": {
      "id": 15,
      "cycleId": 3,
      "agentId": 5,
      "agentName": "张三代理",
      "agentEmail": "zhangsan@example.com",
      "totalCommission": "3456.7800",
      "settledAmount": "3433.2800",
      "adjustmentAmount": "-23.5000",
      "adjustmentReason": "客户退款扣除佣金",
      "status": "pending",
      "confirmedAt": null,
      "settledAt": null,
      "createdAt": "2026-08-01T02:00:00.000Z",
      "updatedAt": "2026-08-01T10:30:00.000Z"
    },
    "cycle": {
      "id": 3,
      "periodStart": "2026-07-01",
      "periodEnd": "2026-07-31",
      "status": "closed"
    },
    "logs": [
      {
        "id": 32,
        "action": "generate",
        "operatorRole": "system",
        "detail": "结算周期关账: 2026-07-01 ~ 2026-07-31, 佣金笔数: 145",
        "createdAt": "2026-08-01T02:00:00.000Z"
      },
      {
        "id": 33,
        "action": "adjust",
        "operatorRole": "admin",
        "detail": "调整: ¥3456.78 → ¥3433.28（-¥23.50）, 原因: 客户退款扣除佣金",
        "createdAt": "2026-08-01T10:30:00.000Z"
      }
    ]
  }
}
```

### 4.5 GET /api/v1/admin/finance/settlements/:id/details — 结算明细

**Query 参数**：limit(20), offset(0)

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "rows": [
      {
        "id": 201,
        "commissionId": 5001,
        "amount": "12.50000000",
        "clientUserId": 101,
        "clientName": "客户A",
        "model": "gpt-4",
        "tokens": 8500,
        "commissionRate": "10.00",
        "createdAt": "2026-07-15T14:30:00.000Z"
      }
    ],
    "summary": {
      "totalAmount": "3456.7800",
      "totalTokens": 2850000,
      "modelCount": 12
    }
  }
}
```

### 4.6 GET /api/v1/admin/finance/settlements/:id/export — 导出 CSV

**响应**：
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="settlement_15_details.csv"`
- UTF-8 BOM (`\uFEFF`) 开头，Excel 兼容

**CSV 格式**：
```
﻿日期,客户ID,客户姓名,模型,Token数,佣金金额(元),佣金率
2026-07-15,101,客户A,gpt-4,8500,12.50,10.00%
2026-07-15,102,客户B,claude-3-opus,12000,18.00,10.00%
```

### 4.7 POST /api/v1/admin/finance/settlements/:id/adjust — 调整金额

**请求体**：
```json
{
  "adjustmentAmount": -23.50,
  "reason": "客户退款扣除佣金"
}
```

**字段校验**：

| 字段 | 类型 | 必填 | 约束 | 无效值 |
|------|------|------|------|--------|
| adjustmentAmount | number | ✅ | 精度 ≤ 4 位小数 | 超精度 → round(4) |
| reason | string | ✅ | trim 后 5-500 字符 | <5 → 400, >500 → 400 |

**完整响应枚举**：

| 场景 | HTTP | error | message |
|------|------|-------|---------|
| 调整成功 | 200 | — | "结算金额已调整" |
| 结算单不存在 | 404 | SETTLEMENT_NOT_FOUND | "结算单不存在" |
| 非 pending 状态 | 400 | SETTLEMENT_STATUS_MISMATCH | "仅待确认状态的结算单可调整" |
| 原因 < 5 字符 | 400 | VALIDATION_ERROR | "调整原因最少 5 个字符" |
| 原因 > 500 字符 | 400 | VALIDATION_ERROR | "调整原因不能超过 500 字符" |
| 调整后为负 | 400 | SETTLEMENT_AMOUNT_NEGATIVE | "调整后金额 ¥X 不能为负数" |

**成功响应**：
```json
{
  "code": 0,
  "message": "结算金额已调整",
  "data": {
    "settlementId": 15,
    "originalAmount": "3456.7800",
    "adjustmentAmount": "-23.5000",
    "newSettledAmount": "3433.2800"
  }
}
```

---

## 5. 路由 — 代理端（4 个 API）

### 5.1 GET /api/v1/agent/settlements — 代理结算单列表

**Query 参数**：status(pending/settled), limit(20), offset(0)

**成功响应(200)**：
```json
{
  "code": 0,
  "data": {
    "rows": [
      {
        "id": 15,
        "cycleId": 3,
        "periodStart": "2026-07-01",
        "periodEnd": "2026-07-31",
        "totalCommission": "3456.7800",
        "settledAmount": "3433.2800",
        "adjustmentAmount": "-23.5000",
        "adjustmentReason": "客户退款扣除佣金",
        "status": "pending",
        "confirmedAt": null,
        "createdAt": "2026-08-01T02:00:00.000Z"
      }
    ],
    "stats": {
      "pending": 2,
      "settled": 5
    }
  }
}
```

### 5.2 GET /api/v1/agent/settlements/:id — 代理结算单详情

**安全**：自动过滤 `agentId = 当前代理`，非本人结算单返回 404

### 5.3 POST /api/v1/agent/settlements/:id/confirm — 确认结算

**请求体**：无

**完整响应枚举**：

| 场景 | HTTP | error | message |
|------|------|-------|---------|
| 确认成功 | 200 | — | "结算单已确认，金额已转入可提现余额" |
| 不存在/非本人 | 404 | SETTLEMENT_NOT_FOUND | "结算单不存在" |
| 已结算 | 400 | SETTLEMENT_STATUS_MISMATCH | "结算单状态不符，无法确认" |

### 5.4 GET /api/v1/agent/settlements/:id/export-csv — 导出 CSV

同管理端格式，但不含客户姓名列（隐私保护）

---

## 6. 定时任务

### 6.1 每月自动关账

| 属性 | 值 |
|------|-----|
| Cron 表达式 | `0 2 1 * *`（每月 1 日 02:00） |
| 开关 | system_configs.key='settlement_auto_enabled'，value='true' 才执行 |
| 幂等 | 已关账返回 409，catch 后跳过 |

**日志**：
```
[SettlementCycleCron] 2026-08-01T02:00:00.000Z | period=2026-07-01~2026-07-31 | agents=50 | bills=48 | duration=3400ms
```

### 6.2 每日自动确认

| 属性 | 值 |
|------|-----|
| Cron 表达式 | `0 3 * * *`（每日 03:00） |
| 查询条件 | status='pending' AND created_at < (NOW() - 3 天) |
| 幂等 | 已 settled 的不会被查到 |

**日志**：
```
[SettlementCron] 2026-08-04T03:00:00.000Z | scanned=8 confirmed=5 errors=0 duration=1200ms
[SettlementCron] 2026-08-04T03:00:02.200Z | #12 确认失败: SettlementStatusMismatch
```

---

## 7. 错误码汇总

| HTTP | error_code | 场景 |
|------|-----------|------|
| 400 | VALIDATION_ERROR | 日期格式/跨度/调整原因校验 |
| 400 | SETTLEMENT_STATUS_MISMATCH | 已 settled 再确认/调整 |
| 400 | SETTLEMENT_AMOUNT_NEGATIVE | 调整后金额 < 0 |
| 403 | AGENT_REQUIRED | 非代理访问代理端 API |
| 403 | FORBIDDEN | 无权访问管理端 |
| 404 | SETTLEMENT_NOT_FOUND | 结算单不存在或不属于当前代理 |
| 409 | CYCLE_ALREADY_CLOSED | 周期已关账重复关账 |
