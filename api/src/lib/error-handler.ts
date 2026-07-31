import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ErrorCodes } from "@3cloud/shared";

/**
 * 统一错误响应中间件
 * 对齐 docs/PRD-错误码规范.md：{ code, error, message, details?, requestId? }
 */
export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  const requestId = (req as any).id as string | undefined;

  // 校验错误（Fastify JSON Schema 校验失败）
  if (err.validation) {
    return reply.status(400).send({
      code: 400,
      error: ErrorCodes.BAD_REQUEST,
      message: "请求参数校验失败",
      details: err.validation,
      requestId,
    });
  }

  // 限流
  if ((err as any).statusCode === 429 || err.code === "FST_ERR_RATE_LIMIT") {
    return reply.status(429).send({
      code: 429,
      error: ErrorCodes.RATE_LIMITED,
      message: "请求过于频繁，请稍后再试",
      requestId,
    });
  }

  // 未认证
  if (err.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" || (err as any).statusCode === 401) {
    return reply.status(401).send({
      code: 401,
      error: ErrorCodes.UNAUTHORIZED,
      message: "未认证或凭证已失效",
      requestId,
    });
  }

  req.log.error({ err, requestId }, "request error");
  const statusCode = err.statusCode ?? 500;
  reply.status(statusCode).send({
    code: statusCode,
    error: statusCode >= 500 ? ErrorCodes.INTERNAL : err.message,
    message: statusCode >= 500 ? "服务器内部错误" : err.message,
    requestId,
  });
}
