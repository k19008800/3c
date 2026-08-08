/**
 * 限流步骤
 *
 * 职责：
 * - 调用 checkRateLimit 执行四级限流（全局/用户/Key/模型）
 * - 被限流 → throw 429
 * - rollback: 无（纯校验）
 *
 * @see services/rate-limiter.ts checkRateLimit
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { checkRateLimit, rateLimitError } from "../../rate-limiter";

/**
 * 创建限流 Pipeline 步骤
 *
 * execute: 调用 checkRateLimit → 被限流抛 error
 * noRollbackOn: true（限流是拒绝，不需要回滚）
 */
export function createRateLimitStep(): PipelineStep<GatewayContext> {
  return {
    name: "rate-limit",
    noRollbackOn: true,
    execute: async (ctx) => {
      const rl = await checkRateLimit({
        userId: ctx.userId,
        apiKeyId: ctx.apiKeyId,
        modelId: ctx.modelId,
      });
      if (rl.limited) {
        const errPayload = rateLimitError(rl);
        throw Object.assign(new Error(errPayload.error.message), {
          _httpStatus: 429,
          _code: "rate_limit_exceeded",
          _body: errPayload,
        });
      }
    },
  };
}
