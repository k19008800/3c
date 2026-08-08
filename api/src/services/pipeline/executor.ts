/**
 * Pipeline 主执行器（§1.1）
 * 顺序执行 step 数组，失败时逆序回滚已执行 step。
 */

import type { PipelineContext, PipelineResult, PipelineStep } from "./types";

/**
 * runPipeline() — 带回滚的顺序执行器
 *
 * 规则：
 * 1. 顺序执行 steps[0..N]
 * 2. 某 step 抛异常 → 逆序回滚 steps[i-1..0]（仅调用有 rollback 的 step）
 * 3. noRollbackOn=true 的 step 失败 → 不回滚前置步骤
 * 4. 回滚中某 step 的 rollback 抛异常 → 记录但不吞原错误
 */
export async function runPipeline<T extends PipelineContext = PipelineContext>(
  ctx: T,
  steps: PipelineStep<T>[],
): Promise<PipelineResult> {
  const executed: number[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    try {
      await step.execute(ctx);
      executed.push(i);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // 不回滚的情况
      if (step.noRollbackOn) {
        return { ok: false, failedStep: step.name, error };
      }

      // 逆序回滚
      const rollbackErrors: Error[] = [];
      for (let j = executed.length - 1; j >= 0; j--) {
        const rollbackStep = steps[executed[j]!]!;
        if (rollbackStep.rollback) {
          try {
            await rollbackStep.rollback(ctx);
          } catch (rbErr) {
            rollbackErrors.push(rbErr instanceof Error ? rbErr : new Error(String(rbErr)));
          }
        }
      }

      return {
        ok: false,
        failedStep: step.name,
        error,
        rollbackErrors: rollbackErrors.length > 0 ? rollbackErrors : undefined,
      };
    }
  }

  return { ok: true };
}
