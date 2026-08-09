import { describe, it, expect } from 'vitest';
import { runPipeline, createStep } from '../src/services/pipeline';
import type { PipelineContext } from '../src/services/pipeline';

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    requestId: 'test-req-1',
    userId: 1,
    apiKeyId: 1,
    model: 'deepseek-v3',
    body: { messages: [{ role: 'user', content: 'hello' }] },
    stream: false,
    metadata: {},
    ...overrides,
  };
}

describe('Pipeline Executor', () => {
  it('3 steps execute in order, all success', async () => {
    const order: string[] = [];
    const ctx = makeCtx();

    const result = await runPipeline(ctx, [
      createStep('auth', async () => { order.push('auth'); return { authenticated: true }; }),
      createStep('rate-check', async () => { order.push('rate-check'); return { allowed: true }; }),
      createStep('proxy', async () => { order.push('proxy'); return { status: 200 }; }),
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.results[0]).toEqual({ authenticated: true });
      expect(result.results[1]).toEqual({ allowed: true });
      expect(result.results[2]).toEqual({ status: 200 });
    }
    expect(order).toEqual(['auth', 'rate-check', 'proxy']);
  });

  it('2nd step fails → 1st step rollback called', async () => {
    const rollbacks: string[] = [];
    const ctx = makeCtx();

    const result = await runPipeline(ctx, [
      createStep('auth',
        async () => ({ authenticated: true }),
        { rollback: async () => { rollbacks.push('auth-rollback'); } },
      ),
      createStep('rate-check', async () => { throw new Error('rate limit exceeded'); }),
      createStep('proxy', async () => ({ status: 200 })),
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('rate limit exceeded');
      expect(result.failedStep).toBe('rate-check');
    }
    expect(rollbacks).toEqual(['auth-rollback']);
  });

  it('noRollbackOn step failure → does not trigger rollback', async () => {
    const rollbacks: string[] = [];
    const ctx = makeCtx();

    const result = await runPipeline(ctx, [
      createStep('auth',
        async () => ({ authenticated: true }),
        { rollback: async () => { rollbacks.push('auth-rollback'); }, noRollbackOn: true },
      ),
      createStep('rate-check', async () => { throw new Error('rate limit'); }),
    ]);

    expect(result.success).toBe(false);
    // noRollbackOn means auth rollback is NOT called
    expect(rollbacks).toEqual([]);
  });

  it('rollback throws → original error not swallowed', async () => {
    const ctx = makeCtx();

    const result = await runPipeline(ctx, [
      createStep('step1',
        async () => 'ok',
        { rollback: async () => { throw new Error('rollback failed'); } },
      ),
      createStep('step2', async () => { throw new Error('step2 error'); }),
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      // Original error persists, not rollback error
      expect(result.error.message).toBe('step2 error');
      expect(result.failedStep).toBe('step2');
    }
  });
});
