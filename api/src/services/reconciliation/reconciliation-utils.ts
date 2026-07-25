// ============================================================
//  对账服务工具函数
// ============================================================

import { toDecStr, addDec, subDec } from "../agent-helpers.js";
import type {
  CommissionAggregateResult,
  WithdrawAggregateResult,
  RechargeAggregateResult,
  ConsumptionAggregateResult
} from "./reconciliation-types.js";

/**
 * 生成缓存键
 */
export function generateCacheKey(startDate: string, endDate: string, granularity: 'day' | 'week' | 'month'): string {
  return `recon:${startDate}:${endDate}:${granularity}`;
}

/**
 * 检查是否为历史数据（可缓存）
 */
export function isHistoricalData(date: string, referenceDate?: string): boolean {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  return date < ref;
}

/**
 * 构建汇总统计对象
 */
export function buildSummary(
  commissionResult: CommissionAggregateResult | undefined,
  withdrawResult: WithdrawAggregateResult | undefined,
  rechargeResult: RechargeAggregateResult | undefined,
  consumptionResult: ConsumptionAggregateResult | undefined
) {
  const commissionTotal = toDecStr(commissionResult?.totalCommission);
  const commissionFee = toDecStr(commissionResult?.totalFee);
  const commissionNet = toDecStr(commissionResult?.totalNet || commissionTotal);
  const withdrawTotal = toDecStr(withdrawResult?.totalAmount);
  const withdrawFee = toDecStr(withdrawResult?.totalFee);
  const withdrawActual = toDecStr(withdrawResult?.totalActual || withdrawTotal);
  const rechargeTotal = toDecStr(rechargeResult?.totalAmount);
  const consumptionTotal = toDecStr(consumptionResult?.totalConsumption);

  return {
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
    consumption: consumptionTotal
  };
}

/**
 * 资金平衡校验
 */
export function checkBalance(
  rechargeTotal: string,
  consumptionTotal: string,
  commissionNet: string,
  withdrawActual: string
) {
  const totalExpenses = addDec(addDec(consumptionTotal, commissionNet), withdrawActual);
  const balanceDiff = subDec(rechargeTotal, totalExpenses);
  const absDiff = Math.abs(parseFloat(balanceDiff));
  const isBalanced = absDiff < 0.01; // 精度容差 ¥0.01

  return {
    totalIncome: rechargeTotal,
    totalExpense: consumptionTotal,
    totalCommission: commissionNet,
    totalWithdraw: withdrawActual,
    platformProfit: balanceDiff,
    diff: balanceDiff,
    isBalanced,
  };
}

/**
 * 构建异常记录
 */
export function buildAnomalyItem(
  id: number,
  type: string,
  severity: string,
  description: string,
  relatedId: number | null,
  amount: string | null,
  createdAt: string
) {
  return {
    id,
    type,
    severity,
    description,
    relatedId,
    amount,
    createdAt,
  };
}

/**
 * 生成日期范围序列
 */
export function generateDateSequence(
  startDate: string,
  endDate: string,
  granularity: 'day' | 'week' | 'month'
): string[] {
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
      d.setUTCDate(d.getUTCDate() +173);
    }
    dates.push(key);
  }

  return dates;
}

/**
 * 合并趋势数据
 */
export function mergeTrendData(
  commissionTrends: Array<{ date: string; amount: string; count: number }>,
  withdrawTrends: Array<{ date: string; amount: string; count: number }>,
  rechargeTrends: Array<{ date: string; amount: string; count: number }>,
  dateSequence: string[]
) {
  const dateMap = new Map<string, {
    commissionAmount: string; commissionCount: number;
    withdrawAmount: string; withdrawCount: number;
    rechargeAmount: string; rechargeCount: number;
  }>();

  // 初始化所有日期
  for (const dt of dateSequence) {
    dateMap.set(dt, {
      commissionAmount: '0.000000', commissionCount: 0,
      withdrawAmount: '0.000000', withdrawCount: 0,
      rechargeAmount: '0.000000', rechargeCount: 0,
    });
  }

  // 合并佣金趋势数据
  for (const row of commissionTrends) {
    const existing = dateMap.get(row.date) || {
      commissionAmount: '0.000000', commissionCount: 0,
      withdrawAmount: '0.000000', withdrawCount: 0,
      rechargeAmount: '0.000000', rechargeCount: 0,
    };
    existing.commissionAmount = row.amount;
    existing.commissionCount = row.count;
    dateMap.set(row.date, existing);
  }

  // 合并提现趋势数据
  for (const row of withdrawTrends) {
    const existing = dateMap.get(row.date) || {
      commissionAmount: '0.000000', commissionCount: 0,
      withdrawAmount: '0.000000', withdrawCount: 0,
      rechargeAmount: '0.000000', rechargeCount: 0,
    };
    existing.withdrawAmount = row.amount;
    existing.withdrawCount = row.count;
    dateMap.set(row.date, existing);
  }

  // 合并充值趋势数据
  for (const row of rechargeTrends) {
    const existing = dateMap.get(row.date) || {
      commissionAmount: '0.000000', commissionCount: 0,
      withdrawAmount: '0.000000', withdrawCount: 0,
      rechargeAmount: '0.000000', rechargeCount: 0,
    };
    existing.rechargeAmount = row.amount;
    existing.rechargeCount = row.count;
    dateMap.set(row.date, existing);
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

/**
 * 格式化代理商名称映射
 */
export async function formatAgentLabels(agentIds: number[], db: any) {
  const { agents, users } = await import("../../db/schema.js");
  const { eq, sql } = await import("drizzle-orm");

  const agentMap = new Map<number, string>();
  if (agentIds.length > 0) {
    const agentRows = await db.select({
      id: agents.id,
      nickname: users.nickname,
    }).from(agents)
      .leftJoin(users, eq(agents.userId, users.id))
      .where(sql`${agents.id} = ANY(ARRAY[${sql.join(
        agentIds.map(id => sql`${id}::int`), 
        sql`, `
      )}])`);
    
    for (const a of agentRows) {
      agentMap.set(a.id, a.nickname || `代理商 #${a.id}`);
    }
  }
  
  return agentMap;
}

/**
 * 获取状态标签映射
 */
export function getStatusLabels(): Record<string, string> {
  return {
    pending: '待结算',
    settled: '已结算',
    cancelled: '已作废',
  };
}

/**
 * 获取佣金类型标签映射
 */
export function getCommissionTypeLabels(): Record<string, string> {
  return {
    sale: '销售佣金',
    team: '团队佣金',
    activity: '活动奖励',
    renewal: '续费佣金',
  };
}