// ============================================================
//  3cloud (3C) — Agent Dashboard
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  agentClients,
  withdrawOrders,
  commissionRules,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, num, fmt } from "../agent-helpers.js";

/**
 * 代理商仪表盘
 * 含客户总数、提现统计、可用余额、分佣比例
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

  // 已提现合计
  const [withdrawnTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      eq(withdrawOrders.status, "paid"),
    ));
  const withdrawnTotal = withdrawnTotalResult?.sum ?? "0.000000";

  // 提现中冻结金额（所有非最终状态的提现订单）
  const [pendingWithdrawTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      sql`${withdrawOrders.status} NOT IN ('paid', 'rejected')`,
    ));
  const pendingWithdrawTotal = pendingWithdrawTotalResult?.sum ?? "0.000000";

  // 可用余额 = settledCommission - withdrawnTotal - pendingWithdrawTotal - frozenAmount
  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(settledCommission - withdrawn - pendingW - frozen);
  if (num(availableBalance) < 0) {
    // 不小于 0
  }

  // 分佣比例：从 commission_rules 表查询 sale 类型规则
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

  return {
    totalClients,
    totalCommission: agent.totalCommission,
    settledCommission: agent.settledCommission,
    withdrawnTotal,
    pendingWithdrawTotal,
    frozenAmount: agent.frozenAmount,
    availableBalance,
    status: agent.status,
    commissionRate,
  };
}
