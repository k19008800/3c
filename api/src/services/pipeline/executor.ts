import { PipelineContext, PipelineStep, PipelineResult } from './types';

/**
 * Execute a pipeline of steps with automatic rollback on failure.
 *
 * Order:
 * 1. Execute step[0] → step[1] → ... → step[N]
 * 2. If any step fails, rollback executed steps in reverse order
 * 3. Steps marked `noRollbackOn: true` are NOT rolled back
 */
export async function runPipeline<T extends unknown[]>(
  ctx: PipelineContext,
  steps: { [K in keyof T]: PipelineStep<T[K]> },
): Promise<PipelineResult<T>> {
  const results: unknown[] = [];
  const executedSteps: PipelineStep<unknown>[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    try {
      executedSteps.push(step);
      const result = await step.execute(ctx);
      results.push(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Rollback executed steps in reverse
      for (let j = executedSteps.length - 2; j >= 0; j--) {
        const rollbackStep = executedSteps[j]!;
        if (rollbackStep.noRollbackOn) continue;

        try {
          await rollbackStep.rollback?.(ctx);
        } catch (rollbackErr) {
          // Log rollback error but don't swallow the original error
          console.error(
            `[Pipeline] Rollback failed for step "${rollbackStep.name}":`,
            rollbackErr,
          );
        }
      }

      return {
        success: false,
        error,
        failedStep: step.name,
        results: results as Partial<T>,
      };
    }
  }

  return {
    success: true,
    results: results as T,
  };
}

/**
 * Create a pipeline step helper
 */
export function createStep<T>(
  name: string,
  execute: (ctx: PipelineContext) => Promise<T>,
  opts?: { rollback?: (ctx: PipelineContext) => Promise<void>; noRollbackOn?: boolean },
): PipelineStep<T> {
  return {
    name,
    execute,
    rollback: opts?.rollback,
    noRollbackOn: opts?.noRollbackOn,
  };
}
