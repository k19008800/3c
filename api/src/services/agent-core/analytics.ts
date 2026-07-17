// ============================================================
//  3cloud (3C) — 收入趋势 & 收入结构分析
// ============================================================

import { eq, and, sql, desc, asc, gte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agentCustomerConsumption,
  commissionDailyRollup,
} from "../../db/schema.js";
import { getAgentByUserId, num, fmt } from "../agent-helpers.js";

/**
 * 收入趋势（基于佣金日汇总）
 */
export async function getAgentIncomeTrend(userId: number, days: number = 30) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const rows = await db
    .select({
      reportDate: commissionDailyRollup.reportDate,
      totalCommissionAmount: commissionDailyRollup.totalCommissionAmount,
      totalNetAmount: commissionDailyRollup.totalNetAmount,
      settledAmount: commissionDailyRollup.settledAmount,
      pendingAmount: commissionDailyRollup.pendingAmount,
      saleAmount: commissionDailyRollup.saleAmount,
      renewalAmount: commissionDailyRollup.renewalAmount,
      activityAmount: commissionDailyRollup.activityAmount,
      totalRecords: commissionDailyRollup.totalRecords,
    })
    .from(commissionDailyRollup)
    .where(and(
      eq(commissionDailyRollup.agentId, agent.id),
      gte(commissionDailyRollup.reportDate, startDateStr),
    ))
    .orderBy(asc(commissionDailyRollup.reportDate));

  // 计算汇总指标
  const totalIncome = rows.reduce((s, r) => s + num(r.totalCommissionAmount), 0);
  const avgDailyIncome = rows.length > 0 ? totalIncome / rows.length : 0;

  // 增长率: 后7日均值 / 前7日均值 - 1
  let growthRate = 0;
  if (rows.length >= 14) {
    const recent = rows.slice(-7).reduce((s, r) => s + num(r.totalCommissionAmount), 0) / 7;
    const previous = rows.slice(-14, -7).reduce((s, r) => s + num(r.totalCommissionAmount), 0) / 7;
    growthRate = previous > 0 ? (recent - previous) / previous : 0;
  }

  // 日增长率（最后一天 / 第一天 -1）
  let dailyGrowthRate = 0;
  if (rows.length >= 2) {
    const first = num(rows[0].totalCommissionAmount);
    const last = num(rows[rows.length - 1].totalCommissionAmount);
    dailyGrowthRate = first > 0 ? (last - first) / first : 0;
  }

  return {
    trend: rows.map((r) => ({
      date: r.reportDate,
      totalAmount: r.totalCommissionAmount ?? "0.000000",
      netAmount: r.totalNetAmount ?? "0.000000",
      settledAmount: r.settledAmount ?? "0.000000",
      pendingAmount: r.pendingAmount ?? "0.000000",
      saleAmount: r.saleAmount ?? "0.000000",
      renewalAmount: r.renewalAmount ?? "0.000000",
      activityAmount: r.activityAmount ?? "0.000000",
      recordCount: r.totalRecords ?? 0,
    })),
    summary: {
      totalIncome: fmt(totalIncome),
      avgDailyIncome: fmt(avgDailyIncome),
      growthRate: parseFloat(growthRate.toFixed(4)),
      dailyGrowthRate: parseFloat(dailyGrowthRate.toFixed(4)),
      totalDays: rows.length,
    },
  };
}

/**
 * 收入结构 — Dashboard 收入来源分析
 */
export async function getAgentIncomeStructure(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // ── 按佣金类型汇总（全部历史） ──
  const [typeAgg] = await db
    .select({
      saleAmount: sql<string>`coalesce(sum(${commissionDailyRollup.saleAmount}), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(${commissionDailyRollup.renewalAmount}), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(${commissionDailyRollup.activityAmount}), '0.000000')`,
      saleCount: sql<number>`coalesce(sum(${commissionDailyRollup.saleCount}), 0)`,
      renewalCount: sql<number>`coalesce(sum(${commissionDailyRollup.renewalCount}), 0)`,
      activityCount: sql<number>`coalesce(sum(${commissionDailyRollup.activityCount}), 0)`,
      totalAmount: sql<string>`coalesce(sum(${commissionDailyRollup.totalCommissionAmount}), '0.000000')`,
    })
    .from(commissionDailyRollup)
    .where(eq(commissionDailyRollup.agentId, agent.id));

  const total = num(typeAgg?.totalAmount ?? "0");
  const sale = num(typeAgg?.saleAmount ?? "0");
  const renewal = num(typeAgg?.renewalAmount ?? "0");
  const activity = num(typeAgg?.activityAmount ?? "0");

  const byType = [
    {
      type: "sale",
      label: "销售佣金",
      amount: fmt(sale),
      count: Number(typeAgg?.saleCount ?? 0),
      percentage: total > 0 ? parseFloat(((sale / total) * 100).toFixed(1)) : 0,
    },
    {
      type: "renewal",
      label: "续费佣金",
      amount: fmt(renewal),
      count: Number(typeAgg?.renewalCount ?? 0),
      percentage: total > 0 ? parseFloat(((renewal / total) * 100).toFixed(1)) : 0,
    },
    {
      type: "activity",
      label: "活动奖励",
      amount: fmt(activity),
      count: Number(typeAgg?.activityCount ?? 0),
      percentage: total > 0 ? parseFloat(((activity / total) * 100).toFixed(1)) : 0,
    },
  ];

  // ── TOP 5 客户 ──
  const topClients = await db
    .select({
      customerUserId: agentCustomerConsumption.customerUserId,
      customerName: agentCustomerConsumption.customerName,
      totalAmount: agentCustomerConsumption.totalAmount,
      monthAmount: agentCustomerConsumption.monthAmount,
      commissionAmount: agentCustomerConsumption.commissionAmount,
      orderCount: agentCustomerConsumption.orderCount,
      lastOrderAt: agentCustomerConsumption.lastOrderAt,
    })
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id))
    .orderBy(desc(agentCustomerConsumption.commissionAmount))
    .limit(5);

  // ── 本月收入 ──
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const [monthAgg] = await db
    .select({
      monthIncome: sql<string>`coalesce(sum(${commissionDailyRollup.totalCommissionAmount}), '0.000000')`,
      monthRecords: sql<number>`coalesce(sum(${commissionDailyRollup.totalRecords}), 0)`,
    })
    .from(commissionDailyRollup)
    .where(and(
      eq(commissionDailyRollup.agentId, agent.id),
      gte(commissionDailyRollup.reportDate, monthStartStr),
    ));

  return {
    byType,
    topClients: topClients.map((c) => ({
      customerUserId: c.customerUserId,
      customerName: c.customerName,
      totalAmount: c.totalAmount ?? "0.000000",
      monthAmount: c.monthAmount ?? "0.000000",
      commissionAmount: c.commissionAmount ?? "0.000000",
      orderCount: c.orderCount ?? 0,
      lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
    })),
    monthIncome: monthAgg?.monthIncome ?? "0.000000",
    monthRecords: Number(monthAgg?.monthRecords ?? 0),
    totalIncome: typeAgg?.totalAmount ?? "0.000000",
  };
}
