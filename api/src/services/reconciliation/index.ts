// ============================================================
//  对账服务模块导出
// ============================================================

// 核心逻辑导出
export { getReconciliationReport, streamExportReconCsv, exportReconCsv } from "./reconciliation-core.js";

// 类型导出
export type {
  ReconciliationReport,
  TrendOptions,
  AnomalyType,
  AnomalySeverity,
  DimensionData,
  CsvExportOptions,
  CommissionAggregateResult,
  WithdrawAggregateResult,
  RechargeAggregateResult,
  ConsumptionAggregateResult,
} from "./reconciliation-types.js";
export type { ReconParams } from "../agent-helpers.js";

// 查询函数导出（可选）
export {
  fetchAggregateData,
  fetchDimensionData,
  fetchAnomalyData,
  fetchTrendData,
} from "./reconciliation-queries.js";

// 工具函数导出（可选）
export {
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