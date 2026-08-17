/**
 * Pipeline 步骤共享存储 — 步骤间数据传递（P0-4）
 *
 * 网关路由把调用链改写为 pipeline steps（auth → idempotency → rate-limit →
 * pre-consume → route → proxy → settle）后，各步骤的输出需要被后续步骤/路由读取
 * （如 pre-consume 的结果要传给 settle）。本模块提供类型安全的存储读写：
 *
 *   - 写入：setStepResult(ctx, STEP_KEYS.preConsume, pre)
 *   - 读取：getStepResult<PreConsumeResult>(ctx, STEP_KEYS.preConsume)
 *   - 必读：requireStepResult<T>(ctx, STEP_KEYS.estimatedCost)（缺失即抛错，防顺序错乱）
 *
 * 存储载体为 PipelineContext.metadata（步骤间共享同一 ctx 实例，路由在 runPipeline
 * 前后都可读写）。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 */

import type { PipelineContext } from '../types';

/** 网关步骤共享存储键（必须在此登记，避免魔法字符串散落各路由） */
export const STEP_KEYS = {
  /** API Key 认证上下文（auth preHandler 注入，auth step 断言） */
  apiKeyContext: 'apiKeyContext',
  /** 幂等锁结果 { key, lockToken, status }（idempotency step 写入） */
  idempotency: 'idempotency',
  /** 校验后的请求对象（validate step 写入，路由自定义结构） */
  request: 'request',
  /** 估算输入 token 数（validate step 写入） */
  estimatedInputTokens: 'estimatedInputTokens',
  /** 模型定价（validate step 写入，供预扣/结算复用） */
  pricing: 'pricing',
  /** 预估费用（元，validate step 写入，pre-consume step 读取） */
  estimatedCost: 'estimatedCost',
  /** 余额快照（validate step 写入，pre-consume step 复用避免重复查询） */
  balance: 'balance',
  /** 预扣结果（pre-consume step 写入，settle step / 回滚读取） */
  preConsume: 'preConsume',
  /** 选中渠道（route step 写入；null = 无可用渠道 → mock 回退） */
  channel: 'channel',
  /** 上游 HTTP 响应（proxy step 写入） */
  upstreamResp: 'upstreamResp',
  /** 流式转发状态（proxy step 写入，settle step 读取） */
  streamState: 'streamState',
  /** 非流式解析后的上游响应体（proxy step 写入，settle step 读取） */
  parsedBody: 'parsedBody',
  /** mock 回退结果 { payload, content, usage, cost }（proxy step 写入） */
  mockResult: 'mockResult',
} as const;

export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];

/**
 * 写入步骤结果到共享存储
 *
 * @param ctx - 流水线上下文
 * @param key - 存储键（STEP_KEYS 登记）
 * @param value - 任意值
 */
export function setStepResult(ctx: PipelineContext, key: StepKey, value: unknown): void {
  ctx.metadata[key] = value;
}

/**
 * 读取步骤结果（可能不存在 → undefined）
 *
 * @param ctx - 流水线上下文
 * @param key - 存储键
 * @returns 步骤结果；未写入时 undefined
 */
export function getStepResult<T>(ctx: PipelineContext, key: StepKey): T | undefined {
  return ctx.metadata[key] as T | undefined;
}

/**
 * 必读步骤结果（缺失即抛错 — 捕获步骤顺序错乱）
 *
 * @param ctx - 流水线上下文
 * @param key - 存储键
 * @throws {Error} 步骤结果缺失（pipeline 步骤顺序错误）
 */
export function requireStepResult<T>(ctx: PipelineContext, key: StepKey): T {
  const v = ctx.metadata[key];
  if (v === undefined) {
    throw new Error(`[Pipeline] step result "${key}" missing — check step order`);
  }
  return v as T;
}
