// ============================================================
//  3cloud (3C) — 统一响应格式 & 全局错误处理
// ============================================================
import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

// ── 统一成功响应 ──
export interface ApiResponse<T = unknown> {
  ok: true;
  data: T;
  meta?: { total?: number; page?: number; pageSize?: number };
}

// ── 统一错误响应 ──
export interface ApiError {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
}

// ── 兼容旧格式 { code, data, message } 错误响应 ──
export interface LegacyErrorResponse {
  code: number;
  data: null;
  message: string;
  details?: unknown;
}

// ── 业务异常类 ──
export class AppError extends Error {
  statusCode: number;
  code: string;
  details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ── 常用快捷错误 ──
export const Errors = {
  badRequest: (msg = "请求参数无效", details?: unknown) =>
    new AppError(400, "BAD_REQUEST", msg, details),
  unauthorized: (msg = "未登录或登录已过期") =>
    new AppError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "权限不足") =>
    new AppError(403, "FORBIDDEN", msg),
  notFound: (msg = "资源不存在") =>
    new AppError(404, "NOT_FOUND", msg),
  conflict: (msg = "资源冲突") =>
    new AppError(409, "CONFLICT", msg),
  tooManyRequests: (msg = "请求过于频繁") =>
    new AppError(429, "TOO_MANY_REQUESTS", msg),
  internal: (msg = "服务器内部错误", details?: unknown) =>
    new AppError(500, "INTERNAL_ERROR", msg, details),
};

// ── 统一分页响应格式（兼容旧 { code:0 } 格式）──
export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 成功响应封装 ──
export function ok<T>(reply: FastifyReply, data: T, meta?: ApiResponse<T>["meta"]) {
  const body: ApiResponse<T> = { ok: true, data };
  if (meta) body.meta = meta;
  return reply.send(body);
}

export function okCreated<T>(reply: FastifyReply, data: T) {
  return reply.code(201).send({ ok: true, data } as ApiResponse<T>);
}

export function okNoContent(reply: FastifyReply) {
  return reply.code(204).send();
}

/** 分页成功响应 */
export function okPaginated<T>(reply: FastifyReply, data: PaginatedResult<T>) {
  return reply.send({
    code: 0,
    data: data.list,
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    message: "ok",
  });
}

/** 简单成功响应（兼容旧 { code:0 } 格式，用于渐进迁移）*/
export function success<T>(reply: FastifyReply, data: T, message = "ok") {
  return reply.send({ code: 0, data, message });
}

/** 带总数的成功响应 */
export function successWithTotal<T>(reply: FastifyReply, data: T, total: number, message = "ok") {
  return reply.send({ code: 0, data, total, message });
}

/** 简单错误响应 */
export function fail(reply: FastifyReply, statusCode: number, message: string, code = 1) {
  return reply.status(statusCode).send({ code, data: null, message });
}

// ── ZodError 格式化工具：提取可读的错误消息 ──
function formatZodError(err: ZodError): string {
  const msgs = err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(根对象)";
    return `${path}: ${issue.message}`;
  });
  return msgs.join("; ");
}

// ── 全局错误处理注册 ──
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // ── ZodError：数据校验失败 ──
    if (error instanceof ZodError) {
      const msg = formatZodError(error);
      request.log.warn({ err: error }, "[ZodError] 数据校验失败");
      return reply.status(400).send({
        code: 400,
        data: null,
        message: msg || "请求参数校验失败",
      } satisfies LegacyErrorResponse);
    }

    // Fastify 内置验证错误
    if ("validation" in error && error.validation) {
      const msg = error.validation.map((v: any) => v.message ?? `${v.keyword} error`).join("; ");
      return reply.status(400).send({
        ok: false,
        code: "VALIDATION_ERROR",
        message: msg || "请求参数校验失败",
        details: error.validation,
      } satisfies ApiError);
    }

    // Fastify 自带 404
    if ("statusCode" in error && error.statusCode === 404) {
      return reply.status(404).send({
        ok: false,
        code: "NOT_FOUND",
        message: `路由 ${request.method} ${request.url} 不存在`,
      } satisfies ApiError);
    }

    // Fastify 限流 (429)
    if ("statusCode" in error && error.statusCode === 429) {
      return reply.status(429).send({
        ok: false,
        code: "TOO_MANY_REQUESTS",
        message: error.message || "请求过于频繁，请稍后再试",
      } satisfies ApiError);
    }

    // 业务异常
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      } satisfies ApiError);
    }

    // 未知错误——统一降级为 500，不暴露内部细节
    request.log.error({ err: error }, "Unhandled error");
    const isDev = process.env.NODE_ENV === "development";
    return reply.status(500).send({
      code: 500,
      data: null,
      message: "服务器内部错误",
      ...(isDev ? { details: error.message, stack: error.stack } : {}),
    } satisfies LegacyErrorResponse);
  });
}
