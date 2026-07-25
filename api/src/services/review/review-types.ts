// ============================================================
//  提现审核服务类型定义
// ============================================================

/**
 * 提现审核动作类型
 */
export type ReviewAction = "approve" | "reject";

/**
 * 初审参数
 */
export interface FirstReviewParams {
  operatorId: number;
  withdrawId: number;
  action: ReviewAction;
  rejectReason?: string | null;
}

/**
 * 复审参数
 */
export interface SecondReviewParams {
  operatorId: number;
  withdrawId: number;
  action: ReviewAction;
  rejectReason?: string | null;
  bankVoucherUrl?: string | null;
}

/**
 * 打款确认参数
 */
export interface MarkAsPaidParams {
  operatorId: number;
  withdrawId: number;
  bankVoucherUrl?: string | null;
}

/**
 * 批量审核参数
 */
export interface BatchReviewParams {
  operatorId: number;
  ids: number[];
  action: ReviewAction;
  rejectReason?: string | null;
}

/**
 * 审核结果
 */
export interface ReviewResult {
  id: number;
  status: string;
}

/**
 * 批量审核结果
 */
export interface BatchReviewResult {
  approved: number;
  rejected: number;
  total: number;
  errors: Array<{
    id: number;
    reason: string;
  }>;
}

/**
 * 提现订单状态
 */
export type WithdrawStatus = 
  | "pending_first_review"
  | "pending_second_review"
  | "approved"
  | "rejected"
  | "paid"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/**
 * 审计日志动作类型
 */
export type AuditAction =
  | "withdraw_first_approve"
  | "withdraw_reject"
  | "withdraw_second_approve"
  | "withdraw_paid"
  | "withdraw_approve";

/**
 * 审计日志记录
 */
export interface AuditLogEntry {
  operatorId: number;
  action: AuditAction;
  targetType: string;
  targetId: number;
  before: Record<string, any>;
  after: Record<string, any>;
  ip: string | null;
  description: string;
}

/**
 * 代理商金额更新信息
 */
export interface AgentAmountUpdate {
  agentId: number;
  amount: string;
}

/**
 * 批量审核处理结果
 */
export interface BatchProcessingResult {
  validOrders: any[];
  invalidOrders: Array<{
    id: number;
    reason: string;
  }>;
  agentAmounts: Map<number, string>;
}