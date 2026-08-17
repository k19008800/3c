/**
 * rate-limit step — 四级限流（P0-4）
 *
 * 四级限流（全局/用户组/Key/模型）由 Fastify preHandler `enforceRateLimitPreHandler`
 * 强制执行（P0-2，在路由 handler 之前完成，超限 → 429 直接拦截）。
 * 本 step 在 pipeline 链路中显式声明该环节（链路自文档化），不重复计数
 * （重复调用 enforceRateLimit 会造成双倍计数，破坏限流语义）。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-2 / P0-4
 */

import { createStep } from '../executor';

/**
 * 创建 rate-limit step
 *
 * @returns PipelineStep — 占位断言（实际限流在 preHandler 已执行）
 */
export function rateLimitStep() {
  return createStep('rate-limit', async () => {
    // 四级限流已在 preHandler 强制执行；此处仅声明链路环节。
    return true;
  });
}
