// ============================================================
//  3cloud (3C) — 定时任务：日对账汇总 & 佣金日汇总
// ============================================================

import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  commissionLogs,
  dailyReconSummary,
  commissionDailyRollup,
} from "../../db/schema.js";
import { getRedis } from "../../redis.js";
import { logger } from "../../logger.js";
import { getReconciliationReport } from "./reconciliation.js";

/**
 * 每日预计算对账汇总（Cron: 每天 03:00）
 */
export async function computeDailyReconSummary(targetDate?: string): Promise<number> {
  const db = getDb();
  const redis = getRedis();

  const date = targetDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59Z");

  // 获取该日聚合数据
  const report = await getReconciliationReport({ startDate: date, endDate: date });

  // 写入 daily_recon_summary
  await db.insert(dailyReconSummary).values({
    reportDate: date,
    commissionCount: report.summary.commission.count,
    commissionTotal: report.summary.commission.totalCommission,
    commissionFee: report.summary.commission.totalFee,
    commissionNet: report.summary.commission.totalNet,
    withdrawCount: report.summary.withdraw.count,
    withdrawTotal: report.summary.withdraw.totalAmount,
    withdrawFee: report.summary.withdraw.totalFee,
    withdrawActual: report.summary.withdraw.totalActual,
    rechargeCount: report.summary.recharge.count,
    rechargeTotal: report.summary.recharge.totalAmount,
    consumptionTotal: report.balanceCheck.totalExpense,
    balanceDiff: report.balanceCheck.diff,
    isBalanced: report.balanceCheck.isBalanced,
    version: 1,
    computedAt: new Date(),
  }).onConflictDoUpdate({
    target: dailyReconSummary.reportDate,
    set: {
      commissionCount: sql`excluded.commission_count`,
      commissionTotal: sql`excluded.commission_total`,
      commissionFee: sql`excluded.commission_fee`,
      commissionNet: sql`excluded.commission_net`,
      withdrawCount: sql`excluded.withdraw_count`,
      withdrawTotal: sql`excluded.withdraw_total`,
      withdrawFee: sql`excluded.withdraw_fee`,
      withdrawActual: sql`excluded.withdraw_actual`,
      rechargeCount: sql`excluded.recharge_count`,
      rechargeTotal: sql`excluded.recharge_total`,
      consumptionTotal: sql`excluded.consumption_total`,
      balanceDiff: sql`excluded.balance_diff`,
      isBalanced: sql`excluded.is_balanced`,
      version: sql`${dailyReconSummary.version} + 1`,
      computedAt: new Date(),
    },
  });

  // 清除 Redis 缓存
  const cacheKey = `recon:${date}:${date}:day`;
  try {
    await redis.del(cacheKey);
  } catch { /* ignore */ }

  return report.summary.commission.count + report.summary.withdraw.count + report.summary.recharge.count;
}

/**
 * 佣金日汇总聚合（commission_daily_rollup）
 * 每天 00:30 执行，汇总前一天数据
 */
