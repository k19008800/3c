/**
 * idempotency step — 幂等守卫（P0-4）
 *
 * 三层幂等（P0-3）的 pipeline 接入：
 *   L1  Redis SETNX 锁：同 user-scoped 键立即去重；重复 → 抛 IdempotencyConflictError
 *       （路由 catch 回放首次结果，不重复扣费）；
 *   L2  consumption_records.request_id 唯一约束：DB 层兜底（重复 insert → 409）；
 *   L3  幂等命中返回首次处理结果（非流式缓存完整响应体 / 流式缓存 usage 摘要）。
 *
 * 指纹与用户隔离（幂等回放安全，KB 需求）：
 *   - fingerprint = buildRequestFingerprint({ userId, method, canonical path, canonical body })；
 *   - 锁/缓存 key 用 scopeIdempotencyKey(rawKey, userId) 命名空间到用户 → **跨用户同 key 不会碰撞**，
 *     用户 B 用与 A 相同的 Idempotency-Key 不会拿到 A 的首次响应（消除跨用户回放泄露）；
 *   - requestId（consumption_records.request_id）仍写原始幂等键，保持 L2 DB 口径不变；
 *   - fingerprint 随 IdempotencyConflictError 携带，路由传给 replayIdempotentRequest 做回放前校验，
 *     异摘要（同键异参数/异用户）→ 不回放、返回 'conflict' → 409 IDEMPOTENCY_CONFLICT。
 *
 * 回滚语义（关键）：
 *   - 本 step 获取到锁后，若后续步骤失败 → rollback 释放锁（允许客户端用同一键重试）；
 *   - 成功路径不释放锁（保留到 TTL，同键重复请求 → 回放而非重试）；
 *   - Redis 降级（lock.status='degraded'，锁未获取）→ rollback no-op。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-3 / P0-4
 */

import { createStep } from '../executor.js';
import {
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  buildRequestFingerprint,
  scopeIdempotencyKey,
  canonicalizePath,
} from '../../idempotency.js';
import { setStepResult, getStepResult, STEP_KEYS } from './context.js';

/** 幂等锁状态（写回共享存储，供路由/回滚读取） */
export interface IdempotencyStepResult {
  /** user-scoped 幂等键（scope 后的锁/缓存 key；回滚释放 / 路由 replayIdempotentRequest 用） */
  key: string;
  /** 原始幂等键（consumption_records.request_id；L2 DB 兜底查询口径） */
  requestId: string;
  /** 本次请求指纹（buildRequestFingerprint 输出；缓存写入 + 回放前校验用） */
  fingerprint: string;
  /** 获取到的锁 token；null = Redis 降级（无可释放锁） */
  lockToken: string | null;
  status: 'acquired' | 'degraded';
}

/** 幂等重复冲突（路由 catch 回放首次结果；携带指纹与 user-scoped key 供安全校验） */
export class IdempotencyConflictError extends Error {
  constructor(
    /** 原始幂等键（consumption_records.request_id） */
    public readonly requestId: string,
    /** user-scoped 幂等键（scope 后用于锁/缓存查询） */
    public readonly key: string,
    /** 当前请求是否流式 */
    public readonly isStream: boolean,
    /** 当前请求指纹（用于回放前比对拦截异摘要复用） */
    public readonly fingerprint: string,
  ) {
    super(`Duplicate request with the same idempotency key: ${requestId}`);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * 从请求上下文推导规范化路径（用于指纹分量）。
 *
 * 优先用 Fastify 路由模式（request.routeOptions.url，不含 query/动态参数），
 * 退化为 request.url（剥掉 query 后规范化）。
 *
 * @param ctx - 流水线上下文（含 request）
 * @returns 规范化路径
 */
function canonicalPathFromContext(ctx: {
  request?: { routeOptions?: { url?: string }; url?: string };
}): string {
  const raw = ctx.request?.routeOptions?.url ?? ctx.request?.url ?? '';
  // 复用服务的 canonicalizePath：剥 query、去空白、折叠斜杠、去首尾斜杠、小写
  return canonicalizePath(raw);
}

/**
 * 创建 idempotency step
 *
 * @param opts - { key: 原始幂等键（已由路由 resolveIdempotencyKey 解析）；isStream: 请求是否流式 }
 * @returns PipelineStep — 计算指纹 → 获取 user-scoped 幂等锁；重复 → 抛 IdempotencyConflictError；
 *   后续失败 → 回滚释放锁
 */
export function idempotencyStep(opts: { key: string; isStream: boolean }) {
  return createStep(
    'idempotency',
    async (ctx) => {
      // 身份由 auth step（先于本 step 执行）同步到 ctx.userId
      const userId = ctx.userId ?? 0;
      // 统一 request fingerprint：user identity + method + canonical path + canonical body
      const fingerprint = buildRequestFingerprint({
        userId,
        method: ctx.request?.method ?? 'POST',
        path: canonicalPathFromContext(ctx),
        body: ctx.body,
      });
      // user-scoped 幂等键：跨用户同原始键不碰撞（消除跨用户回放泄露）
      const scopedKey = scopeIdempotencyKey(opts.key, userId);

      const lock = await acquireIdempotencyLock(scopedKey);
      if (lock.status === 'duplicate') {
        throw new IdempotencyConflictError(opts.key, scopedKey, opts.isStream, fingerprint);
      }
      const result: IdempotencyStepResult = {
        key: scopedKey,
        requestId: opts.key,
        fingerprint,
        lockToken: lock.status === 'acquired' ? lock.token : null,
        status: lock.status === 'acquired' ? 'acquired' : 'degraded',
      };
      setStepResult(ctx, STEP_KEYS.idempotency, result);
      ctx.requestId = opts.key; // 原始幂等键即 requestId（consumption_records.request_id 口径，L2 DB 兜底才成立）
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