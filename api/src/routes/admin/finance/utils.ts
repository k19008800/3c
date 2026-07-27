// ============================================================
//  财务路由通用工具函数
// ============================================================

import { FastifyReply, FastifyRequest } from "fastify";
import { AuthenticatedRequest } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

/** 统一成功响应 */
export function sendSuccess<T>(reply: FastifyReply, data: T, message = "ok") {
  reply.status(200).send({ code: 0, data, message });
}

/** 统一 AppError 处理 */
export function handleAppError(reply: FastifyReply, err: AppError) {
  reply.status(err.statusCode).send({
    code: err.statusCode,
    data: null,
    message: err.message,
  });
}

/** 统一错误处理，支持 ZodError */
export function handleRouteError(reply: FastifyReply, err: any): boolean {
  if (err instanceof AppError) {
    handleAppError(reply, err);
    return true;
  }
  if (err?.name === "ZodError") {
    reply.status(400).send({
      code: 400,
      data: null,
      message: err.errors?.[0]?.message || "参数校验失败",
    });
    return true;
  }
  // 不处理则抛给外层
  return false;
}

/** 获取当前操作用户 ID */
export function getOperatorId(request: FastifyRequest): number {
  return (request as any).user?.userId ?? 0;
}

/** 安全解析页码 */
export function parsePage(query: any, key = "page", fallback = 1): number {
  return Math.max(1, parseInt(query[key] ?? String(fallback), 10) || fallback);
}

/** 安全解析每页条数 */
export function parsePageSize(query: any, key = "pageSize", fallback = 20, max = 100): number {
  return Math.min(max, Math.max(1, parseInt(query[key] ?? String(fallback), 10) || fallback));
}
