/**
 * pre-consume step — 余额预扣冻结（P0-4）
 *
 * 阈值旁路预扣（P0-1）的 pipeline 接入：
 *   - 读取 validate step 写入的 estimatedCost / balance（避免重复查询）；
 *   - 调用共享 preConsume()：余额 > 阈值 → 旁路（零延迟）；否则 Redis Lua 冻结；
 *   - 余额不足 → 402（PreConsumeFailedError，不调上游）；
 *   - Redis/DB 故障 → fail-open 旁路（回归旧"事后扣费"行为）。
 *
 * 回滚语义（关键 — 本 step 是 pipeline 回滚机制的核心受益者）：
 *   - 冻结成功后，后续步骤失败（上游不可用/流式中断/非流式结算失败等）
 *     → rollback 解冻预扣（releasePreConsume，幂等，TTL 兜底自愈）；
 *   - 解冻失败有 TTL 兜底（冻结记录 30 分钟自动过期 + 清理任务自愈）。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-1 / P0-4
 */

import { createStep } from '../executor';
import { preConsume, releasePreConsume, type PreConsumeResult } from '../../billing/pre-consume';
import { getStepResult, setStepResult, requireStepResult, STEP_KEYS } from './context';

/**
 * 创建 pre-consume step
 *
 * @returns PipelineStep — 预扣冻结；后续失败 → 回滚解冻
 */
export function preConsumeStep() {
  return createStep(
    'pre-consume',
    async (ctx) => {
      const estimatedCost = requireStepResult<number>(ctx, STEP_KEYS.estimatedCost);
      const balance = getStepResult<{ availableBalance?: string | number | null }>(ctx, STEP_KEYS.balance);
      const pre = await preConsume(ctx, estimatedCost, { balance });
      setStepResult(ctx, STEP_KEYS.preConsume, pre);
      return pre;
    },
    {
      rollback: async (ctx) => {
        const pre = getStepResult<PreConsumeResult>(ctx, STEP_KEYS.preConsume);
        if (pre) {
          await releasePreConsume(ctx, pre).catch(() => {
            /* 解冻失败有 TTL 兜底 */
          });
        }
      },
    },
  );
}
