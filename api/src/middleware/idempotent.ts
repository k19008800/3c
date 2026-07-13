// ============================================================
//  3cloud (3C) — 幂等性中间件
//  读取 X-Idempotency-Key 请求头，使用 Redis 缓存已处理的
//  幂等 ID，防止兑换码等敏感接口重复提交。
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { getRedis } from "../redis.js";

/** 幂等 Key 前缀 */
const IDEMPOTENT_PREFIX = "idempotent:redemption";
const IDEMPOTENT_TTL = 86400; // 24 小时（秒）

/**
 * 从请求中获取幂等 ID。
 * - 如果请求头 X-Idempotency-Key 存在，直接使用
 * - 如果缺失，自动生成一个 UUID 并设置到 reply 头中（前端兼容）
 */
function resolveIdempotentKey(request: FastifyRequest, reply: FastifyReply): string {
  let key = request.headers["x-idempotency-key"] as string | undefined;

  if (!key) {
    key = randomUUID();
    // 将生成的幂等 ID 回写给前端，方便后续重试时使用
    void reply.header("X-Idempotency-Key", key);
  }

  return key;
}

/**
 * 幂等性守卫中间件。
 * 使用方式：在路由 preHandler 中作为第一道关卡。
 *
 * 行为：
 * 1. 解析幂等 ID（自动生成或取自请求头）
 * 2. 检查 Redis 缓存：若存在则直接返回上次的响应
 * 3. 在 request 上挂载 idempotentKey 和 cacheResponse 方法，
 *    供后续 handler 在成功时调用缓存写入
 */
export async function idempotentGuard(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // 跳过 CORS 预检
  if (request.method === "OPTIONS") return;

  const idempotentKey = resolveIdempotentKey(request, reply);
  const redis = getRedis();
  const cacheKey = `${IDEMPOTENT_PREFIX}:${idempotentKey}`;

  // ── 检查缓存 ──
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      const cachedResponse = JSON.parse(cached);
      // 恢复原始状态码和响应体
      return reply.status(cachedResponse.statusCode).send(cachedResponse.body);
    } catch {
      // 缓存数据异常，忽略并继续
      await redis.del(cacheKey);
    }
  }

  // ── 在 request 上挂载幂等上下文 ──
  (request as any).idempotentKey = idempotentKey;
  (request as any).cacheIdempotentResponse = async (statusCode: number, body: any) => {
    const payload = JSON.stringify({ statusCode, body });
    await redis.setex(cacheKey, IDEMPOTENT_TTL, payload);
  };
}
