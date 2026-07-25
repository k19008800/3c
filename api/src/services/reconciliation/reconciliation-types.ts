// ============================================================
//  对账服务类型定义
// ============================================================

import { ReconParams } from "../agent-helpers.js";

// 导出 ReconParams
export type { ReconParams } from "../agent-helpers.js";

/**
 * 对账报表基础类型
 */
export interface ReconciliationReport {
  date: string;
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';
  summary: {
    commission: {
      count: number;
      totalCommission: string;
      totalFee: string;
      totalNet: string;
    };
    withdraw: {
      count: number;
      totalAmount: string;
      totalFee: string;
      totalActual: string;
    };
    recharge: {
      count: number;
      totalAmount: string;
    };
  };
  dimensions: {
    byAgent: Array<{
      label: string;
      count: number;
      totalAmount: string;
    }>;
    byStatus: Record<string, {
      label: string;
      count: number;
      totalAmount: string;
      feeAmount?: string;
      netAmount?: string;
    }>;
    byCommissionType: Array<{
      label: string;
      count: number;
      totalAmount: string;
    }>;
  };
  balanceCheck: {
    totalIncome: string;
    totalExpense: string;
    totalCommission: string;
    totalWithdraw: string;
    platformProfit: string;
    diff: string;
    isBalanced: boolean;
  };
  anomalies: Array<{
    id: number;
    type: string;
    severity: string;
    description: string;
    relatedId: number | null;
    amount: string | null;
    createdAt: string;
  }>;
  trends: Array<{
    date: string;
    commissionAmount: string;
    commissionCount: number;
    withdrawAmount: string;
    withdrawCount: number;
    rechargeAmount: string;
    rechargeCount: number;
  }>;
}

/**
 * 趋势数据生成选项
 */
export interface TrendOptions {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';
}

/**
 * 异常检测类型
 */
export type AnomalyType = 'orphan_commission' | 'frequent_withdraw' | 'unmatched_recharge';

/**
 * 异常严重级别
 */
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 维度数据
 */
export interface DimensionData {
  label: string;
  count: number;
  totalAmount: string;
  feeAmount?: string;
  netAmount?: string;
}

/**
 * CSV导出选项
 */
export interface CsvExportOptions extends ReconParams {
  fileName?: string;
  includeAnomalies?: boolean;
  includeTrends?: boolean;
}

/**
 * 数据库查询结果类型
 */
export interface CommissionAggregateResult {
  count: number;
  totalCommission: string;
  totalFee: string;
  totalNet: string;
}

export interface WithdrawAggregateResult {
  count: number;
  totalAmount: string;
  totalFee: string;
  totalActual: string;
}

export interface RechargeAggregateResult {
  count: number;
  totalAmount: string;
}

export interface ConsumptionAggregateResult {
  totalConsumption: string;
}