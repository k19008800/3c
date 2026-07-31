/**
 * 错误码定义
 * 来源：docs/PRD-错误码规范.md
 * 原则：API 错误码与业务错误码统一在此，对齐前端错误码映射与 docs/api-reference.md
 */

// ===== HTTP 级错误码 =====
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCodes = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ===== 业务错误码 =====
export const BusinessErrorCodes = {
  // 路由/调用
  ROUTING_ALL_DOWN: "ROUTING_ALL_DOWN",
  ROUTING_NO_ROUTE: "ROUTING_NO_ROUTE",
  MODEL_DISABLED: "MODEL_DISABLED",
  // 计费
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  BILLING_DEDUCT_FAILED: "BILLING_DEDUCT_FAILED",
  // Key
  KEY_INVALID: "KEY_INVALID",
  KEY_EXPIRED: "KEY_EXPIRED",
  KEY_DISABLED: "KEY_DISABLED",
  KEY_QUOTA_EXCEEDED: "KEY_QUOTA_EXCEEDED",
  // 限流
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  // 校验
  VALIDATION_FAILED: "VALIDATION_FAILED",
  // 用户
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_DISABLED: "USER_DISABLED",
  // 认证
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  PASSWORD_WRONG: "PASSWORD_WRONG",
  // 幂等/冲突
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  // 供应商
  VENDOR_OFFLINE: "VENDOR_OFFLINE",
  VENDOR_KEY_EXHAUSTED: "VENDOR_KEY_EXHAUSTED",
} as const;
export type BusinessErrorCodes = (typeof BusinessErrorCodes)[keyof typeof BusinessErrorCodes];
