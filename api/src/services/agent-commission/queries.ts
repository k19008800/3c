// ============================================================
//  3cloud (3C) — 代理佣金查询 (代理商视角)
// ============================================================

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  commissionLogs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, getStatusLabel, COMMISSION_TYPE_LABEL } from "../agent-helpers.js";

// ══════════════════════════════════════════════
//  佣金查询 (代理商视角)
// ══════════════════════════════════════════════

export async function getAgentCommissions(
  userId: number,
  page: number,
  pageSize: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
    customerSearch?: string;
  },
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }
  if (filters?.customerSearch) {
    const kw = `%${filters.customerSearch}%`;
    conditions.push(sql`(${users.nickname} ILIKE ${kw} OR ${users.email} ILIKE ${kw})`);
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      callCost: r.callCost,
      commissionAmount: r.commissionAmount,
      commissionType: r.commissionType,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      voucherNo: r.voucherNo,
      sourceOrderId: r.sourceOrderId,
      sourceOrderAmount: r.sourceOrderAmount,
      feeRate: r.feeRate,
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      calcDetail: r.calcDetail,
      ruleSnapshot: r.ruleSnapshot,
      status: r.status,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  佣金汇总统计 (代理商视角)
// ══════════════════════════════════════════════

export async function getAgentCommissionSummary(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // 当前月份范围
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // PERF: 添加默认时间范围限制（过去一年），避免扫描全部历史记录
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const [totalStat] = await db
    .select({
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      pendingAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'settled'), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'pending')`,
      settledCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'settled')`,
    })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, oneYearAgo),
    ));

  const [monthStat] = await db
    .select({
      monthCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      monthCount: sql<number>`count(*)`,
    })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, monthStart),
    ));

  return {
    totalCommission: totalStat?.totalCommission ?? "0.000000",
    monthCommission: monthStat?.monthCommission ?? "0.000000",
    monthCount: Number(monthStat?.monthCount ?? 0),
    pendingAmount: totalStat?.pendingAmount ?? "0.000000",
    pendingCount: Number(totalStat?.pendingCount ?? 0),
    settledAmount: totalStat?.settledAmount ?? "0.000000",
    settledCount: Number(totalStat?.settledCount ?? 0),
  };
}

// ══════════════════════════════════════════════
//  单条佣金详情
// ══════════════════════════════════════════════

export async function getAgentCommissionDetail(userId: number, commissionId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const [row] = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(
      eq(commissionLogs.id, commissionId),
      eq(commissionLogs.agentId, agent.id),
    ))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "佣金记录不存在", 404);
  }

  return {
    id: row.id,
    callCost: row.callCost,
    commissionAmount: row.commissionAmount,
    commissionType: row.commissionType,
    commissionTypeLabel: getStatusLabel(row.commissionType ?? "", COMMISSION_TYPE_LABEL),
    voucherNo: row.voucherNo,
    sourceOrderId: row.sourceOrderId,
    sourceOrderAmount: row.sourceOrderAmount,
    feeRate: row.feeRate,
    feeAmount: row.feeAmount ?? "0.000000",
    netAmount: row.netAmount ?? "0.000000",
    calcDetail: row.calcDetail,
    ruleSnapshot: row.ruleSnapshot,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    sourceCustomerId: row.sourceCustomerId,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}
