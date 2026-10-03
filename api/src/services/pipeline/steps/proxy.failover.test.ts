/**
 * proxy step 请求级故障转移单元测试（Step4-P0）
 *
 * 直接驱动 proxyStep 的 execute（不走完整 Fastify 链路），聚焦故障转移矩阵：
 *   - 首个 key 5xx → 自动回退第二个 key → 用户拿到正确响应；
 *   - 两个 key 都 5xx → 透传 502（不无限重试）；
 *   - 4xx（client）→ 不重试，原样透传；
 *   - 网络错误（fetch reject）→ 回退下一个 key 后成功；
 *   - 每次失败的 key 都记熔断失败；成功 key 写回共享存储（供 settle 记录）。
 *
 * 与 integration.test.ts 的关系：后者验证全链路回归（默认无下一个 key → 立即透传）；
 * 本文件验证故障转移循环本身的分支逻辑。
 *
 * @module services/pipeline/steps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Module mocks
// ============================================================
const mocks = vi.hoisted(() => ({
  recordChannelResult: vi.fn(),
  selectFailoverChannel: vi.fn(),
  streamRelay: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../../upstream/circuit-breaker.js', () => ({
  recordChannelResult: mocks.recordChannelResult,
}));
vi.mock('../../upstream/routing.js', () => ({
  selectFailoverChannel: mocks.selectFailoverChannel,
}));
vi.mock('../../upstream/proxy.js', () => ({
  streamRelay: mocks.streamRelay,
}));
// upstream/errors.js（classifyUpstreamError / UpstreamAuthError）与 lib/errors.js（AppError）
// 为纯逻辑，保持真实实现，不 mock。

import { proxyStep, UpstreamPassthroughError } from './proxy.js';
import { getStepResult, setStepResult, STEP_KEYS } from './context.js';
import type { PipelineContext } from '../types.js';
import type { SelectedChannel } from '../../upstream/routing.js';

// ============================================================
// Fixtures
// ============================================================

function makeChannel(keyId: number, keyValue: string): SelectedChannel {
  return {
    supplier: { id: 1, name: 'S', code: 's', baseUrl: 'https://up.test', status: 'active', healthStatus: null, allowedGroups: [] },
    key: { id: keyId, supplierId: 1, keyValue, name: `k${keyId}`, status: 'active', selectMode: 'single', priority: 1, currentBalance: null },
    modelMapping: { id: 3, supplierId: 1, modelName: 'm', platformModel: 'up-m', status: 'active' },
  };
}

function makeCtx(): PipelineContext {
  return {
    requestId: 'req-fo',
    userId: 1,
    apiKeyId: 1,
    model: 'deepseek-v3',
    body: {},
    stream: false,
    metadata: {},
  };
}

/** buildUpstreamRequest：按当前 STEP_KEYS.channel 的 key 凭证构造请求（便于断言用了哪个 key） */
function buildUpstreamRequest(c: PipelineContext) {
  const ch = getStepResult<SelectedChannel>(c, STEP_KEYS.channel)!;
  return {
    url: 'https://up.test/v1/chat/completions',
    headers: { Authorization: `Bearer ${ch.key.keyValue}` },
    body: '{}',
  };
}

const OK_BODY = JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });

// ============================================================
// Tests
// ============================================================

describe('proxy step 请求级故障转移', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordChannelResult.mockResolvedValue({ shouldBan: false });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('首个 key 5xx → 自动回退第二个 key → 用户拿到正确响应', async () => {
    const channel1 = makeChannel(7, 'sk-7');
    const channel2 = makeChannel(8, 'sk-8');

    // 下一个候选：第二次调用才返回 channel2（断言 tried 集合已含 key7）
    mocks.selectFailoverChannel.mockImplementation(async (_model, _opts, tried: ReadonlySet<number>) => {
      expect(tried.has(7)).toBe(true);
      return channel2;
    });

    // key7 → 502；key8 → 200
    mocks.fetch.mockImplementation((_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer sk-7') {
        return Promise.resolve(new Response('{"error":{"message":"upstream down"}}', { status: 502 }));
      }
      return Promise.resolve(new Response(OK_BODY, { status: 200 }));
    });

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.channel, channel1);

    const result = await proxyStep({ buildUpstreamRequest }).execute(ctx);

    // 用户拿到第二个 key 的成功响应
    expect(result).toEqual(JSON.parse(OK_BODY));
    // 共发起 2 次上游请求（key7 失败 + key8 成功）
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    // 故障转移只取了 1 次下一个候选（未超出重试额度）
    expect(mocks.selectFailoverChannel).toHaveBeenCalledTimes(1);
    // 失败的 key7 记熔断失败
    expect(mocks.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', false);
    // 成功 key 写回共享存储 → settle/gateway 日志记录的是 key8
    expect(getStepResult<SelectedChannel>(ctx, STEP_KEYS.channel)!.key.id).toBe(8);
  });

  it('两个 key 都 5xx → 透传 502（不无限重试）', async () => {
    const channel1 = makeChannel(7, 'sk-7');
    const channel2 = makeChannel(8, 'sk-8');

    // 第一次回退给 key8，第二次无更多候选
    mocks.selectFailoverChannel
      .mockResolvedValueOnce(channel2)
      .mockResolvedValueOnce(null);

    // 任意 key 都返回 502
    mocks.fetch.mockResolvedValue(new Response('{"error":{"message":"down"}}', { status: 502 }));

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.channel, channel1);

    const err = await proxyStep({ buildUpstreamRequest }).execute(ctx)
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(UpstreamPassthroughError);
    expect((err as UpstreamPassthroughError).statusCode).toBe(502);
    // 只用了 2 个 key（未尝试第 3 个），且 502 错误体被透传
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.selectFailoverChannel).toHaveBeenCalledTimes(2);
    expect(mocks.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', false);
    expect(mocks.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:8', false);
  });

  it('4xx（client 错误）→ 不重试，原样透传', async () => {
    const channel1 = makeChannel(7, 'sk-7');
    mocks.fetch.mockResolvedValue(new Response('{"error":{"message":"model not found"}}', { status: 404 }));

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.channel, channel1);

    const err = await proxyStep({ buildUpstreamRequest }).execute(ctx)
      .then(() => null, (e) => e);

    expect(err).toBeInstanceOf(UpstreamPassthroughError);
    expect((err as UpstreamPassthroughError).statusCode).toBe(404);
    // 没有尝试回退，只发了 1 次请求
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.selectFailoverChannel).not.toHaveBeenCalled();
  });

  it('网络错误（fetch reject）→ 回退下一个 key 后成功', async () => {
    const channel1 = makeChannel(7, 'sk-7');
    const channel2 = makeChannel(8, 'sk-8');
    mocks.selectFailoverChannel.mockResolvedValue(channel2);

    // key7 网络层失败；key8 成功
    mocks.fetch
      .mockRejectedValueOnce(new TypeError('fetch failed: ECONNREFUSED'))
      .mockResolvedValueOnce(new Response(OK_BODY, { status: 200 }));

    const ctx = makeCtx();
    setStepResult(ctx, STEP_KEYS.channel, channel1);

    const result = await proxyStep({ buildUpstreamRequest }).execute(ctx);

    expect(result).toEqual(JSON.parse(OK_BODY));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.recordChannelResult).toHaveBeenCalledWith('supplier:1:key:7', false);
    expect(getStepResult<SelectedChannel>(ctx, STEP_KEYS.channel)!.key.id).toBe(8);
  });
});
