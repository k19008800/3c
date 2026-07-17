// ============================================================
//  3cloud (3C) — 对账报表 & CSV 导出
// ============================================================

import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  commissionLogs,
  callLogs,
  withdrawOrders,
  rechargeOrders,
  agents,
  users,
} from "../../db/schema.js";
import { getRedis } from "../../redis.js";
import { toDecStr, addDec, subDec, type ReconParams } from "../agent-helpers.js";

/**
 * 对账报表（多维度 + 异常检测 + 资金平衡校验 + 趋势）
 * Redis 缓存 24h TTL（仅历史数据）
 */
export async function getReconciliationReport(params?: ReconParams) {
  const db = getDb();
  const redis = getRedis();

  const now = new Date().toISOString().slice(0, 10);
  const startDate = params?.startDate || now;
  const endDate = params?.endDate || now;
  const granularity: 'day' | 'week' | 'month' = params?.granularity || 'day';

  // 对于历史数据，尝试走 Redis 缓存（非今天的数据写入后可缓存24h）
  const cacheKey = `recon:${startDate}:${endDate}:${granularity}`;
  if (startDate < now) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* 缓存读失败则继续查库 */ }
  }

  const startOfRange = new Date(startDate + "T00:00:00Z");
  const endOfRange = new Date(endDate + "T23:59:59Z");

  // ── 1. 汇总统计（佣金、提现、充值、消耗） ──

  const aggregatePromises = Promise.all([
    // 佣金
    db.select({
      count: sql<number>`count(*)`,
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
      totalNet: sql<string>`coalesce(sum(${commissionLogs.netAmount}), '0.000000')`,
    }).from(commissionLogs).where(and(
      gte(commissionLogs.createdAt, startOfRange),
      lte(commissionLogs.createdAt, endOfRange),
    )),
    // 提现
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
      totalActual: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    }).from(withdrawOrders).where(and(
      gte(withdrawOrders.createdAt, startOfRange),
      lte(withdrawOrders.createdAt, endOfRange),
    )),
    // 充值确认
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    }).from(rechargeOrders).where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(rechargeOrders.confirmedAt, startOfRange),
      lte(rechargeOrders.confirmedAt, endOfRange),
    )),
    // 调用消耗（实际扣费总额）
    db.select({
      totalConsumption: sql<string>`coalesce(sum(${callLogs.cost}), '0.000000')`,
    }).from(callLogs).where(and(
      gte(callLogs.createdAt, startOfRange),
      lte(callLogs.createdAt, endOfRange),
      inArray(callLogs.status, ["success", "timeout", "cancelled"]),
    )),
  ]);

  // ── 2. 维度拆分 ──

  const dimensionPromises = Promise.all([
    // 按代理商
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
    // 按状态
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
    // 按提现状态
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
    // 按佣金类型
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

  // ── 3. 异常检测 ──

  const anomalyPromises = Promise.all([
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

  // ── 4. 趋势数据（多日才有意义） ──

  let trends: Array<{
    date: string
    commissionAmount: string
    commissionCount: number
    withdrawAmount: string
    withdrawCount: number
    rechargeAmount: string
    rechargeCount: number
  }> = [];

  if (startDate !== endDate) {
    const groupExpr = granularity === 'month'
      ? sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM')`
      : granularity === 'week'
        ? sql`to_char(date_trunc('week', ${commissionLogs.createdAt}), 'YYYY-MM-DD')`
        : sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM-DD')`;

    const [trendComm, trendWdraw, trendRech] = await Promise.all([
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

    // 合并趋势数据
    const dateMap = new Map<string, {
      commissionAmount: string; commissionCount: number
      withdrawAmount: string; withdrawCount: number
      rechargeAmount: string; rechargeCount: number
    }>();

    const genDates = () => {
      const dates: string[] = [];
      const d = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T23:59:59Z");
      while (d <= end) {
        let key: string;
        if (granularity === 'month') {
          key = d.toISOString().slice(0, 7);
          d.setMonth(d.getMonth() + 1);
        } else if (granularity === 'week') {
          const dayOfWeek = d.getUTCDay();
          const monday = new Date(d);
          monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
          key = monday.toISOString().slice(0, 10);
          d.setUTCDate(d.getUTCDate() + 7);
        } else {
          key = d.toISOString().slice(0, 10);
          d.setUTCDate(d.getUTCDate() + 1);
        }
        dates.push(key);
      }
      return dates;
    };

    const allDates = genDates();
    for (const dt of allDates) {
      dateMap.set(dt, {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      });
    }

    for (const row of trendComm) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.commissionAmount = row.amount;
      existing.commissionCount = row.count;
      dateMap.set(row.date, existing);
    }
    for (const row of trendWdraw) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.withdrawAmount = row.amount;
      existing.withdrawCount = row.count;
      dateMap.set(row.date, existing);
    }
    for (const row of trendRech) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.rechargeAmount = row.amount;
      existing.rechargeCount = row.count;
      dateMap.set(row.date, existing);
    }

    trends = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }

  const [
    [commissionResult],
    [withdrawResult],
    [rechargeResult],
    [consumptionResult],
  ] = await aggregatePromises;

  const [
    byAgentRows,
    byCommissionStatusRows,
    byWithdrawStatusRows,
    byCommissionTypeRows,
  ] = await dimensionPromises;

  const [
    orphanRows,
    frequentWithdrawRows,
    unmatchedRechargeRows,
  ] = await anomalyPromises;

  // ── 5. 构建响应 ──

  const commissionTotal = toDecStr(commissionResult?.totalCommission);
  const commissionFee = toDecStr(commissionResult?.totalFee);
  const commissionNet = toDecStr(commissionResult?.totalNet || commissionTotal);
  const withdrawTotal = toDecStr(withdrawResult?.totalAmount);
  const withdrawFee = toDecStr(withdrawResult?.totalFee);
  const withdrawActual = toDecStr(withdrawResult?.totalActual || withdrawTotal);
  const rechargeTotal = toDecStr(rechargeResult?.totalAmount);
  const consumptionTotal = toDecStr(consumptionResult?.totalConsumption);

  // 资金平衡校验
  const totalExpenses = addDec(addDec(consumptionTotal, commissionNet), withdrawActual);
  const balanceDiff = subDec(rechargeTotal, totalExpenses);
  const absDiff = Math.abs(parseFloat(balanceDiff));
  const isBalanced = absDiff < 0.01; // 精度容差 ¥0.01

  // 构建 anomaly items
  const anomalies: Array<{
    id: number
    type: string
    severity: string
    description: string
    relatedId: number | null
    amount: string | null
    createdAt: string
  }> = [];

  for (const row of orphanRows) {
    anomalies.push({
      id: row.id,
      type: 'orphan_commission',
      severity: 'high',
      description: `佣金记录 #${row.id} 没有对应的调用日志（call_log_id: ${row.clientCallLogId}）`,
      relatedId: row.clientCallLogId as number | null,
      amount: toDecStr(row.amount),
      createdAt: row.createdAt?.toISOString() || startDate,
    });
  }

  for (const row of frequentWithdrawRows) {
    anomalies.push({
      id: 0,
      type: 'frequent_withdraw',
      severity: 'medium',
      description: `代理商 #${row.agentId} 当日提现 ${row.times} 次（共 ${toDecStr(row.totalAmount)}），存在拆分风险`,
      relatedId: row.agentId as number,
      amount: toDecStr(row.totalAmount),
      createdAt: startDate,
    });
  }

  for (const row of unmatchedRechargeRows) {
    anomalies.push({
      id: row.id,
      type: 'unmatched_recharge',
      severity: 'high',
      description: `充值订单 #${row.id}（用户 #${row.userId}，${toDecStr(row.amount)}）已确认但 balance_logs 未入账`,
      relatedId: row.id,
      amount: toDecStr(row.amount),
      createdAt: row.createdAt?.toISOString() || startDate,
    });
  }

  // 按维度构建 byStatus
  const byStatusLabels: Record<string, string> = {
    pending: '待结算',
    settled: '已结算',
    cancelled: '已作废',
  };
  const byStatus: Record<string, { label: string; count: number; totalAmount: string; feeAmount?: string; netAmount?: string }> = {};
  for (const row of byCommissionStatusRows) {
    byStatus[row.status] = {
      label: byStatusLabels[row.status] || row.status,
      count: row.count,
      totalAmount: toDecStr(row.total),
      feeAmount: toDecStr(row.fee),
    };
  }
  for (const row of byWithdrawStatusRows) {
    const key = `withdraw_${row.status}`;
    byStatus[key] = {
      label: `提现(${row.status})`,
      count: row.count,
      totalAmount: toDecStr(row.total),
      feeAmount: toDecStr(row.fee),
    };
  }

  // 按代理商
  const agentIds = byAgentRows.map(r => r.agentId).filter(Boolean);
  let agentMap = new Map<number, string>();
  if (agentIds.length > 0) {
    const agentRows = await db.select({
      id: agents.id,
      nickname: users.nickname,
    }).from(agents)
      .leftJoin(users, eq(agents.userId, users.id))
      .where(inArray(agents.id, agentIds as number[]));
    for (const a of agentRows) {
      agentMap.set(a.id, a.nickname || `代理商 #${a.id}`);
    }
  }

  const byAgent = byAgentRows.map(r => ({
    label: agentMap.get(r.agentId as number) || `代理商 #${r.agentId}`,
    count: r.count,
    totalAmount: toDecStr(r.total),
  }));

  // 按佣金类型
  const typeLabels: Record<string, string> = {
    sale: '销售佣金',
    team: '团队佣金',
    activity: '活动奖励',
    renewal: '续费佣金',
  };
  const byCommissionType = byCommissionTypeRows.map(r => ({
    label: typeLabels[r.type as string] || (r.type as string),
    count: r.count,
    totalAmount: toDecStr(r.total),
  }));

  // ── 组装结果 ──

  const report = {
    date: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
    startDate,
    endDate,
    granularity,
    summary: {
      commission: {
        count: Number(commissionResult?.count ?? 0),
        totalCommission: commissionTotal,
        totalFee: commissionFee,
        totalNet: commissionNet,
      },
      withdraw: {
        count: Number(withdrawResult?.count ?? 0),
        totalAmount: withdrawTotal,
        totalFee: withdrawFee,
        totalActual: withdrawActual,
      },
      recharge: {
        count: Number(rechargeResult?.count ?? 0),
        totalAmount: rechargeTotal,
      },
    },
    dimensions: {
      byAgent,
      byStatus,
      byCommissionType,
    },
    balanceCheck: {
      totalIncome: rechargeTotal,
      totalExpense: consumptionTotal,
      totalCommission: commissionNet,
      totalWithdraw: withdrawActual,
      platformProfit: balanceDiff,
      diff: balanceDiff,
      isBalanced,
    },
    anomalies,
    trends,
  };

  // 缓存历史数据（24h TTL）
  if (startDate < now) {
    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(report));
    } catch { /* 缓存写入失败不阻塞 */ }
  }

  return report;
}

