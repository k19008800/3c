// ============================================================
//  3cloud (3C) — 结算周期管理（Service 层）
//  Settlement cycle generation, agent billing, confirmation
// ============================================================

import { eq, and, sql, gte, lte, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  settlementCycles,
  agentSettlements,
  settlementDetails,
  settlementConfirmLogs,
} from "../db/schema.js";
import { agents } from "../db/schema.js";

/**
 * 为指定月份生成结算周期和代理账单
 * periodStart/periodEnd: YYYY-MM-DD string
 */
export async function generateSettlementCycle(
  periodStart: string,
  periodEnd: string
): Promise<{ cycleId: number; agentBillCount: number }> {
  const db = getDb();

  // 1. 创建或获取结算周期
  const [existing] = await db
    .select()
    .from(settlementCycles)
    .where(
      and(
        eq(settlementCycles.periodStart, periodStart),
        eq(settlementCycles.periodEnd, periodEnd)
      )
    )
    .limit(1);

  let cycleId: number;
  if (existing) {
    if (existing.status !== "open") {
      throw new Error(`周期 ${periodStart}~${periodEnd} 已关账，无法重复生成`);
    }
    cycleId = existing.id;
  } else {
    const [created] = await db
      .insert(settlementCycles)
      .values({
        periodStart,
        periodEnd,
      })
      .returning();
    cycleId = created.id;
  }

  // 2. 查询期内所有活跃代理
  const agentList = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      commissionRate: agents.commissionRate,
    })
    .from(agents)
    .where(eq(agents.level, "formal")) // 仅正式代理参与结算
    .where(sql`${agents.status} = 'active'`);

  let billCount = 0;

  for (const agent of agentList) {
    // 3. 期内代理佣金汇总
    const aggResult = await db.execute(
      sql`
        SELECT
          COALESCE(SUM(actual_commission), 0) as total_commission
        FROM agent_commission_logs
        WHERE agent_id = ${agent.id}
          AND created_at >= ${periodStart}::timestamptz
          AND created_at < (${periodEnd}::date + 1)::timestamptz
          AND status = 'settled'
      `
    );
    const totalCommission = parseFloat(
      (aggResult.rows[0] as any)?.total_commission || "0"
    );

    if (totalCommission <= 0) continue; // 无佣金，跳过

    // 4. 插入结算账单
    const [settlement] = await db
      .insert(agentSettlements)
      .values({
        cycleId,
        agentId: agent.id,
        totalCommission,
        settledAmount: totalCommission,
        status: "pending",
      })
      .returning();

    // 5. 写入明细
    const detailRows = await db.execute(
      sql`
        SELECT
          id as commission_id,
          actual_commission as amount,
          client_id as client_user_id,
          consumption_id,
          model,
          tokens,
          commission_rate
        FROM agent_commission_logs
        WHERE agent_id = ${agent.id}
          AND created_at >= ${periodStart}::timestamptz
          AND created_at < (${periodEnd}::date + 1)::timestamptz
          AND status = 'settled'
      `
    );

    for (const row of detailRows.rows) {
      const d = row as any;
      await db.insert(settlementDetails).values({
        settlementId: settlement.id,
        commissionId: d.commission_id,
        amount: d.amount,
        clientUserId: d.client_user_id,
        consumptionId: d.consumption_id,
        model: d.model,
        tokens: d.tokens,
        commissionRate: d.commission_rate,
      });
    }

    billCount++;
  }

  // 6. 关账
  await db
    .update(settlementCycles)
    .set({
      status: "closed",
      generatedAt: sql`NOW()`,
    })
    .where(eq(settlementCycles.id, cycleId));

  // 7. 记录日志
  await db.insert(settlementConfirmLogs).values({
    settlementId: 0, // 全局动作，用 cycleId 记录
    action: "generate",
    detail: `结算周期 ${periodStart}~${periodEnd} 关账，生成 ${billCount} 个代理账单`,
  });

  return { cycleId, agentBillCount: billCount };
}

/**
 * 代理确认结算单
 */
