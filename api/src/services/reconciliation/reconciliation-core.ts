// ============================================================
//  对账服务核心逻辑
// ============================================================

import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { ReconParams } from "../agent-helpers.js";
import type { ReconciliationReport } from "./reconciliation-types.js";
import {
  fetchAggregateData,
  fetchDimensionData,
  fetchAnomalyData,
  fetchTrendData,
} from "./reconciliation-queries.js";
import {
  generateCacheKey,
  isHistoricalData,
  buildSummary,
  checkBalance,
  buildAnomalyItem,
  generateDateSequence,
  mergeTrendData,
  formatAgentLabels,
  getStatusLabels,
  getCommissionTypeLabels,
} from "./reconciliation-utils.js";

/**
 * 获取对账报表
 */
export async function getReconciliationReport(params?: ReconParams): Promise<ReconciliationReport> {
  const db = getDb();
  const redis = getRedis();

  const now = new Date().toISOString().slice(0, 10);
  const startDate = params?.startDate || now;
  const endDate = params?.endDate || now;
  const granularity: 'day' | 'week' | 'month' = params?.granularity || 'day';

  // 对于历史数据，尝试走 Redis 缓存（非今天的数据写入后可缓存24h）
  const cacheKey = generateCacheKey(startDate, endDate, granularity);
  if (isHistoricalData(startDate, now)) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* 缓存读失败则继续查库 */ }
  }

  const startOfRange = new Date(startDate + "T00:00:00Z");
  const endOfRange = new Date(endDate + "T23:59:59Z");

  // 执行所有查询
  const [
    aggregateResults,
    dimensionResults,
    anomalyResults,
  ] = await Promise.all([
    fetchAggregateData(db, startOfRange, endOfRange),
    fetchDimensionData(db, startOfRange, endOfRange),
    fetchAnomalyData(db, startOfRange, endOfRange),
  ]);

  const [
    commissionAggregate,
    withdrawAggregate,
    rechargeAggregate,
    consumptionAggregate,
  ] = aggregateResults;

  const [
    byAgentRows,
    byCommissionStatusRows,
    byWithdrawStatusRows,
    byCommissionTypeRows,
  ] = dimensionResults;

  const [
    orphanRows,
    frequentWithdrawRows,
    unmatchedRechargeRows,
  ] = anomalyResults;

  // 处理趋势数据（多日才有意义）
  let trends: ReconciliationReport['trends'] = [];

  if (startDate !== endDate) {
    const trendData = await fetchTrendData(db, startOfRange, endOfRange, granularity);
    const [trendComm, trendWdraw, trendRech] = trendData;
    
    const dateSequence = generateDateSequence(startDate, endDate, granularity);
    trends = mergeTrendData(trendComm, trendWdraw, trendRech, dateSequence);
  }

  // 构建汇总数据
  const summary = buildSummary(
    commissionAggregate[0],
    withdrawAggregate[0],
    rechargeAggregate[0],
    consumptionAggregate[0]
  );

  // 资金平衡校验
  const balanceCheck = checkBalance(
    summary.recharge.totalAmount,
    summary.consumption,
    summary.commission.totalNet,
    summary.withdraw.totalActual
  );

  // 构建异常记录
  const anomalies: ReconciliationReport['anomalies'] = [];

  for (const row of orphanRows) {
    anomalies.push(buildAnomalyItem(
      row.id,
      'orphan_commission',
      'high',
      `佣金记录 #${row.id} 没有对应的调用日志（call_log_id: ${row.clientCallLogId}）`,
      row.clientCallLogId as number | null,
      row.amount,
      row.createdAt?.toISOString() || startDate
    ));
  }

  for (const row of frequentWithdrawRows) {
    anomalies.push(buildAnomalyItem(
      0,
      'frequent_withdraw',
      'medium',
      `代理商 #${row.agentId} 当日提现 ${row.times} 次（共 ${row.totalAmount}），存在拆分风险`,
      row.agentId as number,
      row.totalAmount,
      startDate
    ));
  }

  for (const row of unmatchedRechargeRows) {
    anomalies.push(buildAnomalyItem(
      row.id,
      'unmatched_recharge',
      'high',
      `充值订单 #${row.id}（用户 #${row.userId}，${row.amount}）已确认但 balance_logs 未入账`,
      row.id,
      row.amount,
      row.createdAt?.toISOString() || startDate
    ));
  }

  // 构建维度数据
  const byStatusLabels = getStatusLabels();
  const byStatus: Record<string, any> = {};

  for (const row of byCommissionStatusRows) {
    byStatus[row.status] = {
      label: byStatusLabels[row.status] || row.status,
      count: row.count,
      totalAmount: row.total,
      feeAmount: row.fee,
    };
  }

  for (const row of byWithdrawStatusRows) {
    const key = `withdraw_${row.status}`;
    byStatus[key] = {
      label: `提现(${row.status})`,
      count: row.count,
      totalAmount: row.total,
      feeAmount: row.fee,
    };
  }

  // 按代理商
  const agentIds = byAgentRows.map((r: any) => r.agentId).filter(Boolean);
  const agentMap = await formatAgentLabels(agentIds, db);
  
  const byAgent = byAgentRows.map((r: any) => ({
    label: agentMap.get(r.agentId as number) || `代理商 #${r.agentId}`,
    count: r.count,
    totalAmount: r.total,
  }));

  // 按佣金类型
  const typeLabels = getCommissionTypeLabels();
  const byCommissionType = byCommissionTypeRows.map((r: any) => ({
    label: typeLabels[r.type as string] || (r.type as string),
    count: r.count,
    totalAmount: r.total,
  }));

  // 构建最终报表
  const report: ReconciliationReport = {
    date: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
    startDate,
    endDate,
    granularity,
    summary: {
      commission: summary.commission,
      withdraw: summary.withdraw,
      recharge: summary.recharge,
    },
    dimensions: {
      byAgent,
      byStatus,
      byCommissionType,
    },
    balanceCheck,
    anomalies,
    trends,
  };

  // 缓存历史数据（24h TTL）
  if (isHistoricalData(startDate, now)) {
    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(report));
    } catch { /* 缓存写入失败不阻塞 */ }
  }

  return report;
}

