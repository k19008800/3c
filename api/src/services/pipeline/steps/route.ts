/**
 * route step — 渠道选择（P0-4）
 *
 * 路由矩阵选择（P0 前已有 selectChannel）的 pipeline 接入：
 *   - 按 ctx.model 选择 supplier + key + 模型映射组合；
 *   - 分组供给过滤（supplier.allowed_groups × 调用方分组，传入 userId）；
 *   - 全部不可用 → null（由 proxy step 决定 mock 回退）。
 *
 * 无回滚：渠道选择不产生副作用（不冻结/不写库）。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 */

import { createStep } from '../executor';
import { selectChannel, type SelectedChannel } from '../../upstream/routing';
import { setStepResult, STEP_KEYS } from './context';

/**
 * 创建 route step
 *
 * @returns PipelineStep — 选择渠道（null = 无可用 → mock 回退）
 */
export function routeStep() {
  return createStep('route', async (ctx) => {
    const channel = await selectChannel(
      ctx.model,
      ctx.userId ? { userId: ctx.userId } : undefined,
    );
    setStepResult(ctx, STEP_KEYS.channel, channel);
    return channel;
  });
}
