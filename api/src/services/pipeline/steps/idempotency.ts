/**
 * idempotency step — 幂等守卫（P0-4）
 *
 * 三层幂等（P0-3）的 pipeline 接入：
 *   L1  Redis SETNX 锁：同 requestId 立即去重；重复 → 抛 IdempotencyConflictError
 *       （路由 catch 回放首次结果，不重复扣费）；
 *   L2  consumption_records.request_id 唯一约束：DB 层兜底（重复 insert → 409）；
 *   L3  幂等命中返回首次处理结果（非流式缓存完整响应体 / 流式缓存 usage 摘要）。
 *
 * 回滚语义（关键）：
 *   - 本 step 获取到锁后，若后续步骤失败 → rollback 释放锁（允许客户端用同一键重试）；
 *   - 成功路径不释放锁（保留到 TTL，同键重复请求 → 回放而非重试）；
 *   - Redis 降级（lock.status='degraded'，锁未获取）→ rollback no-op。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-3 / P0-4
 */

import { createStep } from '../executor';
import {
  acquireIdempotencyLock,
  releaseIdempotencyLock,
} from '../../idempotency';
import { setStepResult, getStepResult, STEP_KEYS } from './context';

/** 幂等锁状态（写回共享存储，供路由/回滚读取） */
export interface IdempotencyStepResult {
  key: string;
  /** 获取到的锁 token；null = Redis 降级（无可释放锁） */
  lockToken: string | null;
  status: 'acquired' | 'degraded';
}

/** 幂等重复冲突（路由 catch 回放首次结果） */
export class IdempotencyConflictError extends Error {
  constructor(
    public readonly key: string,
    public readonly isStream: boolean,
  ) {
    super(`Duplicate request with the same idempotency key: ${key}`);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * 创建 idempotency step
 *
 * @param opts - { key: 幂等键（已由路由 resolveIdempotencyKey 解析）；isStream: 请求是否流式 }
 * @returns PipelineStep — 获取幂等锁；重复 → 抛 IdempotencyConflictError；后续失败 → 回滚释放锁
 */
export function idempotencyStep(opts: { key: string; isStream: boolean }) {
  return createStep(
    'idempotency',
    async (ctx) => {
      const lock = await acquireIdempotencyLock(opts.key);
      if (lock.status === 'duplicate') {
        throw new IdempotencyConflictError(opts.key, opts.isStream);
      }
      const result: IdempotencyStepResult = {
        key: opts.key,
        lockToken: lock.status === 'acquired' ? lock.token : null,
        status: lock.status === 'acquired' ? 'acquired' : 'degraded',
      };
      setStepResult(ctx, STEP_KEYS.idempotency, result);
      ctx.requestId = opts.key; // 幂等键即 requestId（消费记录 / Redis 锁缓存同键，L2 DB 兜底才成立）
      return result;
    },
    {
      rollback: async (ctx) => {
        const idem = getStepResult<IdempotencyStepResult>(ctx, STEP_KEYS.idempotency);
        if (idem?.lockToken) {
          await releaseIdempotencyLock(idem.key, idem.lockToken).catch(() => {
            /* 释放失败不阻断 */
          });
        }
      },
    },
  );
}