/**
 * 对账报表 CSV 导出
 */
export async function exportReconCsv(params: ReconParams): Promise<string> {
  const report = await getReconciliationReport(params);

  const lines: string[] = [];
  lines.push('"3cloud 对账报表"');
  lines.push(`"日期范围","${report.startDate} ~ ${report.endDate}"`);
  lines.push(`"粒度","${report.granularity}"`);
  lines.push('');

  // 汇总
  lines.push('"汇总"');
  lines.push('"分类","笔数","总金额","手续费","净额"');
  lines.push(`"佣金",${report.summary.commission.count},"${report.summary.commission.totalCommission}","${report.summary.commission.totalFee}","${report.summary.commission.totalNet}"`);
  lines.push(`"提现",${report.summary.withdraw.count},"${report.summary.withdraw.totalAmount}","${report.summary.withdraw.totalFee}","${report.summary.withdraw.totalActual}"`);
  lines.push(`"充值确认",${report.summary.recharge.count},"${report.summary.recharge.totalAmount}","-","-"`);
  lines.push('');

  // 资金平衡
  lines.push('"资金平衡校验"');
  lines.push(`"总收入(充值)","${report.balanceCheck.totalIncome}"`);
  lines.push(`"总支出(扣费)","${report.balanceCheck.totalExpense}"`);
  lines.push(`"佣金支出","${report.balanceCheck.totalCommission}"`);
  lines.push(`"提现支出","${report.balanceCheck.totalWithdraw}"`);
  lines.push(`"平台利润","${report.balanceCheck.platformProfit}"`);
  lines.push(`"差额","${report.balanceCheck.diff}"`);
  lines.push(`"是否平账","${report.balanceCheck.isBalanced ? '是' : '否'}"`);
  lines.push('');

  // 异常
  if (report.anomalies.length > 0) {
    lines.push('"异常记录"');
    lines.push('"类型","严重级别","描述","金额"');
    for (const a of report.anomalies) {
      lines.push(`"${a.type}","${a.severity}","${a.description}","${a.amount || ''}"`);
    }
    lines.push('');
  }

  // 趋势
  if (report.trends.length > 0) {
    lines.push('"趋势数据"');
    lines.push('"日期","佣金总额","佣金笔数","提现总额","提现笔数","充值总额","充值笔数"');
    for (const t of report.trends) {
      lines.push(`"${t.date}","${t.commissionAmount}",${t.commissionCount},"${t.withdrawAmount}",${t.withdrawCount},"${t.rechargeAmount}",${t.rechargeCount}`);
    }
  }

  return lines.join('\n');
}
