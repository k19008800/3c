/**
 * proxy step — 上游转发（P0-4）
 *
 * 上游代理（P0 前已有 streamRelay）的 pipeline 接入：
 *   - 按 route step 选中的渠道构造上游请求并 fetch；
 *   - 上游 4xx/5xx → 记熔断失败 + 抛 UpstreamPassthroughError（携带上游状态码/错误体，
 *     路由 catch 原样透传，与旧实现"透传上游错误体"行为等价）；
 *   - 流式 → streamRelay 逐 chunk 转发并累积 usage，记熔断成功，写回 StreamState；
 *   - 非流式 → 读取并解析上游响应体（不发送 — 发送在 settle step，保证"结算失败能返回 402"）；
 *   - 无可用渠道（route step 返回 null）→ 走 mockFallback 回调（占位响应 + 记账，不调上游）。
 *
 * 回滚：本 step 不注册 rollback（上游请求不可撤销）；失败时由前序步骤
 * （pre-consume 解冻 / idempotency 释放锁）的 rollback 兜底。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 */

import { createStep } from '../executor';
import { AppError } from '../../../lib/errors';
import { streamRelay } from '../../upstream/proxy';
import { recordChannelResult } from '../../upstream/circuit-breaker';
import type { SelectedChannel } from '../../upstream/routing';
import type { PipelineContext } from '../types';
import {
  getStepResult,
  setStepResult,
  requireStepResult,
  STEP_KEYS,
} from './context';

/** 上游错误（透传上游状态码 + 错误体；路由 catch 原样转发，行为与旧实现等价） */
export class UpstreamPassthroughError extends AppError {
  public readonly upstreamBody: string;

  constructor(upstreamStatus: number, upstreamBody: string) {
    super(
      `Upstream error: ${upstreamStatus}`,
      upstreamStatus || 502,
      'UPSTREAM_ERROR',
      { upstreamStatus, upstreamBody: upstreamBody.slice(0, 20000) },
    );
    this.name = 'UpstreamPassthroughError';
    this.upstreamBody = upstreamBody;
  }
}

/** 上游请求构造结果 */
export interface UpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** mock 回退结果（proxy step 写回共享存储，settle step 读取结算） */
export interface MockStepResult {
  /** 回放给客户端的完整响应体（OpenAI 兼容或路由自定义格式） */
  payload: Record<string, unknown>;
  /** 占位文本内容（对话留痕用） */
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/** proxy step 选项 */
export interface ProxyStepOptions {
  /** 构造上游请求（URL / headers / body；可异步，如多模态预处理落盘） */
  buildUpstreamRequest: (ctx: PipelineContext) => UpstreamRequest | Promise<UpstreamRequest>;
  /** mock 回退：无可用渠道时构造占位响应；缺省 → 无渠道时抛 502 */
  mockFallback?: (ctx: PipelineContext) => Promise<MockStepResult | null>;
  /** 上游失败回调（默认 recordChannelResult(false)） */
  onUpstreamError?: (ctx: PipelineContext, channel: SelectedChannel, status: number) => Promise<void>;
}

/**
 * 创建 proxy step
 *
 * @param opts - 路由专属钩子（buildUpstreamRequest 必填；mockFallback 供 mock 回退路由使用）
 * @returns PipelineStep — 上游转发（流式 relay / 非流式读取）；失败抛 UpstreamPassthroughError
 */
export function proxyStep(opts: ProxyStepOptions) {
  return createStep('proxy', async (ctx) => {
    const channel = requireStepResult<SelectedChannel | null>(ctx, STEP_KEYS.channel);

    // ── 无可用渠道 → mock 回退（占位响应 + 记账，不调上游）──
    if (!channel) {
      if (!opts.mockFallback) {
        throw new AppError('No available channel for model', 502, 'NO_AVAILABLE_CHANNEL');
      }
      const mock = await opts.mockFallback(ctx);
      if (mock) {
        setStepResult(ctx, STEP_KEYS.mockResult, mock);
        return mock;
      }
      throw new AppError('No available channel for model', 502, 'NO_AVAILABLE_CHANNEL');
    }

    const { url, headers, body } = await opts.buildUpstreamRequest(ctx);
    const upstreamResp = await fetch(url, { method: 'POST', headers, body });
    const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

    if (!upstreamResp.ok) {
      if (opts.onUpstreamError) {
        await opts.onUpstreamError(ctx, channel, upstreamResp.status);
      } else {
        await recordChannelResult(cbKey, false).catch(() => { /* 熔断记录失败不阻断 */ });
      }
      let errorBody = '';
      try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }
      throw new UpstreamPassthroughError(upstreamResp.status || 502, errorBody);
    }

    setStepResult(ctx, STEP_KEYS.upstreamResp, upstreamResp);

    if (ctx.stream) {
      // ── SSE 流式：逐 chunk 转发 + 累积 usage，结束后记熔断成功 ──
      const reply = ctx.reply;
      if (!reply) throw new Error('[Pipeline] stream request requires ctx.reply');
      const state = await streamRelay(ctx, reply, upstreamResp);
      setStepResult(ctx, STEP_KEYS.streamState, state);
      await recordChannelResult(cbKey, true).catch(() => { /* 熔断记录失败不阻断 */ });
      return state;
    }

    // ── 非流式：只读取 + 解析（发送在 settle step，保证结算失败能返回 402）──
    const rawBody = await upstreamResp.text();
    let parsedBody: Record<string, unknown> = {};
    try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
    setStepResult(ctx, STEP_KEYS.parsedBody, parsedBody);
    return parsedBody;
  });
}