export async function computeDailyCommissionRollup(targetDate?: string): Promise<number> {
  const db = getDb();

  // 默认聚合前一天（Asia/Shanghai 时区）
  const date = targetDate || (() => {
    const now = new Date();
    const cstNow = new Date(now.getTime() + 8 * 3600_000);
    const cstTarget = new Date(cstNow.getTime() - 86400_000);
    return `${cstTarget.getUTCFullYear()}-${String(cstTarget.getUTCMonth()+1).padStart(2,'0')}-${String(cstTarget.getUTCDate()).padStart(2,'0')}`;
  })();
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59.999Z");

  logger.info({ date }, "[CommissionRollup] 开始聚合分佣数据");

  // 从分区表获取每日聚合
  const rollupRows = await db
    .select({
      agentId: commissionLogs.agentId,
      totalRecords: sql<number>`count(*)`,
      totalCallCost: sql<string>`coalesce(sum(call_cost), '0.000000')`,
      totalCommissionAmount: sql<string>`coalesce(sum(commission_amount), '0.000000')`,
      totalFeeAmount: sql<string>`coalesce(sum(fee_amount), '0.000000')`,
      totalNetAmount: sql<string>`coalesce(sum(net_amount), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
      settledCount: sql<number>`count(*) filter (where status = 'settled')`,
      cancelledCount: sql<number>`count(*) filter (where status = 'cancelled')`,
      pendingAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'settled'), '0.000000')`,
      cancelledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'cancelled'), '0.000000')`,
      saleCount: sql<number>`count(*) filter (where commission_type = 'sale')`,
      renewalCount: sql<number>`count(*) filter (where commission_type = 'renewal')`,
      activityCount: sql<number>`count(*) filter (where commission_type = 'activity')`,
      saleAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'sale'), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'renewal'), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'activity'), '0.000000')`,
    })
    .from(commissionLogs)
    .where(
      and(
        gte(commissionLogs.createdAt, startOfDay),
        lte(commissionLogs.createdAt, endOfDay),
      )
    )
    .groupBy(commissionLogs.agentId);

  if (rollupRows.length === 0) {
    logger.info({ date }, "[CommissionRollup] 无分佣数据，跳过");
    return 0;
  }

  // 批量写入 rollup 表（Upsert）— 使用 Drizzle 批量 insert + onConflictDoUpdate
  // Drizzle 不支持批量 onConflictDoUpdate，改用单条事务批量提交
  const batchSize = 50;
  for (let i = 0; i < rollupRows.length; i += batchSize) {
    const batch = rollupRows.slice(i, i + batchSize);
    await db.transaction(async (tx) => {
      for (const row of batch) {
        await tx.insert(commissionDailyRollup).values({
          agentId: row.agentId,
          reportDate: date,
          totalRecords: row.totalRecords,
          totalCallCost: row.totalCallCost,
          totalCommissionAmount: row.totalCommissionAmount,
          totalFeeAmount: row.totalFeeAmount,
          totalNetAmount: row.totalNetAmount,
          pendingCount: row.pendingCount,
          settledCount: row.settledCount,
          cancelledCount: row.cancelledCount,
          pendingAmount: row.pendingAmount,
          settledAmount: row.settledAmount,
          cancelledAmount: row.cancelledAmount,
          saleCount: row.saleCount,
          renewalCount: row.renewalCount,
          activityCount: row.activityCount,
          saleAmount: row.saleAmount,
          renewalAmount: row.renewalAmount,
          activityAmount: row.activityAmount,
        }).onConflictDoUpdate({
          target: [commissionDailyRollup.agentId, commissionDailyRollup.reportDate],
          set: {
            totalRecords: sql`excluded.total_records`,
            totalCallCost: sql`excluded.total_call_cost`,
            totalCommissionAmount: sql`excluded.total_commission_amount`,
            totalFeeAmount: sql`excluded.total_fee_amount`,
            totalNetAmount: sql`excluded.total_net_amount`,
            pendingCount: sql`excluded.pending_count`,
            settledCount: sql`excluded.settled_count`,
            cancelledCount: sql`excluded.cancelled_count`,
            pendingAmount: sql`excluded.pending_amount`,
            settledAmount: sql`excluded.settled_amount`,
            cancelledAmount: sql`excluded.cancelled_amount`,
            saleCount: sql`excluded.sale_count`,
            renewalCount: sql`excluded.renewal_count`,
            activityCount: sql`excluded.activity_count`,
            saleAmount: sql`excluded.sale_amount`,
            renewalAmount: sql`excluded.renewal_amount`,
            activityAmount: sql`excluded.activity_amount`,
            updatedAt: new Date(),
          },
        });
      }
    });
  }
  const updatedCount = rollupRows.length;

  logger.info({ date, updatedCount, totalRecords: rollupRows.reduce((s, r) => s + r.totalRecords, 0) }, "[CommissionRollup] 聚合完成");
  return updatedCount;
}

/**
 * 结算/作废后，刷新指定代理商指定日期的 rollup 行
 * 只影响一个 agent + date，针对性强
 */
