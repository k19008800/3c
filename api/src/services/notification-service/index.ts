// ============================================================
//  3cloud (3C) — 通知服务
//  站内信 + 邮件通知编排
// ============================================================

export type { CreateNotificationParams, RealNameReviewNotifParams } from "./types.js";

export { createNotification, sendEmailAsync } from "./core.js";
export { notifyRealNameReviewResult, notifyRealNameReviewByUserId } from "./real-name.js";

export {
  notifyBalanceLow,
  notifyQuotaWarning,
  notifyWithdrawResult,
  notifyCommissionSettled,
  notifyAgentClientEvent,
  notifyNewModel,
  notifyRedemptionSuccess,
  notifyUnusualLogin,
  notifyApiKeyCreated,
  notifyApiKeyDeleted,
  notifyRateLimitWarned,
  notifySettlementComplete,
  notifyAccountBanned,
  notifyRedemptionUsed,
  notifyRedemptionExpiring,
  notifyRedemptionFraud,
  notifyRedemptionRevoked,
} from "./notifications.js";
