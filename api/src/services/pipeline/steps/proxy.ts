/**
 * proxy step — 上游转发 + 请求级故障转移（P0-4 / Step4-P0）
 *
 * 上游代理（P0 前已有 streamRelay）的 pipeline 接入：
 *   - 按 route step 选中的渠道构造上游请求并 fetch；
 *   - 请求级故障转移：上游 5xx/429/网络错误时，在同一 supplier 的 Key 池内
 *     回退到下一个「未尝试、未熔断」的 key 重试（最多 2 次，合计最多 3 个 key）；
 *     不跨供应商（模型编码 M-S-04/05 把 model_code 锁定唯一 supplier）。
 *   - 不重试的情形：4xx（请求本身有问题，原样透传）、上游 401/403（平台侧
 *     上游 Key 无效 → 友好 502 UPSTREAM_AUTH_FAILED，不透传上游错误体）。
 *   - 流式：仅在拿到上游响应头后判定 4xx/5xx；一旦开始 streamRelay 写 chunk 即
 *     提交，不可回退（与旧实现边界一致）。
 *   - 非流式：读取并解析上游响应体（不发送 — 发送在 settle step，保证"结算失败能返回 402"）；
 *   - 无可用渠道（route step 返回 null）→ 走 mockFallback 回调（占位响应 + 记账，不调上游）。
 *
 * 计费语义：故障转移不重复预扣（预扣在 pre-consume 已冻结，结算时多退少补）；
 * 每轮换 key 都把当前 channel 写回共享存储，settle / gateway 日志据此记录「最终成功的 key」。
 *
 * 回滚：本 step 不注册 rollback（上游请求不可撤销）；失败时由前序步骤
 * （pre-consume 解冻 / idempotency 释放锁）的 rollback 兜底。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 * @see kb/3cloud/coding-standards-control-logic.md §四 上游调用：重试 + 熔断
 */

import { createStep } from '../executor.js';
import { AppError } from '../../../lib/errors.js';
import { streamRelay } from '../../upstream/proxy.js';
import { recordChannelResult } from '../../upstream/circuit-breaker.js';
import { classifyUpstreamError, UpstreamAuthError } from '../../upstream/errors.js';
import { selectFailoverChannel, type SelectedChannel } from '../../upstream/routing.js';
import type { PipelineContext } from '../types.js';
import {
  setStepResult,
  requireStepResult,
  STEP_KEYS,
} from './context.js';

/** 故障转移重试上限：初始 key 之外最多再回退 N 个 key（合计最多 N+1 个 key） */
const MAX_FAILOVER_RETRIES = 2;

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
  /** 构造上游请求（URL / headers / body；可异步，如多模态预处理落盘）。
   *  每次重试都会被再次调用 — 它应读取当前 STEP_KEYS.channel 以使用最新选中的 key 凭证。 */
  buildUpstreamRequest: (ctx: PipelineContext) => UpstreamRequest | Promise<UpstreamRequest>;
  /** mock 回退：无可用渠道时构造占位响应；缺省 → 无渠道时抛 502 */
  mockFallback?: (ctx: PipelineContext) => Promise<MockStepResult | null>;
  /** 上游失败回调（默认 recordChannelResult(false)）。每次失败的 key 都会触发。 */
  onUpstreamError?: (ctx: PipelineContext, channel: SelectedChannel, status: number) => Promise<void>;
}

/** 熔断/记账用的渠道唯一键（与 route step / settle 口径一致） */
function cbKeyOf(channel: SelectedChannel): string {
  return `supplier:${channel.supplier.id}:key:${channel.key.id}`;
}

/** 记录某个 key 的一次上游失败（尊重路由自定义 onUpstreamError，否则默认记熔断失败） */
async function recordUpstreamFailure(
  ctx: PipelineContext,
  channel: SelectedChannel,
  status: number,
  opts: ProxyStepOptions,
): Promise<void> {
  if (opts.onUpstreamError) {
    await opts.onUpstreamError(ctx, channel, status);
  } else {
    await recordChannelResult(cbKeyOf(channel), false).catch(() => { /* 熔断记录失败不阻断 */ });
  }
}

/**
 * 故障转移推进：仍有重试额度时取下一个「未尝试、未熔断」的 key；否则返回 null 终止循环。
 *
 * @param ctx - 流水线上下文（读取 model / userId）
 * @param triedKeyIds - 本次请求已尝试过的 key id 集合（会就地 add）
 * @param attempt - 当前已尝试次数（从 0 起）
 */
async function advanceFailover(
  ctx: PipelineContext,
  triedKeyIds: Set<number>,
  attempt: number,
): Promise<SelectedChannel | null> {
  if (attempt >= MAX_FAILOVER_RETRIES) return null;
  const routeOpts = ctx.userId ? { userId: ctx.userId } : undefined;
  return selectFailoverChannel(ctx.model, routeOpts, triedKeyIds);
}

