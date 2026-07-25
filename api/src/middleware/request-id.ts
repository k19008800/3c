// ============================================================
//  3cloud (3C) — 请求ID追踪中间件
//  为每个请求生成唯一X-Request-ID，便于分布式追踪
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "crypto";

// 声明Fastify请求的扩展
declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

// 生成请求ID（格式：req_时间戳_随机8字符）
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString("hex").slice(0, 8);
  return `req_${timestamp}_${random}`;
}

// 请求ID中间件
export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 从请求头获取或生成新的请求ID
  const requestId = request.headers["x-request-id"] as string || generateRequestId();
  
  // 存储到请求对象
  request.requestId = requestId;
  
  // 设置响应头
  reply.header("X-Request-ID", requestId);
  
  // 将请求ID添加到日志上下文（使用 child logger）
  // 注意：不要重新赋值 request.log，会破坏 Pino 内部结构
  // request.log = Object.assign({}, originalLog, { requestId });
  
  // 记录请求开始（包含请求ID）
  request.log.info({
    url: request.url,
    method: request.method,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
    requestId,
  }, "incoming request");
}

// 注册中间件到Fastify应用
export function registerRequestIdMiddleware(app: FastifyInstance) {
  // 在最早的阶段注册（在其他中间件之前）
  app.addHook("onRequest", requestIdMiddleware);
  
  // 装饰请求对象
  app.decorateRequest("requestId", "");
  
  app.log.info("[Middleware] Request ID tracking enabled");
}

// 工具函数：获取当前请求的日志器（包含请求ID）
export function getRequestLogger(request: FastifyRequest) {
  return request.log;
}

// 工具函数：创建子请求ID（用于嵌套操作）
export function createSubRequestId(parentRequestId: string): string {
  const subId = randomBytes(2).toString("hex").slice(0, 4);
  return `${parentRequestId}_${subId}`;
}