// ============================================================
//  3cloud (3C) — 客户消费明细 & 订单详情
// ============================================================

import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agentCustomerConsumption,
  commissionLogs,
  agentClients,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, getStatusLabel, COMMISSION_TYPE_LABEL } from "../agent-helpers.js";

/**
 * 客户消费排行列表
 */
export async function getCustomerConsumption(
  userId: number,
  page: number,
  pageSize: number,
  sortBy: string = "total_amount",
  sortOrder: string = "desc",
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const offset = (page - 1) * pageSize;

  // 允许排序字段
  const sortFieldMap: Record<string, any> = {
    total_amount: agentCustomerConsumption.totalAmount,
    month_amount: agentCustomerConsumption.monthAmount,
    commission_amount: agentCustomerConsumption.commissionAmount,
    last_order_at: agentCustomerConsumption.lastOrderAt,
  };

  const sortField = sortFieldMap[sortBy] ?? agentCustomerConsumption.totalAmount;
  const sortFn = sortOrder === "asc" ? asc : desc;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id))
    .orderBy(sortFn(sortField))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      customerUserId: r.customerUserId,
      customerName: r.customerName,
      totalAmount: r.totalAmount ?? "0.000000",
      monthAmount: r.monthAmount ?? "0.000000",
      commissionAmount: r.commissionAmount ?? "0.000000",
      orderCount: r.orderCount ?? 0,
      lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * 客户订单详情
 */
export async function getCustomerOrderDetail(
  userId: number,
  customerUserId: number,
  page: number,
  pageSize: number,
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  // 验证客户属于该代理商
  const [client] = await db
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(and(
      eq(agentClients.agentId, agent.id),
      eq(agentClients.clientUserId, customerUserId),
    ))
    .limit(1);

  if (!client) {
    throw new AppError("CLIENT_NOT_FOUND", "该客户不属于您", 404);
  }

  // 从佣金日志查询该客户的订单
  const conditions = [
    eq(commissionLogs.agentId, agent.id),
    eq(commissionLogs.sourceCustomerId, customerUserId),
  ];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      callCost: commissionLogs.callCost,
      createdAt: commissionLogs.createdAt,
    })
    .from(commissionLogs)
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      orderNo: r.sourceOrderId,
      orderAmount: r.sourceOrderAmount,
      commissionAmount: r.commissionAmount,
      commissionType: r.commissionType,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      callCost: r.callCost,
      paidAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
