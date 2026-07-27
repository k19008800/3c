// ============================================================
//  3cloud (3C) — Agent Dashboard (Enhanced for PRD Chapter 3)
// ============================================================

import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  agentClients,
  agentCustomerConsumption,
  withdrawOrders,
  commissionRules,
  commissionLogs,
  callLogs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, num, fmt } from "../agent-helpers.js";

/**
 * 代理商仪表盘
 * 含客户总数、本月新增客户、本月总消费、佣金收入、待结算金额、可用余额
 */
export async function getAgentDashboard(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // 客户总数
  const [clientCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentClients)
    .where(eq(agentClients.agentId, agent.id));
  const totalClients = Number(clientCountResult?.count ?? 0);

  // 本月新增客户
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [newClientsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentClients)
    .where(and(
      eq(agentClients.agentId, agent.id),
      gte(agentClients.createdAt, monthStart),
    ));
  const newClientsThisMonth = Number(newClientsResult?.count ?? 0);

  // 已提现合计
  const [withdrawnTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      eq(withdrawOrders.status, "paid"),
    ));
  const withdrawnTotal = withdrawnTotalResult?.sum ?? "0.000000";

  // 提现中冻结金额
  const [pendingWithdrawTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      sql`${withdrawOrders.status} NOT IN ('paid', 'rejected')`,
    ));
  const pendingWithdrawTotal = pendingWithdrawTotalResult?.sum ?? "0.000000";

  // 可用余额
  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(Math.max(0, settledCommission - withdrawn - pendingW - frozen));

  // 分佣比例
  const [saleRule] = await db
    .select({ rate: commissionRules.rate })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agent.id),
      eq(commissionRules.ruleType, 'sale'),
      eq(commissionRules.isEnabled, true),
    ))
    .limit(1);
  const commissionRate = saleRule?.rate ?? "0.0000";

  // ── 3.3 新增KPI: 本月总消费（名下客户的call logs） ──
  const [monthConsumptionResult] = await db
    .select({ total: sql<string>`coalesce(sum(${callLogs.cost}), '0.000000')` })
    .from(callLogs)
    .innerJoin(agentClients, eq(callLogs.userId, agentClients.clientUserId))
    .where(and(
      eq(agentClients.agentId, agent.id),
      gte(callLogs.createdAt, monthStart),
    ));
  const monthTotalConsumption = monthConsumptionResult?.total ?? "0.000000";

  // ── 3.3 新增KPI: 本月佣金收入 ──
  const [monthCommissionResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')` })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, monthStart),
    ));
  const monthCommissionIncome = monthCommissionResult?.sum ?? "0.000000";

  // ── 3.3 新增KPI: 待结算金额 ──
  const [pendingSettlementResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')` })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      eq(commissionLogs.status, "pending"),
    ));
  const pendingSettlement = pendingSettlementResult?.sum ?? "0.000000";

  return {
    totalClients,
    newClientsThisMonth,
    totalCommission: agent.totalCommission,
    settledCommission: agent.settledCommission,
    withdrawnTotal,
    pendingWithdrawTotal,
    frozenAmount: agent.frozenAmount,
    availableBalance,
    status: agent.status,
    commissionRate,
    // 3.3 新增
    monthTotalConsumption,
    monthCommissionIncome,
    pendingSettlement,
    agentLevel: agent.level,
  };
}