/**
 * CSV流式导出
 */
export async function streamExportReconCsv(
  reply: any,
  params: ReconParams
): Promise<void> {
  const report = await getReconciliationReport(params);

  // 设置响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="reconciliation_${params.startDate || 'report'}.csv"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // 设置5分钟超时
  reply.raw.setTimeout(300000, () => {
    reply.raw.destroy();
  });

  // 写入BOM
  reply.raw.write('\uFEFF');

  // 逐行写入，避免构建大数组
  const writeLine = (line: string) => {
    reply.raw.write(line + '\n');
  };

  writeLine('"3cloud 对账报表"');
  writeLine(`"日期范围","${report.startDate} ~ ${report.endDate}"`);
  writeLine(`"粒度","${report.granularity}"`);
  writeLine('');

  // 汇总
  writeLine('"汇总"');
  writeLine('"分类","笔数","总金额","手续费","净额"');
  writeLine(`"佣金",${report.summary.commission.count},"${report.summary.commission.totalCommission}","${report.summary.commission.totalFee}","${report.summary.commission.totalNet}"`);
  writeLine(`"提现",${report.summary.withdraw.count},"${report.summary.withdraw.totalAmount}","${report.summary.withdraw.totalFee}","${report.summary.withdraw.totalActual}"`);
  writeLine(`"充值确认",${report.summary.recharge.count},"${report.summary.recharge.totalAmount}","-","-"`);
  writeLine('');

  // 资金平衡
  writeLine('"资金平衡校验"');
  writeLine(`"总收入(充值)","${report.balanceCheck.totalIncome}"`);
  writeLine(`"总支出(扣费)","${report.balanceCheck.totalExpense}"`);
  writeLine(`"佣金支出","${report.balanceCheck.totalCommission}"`);
  writeLine(`"提现支出","${report.balanceCheck.totalWithdraw}"`);
  writeLine(`"平台利润","${report.balanceCheck.platformProfit}"`);
  writeLine(`"差额","${report.balanceCheck.diff}"`);
  writeLine(`"是否平账","${report.balanceCheck.isBalanced ? '是' : '否'}"`);
  writeLine('');

  // 异常
  if (report.anomalies.length > 0) {
    writeLine('"异常记录"');
    writeLine('"类型","严重级别","描述","金额"');
    for (const a of report.anomalies) {
      writeLine(`"${a.type}","${a.severity}","${a.description}","${a.amount || ''}"`);
    }
    writeLine('');
  }

  // 趋势
  if (report.trends.length > 0) {
    writeLine('"趋势数据"');
    writeLine('"日期","佣金总额","佣金笔数","提现总额","提现笔数","充值总额","充值笔数"');
    for (const t of report.trends) {
      writeLine(`"${t.date}","${t.commissionAmount}",${t.commissionCount},"${t.withdrawAmount}",${t.withdrawCount},"${t.rechargeAmount}",${t.rechargeCount}`);
    }
  }

  reply.raw.end();
}

/**
 * CSV导出（兼容旧版）
 * @deprecated 请使用 streamExportReconCsv
 */
export async function exportReconCsv(params: ReconParams): Promise<string> {
  console.warn('[DEPRECATED] exportReconCsv 已废弃，请使用流式版本 streamExportReconCsv');
  
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