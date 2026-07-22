import type { FastifyReply } from "fastify";
import { AppError } from "../../services/auth-service/index.js";
import { openaiError } from "./types.js";

/**
 * 统一代理错误处理
 * - AppError → 已知业务错误
 * - ZodError → 请求参数校验失败
 * - 其他 → 向上抛出，由 Fastify 全局错误处理兜底
 */
export function handleProxyError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppError) {
    reply.status(err.statusCode);
    return openaiError(err.statusCode, err.message, "invalid_request_error", err.code);
  }
  if ((err as any)?.name === "ZodError") {
    reply.status(400);
    return openaiError(
      400,
      (err as any).errors?.[0]?.message || "请求参数校验失败",
      "invalid_request_error",
      "invalid_params",
    );
  }
  throw err;
}
