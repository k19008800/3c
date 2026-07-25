// ============================================================
//  提现审核服务模块导出
// ============================================================

// 核心逻辑导出
export {
  firstReviewWithdraw,
  secondReviewWithdraw,
  markWithdrawAsPaid,
  reviewWithdraw,
  batchReviewWithdraws,
} from "./review-core.js";

// 类型导出
export type {
  ReviewAction,
  FirstReviewParams,
  SecondReviewParams,
  MarkAsPaidParams,
  BatchReviewParams,
  ReviewResult,
  BatchReviewResult,
  WithdrawStatus,
  AuditAction,
  AuditLogEntry,
  AgentAmountUpdate,
} from "./review-types.js";

// 查询函数导出（可选）
export {
  getWithdrawOrder,
  getBatchWithdrawOrders,
  updateWithdrawOrder,
  updateAgentPendingWithdraw,
  batchUpdateAgentPendingWithdraw,
  insertAuditLog,
  batchInsertAuditLogs,
  batchUpdateWithdrawOrders,
  isOrderReviewable,
  getReviewLevel,
} from "./review-queries.js";

// 工具函数导出（可选）
export {
  validateWithdrawStatus,
  buildAuditLog,
  calculateActualAmount,
  prepareBatchProcessing,
  buildAgentAmountUpdates,
  buildBatchDescription,
  buildOrderDescription,
  checkOrderExists,
  getStatusTransition,
} from "./review-utils.js";