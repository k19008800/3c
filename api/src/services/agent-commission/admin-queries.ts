// ============================================================
//  3cloud (3C) — 代理佣金管理后台查询
// ============================================================

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  commissionLogs,
  commissionDailyRollup,
} from "../../db/schema.js";
import { getStatusLabel, COMMISSION_TYPE_LABEL } from "../agent-helpers.js";

// ══════════════════════════════════════════════
//  管理后台列表（走预聚合表）
// ══════════════════════════════════════════════

export async function listAllCommissions(
  page: number,
  pageSize: number,
  filters?: {
    agentId?: number;
    agentSearch?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    commissionType?: string;
    cursor?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];

  if (filters?.agentId) {
    conditions.push(eq(commissionDailyRollup.agentId, filters.agentId));
  }
  if (filters?.agentSearch) {
    const keyword = `%${filters.agentSearch}%`;
    conditions.push(
      sql`(${users.email} ILIKE ${keyword} OR ${users.nickname} ILIKE ${keyword})`
    );
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionDailyRollup.reportDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionDailyRollup.reportDate, filters.endDate));
  }

  // COUNT 走 rollup 表，数据量极小
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionDailyRollup.id,
      agentId: commissionDailyRollup.agentId,
      agentEmail: users.email,
      agentNickname: users.nickname,
      reportDate: commissionDailyRollup.reportDate,
      totalRecords: commissionDailyRollup.totalRecords,
      totalCallCost: commissionDailyRollup.totalCallCost,
      totalCommissionAmount: commissionDailyRollup.totalCommissionAmount,
      totalFeeAmount: commissionDailyRollup.totalFeeAmount,
      totalNetAmount: commissionDailyRollup.totalNetAmount,
      pendingCount: commissionDailyRollup.pendingCount,
      settledCount: commissionDailyRollup.settledCount,
      cancelledCount: commissionDailyRollup.cancelledCount,
      pendingAmount: commissionDailyRollup.pendingAmount,
      settledAmount: commissionDailyRollup.settledAmount,
      saleCount: commissionDailyRollup.saleCount,
      renewalCount: commissionDailyRollup.renewalCount,
      activityCount: commissionDailyRollup.activityCount,
      saleAmount: commissionDailyRollup.saleAmount,
      renewalAmount: commissionDailyRollup.renewalAmount,
      activityAmount: commissionDailyRollup.activityAmount,
    })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionDailyRollup.reportDate), desc(commissionDailyRollup.id))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      totalCallCost: r.totalCallCost ?? "0.000000",
      totalCommissionAmount: r.totalCommissionAmount ?? "0.000000",
      totalFeeAmount: r.totalFeeAmount ?? "0.000000",
      totalNetAmount: r.totalNetAmount ?? "0.000000",
      pendingAmount: r.pendingAmount ?? "0.000000",
      settledAmount: r.settledAmount ?? "0.000000",
      saleAmount: r.saleAmount ?? "0.000000",
      renewalAmount: r.renewalAmount ?? "0.000000",
      activityAmount: r.activityAmount ?? "0.000000",
    })),
    total,
    page,
    pageSize,
    nextCursor: undefined,
  };
}

// ══════════════════════════════════════════════
//  管理后台明细（走分区表 commission_logs）
// ══════════════════════════════════════════════

export async function listAllCommissionsDetail(
  page: number,
  pageSize: number,
  filters: {
    agentId: number;
    date: string;
    status?: string;
    commissionType?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  // 只查指定代理商当天的数据 → 强制走索引，范围限定在一个分区内
  const dateStart = new Date(filters.date + "T00:00:00Z");
  const dateEnd = new Date(filters.date + "T23:59:59.999Z");

  const conditions: any[] = [
    eq(commissionLogs.agentId, filters.agentId),
    gte(commissionLogs.createdAt, dateStart),
    lte(commissionLogs.createdAt, dateEnd),
  ];

  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }

  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      agentId: commissionLogs.agentId,
      voucherNo: commissionLogs.voucherNo,
      commissionType: commissionLogs.commissionType,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
    })
    .from(commissionLogs)
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}
