// ============================================================
//  3cloud (3C) — Agent 服务层
//  代理商面板 / 客户管理 / 佣金 / 提现 / 管理后台
//  Version: V3.5 — 增强双审财务体系
// ============================================================

import { eq, and, sql, desc, asc, count, inArray, gte, lte, lt, like } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  users,
  agents,
  agentClients,
  agentCustomerConsumption,
  commissionLogs,
  callLogs,
  withdrawOrders,
  rechargeOrders,
  systemConfigs,
  auditLogs,
  userRoleHistory,
  dailyReconSummary,
  balanceLogs,
  commissionDailyRollup,
  commissionRules,
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import { getRedis } from "../redis.js";
import { nanoid } from "nanoid";
import { generateVoucherNo } from "./voucher-service.js";
import { num, fmt } from "./agent-helpers.js";
import { refreshRollupForAgentDate } from "./agent-finance.js";

// ── 辅助: 获取系统配置值 ──

async function getSystemConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, key))
    .limit(1);
  return config?.value ?? null;
}

// ══════════════════════════════════════════════
//  Settlement helpers (新增)
// ══════════════════════════════════════════════

/**
 * 批量生成凭证号（一次查询最大序号，避免逐条 SELECT）
 */
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

    // 批量更新凭证号（非事务，可容忍部分失败）
    for (const [id, no] of voucherMap) {
      try {
        await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
      } catch (err) {
        console.error(`[Voucher] 凭证号更新失败 (id=${id}, no=${no}):`, err);
      }
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

// ══════════════════════════════════════════════
//  结算配置管理 (预留)
// ══════════════════════════════════════════════

export async function getSettlementConfig(agentId: number) {
  // TODO: 实现结算配置查询（settlement_cycles 表）
  return { agentId, settlementCycle: "monthly", autoSettle: true };
}

export async function updateSettlementConfig(agentId: number, settlementCycle: string, operatorId: number) {
  // TODO: 实现结算配置更新
  return { agentId, settlementCycle, updatedBy: operatorId };
}

export async function settleAgentManually(agentId: number, operatorId: number) {
  // TODO: 实现手动触发结算
  const count = await settleCommissions(agentId);
  return { agentId, settledCount: count, triggeredBy: operatorId };
}

export async function getSettlementHistory(agentId: number, page: number, pageSize: number) {
  // TODO: 实现结算历史查询
  return { agentId, list: [], total: 0, page, pageSize };
}

export async function autoSettleDueAgents(): Promise<number> {
  // TODO: 查询 settlement_cycles 找出到期代理商并调用 settleCommissions
  const count = await settleCommissions();
  return count;
}

import type { AgentIntegrityParams } from "./agent-helpers.js";

export async function getAgentIntegrity(params?: AgentIntegrityParams) {
  const db = getDb();
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];
  if (params?.agentId) {
    conditions.push(eq(agents.id, params.agentId));
  }
  if (params?.agentSearch) {
    const kw = `%${params.agentSearch}%`;
    conditions.push(sql`(${users.nickname} ILIKE ${kw} OR ${users.email} ILIKE ${kw})`);
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`);
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      email: users.email,
      nickname: users.nickname,
      totalCommission: agents.totalCommission,
      settledCommission: agents.settledCommission,
      pendingWithdraw: agents.pendingWithdraw,
      frozenAmount: agents.frozenAmount,
      status: agents.status,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
    .orderBy(desc(agents.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      totalCommission: r.totalCommission ?? "0.000000",
      settledCommission: r.settledCommission ?? "0.000000",
      pendingWithdraw: r.pendingWithdraw ?? "0.000000",
      frozenAmount: r.frozenAmount ?? "0.000000",
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

