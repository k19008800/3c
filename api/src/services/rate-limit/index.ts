/**
 * 限流服务入口 — 四级限流（P0-2）统一导出
 *
 * - effective.ts：effective 生效值纯函数（min(例外 ?? 组默认 ?? 平台默认, 模型硬顶)）
 * - enforcer.ts：enforceRateLimit(ctx) 核心 + enforceRateLimitPreHandler Fastify 钩子
 *
 * @module services/rate-limit
 * @see docs/iteration-plan-v2.md P0-2 四级限流强制落地
 */

export * from './effective';
export * from './enforcer';
