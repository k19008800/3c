/**
 * 幂等守卫步骤 — 基于 request_id 的请求去重
 *
 * 职责：
 * - 从 req.headers["x-request-id"] 获取 requestId
 * - 检查 Redis key `idempotency:{requestId}` 是否存在
 * - 命中缓存 → 设置 ctx.upstreamData / ctx._idempotencyHit → 抛出 IdempotencyHitError
 * - 未命中 → 设置 Redis key（TTL 24h）→ 继续后续步骤
 * - 回滚：删除 Redis 幂等 key（失败时清除，防止脏缓存）
 *
 * @see coding-standards-control-logic.md §三 三层幂等守卫
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { IdempotencyHitError } from "../types";
import { redis } from "../../../lib/redis";

/** 幂等缓存 TTL（秒）：24 小时 */
const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;

/**
 * 创建幂等守卫 Pipeline 步骤
 *
 * execute:
 *   1. 读取 x-request-id header
 *   2. 检查 Redis 缓存
 *   3. 命中 → 设置 upstreamData → 抛 IdempotencyHitError（提前终止，不标记失败）
 *   4. 未命中 → 设置缓存标记 → 继续
 *
 * rollback: 删除 Redis 幂等 key（ Pipeline 失败时清除已缓存标记）
 * noRollbackOn: true（IdempotencyHitError 不应触发回滚）
 *
 * @returns Pipeline 步骤对象
 */
export function createIdempotencyStep(): PipelineStep<GatewayContext> {
  return {
    name: "idempotency",
    noRollbackOn: true,
    execute: async (ctx) => {
      const requestId = (ctx.req.headers["x-request-id"] as string) || ctx.req.id;
      if (!requestId) return; // 无 requestId → 跳过幂等

      const cacheKey = `idempotency:${requestId}`;
      ctx._idempotencyCacheKey = cacheKey;

      // 检查缓存
      const cached = await redis.get(cacheKey);
      if (cached) {
        ctx._idempotencyHit = true;
        ctx.upstreamData = JSON.parse(cached);
        // 抛出专用错误终止 Pipeline，不视为失败
        throw new IdempotencyHitError();
      }

      // 预占位 key（值先为空，proxy step 完成后会更新为实际结果）
      await redis.setex(cacheKey, IDEMPOTENCY_TTL_SEC, JSON.stringify({ _pending: true }));
    },
    rollback: async (ctx) => {
      // 失败时清除幂等缓存（防止脏数据导致后续重试跳过）
      if (ctx._idempotencyCacheKey) {
        await redis.del(ctx._idempotencyCacheKey).catch(() => {});
      }
    },
  };
}