export async function refreshRollupForAgentDate(agentId: number, date: string, tx?: any): Promise<void> {
  const db = tx ?? getDb();
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59.999Z");

  const [rollup] = await db
    .select({
      totalRecords: sql<number>`count(*)`,
      totalCallCost: sql<string>`coalesce(sum(call_cost), '0.000000')`,
      totalCommissionAmount: sql<string>`coalesce(sum(commission_amount), '0.000000')`,
      totalFeeAmount: sql<string>`coalesce(sum(fee_amount), '0.000000')`,
      totalNetAmount: sql<string>`coalesce(sum(net_amount), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
      settledCount: sql<number>`count(*) filter (where status = 'settled')`,
      cancelledCount: sql<number>`count(*) filter (where status = 'cancelled')`,
      pendingAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'settled'), '0.000000')`,
      cancelledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'cancelled'), '0.000000')`,
      saleCount: sql<number>`count(*) filter (where commission_type = 'sale')`,
      renewalCount: sql<number>`count(*) filter (where commission_type = 'renewal')`,
      activityCount: sql<number>`count(*) filter (where commission_type = 'activity')`,
      saleAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'sale'), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'renewal'), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'activity'), '0.000000')`,
    })
    .from(commissionLogs)
    .where(
      and(
        eq(commissionLogs.agentId, agentId),
        gte(commissionLogs.createdAt, startOfDay),
        lte(commissionLogs.createdAt, endOfDay),
      ),
    );

  if (!rollup || rollup.totalRecords === 0) {
    // 该代理商当天没有记录 → 删除 rollup 行（避免残留）
    // 注意：在 tx 模式下清空可能导致该日其他数据丢失
    if (!tx) {
      await db
        .delete(commissionDailyRollup)
        .where(
          and(
            eq(commissionDailyRollup.agentId, agentId),
            eq(commissionDailyRollup.reportDate, date),
          ),
        );
    }
    return;
  }

  await db
    .insert(commissionDailyRollup)
    .values({
      agentId,
      reportDate: date,
      totalRecords: rollup.totalRecords,
      totalCallCost: rollup.totalCallCost,
      totalCommissionAmount: rollup.totalCommissionAmount,
      totalFeeAmount: rollup.totalFeeAmount,
      totalNetAmount: rollup.totalNetAmount,
      pendingCount: rollup.pendingCount,
      settledCount: rollup.settledCount,
      cancelledCount: rollup.cancelledCount,
      pendingAmount: rollup.pendingAmount,
      settledAmount: rollup.settledAmount,
      cancelledAmount: rollup.cancelledAmount,
      saleCount: rollup.saleCount,
      renewalCount: rollup.renewalCount,
      activityCount: rollup.activityCount,
      saleAmount: rollup.saleAmount,
      renewalAmount: rollup.renewalAmount,
      activityAmount: rollup.activityAmount,
    })
    .onConflictDoUpdate({
      target: [commissionDailyRollup.agentId, commissionDailyRollup.reportDate],
      set: {
        totalRecords: sql`excluded.total_records`,
        totalCallCost: sql`excluded.total_call_cost`,
        totalCommissionAmount: sql`excluded.total_commission_amount`,
        totalFeeAmount: sql`excluded.total_fee_amount`,
        totalNetAmount: sql`excluded.total_net_amount`,
        pendingCount: sql`excluded.pending_count`,
        settledCount: sql`excluded.settled_count`,
        cancelledCount: sql`excluded.cancelled_count`,
        pendingAmount: sql`excluded.pending_amount`,
        settledAmount: sql`excluded.settled_amount`,
        cancelledAmount: sql`excluded.cancelled_amount`,
        saleCount: sql`excluded.sale_count`,
        renewalCount: sql`excluded.renewal_count`,
        activityCount: sql`excluded.activity_count`,
        saleAmount: sql`excluded.sale_amount`,
        renewalAmount: sql`excluded.renewal_amount`,
        activityAmount: sql`excluded.activity_amount`,
        updatedAt: new Date(),
      },
    });

  logger.info({ agentId, date, pending: rollup.pendingCount, settled: rollup.settledCount, cancelled: rollup.cancelledCount }, "[RollupRefresh] 聚合结果");
}