export async function confirmSettlement(
  settlementId: number,
  agentUserId: number
): Promise<void> {
  const db = getDb();

  const [settlement] = await db
    .select()
    .from(agentSettlements)
    .where(eq(agentSettlements.id, settlementId))
    .limit(1);

  if (!settlement) throw new Error("结算单不存在");
  if (settlement.status !== "pending") {
    throw new Error("结算单状态不符，无法确认");
  }

  // 验证归属
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.userId, agentUserId), eq(agents.id, settlement.agentId)))
    .limit(1);

  if (!agent) throw new Error("该结算单不属于当前代理商");

  // 更新结算单
  await db
    .update(agentSettlements)
    .set({
      status: "settled",
      confirmedAt: sql`NOW()`,
      settledAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(agentSettlements.id, settlementId));

  // 更新代理余额
  const settledAmount = parseFloat(settlement.settledAmount as string);
  await db.execute(
    sql`
      UPDATE agents SET
        settled_commission = settled_commission + ${settledAmount},
        updated_at = NOW()
      WHERE id = ${settlement.agentId}
    `
  );

  // 记录资金流水
  await db.execute(
    sql`
      INSERT INTO agent_balance_ledger (agent_id, change_type, amount, balance_before, balance_after, remark, created_at)
      SELECT
        ${settlement.agentId},
        'commission_settlement',
        ${settledAmount},
        settled_commission - ${settledAmount},
        settled_commission,
        CONCAT('结算周期确认: #', settlement_id),
        NOW()
      FROM (SELECT settled_commission as settled_commission FROM agents WHERE id = ${settlement.agentId}) a
    `
  );

  // 记录日志
  await db.insert(settlementConfirmLogs).values({
    settlementId,
    action: "confirm",
    detail: `代理确认结算单，金额 ¥${settledAmount.toFixed(4)}`,
  });
}

/**
 * 自动确认过期待确认的结算单
 */
export async function autoConfirmOverdueSettlements(): Promise<number> {
  const db = getDb();

  const overdueSettlements = await db
    .select({
      id: agentSettlements.id,
      agentId: agentSettlements.agentId,
      settledAmount: agentSettlements.settledAmount,
    })
    .from(agentSettlements)
    .where(
      and(
        eq(agentSettlements.status, "pending"),
        sql`${agentSettlements.createdAt} < NOW() - INTERVAL '3 days'`
      )
    );

  let count = 0;
  for (const s of overdueSettlements) {
    const amount = parseFloat(s.settledAmount as string);

    await db
      .update(agentSettlements)
      .set({
        status: "settled",
        confirmedAt: sql`NOW()`,
        settledAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(agentSettlements.id, s.id));

    await db.execute(
      sql`
        UPDATE agents SET
          settled_commission = settled_commission + ${amount},
          updated_at = NOW()
        WHERE id = ${s.agentId}
      `
    );

    await db.insert(settlementConfirmLogs).values({
      settlementId: s.id,
      action: "auto_confirm",
      detail: `超过 3 天未确认，系统自动确认，金额 ¥${amount.toFixed(4)}`,
    });

    count++;
  }

  return count;
}

/**
 * 管理员调整结算金额
 */
export async function adjustSettlement(
  settlementId: number,
  adjustmentAmount: number,
  reason: string,
  adminUserId: number
): Promise<void> {
  const db = getDb();

  const [settlement] = await db
    .select()
    .from(agentSettlements)
    .where(eq(agentSettlements.id, settlementId))
    .limit(1);

  if (!settlement) throw new Error("结算单不存在");
  if (settlement.status !== "pending") {
    throw new Error("仅待确认状态的结算单可调整");
  }

  const newAmount =
    parseFloat(settlement.totalCommission as string) + adjustmentAmount;

  await db
    .update(agentSettlements)
    .set({
      adjustmentAmount: adjustmentAmount.toString(),
      adjustmentReason: reason,
      settledAmount: newAmount.toString(),
      updatedAt: sql`NOW()`,
    })
    .where(eq(agentSettlements.id, settlementId));

  await db.insert(settlementConfirmLogs).values({
    settlementId,
    action: "adjust",
    operatorId: adminUserId,
    operatorRole: "admin",
    detail: `管理员调整结算金额: ${adjustmentAmount >= 0 ? "+" : ""}¥${adjustmentAmount.toFixed(4)}，原因: ${reason}`,
  });
}
