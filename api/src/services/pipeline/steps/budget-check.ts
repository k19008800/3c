/**
 * budget-check step — 用户消费预算熔断（§20.1，migration 0042）
 *
 * 位置：validate（写入 estimatedCost）之后、pre-consume 之前。
 *   - 读 validate 写入的预估费用，调用 assertWithinBudget() 判定；
 *   - 超硬阻断 → 抛 BudgetLimitExceededError（429，转发上游前拒绝，不产生消费记录）；
 *   - 超告警阈值 → 放通（服务内部记日志）；
 *   - 预算未设置 / 检查依赖异常 → fail-open 放通（不阻断主链路）。
 *
 * 回滚语义：本 step 不写任何状态，无需 rollback；其后步骤失败时由已执行步骤
 * （如 idempotency）各自回滚。本 step 抛 429 时逆序回滚会释放幂等锁，允许用户重试。
 *
 * @module services/pipeline/steps
 * @see services/billing/budget.ts
 */

import { createStep } from '../executor.js';
import { requireStepResult, STEP_KEYS } from './context.js';
import { assertWithinBudget } from '../../billing/budget.js';

/**
 * 创建 budget-check step
 *
 * @returns PipelineStep — 预算超限 429；无副作用、无需回滚
 */
export function budgetCheckStep() {
  return createStep('budget-check', async (ctx) => {
    const estimatedCost = requireStepResult<number>(ctx, STEP_KEYS.estimatedCost);
    await assertWithinBudget(ctx.userId, estimatedCost);
  });
}
