/**
 * settle step — 响应后结算（P0-4）
 *
 * 记账扣费（P0-1 共享 settleBilling）的 pipeline 接入。各路由的结算实现
 * （mock 回退 / 流式 / 非流式三态）差异较大，由路由提供 `implement` 钩子
 * （行为等价优先，见 docs/iteration-plan-v2.md P0-4 测试要求"现有路由行为回归"）。
 *
 * 本模块统一提供：
 *   - settleStep(opts)：pipeline 步骤包装（统一步骤名 + 共享 ctx 传递）；
 *   - readPreConsume(ctx)：读取 pre-consume step 写回的预扣结果（结算 opts 复用）。
 *
 * 回滚语义（由 pre-consume / idempotency 步骤的 rollback 承担）：
 *   - 非流式结算失败（余额不足 402 等）→ 抛错 → pipeline 逆序回滚
 *     （pre-consume 解冻 + idempotency 释放锁）；
 *   - 流式结算失败（罕见竞态）→ 路由实现内部捕获（流已发出无法改状态码），
 *     手动解冻预扣 + 记日志，不抛错（保持锁以支持幂等回放）。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 */

import { createStep } from '../executor';
import type { PreConsumeResult } from '../../billing/pre-consume';
import type { PipelineContext } from '../types';
import { getStepResult, STEP_KEYS } from './context';

/** settle step 选项 */
export interface SettleStepOptions {
  /** 路由专属结算实现（mock / 流式 / 非流式三态，行为等价优先） */
  implement: (ctx: PipelineContext) => Promise<void>;
  /** 结算步骤名（默认 'settle'） */
  name?: string;
}

/**
 * 创建 settle step
 *
 * @param opts - 路由专属结算实现
 * @returns PipelineStep — 记账扣费（结算失败 → 前序步骤回滚）
 */
export function settleStep(opts: SettleStepOptions) {
  return createStep(opts.name ?? 'settle', async (ctx) => {
    await opts.implement(ctx);
  });
}

/**
 * 读取 pre-consume step 写回的预扣结果（传给 settleBilling 的 opts.preConsume）
 *
 * @param ctx - 流水线上下文
 * @returns 预扣结果；未预扣（旁路/未执行）→ null
 */
export function readPreConsume(ctx: PipelineContext): PreConsumeResult | null {
  return getStepResult<PreConsumeResult>(ctx, STEP_KEYS.preConsume) ?? null;
}
