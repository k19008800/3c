/**
 * 代理商佣金服务 — 实时结算 + 退款冲销
 *
 * 职责：
 *   - generateCommissionForConsumption：消费产生佣金（实时 settled），同步累计代理余额
 *   - cancelCommissionsForConsumption：客户退款时冲销该笔消费对应佣金，回冲代理余额
 *
 * 幂等：agent_commissions.consumption_record_id 唯一索引 + insert onConflictDoNothing，
 *       同一笔消费重复调用只会生成一条佣金。
 */

import { db, schema } from '../../db';
import { eq, and, sql } from 'drizzle-orm';

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * 为一笔消费实时生成佣金（若有 active 代理绑定）。
 *
 * - 无代理绑定 → 跳过（返回 null）
 * - 佣金比例 = 代理当前 commission_rate（% 存储，×1/100）
 * - 直接落 settled，settled_at = now（实时结算语义）
 * - 同一事务内更新 agents.available_balance / total_earnings
 *
 * 消费链路异步调用（不阻塞响应）；返回生成的佣金记录或 null。
 */
export async function generateCommissionForConsumption(input: {
  userId: number;
  consumptionRecordId: number;
  cost: string;
}): Promise<typeof schema.agentCommissions.$inferSelect | null> {
  // 查 active 代理绑定（无则跳过）
  const bindings = await db
    .select({
      agentId: schema.agentCustomers.agentId,
      rate: schema.agents.commissionRate,
      agentStatus: schema.agents.status,
    })
    .from(schema.agentCustomers)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.agentCustomers.agentId))
    .where(and(
      eq(schema.agentCustomers.customerUserId, input.userId),
      eq(schema.agentCustomers.status, 'active'),
    ))
    .limit(1);

  const binding = bindings[0];
  if (!binding || binding.agentStatus !== 'active') return null;

  const cost = Number(input.cost ?? 0);
  if (!Number.isFinite(cost) || cost <= 0) return null;

  const rate = Number(binding.rate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const amount = round2(cost * (rate / 100));
  if (amount <= 0) return null;

  return db.transaction(async (tx) => {
    // 幂等：唯一索引冲突直接跳过
    const [comm] = await tx
      .insert(schema.agentCommissions)
      .values({
        agentId: binding.agentId,
        customerUserId: input.userId,
        consumptionRecordId: input.consumptionRecordId,
        amount: amount.toFixed(4),
        rate: rate.toFixed(2),
        status: 'settled',
        settledAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.agentCommissions.consumptionRecordId })
      .returning();
    if (!comm) return null;

    await tx.execute(sql`
      UPDATE agents
      SET available_balance = available_balance + ${amount.toFixed(4)}::numeric,
          total_earnings   = total_earnings + ${amount.toFixed(4)}::numeric,
          updated_at = NOW()
      WHERE id = ${binding.agentId}
    `);
    return comm;
  });
}

/**
 * 把「消费引用」解析为 consumption_records.id。
 * - 全数字 → 视为 id 本身
 * - 其他（request_id UUID）→ 按 request_id 查 consumption_records
 */
export async function resolveConsumptionRecordId(ref: string | number): Promise<number | null> {
  if (typeof ref === 'number' && Number.isInteger(ref) && ref > 0) return ref;
  const s = String(ref ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    return id > 0 ? id : null;
  }
  const rows = await db
    .select({ id: schema.consumptionRecords.id })
    .from(schema.consumptionRecords)
    .where(eq(schema.consumptionRecords.requestId, s))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * 冲销某笔消费对应的佣金（客户退款时调用）。
 *
 * - 未生成佣金 → no-op
 * - 佣金为 settled → 置 cancelled，并回冲 agents.available_balance / total_earnings
 * - 佣金已是 cancelled → no-op（幂等）
 */
export async function cancelCommissionsForConsumption(input: {
  consumptionRecordId: number;
}): Promise<void> {
  const target = input.consumptionRecordId;
  if (!target) return;

  const rows = await db
    .select({ id: schema.agentCommissions.id, agentId: schema.agentCommissions.agentId, amount: schema.agentCommissions.amount })
    .from(schema.agentCommissions)
    .where(and(
      eq(schema.agentCommissions.consumptionRecordId, target),
      eq(schema.agentCommissions.status, 'settled'),
    ));

  if (rows.length === 0) return;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .update(schema.agentCommissions)
        .set({ status: 'cancelled' })
        .where(eq(schema.agentCommissions.id, row.id));

      const amount = Number(row.amount ?? 0);
      if (amount > 0) {
        await tx.execute(sql`
          UPDATE agents
          SET available_balance = GREATEST(available_balance - ${amount.toFixed(4)}::numeric, 0),
              total_earnings   = GREATEST(total_earnings - ${amount.toFixed(4)}::numeric, 0),
              updated_at = NOW()
          WHERE id = ${row.agentId}
        `);
      }
    }
  });
}
