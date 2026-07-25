// ============================================================
//  对账服务数据库查询
// ============================================================

import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import {
  commissionLogs,
  callLogs,
  withdrawOrders,
  rechargeOrders,
  agents,
  users,
} from "../../db/schema.js";

/**
 * 获取汇总统计数据
 */
export async function fetchAggregateData(db: any, startOfRange: Date, endOfRange: Date) {
  return await Promise.all([
    // 佣金汇总
    db.select({
      count: sql<number>`count(*)`,
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
      totalNet: sql<string>`coalesce(sum(${commissionLogs.netAmount}), '0.000000')`,
    }).from(commissionLogs).where(and(
      gte(commissionLogs.createdAt, startOfRange),
      lte(commissionLogs.createdAt, endOfRange),
    )),
    // 提现汇总
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
      totalActual: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    }).from(withdrawOrders).where(and(
      gte(withdrawOrders.createdAt, startOfRange),
      lte(withdrawOrders.createdAt, endOfRange),
    )),
    // 充值汇总
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    }).from(rechargeOrders).where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(rechargeOrders.confirmedAt, startOfRange),
      lte(rechargeOrders.confirmedAt, endOfRange),
    )),
    // 调用消耗汇总
    db.select({
      totalConsumption: sql<string>`coalesce(sum(${callLogs.cost}), '0.000000')`,
    }).from(callLogs).where(and(
      gte(callLogs.createdAt, startOfRange),
      lte(callLogs.createdAt, endOfRange),
      inArray(callLogs.status, ["success", "timeout", "cancelled"]),
    )),
  ]);
}

/**
 * 获取维度统计数据
 */
export async function fetchDimensionData(db: any, startOfRange: Date, endOfRange: Date) {
  return await Promise.all([
    // 按代理商分组
    db.select({
      agentId: commissionLogs.agentId,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
      ))
      .groupBy(commissionLogs.agentId)
      .orderBy(sql`sum(commission_amount) desc`)
      .limit(50),
    // 按佣金状态分组
    db.select({
      status: commissionLogs.status,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      fee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
      ))
      .groupBy(commissionLogs.status),
    // 按提现状态分组
    db.select({
      status: withdrawOrders.status,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      fee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
    }).from(withdrawOrders)
      .where(and(
        gte(withdrawOrders.createdAt, startOfRange),
        lte(withdrawOrders.createdAt, endOfRange),
      ))
      .groupBy(withdrawOrders.status),
    // 按佣金类型分组
    db.select({
      type: commissionLogs.commissionType,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
        sql`${commissionLogs.commissionType} is not null`,
      ))
      .groupBy(commissionLogs.commissionType),
  ]);
}

/**
 * 获取异常检测数据
 */
export async function fetchAnomalyData(db: any, startOfRange: Date, endOfRange: Date) {
  return await Promise.all([
    // 孤立佣金（无对应 call_log）
    db.select({
      id: commissionLogs.id,
      clientCallLogId: commissionLogs.clientCallLogId,
      amount: commissionLogs.commissionAmount,
      createdAt: commissionLogs.createdAt,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
        sql`${commissionLogs.clientCallLogId} is not null`,
        sql`not exists (select 1 from call_logs where call_logs.id = ${commissionLogs.clientCallLogId})`,
      ))
      .limit(50),
    // 高频提现（同一天 >= 3 笔）
    db.select({
      agentId: withdrawOrders.agentId,
      times: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    }).from(withdrawOrders)
      .where(and(
        gte(withdrawOrders.createdAt, startOfRange),
        lte(withdrawOrders.createdAt, endOfRange),
      ))
      .groupBy(withdrawOrders.agentId, sql`date(${withdrawOrders.createdAt})`)
      .having(sql`count(*) >= 3`)
      .limit(50),
    // 无匹配充值（充值完成但 balance_logs 未对应入账）
    db.select({
      id: rechargeOrders.id,
      userId: rechargeOrders.userId,
      amount: rechargeOrders.amount,
      status: rechargeOrders.status,
      createdAt: rechargeOrders.createdAt,
    }).from(rechargeOrders)
      .where(and(
        eq(rechargeOrders.status, "confirmed"),
        gte(rechargeOrders.confirmedAt, startOfRange),
        lte(rechargeOrders.confirmedAt, endOfRange),
        sql`not exists (
          select 1 from balance_logs
          where balance_logs.user_id = ${rechargeOrders.userId}
            and balance_logs.ref_type = 'recharge'
            and balance_logs.ref_id = ${rechargeOrders.id}
        )`,
      ))
      .limit(50),
  ]);
}

/**
 * 获取趋势数据
 */
export async function fetchTrendData(
  db: any, 
  startOfRange: Date, 
  endOfRange: Date, 
  granularity: 'day' | 'week' | 'month'
) {
  const groupExpr = granularity === 'month'
    ? sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM')`
    : granularity === 'week'
      ? sql`to_char(date_trunc('week', ${commissionLogs.createdAt}), 'YYYY-MM-DD')`
      : sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM-DD')`;

  return await Promise.all([
    // 佣金趋势
    db.select({
      date: sql<string>`${groupExpr}`,
      amount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      count: sql<number>`count(*)`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
      ))
      .groupBy(sql`${groupExpr}`)
      .orderBy(sql`${groupExpr}`),
    // 提现趋势
    db.select({
      date: sql<string>`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`,
      amount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      count: sql<number>`count(*)`,
    }).from(withdrawOrders)
      .where(and(
        gte(withdrawOrders.createdAt, startOfRange),
        lte(withdrawOrders.createdAt, endOfRange),
      ))
      .groupBy(sql`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`),
    // 充值趋势
    db.select({
      date: sql<string>`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`,
      amount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
      count: sql<number>`count(*)`,
    }).from(rechargeOrders)
      .where(and(
        eq(rechargeOrders.status, "confirmed"),
        gte(rechargeOrders.confirmedAt, startOfRange),
        lte(rechargeOrders.confirmedAt, endOfRange),
      ))
      .groupBy(sql`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`),
  ]);
}