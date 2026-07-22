// ============================================================
//  3cloud (3C) — Agent 结算核心逻辑
//  结算 / 批量结算 / 作废
// ============================================================

import { eq, and, sql, inArray, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { commissionLogs, agents } from "../../db/schema.js";
import { num } from "../agent-helpers.js";
import { refreshRollupForAgentDate } from "../agent-finance.js";

// ══════════════════════════════════════════════
//  Settlement helpers
// ══════════════════════════════════════════════

/**
 * 结算指定代理商的待结算佣金（分批处理，每批 1000 条）
 * @param agentId 可选，不传则结算所有 pending 佣金
 * @returns 结算记录数
 */
export async function settleCommissions(agentId?: number): Promise<number> {
  const db = getDb();
  const BATCH_SIZE = 1000;
  let totalSettled = 0;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // PERF: 优化凭证号查询，使用前缀匹配而非 LIKE 通配符
  const seqResult = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE ${'VCH-' + dateStr + '-A-%'}
  `);
  const rows = seqResult?.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  const baseConditions: any[] = [eq(commissionLogs.status, "pending")];
  if (agentId) baseConditions.push(eq(commissionLogs.agentId, agentId));

  while (true) {
    // 每次只取一批，不全部加载到内存
    const batch = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
        createdAt: commissionLogs.createdAt,
      })
      .from(commissionLogs)
      .where(and(...baseConditions))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    // 按代理商分组汇总 + 预分配凭证号 + 收集受影响的 (agentId, date) 对
    const agentSumMap = new Map<number, number>();
    const batchIds: number[] = [];
    const voucherMap = new Map<number, string>();
    const affectedDates = new Map<number, Set<string>>();
    for (const c of batch) {
      batchIds.push(c.id);
      voucherMap.set(c.id, `VCH-${dateStr}-A-${String(nextSeq++).padStart(4, '0')}`);
      const cur = agentSumMap.get(c.agentId) ?? 0;
      agentSumMap.set(c.agentId, cur + num(c.commissionAmount));
      const d = c.createdAt.toISOString().slice(0, 10);
      if (!affectedDates.has(c.agentId)) affectedDates.set(c.agentId, new Set());
      affectedDates.get(c.agentId)!.add(d);
    }

    // 事务处理：更新状态 + 累加余额
    await db.transaction(async (tx) => {
      await tx
        .update(commissionLogs)
        .set({ status: "settled", settledAt: new Date() })
        .where(inArray(commissionLogs.id, batchIds));

      for (const [aid, amount] of agentSumMap) {
        await tx
          .update(agents)
          .set({
            settledCommission: sql`settled_commission + ${amount}`,
            pendingWithdraw: sql`pending_withdraw + ${amount}`,
          })
          .where(eq(agents.id, aid));
      }
    });

    // 批量更新凭证号（使用 CASE WHEN 批量 UPDATE）
    if (voucherMap.size > 0) {
      const idList = Array.from(voucherMap.keys());
      const caseExpr = idList.map((id, idx) => 
        `WHEN id = ${id} THEN '${voucherMap.get(id)}'`
      ).join(' ');
      await db.execute(sql.raw(`
        UPDATE commission_logs 
        SET voucher_no = CASE ${caseExpr} END 
        WHERE id IN (${idList.join(',')})
      `));
    }

    // PERF: 事务内只做状态更新 + 余额累加，凭证号更新在事务外（可容忍部分失败）
    // 刷新 rollup（同步状态分布）
    for (const [aid, dates] of affectedDates) {
      for (const d of dates) {
        await refreshRollupForAgentDate(aid, d);
      }
    }

    totalSettled += batch.length;
    console.log(`[Settle] Batch completed: ${batch.length} records (total ${totalSettled})`);
  }

  return totalSettled;
}

/**
 * 手动批量结算指定 ID 的佣金记录（分批处理）
 */
export async function batchSettleCommissions(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();
  const BATCH_SIZE = 1000;
  let totalSettled = 0;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // PERF: 优化凭证号查询，使用前缀匹配
  const seqResult = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE ${'VCH-' + dateStr + '-A-%'}
  `);
  const rows = seqResult?.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batchIds = ids.slice(offset, offset + BATCH_SIZE);

    const pendingList = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
        createdAt: commissionLogs.createdAt,
      })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, batchIds)));

    if (pendingList.length === 0) continue;

    // 收集受影响的 (agentId, date) 对，后面刷新 rollup
    const affectedRows = new Map<string, Set<number>>();
    for (const c of pendingList) {
      const date = c.createdAt.toISOString().slice(0, 10);
      const key = `${c.agentId}|${date}`;
      if (!affectedRows.has(key)) affectedRows.set(key, new Set());
      affectedRows.get(key)!.add(c.agentId);
    }

    // 按代理商分组
    const agentSumMap = new Map<number, number>();
    const settleIds: number[] = [];
    for (const c of pendingList) {
      settleIds.push(c.id);
      const cur = agentSumMap.get(c.agentId) ?? 0;
      agentSumMap.set(c.agentId, cur + num(c.commissionAmount));
    }

    // 准备批量凭证号
    const voucherMap = new Map<number, string>();
    for (const id of settleIds) {
      voucherMap.set(id, `VCH-${dateStr}-A-${String(nextSeq++).padStart(4, '0')}`);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(commissionLogs)
        .set({ status: "settled", settledAt: new Date() })
        .where(inArray(commissionLogs.id, settleIds));

      for (const [aid, amount] of agentSumMap) {
        await tx
          .update(agents)
          .set({
            settledCommission: sql`settled_commission + ${amount}`,
            pendingWithdraw: sql`pending_withdraw + ${amount}`,
          })
          .where(eq(agents.id, aid));
      }
    });

    // 批量更新凭证号
    for (const [id, no] of voucherMap) {
      await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
    }

    // 刷新 rollup（同步状态分布）
    for (const [key, agentSet] of affectedRows) {
      const date = key.split("|")[1];
      for (const aid of agentSet) {
        await refreshRollupForAgentDate(aid, date);
      }
    }

    totalSettled += pendingList.length;
    console.log(`[BatchSettle] Batch ${offset / BATCH_SIZE + 1}: ${pendingList.length} records`);
  }

  return totalSettled;
}

