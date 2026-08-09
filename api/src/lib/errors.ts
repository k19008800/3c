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
      `Insufficient balance: have ${currentBalance}, need ${requiredCost}`,
      402,
      'INSUFFICIENT_BALANCE',
      { currentBalance, requiredCost },
    );
    this.name = 'InsufficientBalanceError';
  }
}

// Circuit breaker errors
export class CircuitBreakerOpenError extends AppError {
  constructor(channelKey: string) {
    super(`Circuit breaker open for channel: ${channelKey}`, 503, 'CIRCUIT_BREAKER_OPEN');
    this.name = 'CircuitBreakerOpenError';
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