/**
 * 创建 proxy step
 *
 * @param opts - 路由专属钩子（buildUpstreamRequest 必填；mockFallback 供 mock 回退路由使用）
 * @returns PipelineStep — 上游转发 + 请求级故障转移（流式 relay / 非流式读取；全部 key 失败抛 UpstreamPassthroughError）
 */
export function proxyStep(opts: ProxyStepOptions) {
  return createStep('proxy', async (ctx) => {
    const initialChannel = requireStepResult<SelectedChannel | null>(ctx, STEP_KEYS.channel);

    // ── 无可用渠道 → mock 回退（占位响应 + 记账，不调上游）──
    if (!initialChannel) {
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

    // ── 请求级故障转移循环（初始 key 之外最多再回退 MAX_FAILOVER_RETRIES 个）──
    const triedKeyIds = new Set<number>([initialChannel.key.id]);
    let currentChannel = initialChannel;
    let lastRetryable: { status: number; body: string } | null = null;

    for (let attempt = 0; ; attempt++) {
      // 每轮换 key 后写回共享存储：buildUpstreamRequest 据此构造 URL/凭证，
      // settle / gateway 日志也据此记录「最终成功的 key」。
      setStepResult(ctx, STEP_KEYS.channel, currentChannel);

      const { url, headers, body } = await opts.buildUpstreamRequest(ctx);

      // 网络错误 / 连接失败（fetch reject）→ 可重试故障
      let upstreamResp: Response;
      try {
        upstreamResp = await fetch(url, { method: 'POST', headers, body });
      } catch {
        await recordUpstreamFailure(ctx, currentChannel, 0, opts);
        lastRetryable = { status: 502, body: '' };
        const next = await advanceFailover(ctx, triedKeyIds, attempt);
        if (!next) break;
        console.warn(
          `[proxy] upstream network error on supplier=${currentChannel.supplier.id} key=${currentChannel.key.id}, ` +
          `failing over to key=${next.key.id} (attempt ${attempt + 1})`,
        );
        triedKeyIds.add(next.key.id);
        currentChannel = next;
        continue;
      }

      if (!upstreamResp.ok) {
        const status = upstreamResp.status || 502;
        let errorBody = '';
        try { errorBody = await upstreamResp.text(); } catch { /* ignore */ }

        const fault = classifyUpstreamError(status);

        // auth（401/403）：平台侧上游 Key 无效/无权限 → 友好 502，不透传、不回退。
        // R2-USER-DRILL-002：上游鉴权失败属平台配置问题，不在本请求内换 key 重试。
        if (fault === 'auth') {
          await recordUpstreamFailure(ctx, currentChannel, status, opts);
          throw new UpstreamAuthError(status);
        }

        // client（其余 4xx）：请求本身有问题（模型不存在/参数错误）→ 原样透传，不回退。
        if (fault === 'client') {
          await recordUpstreamFailure(ctx, currentChannel, status, opts);
          throw new UpstreamPassthroughError(status, errorBody);
        }

        // retryable（5xx/429）：记录失败并回退下一个 key
        await recordUpstreamFailure(ctx, currentChannel, status, opts);
        lastRetryable = { status, body: errorBody };
        const next = await advanceFailover(ctx, triedKeyIds, attempt);
        if (!next) break;
        console.warn(
          `[proxy] upstream ${status} on supplier=${currentChannel.supplier.id} key=${currentChannel.key.id}, ` +
          `failing over to key=${next.key.id} (attempt ${attempt + 1})`,
        );
        triedKeyIds.add(next.key.id);
        currentChannel = next;
        continue;
      }

      // ── 成功路径（upstreamResp.ok）──
      setStepResult(ctx, STEP_KEYS.upstreamResp, upstreamResp);

      if (ctx.stream) {
        // SSE 流式：一旦开始 relay 即提交，不可回退（4xx/5xx 在取响应体前已判定）
        const reply = ctx.reply;
        if (!reply) throw new Error('[Pipeline] stream request requires ctx.reply');
        const state = await streamRelay(ctx, reply, upstreamResp);
        setStepResult(ctx, STEP_KEYS.streamState, state);
        await recordChannelResult(cbKeyOf(currentChannel), true).catch(() => { /* 熔断记录失败不阻断 */ });
        return state;
      }

      // ── 非流式：只读取 + 解析（发送在 settle step，保证结算失败能返回 402）──
      const rawBody = await upstreamResp.text();
      let parsedBody: Record<string, unknown> = {};
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = { raw: rawBody }; }
      setStepResult(ctx, STEP_KEYS.parsedBody, parsedBody);
      return parsedBody;
    }

    // ── 所有候选 key 均已失败：透传最后一次可重试错误（5xx/429/网络）──
    // 预扣解冻 + 幂等锁释放由 pipeline 逆序回滚承担（本 step 不注册 rollback）。
    throw new UpstreamPassthroughError(lastRetryable?.status ?? 502, lastRetryable?.body ?? '');
  });
}
