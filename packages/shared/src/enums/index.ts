/**
 * 核心枚举定义
 * 来源：docs/SPEC、docs/data-dictionary.md
 * 原则：所有跨模块状态/类型枚举在此统一，防止散落重复定义
 */

// ===== 订单/充值 =====
export const RechargeStatus = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;
export type RechargeStatus = (typeof RechargeStatus)[keyof typeof RechargeStatus];

export const RefundStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  PROCESSED: "processed",
  CANCELLED: "cancelled",
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const WithdrawStatus = {
  PENDING: "pending",
  FIRST_AUDIT: "first_audit",
  SECOND_AUDIT: "second_audit",
  APPROVED: "approved",
  TRANSFERRED: "transferred",
  REJECTED: "rejected",
  FROZEN: "frozen",
} as const;
export type WithdrawStatus = (typeof WithdrawStatus)[keyof typeof WithdrawStatus];

// ===== 佣金 =====
export const CommissionType = {
  PERCENT: "percent",
  FIXED: "fixed",
  MIXED: "mixed",
} as const;
export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

export const CommissionStatus = {
  PENDING: "pending",
  SETTLED: "settled",
  CANCELLED: "cancelled",
} as const;
export type CommissionStatus = (typeof CommissionStatus)[keyof typeof CommissionStatus];

// ===== 用户/代理 =====
export const UserStatus = {
  ACTIVE: "active",
  DISABLED: "disabled",
  PENDING: "pending",
  DELETED: "deleted",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AgentTier = {
  PRELIMINARY: "preliminary",
  LEVEL1: "level1",
  LEVEL2: "level2",
  SENIOR: "senior",
} as const;
export type AgentTier = (typeof AgentTier)[keyof typeof AgentTier];

// ===== 模型/供应商 =====
export const ModelStatus = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ARCHIVED: "archived",
} as const;
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];

export const VendorStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  OFFLINE: "offline",
} as const;
export type VendorStatus = (typeof VendorStatus)[keyof typeof VendorStatus];

// ===== 工单 =====
export const TicketStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  RESOLVED: "resolved",
  CLOSED: "closed",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

// ===== API Key =====
export const ApiKeyStatus = {
  ACTIVE: "active",
  DISABLED: "disabled",
  EXPIRED: "expired",
  DELETED: "deleted",
} as const;
export type ApiKeyStatus = (typeof ApiKeyStatus)[keyof typeof ApiKeyStatus];

// ===== 通用 =====
export const SortOrder = {
  ASC: "asc",
  DESC: "desc",
} as const;
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