/**
 * 按筛选条件批量结算佣金
 * 复用 listAllCommissions 的筛选逻辑，找出匹配的 pending 记录后交由 batchSettleCommissions 执行
 */
export async function settleCommissionsByFilters(filters?: {
  agentId?: number;
  startDate?: string;
  endDate?: string;
  commissionType?: string;
}): Promise<number> {
  const db = getDb();
  const conditions: any[] = [eq(commissionLogs.status, "pending")];

  if (filters?.agentId) {
    conditions.push(eq(commissionLogs.agentId, filters.agentId));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate + 'T00:00:00Z')));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate + 'T23:59:59.999Z')));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }

  const pendingList = await db
    .select({ id: commissionLogs.id })
    .from(commissionLogs)
    .where(and(...conditions));

  if (pendingList.length === 0) return 0;

  return batchSettleCommissions(pendingList.map((c) => c.id));
}

/**
 * 批量作废佣金记录
 */
export async function batchCancelCommissions(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();

  // 先查出受影响的 (agentId, date) 对
  const affected = await db
    .select({
      agentId: commissionLogs.agentId,
      createdAt: commissionLogs.createdAt,
    })
    .from(commissionLogs)
    .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, ids)));

  await db
    .update(commissionLogs)
    .set({ status: "cancelled" })
    .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, ids)));

  // 刷新 rollup
  const seen = new Set<string>();
  for (const r of affected) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const key = `${r.agentId}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await refreshRollupForAgentDate(r.agentId, date);
  }

  return ids.length;
}
