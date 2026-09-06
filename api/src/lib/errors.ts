/**
 * Application error classes for 3cloud API
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
  }
}

// Authentication errors
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * 数据导出未授权（403 DATA_EXPORT_NOT_GRANTED）— 数据导出授权管理
 *
 * 用户端 /api/v1/me/data-export/* 中 request/requests/:id/:id/cancel 四接口，
 * 在用户未获后台授权（无 data_export_grants 记录或 is_enabled=false）时抛出。
 * download 接口不受此错误影响（见 PRD §4.3：已生成文件在有效期内仍可下载）。
 *
 * @see docs/PRD-数据导出授权管理.md §4.4 错误码与响应
 */
export class DataExportNotGrantedError extends AppError {
  constructor() {
    super('您暂未被授权使用数据导出功能，请联系管理员', 403, 'DATA_EXPORT_NOT_GRANTED');
    this.name = 'DataExportNotGrantedError';
  }
}

// Resource errors
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource} not found: ${id}` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

// Validation errors
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

// Upstream/relay errors
export class UpstreamError extends AppError {
  public readonly upstreamStatus?: number;

  constructor(message: string, upstreamStatus?: number, context?: Record<string, unknown>) {
    super(message, 502, 'UPSTREAM_ERROR', context);
    this.name = 'UpstreamError';
    this.upstreamStatus = upstreamStatus;
  }
}

// Rate limit errors
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

// Billing errors
export class InsufficientBalanceError extends AppError {
  constructor(currentBalance: string, requiredCost: string) {
    super(
      `余额不足：当前 ¥${Number(currentBalance || 0).toFixed(2)}，本次调用约需 ¥${Number(requiredCost || 0).toFixed(2)}，请充值后重试`,
      402,
      'INSUFFICIENT_BALANCE',
      { currentBalance, requiredCost },
    );
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * 预扣失败（余额不足）— P0-1 阈值旁路模式的预扣路径专用错误（402）
 *
 * 与 InsufficientBalanceError 的语义差异：后者用于"事后扣费"（deductBalance），
 * 前者用于"请求前冻结"（preConsume Lua 冻结失败）。二者都映射 HTTP 402；
 * 预扣失败发生在转发上游之前，因此不产生任何消费记录。
 *
 * @see coding-standards-control-logic.md §八 错误分层
 */
export class PreConsumeFailedError extends AppError {
  constructor(currentBalance?: string, requiredCost?: string) {
    super(
      '余额不足，请充值后重试',
      402,
      'PRE_CONSUME_FAILED',
      {
        currentBalance,
        requiredCost,
        guidance: '请前往「充值」页充值；新用户可领取体验金',
      },
    );
    this.name = 'PreConsumeFailedError';
  }
}

/**
 * 支付必需（模型消费缺额）— 兼容表面（/v1/*、/anthropic/v1/*）专用（D-01 裁决）
 *
 * D-01：兼容表面消费缺额的 `INSUFFICIENT_BALANCE`(402) 与平台资金操作的
 * `INSUFFICIENT_BALANCE`(422) 共用 code 名、HTTP 语义分裂。为两表面解耦，
 * 兼容表面消费缺额改用专属 code `PAYMENT_REQUIRED`(402)。对客户端的原生
 * `insufficient_balance` error.type 保持不变（兼容 OpenAI/Anthropic），
 * 仅平台日志/trace 的 code 用 `PAYMENT_REQUIRED`。
 *
 * @see docs/_draft-rulings-D01-D08-2026-09.md D-01
 */
export class PaymentRequiredError extends AppError {
  constructor(message = '余额不足，请充值后重试') {
    super(message, 402, 'PAYMENT_REQUIRED', { guidance: '请前往「充值」页充值' });
    this.name = 'PaymentRequiredError';
  }
}

// Circuit breaker errors
export class CircuitBreakerOpenError extends AppError {
  constructor(channelKey: string) {
    super(`Circuit breaker open for channel: ${channelKey}`, 503, 'CIRCUIT_BREAKER_OPEN');
    this.name = 'CircuitBreakerOpenError';
  }
}

// Idempotency errors
export class IdempotencyConflictError extends AppError {
  constructor(requestId: string, context?: Record<string, unknown>) {
    super(
      `Duplicate request with the same idempotency key: ${requestId}`,
      409,
      'IDEMPOTENCY_CONFLICT',
      { requestId, ...context },
    );
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * 幂等基础设施不可用（503 IDEMPOTENCY_UNAVAILABLE）
 *
 * 资金写操作（充值/人工上账/退款/调账等）依赖的 Redis 幂等锁不可用时抛出，
 * 禁止静默绕过（docs/05-api/idempotency.md §3 / errors.md §2.3，ADR-0009）。
 * 与模型消费链路的 degraded 降级语义相反：资金写操作必须 fail-closed，
 * 否则同一 Idempotency-Key 可能被并发重复入账。
 *
 * @see docs/05-api/errors.md §2.3 IDEMPOTENCY_UNAVAILABLE
 * @see docs/05-api/idempotency.md §3 行为语义
 */
export class IdempotencyUnavailableError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super('幂等服务暂时不可用，请稍后重试', 503, 'IDEMPOTENCY_UNAVAILABLE', context);
    this.name = 'IdempotencyUnavailableError';
  }
}

/**
 * Check if an error is an AppError
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Extract error info for logging
 */
export function errorInfo(err: unknown): { name: string; message: string; statusCode?: number; code?: string } {
  if (err instanceof AppError) {
    return { name: err.name, message: err.message, statusCode: err.statusCode, code: err.code };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { name: 'UnknownError', message: String(err) };
}
