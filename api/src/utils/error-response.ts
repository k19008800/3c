// ============================================================
//  3cloud (3C) — 错误响应工具函数
//  统一 API 错误响应格式，包含错误码和文档链接
// ============================================================

import { FastifyReply } from "fastify";
import { getErrorCode, getErrorCodeDocUrl } from "../constants/error-codes.js";

/**
 * 标准错误响应格式
 */
export interface StandardErrorResponse {
  code: number;
  error: string;
  errorCode?: string;
  docUrl?: string;
  details?: Record<string, unknown>;
  message: string;
}

/**
 * 发送标准错误响应
 *
 * @example
 * ```ts
 * // 使用预定义错误码
 * return sendErrorResponse(reply, 400, 'E001');
 *
 * // 自定义错误消息
 * return sendErrorResponse(reply, 400, 'E001', '余额不足，当前余额：10.00 元');
 *
 * // 附加详细信息
 * return sendErrorResponse(reply, 400, 'E001', undefined, { balance: 10.00, required: 100.00 });
 * ```
 */
export function sendErrorResponse(
  reply: FastifyReply,
  statusCode: number,
  errorCode: string,
  customMessage?: string,
  details?: Record<string, unknown>
): FastifyReply {
  const definition = getErrorCode(errorCode);
  const message = customMessage || definition?.message || "未知错误";
  const docUrl = getErrorCodeDocUrl(errorCode);

  const response: StandardErrorResponse = {
    code: 1,
    error: message,
    errorCode,
    docUrl,
    message: "error",
  };

  if (details) {
    response.details = details;
  }

  return reply.status(statusCode).send(response);
}

/**
 * 常用错误响应快捷方法
 */
export const ErrorResponses = {
  // 余额相关
  insufficientBalance: (reply: FastifyReply, balance?: number) =>
    sendErrorResponse(reply, 400, "E001", undefined, balance ? { balance } : undefined),

  balanceFrozen: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E002"),

  // 认证相关
  apiKeyDisabled: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E011"),

  apiKeyNotFound: (reply: FastifyReply) =>
    sendErrorResponse(reply, 401, "E012"),

  apiKeyExpired: (reply: FastifyReply) =>
    sendErrorResponse(reply, 401, "E013"),

  userDisabled: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E014"),

  invalidCredentials: (reply: FastifyReply) =>
    sendErrorResponse(reply, 401, "E015"),

  tokenExpired: (reply: FastifyReply) =>
    sendErrorResponse(reply, 401, "E016"),

  permissionDenied: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E017"),

  invalidToken: (reply: FastifyReply) =>
    sendErrorResponse(reply, 401, "E018"),

  // 模型相关
  modelNotFound: (reply: FastifyReply, model?: string) =>
    sendErrorResponse(reply, 404, "E021", undefined, model ? { model } : undefined),

  modelDisabled: (reply: FastifyReply, model?: string) =>
    sendErrorResponse(reply, 403, "E022", undefined, model ? { model } : undefined),

  modelMaintenance: (reply: FastifyReply, model?: string) =>
    sendErrorResponse(reply, 503, "E023", undefined, model ? { model } : undefined),

  // 限流相关
  rateLimitExceeded: (reply: FastifyReply, retryAfter?: number) =>
    sendErrorResponse(reply, 429, "E031", undefined, retryAfter ? { retryAfter } : undefined),

  concurrencyLimitExceeded: (reply: FastifyReply) =>
    sendErrorResponse(reply, 429, "E032"),

  tpmLimitExceeded: (reply: FastifyReply) =>
    sendErrorResponse(reply, 429, "E033"),

  rpmLimitExceeded: (reply: FastifyReply) =>
    sendErrorResponse(reply, 429, "E034"),

  dailyQuotaExhausted: (reply: FastifyReply) =>
    sendErrorResponse(reply, 429, "E035"),

  // 请求相关
  invalidParameters: (reply: FastifyReply, details?: Record<string, unknown>) =>
    sendErrorResponse(reply, 400, "E041", undefined, details),

  requestTooLarge: (reply: FastifyReply) =>
    sendErrorResponse(reply, 413, "E042"),

  requestTimeout: (reply: FastifyReply) =>
    sendErrorResponse(reply, 504, "E043"),

  contentModerationFailed: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E044"),

  promptViolation: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E045"),

  // 服务相关
  upstreamUnavailable: (reply: FastifyReply) =>
    sendErrorResponse(reply, 503, "E051"),

  upstreamTimeout: (reply: FastifyReply) =>
    sendErrorResponse(reply, 504, "E052"),

  upstreamError: (reply: FastifyReply, details?: Record<string, unknown>) =>
    sendErrorResponse(reply, 502, "E053", undefined, details),

  circuitBreakerOpen: (reply: FastifyReply) =>
    sendErrorResponse(reply, 503, "E054"),

  serviceMaintenance: (reply: FastifyReply) =>
    sendErrorResponse(reply, 503, "E055"),

  // 兑换码相关
  invalidRedemptionCode: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E061"),

  redemptionCodeUsed: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E062"),

  redemptionCodeExpired: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E063"),

  redemptionCodeDisabled: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E064"),

  redemptionCodeNotActivated: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E065"),

  // 实名认证相关
  verificationIncomplete: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E071"),

  verificationPending: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E072"),

  verificationRejected: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E073"),

  // 发票相关
  invoiceInfoIncomplete: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E081"),

  invoiceAmountInsufficient: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E082"),

  invoiceAlreadyIssued: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E083"),

  // 退款相关
  invalidRefundRequest: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E091"),

  refundAlreadyProcessed: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E092"),

  refundPeriodExpired: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E093"),

  // 代理相关
  agentNotActivated: (reply: FastifyReply) =>
    sendErrorResponse(reply, 403, "E101"),

  insufficientCommission: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E102"),

  withdrawalInProgress: (reply: FastifyReply) =>
    sendErrorResponse(reply, 400, "E103"),

  // 系统相关
  internalError: (reply: FastifyReply, details?: Record<string, unknown>) =>
    sendErrorResponse(reply, 500, "E901", undefined, details),

  databaseError: (reply: FastifyReply) =>
    sendErrorResponse(reply, 500, "E902"),

  cacheError: (reply: FastifyReply) =>
    sendErrorResponse(reply, 500, "E903"),

  configError: (reply: FastifyReply) =>
    sendErrorResponse(reply, 500, "E904"),
};

/**
 * 创建错误响应对象（不直接发送）
 * 用于需要在发送前做额外处理的场景
 */
export function createErrorObject(
  errorCode: string,
  customMessage?: string,
  details?: Record<string, unknown>
): StandardErrorResponse {
  const definition = getErrorCode(errorCode);
  const message = customMessage || definition?.message || "未知错误";
  const docUrl = getErrorCodeDocUrl(errorCode);

  return {
    code: 1,
    error: message,
    errorCode,
    docUrl,
    ...(details && { details }),
    message: "error",
  };
}
