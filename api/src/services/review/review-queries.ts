// ============================================================
//  提现审核服务数据库查询
// ============================================================

import { eq, sql } from "drizzle-orm";
import { withdrawOrders, agents, auditLogs } from "../../db/schema.js";

/**
 * 获取单个提现订单
 */
export async function getWithdrawOrder(db: any, withdrawId: number) {
  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);
  return order;
}

/**
 * 获取批量提现订单
 */
export async function getBatchWithdrawOrders(db: any, ids: number[]) {
  return await db
    .select()
    .from(withdrawOrders)
    .where(sql`${withdrawOrders.id} = ANY(ARRAY[${sql.join(
      ids.map(id => sql`${id}::int`), 
      sql`, `
    )}])`);
}

/**
 * 更新提现订单状态
 */
export async function updateWithdrawOrder(
  db: any, 
  withdrawId: number, 
  updates: Record<string, any>
) {
  return await db
    .update(withdrawOrders)
    .set(updates)
    .where(eq(withdrawOrders.id, withdrawId));
}

/**
 * 更新代理商冻结金额
 */
export async function updateAgentPendingWithdraw(
  db: any,
  agentId: number,
  amount: string
) {
  return await db
    .update(agents)
    .set({
      pendingWithdraw: sql`${agents.pendingWithdraw} + ${amount}`,
    })
    .where(eq(agents.id, agentId));
}

/**
 * 批量更新代理商冻结金额
 */
export async function batchUpdateAgentPendingWithdraw(
  db: any,
  updates: Array<{ agentId: number; amount: string }>
) {
  const promises = updates.map(({ agentId, amount }) =>
    updateAgentPendingWithdraw(db, agentId, amount)
  );
  return await Promise.all(promises);
}

/**
 * 插入审计日志
 */
export async function insertAuditLog(db: any, logEntry: any) {
  return await db.insert(auditLogs).values(logEntry);
}

/**
 * 批量插入审计日志
 */
export async function batchInsertAuditLogs(db: any, logEntries: any[]) {
  if (logEntries.length === 0) return;
  return await db.insert(auditLogs).values(logEntries);
}

/**
 * 批量更新提现订单状态
 */
export async function batchUpdateWithdrawOrders(
  db: any,
  orderIds: number[],
  updates: Record<string, any>
) {
  return await db
    .update(withdrawOrders)
    .set(updates)
    .where(sql`${withdrawOrders.id} = ANY(ARRAY[${sql.join(
      orderIds.map(id => sql`${id}::int`), 
      sql`, `
    )}])`);
}

/**
 * 检查订单状态是否可审核
 */
export function isOrderReviewable(status: string, reviewLevel: 1 | 2): boolean {
  const validStatuses = {
    1: ["pending_first_review"],
    2: ["pending_second_review"],
  };
  return validStatuses[reviewLevel].includes(status);
}

/**
 * 获取订单审核级别
 */
export function getReviewLevel(status: string): 1 | 2 | null {
  const levelMap: Record<string, 1 | 2> = {
    "pending_first_review": 1,
    "pending_second_review": 2,
  };
  return levelMap[status] || null;
}