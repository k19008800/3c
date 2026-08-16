/**
 * WebSocket 流式转发核心服务 — relayWebSocket
 *
 * 职责（对齐 newapi-migration-guide.md §2.1 relayWebSocket）：
 * - parseFirstMessage：解析客户端 WS 首条消息（OpenAI 兼容格式，含 model/messages/stream）
 * - relayWebSocket：鉴权之后（由 routes/ws.ts 完成）的完整转发编排：
 *   余额预检（0 → 402）→ selectChannel（null → mock 回退占位响应）
 *   → 方案 A（上游 WS 双向透传） / 方案 B（上游 HTTP + SSE → WS 帧包装，推荐）
 *   → 流式结算（determineStreamBilling → settleBilling）
 * - 心跳：每 30s ping，空闲 60s 断开；WS 断开时若未结算则按已收 chunk 结算
 *
 * relayStreamToSocket 说明：
 * 这是 proxy.ts streamRelay 的 WS 输出变体 —— 复用同一个 parseSSELines 解析器，
 * usage / finish_reason / delta.content 累积语义与 streamRelay 完全一致；
 * 差异在于输出目标是 WS socket（每帧 socket.send）而非 FastifyReply.raw，
 * 且 state 可中途捕获（支持客户端断开时按已收 chunk 结算）。
 *
 * 依赖注入：relayWebSocket 接受 deps 覆盖默认实现（socket / 上游客户端 / fetch /
 * 定时器 / selectChannel / getBalance / settleBilling 均可 mock），便于纯单测。
 *
 * @see newapi-migration-guide.md §2.1
 * @see routes/chat.ts 计费链路参照（余额预检 → 选路 → 转发 → 结算）
 * @module services/upstream
 */

import { randomUUID } from 'crypto';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import { AppError } from '../../lib/errors';
import type { PipelineContext } from '../pipeline/types';
import { selectChannel, type SelectedChannel } from './routing';
import { recordChannelResult } from './circuit-breaker';
import { parseSSELines } from './sse-parser';
import type { StreamState } from './proxy';
import { determineStreamBilling, type StreamBillingResult } from '../billing/settle-stream';
import { getBalance, deductBalance } from '../billing/balance';
import { recordConsumption } from '../billing/consumption-log';
import { generateCommissionForConsumption } from '../agent/commission';
import { countTokens } from '../billing/token-counter';

// ============================================================
// 常量
// ============================================================

/** 心跳间隔：每 30s 发一次 ping */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
/** 空闲超时：60s 无任何收发活动则断开 */
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
/** 默认单价（¥ / 1K tokens）——取不到 vendor_pricing 时兜底（与 chat.ts 一致） */
const DEFAULT_INPUT_PRICE = 0.002;
const DEFAULT_OUTPUT_PRICE = 0.008;
/** ws.WebSocket readyState 常量（OPEN） */
const WS_OPEN = 1;

// ============================================================
// Types
// ============================================================

/** 客户端 WS socket 抽象（@fastify/websocket 的 socket 即 ws.WebSocket，天然满足） */
export interface WsClientSocket {
  /** 向客户端发送一帧（字符串/Buffer/二进制） */
  send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
  /** 关闭连接（code/reason 为 ws 标准参数） */
  close(code?: number, reason?: string): void;
  /** 协议层 ping（可选；缺失时退化为 JSON ping 帧） */
  ping?(data?: unknown): void;
  /** ws readyState：0 CONNECTING / 1 OPEN / 2 CLOSING / 3 CLOSED */
  readyState: number;
  /** 事件监听（message/close/error...） */
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
  removeListener?(event: string, listener: (...args: any[]) => void): unknown;
}

/** 上游 WS 客户端抽象（方案 A 使用） */
export interface UpstreamSocket {
  send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  on(event: 'open' | 'message' | 'close' | 'error', listener: (...args: any[]) => void): unknown;
}

/** 客户端 WS 首条消息（OpenAI 兼容请求体） */
export interface RelayFirstMessage {
  model: string;
  messages: Array<{ role: string; content: string | unknown[]; name?: string }>;
  stream?: boolean;
  /** 首条消息内携带的 API Key（query ?api_key= 缺失时的兜底鉴权） */
  apiKey?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stop?: string | string[];
  user?: string;
  [key: string]: unknown;
}

/** 注入的定时器集合（可 mock 断言） */
export interface WsTimers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

/** 结算入参（cost 由 relay 按定价计算后填充） */
export interface WsSettleArgs {
  ctx: PipelineContext;
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 结算金额（¥，元），由 relay 按定价计算 */
  cost: number;
  /** 命中渠道（mock 回退时为 null） */
  channel: SelectedChannel | null;
  /** 是否流式 */
  streamed: boolean;
  /** 是否采信上游 usage */
  trustUpstream: boolean;
  /** 是否使用本地 fallback */
  fallback: boolean;
  finishReason?: string;
  errorCode?: string;
}

export type WsSettleFn = (args: WsSettleArgs) => Promise<void>;

/** relayWebSocket 可注入依赖（默认实现见 defaultWsRelayDeps） */
export interface WsRelayDeps {
  /** 余额查询（余额预检用） */
  getBalance: (userId: number) => Promise<{ availableBalance?: string | number | null }>;
  /** 渠道选择 */
  selectChannel: (model: string) => Promise<SelectedChannel | null>;
  /** 流式结算决策（默认用真实 determineStreamBilling） */
  determineStreamBilling: (
    state: StreamState,
    isAbnormalEnd: boolean,
    estimatedInputTokens: number,
    model?: string,
  ) => StreamBillingResult;
  /** 结算（记账 + 扣费 + 佣金 + key 最后调用时间） */
  settleBilling: WsSettleFn;
  /** 模型定价（默认查 vendor_pricing，失败走默认价） */
  getPricingForModel: (model: string) => Promise<{ input: number; output: number }>;
  /** HTTP 转发用（默认全局 fetch） */
  fetchImpl: typeof fetch;
  /** 方案 A 上游 WS 连接工厂（默认 Node 22+ 内置 WebSocket） */
  connectUpstreamWs: (url: string, headers?: Record<string, string>) => UpstreamSocket;
  /** 由渠道推导上游 WS 地址（默认 http(s) → ws(s) 并补 /v1/ws 路径） */
  buildUpstreamWsUrl: (channel: SelectedChannel) => string;
  /** 定时器（可 mock 断言心跳） */
  timers: WsTimers;
  /** 当前时间戳（可 mock） */
  now: () => number;
  /** 转发模式：auto（baseUrl 为 ws(s):// → 方案 A，否则方案 B）/ 强制 ws / 强制 http */
  mode: 'auto' | 'ws' | 'http';
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  /** 渠道熔断记录 */
  recordChannelResult: (channelKey: string, success: boolean) => Promise<unknown>;
}

/** relayWebSocket 返回结果 */
export interface WsRelayResult {
  /** 是否已完成结算（客户端中途断开且无已收数据时为 false 场景：见 error） */
  settled: boolean;
  /** 采用的中继模式 */
  mode?: 'ws' | 'http' | 'mock';
  error?: { code: number; message: string; type?: string };
}

export interface WsRelayOptions {
  socket: WsClientSocket;
  rawFirstMessage: string;
  /** 鉴权上下文（由路由层解析 query/首条消息 API Key 后填充） */
  ctx: { userId: number; apiKeyId: number; keyHash: string };
  deps?: Partial<WsRelayDeps>;
}

/** 方案 B 中 SSE → WS 帧转发的结果 */
export interface WsStreamRelayResult {
  /** 是否收到 data: [DONE] 结束标记 */
  sawDone: boolean;
  /** 是否异常中断（上游断开 / 客户端断开 / 读取错误） */
  abnormal: boolean;
}

// ============================================================
// 错误帧 / 解析 / 计费工具
// ============================================================

/**
 * 构造 WS 内错误消息帧（不 401 HTTP，WS 内返回 error JSON）
 *
 * @param code - 业务错误码（402 余额不足 / 401 鉴权失败 / 502 上游不可用等）
 * @param message - 用户可见错误消息
 * @param type - OpenAI 兼容错误类型
 * @returns 可直接 socket.send 的 JSON 字符串
 */
export function wsErrorFrame(code: number, message: string, type = 'upstream_error'): string {
  return JSON.stringify({ error: { message, type, code } });
}

function toWsError(err: unknown, fallbackCode: number, fallbackType: string): { code: number; message: string; type: string } {
  if (err instanceof AppError) {
    return { code: err.statusCode, message: err.message, type: err.code.toLowerCase() };
  }
  return { code: fallbackCode, message: err instanceof Error ? err.message : String(err), type: fallbackType };
}

/**
 * 解析客户端 WS 首条消息（OpenAI 兼容 JSON）
 *
 * 提取 model / messages / stream 等字段；非法 JSON 或缺 model / 空 messages → 抛 AppError(400)。
 *
 * @param raw - 首条消息原始字符串
 * @returns 解析后的首条消息对象
 * @throws {AppError} 400 INVALID_REQUEST — 非法 JSON / 缺 model / messages 为空
 */
export function parseFirstMessage(raw: string): RelayFirstMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('First message must be a valid JSON object', 400, 'INVALID_REQUEST');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('First message must be a JSON object', 400, 'INVALID_REQUEST');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.model !== 'string' || !obj.model) {
    throw new AppError('"model" is required', 400, 'INVALID_REQUEST');
  }
  if (!Array.isArray(obj.messages) || obj.messages.length === 0) {
    throw new AppError('"messages" is required and must be a non-empty array', 400, 'INVALID_REQUEST');
  }

  return obj as unknown as RelayFirstMessage;
}

/** 预估输入 token（镜像 chat.ts estimateInputTokens） */
function estimateInputTokens(messages: RelayFirstMessage['messages'], model: string): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += countTokens(msg.content, model);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === 'string') {
          total += countTokens(part, model);
        } else if (part && typeof part === 'object') {
          total += countTokens(JSON.stringify(part), model);
        }
      }
    }
  }
  total += messages.length * 4;
  return total;
}

/** 构造上游请求体（镜像 chat.ts buildUpstreamBody，stream 默认 true） */
function buildUpstreamBody(req: RelayFirstMessage, platformModel: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: platformModel,
    messages: req.messages,
    stream: req.stream ?? true,
  };
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.n !== undefined) body.n = req.n;
  if (req.stop !== undefined) body.stop = req.stop;
  if (req.user !== undefined) body.user = req.user;
  return body;
}

/** 查找模型定价（vendor_pricing × supplier_models），无则默认（镜像 chat.ts） */
async function getPricingForModel(model: string): Promise<{ input: number; output: number }> {
  try {
    const rows = await db.select({
      inputPrice: schema.vendorPricing.inputPrice,
      outputPrice: schema.vendorPricing.outputPrice,
    })
      .from(schema.vendorPricing)
      .innerJoin(schema.supplierModels, eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id))
      .where(eq(schema.supplierModels.modelName, model))
      .limit(1);

    if (rows.length > 0 && rows[0]) {
      const input = Number(rows[0].inputPrice);
      const output = Number(rows[0].outputPrice);
      if (!isNaN(input) && !isNaN(output) && input > 0 && output > 0) {
        return { input, output };
      }
    }
  } catch {
    /* 定价查询失败 → 走默认价 */
  }
  return { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
}

/** 按 token 数 + 单价计算费用（¥，元；镜像 chat.ts computeCost） */
function computeCost(model: string, inputTokens: number, outputTokens: number, pricing?: { input: number; output: number }): number {
  const p = pricing ?? { input: DEFAULT_INPUT_PRICE, output: DEFAULT_OUTPUT_PRICE };
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

/** mock 回退：无可用供应商时返回占位 completion（镜像 chat.ts buildMockCompletion） */
function buildMockCompletion(model: string, messages: RelayFirstMessage['messages'], inputTokens: number) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = typeof lastUser?.content === 'string' ? lastUser.content.slice(0, 120) : '（无用户消息）';
  const content = `[3cloud 模拟响应] 已收到请求（模型 ${model}）。当前环境未配置可用的供应商 Key，返回占位响应以演示完整计费链路。\n> ${prompt}\n\n配置真实供应商后即可返回模型真实输出。`;
  const outputTokens = countTokens(content, model);
  return {
    content,
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
  };
}

// ============================================================
// 结算（复用 chat.ts settleBilling 的同一服务链）
// ============================================================

/**
 * 结算 — 记账 + 扣费 + 佣金 + 更新 key 最后调用时间
 *
 * 与 chat.ts 的 settleBilling 使用同一服务链（deductBalance / recordConsumption /
 * generateCommissionForConsumption / apiKeys.lastUsedAt），保证 WS 转发与 HTTP 转发计费口径一致。
 *
 * @param args - 结算入参（见 WsSettleArgs）
 */
export async function settleWsBilling(args: WsSettleArgs): Promise<void> {
  const { ctx, promptTokens, completionTokens, cost, channel } = args;

  await deductBalance(ctx.userId, cost.toFixed(8), 'consumption', ctx.requestId);

  const record = await recordConsumption({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    model: ctx.model,
    supplierId: channel?.supplier.id,
    supplierModelId: channel?.modelMapping.id,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cost: cost.toFixed(8),
    trustUpstream: args.trustUpstream,
    fallback: args.fallback,
    streamed: args.streamed,
    finishReason: args.finishReason,
    errorCode: args.errorCode,
    requestId: ctx.requestId,
  });

  // 实时佣金结算（异步，不阻塞转发）；幂等由唯一索引保证，进程崩溃由回填调度器自愈
  if (record?.id) {
    void generateCommissionForConsumption({
      userId: ctx.userId,
      consumptionRecordId: record.id,
      cost: cost.toFixed(8),
    }).catch((e) => {
      console.error(`[ws-relay] commission generation failed for consumption ${record.id}:`, e);
    });
  }

  // 更新 key 最后调用时间（非致命）
  if (ctx.apiKeyId) {
    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, ctx.apiKeyId))
      .catch(() => { /* 非致命 */ });
  }
}

// ============================================================
// SSE → WS 帧转发（方案 B）
// ============================================================

/** 解析一帧 SSE data 负载并累积到 state（与 streamRelay 的累积语义一致） */
function accumulateSseChunk(state: StreamState, data: string): void {
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    state.totalChunks++;

    const deltaContent = parsed.choices?.[0]?.delta?.content;
    if (typeof deltaContent === 'string') {
      state.generatedText += deltaContent;
    }

    // 只有 finish_reason 非空的帧，其 usage 才是最终值
    const finishReason = parsed.choices?.[0]?.finish_reason;
    if (finishReason) {
      state.finishReason = finishReason;
      if (parsed.usage) {
        state.lastValidUsage = {
          prompt_tokens: Number(parsed.usage.prompt_tokens) || 0,
          completion_tokens: Number(parsed.usage.completion_tokens) || 0,
          total_tokens: Number(parsed.usage.total_tokens) || 0,
        };
      }
    }
  } catch {
    // 非 JSON data 行 → 跳过解析（原样已转发）
  }
}

/**
 * 方案 B：把上游 SSE 流逐帧包装为 WS 消息推回客户端
 *
 * 与 proxy.ts streamRelay 同源（复用 parseSSELines），差异：
 * - 输出目标是 WS socket（每帧 sendFrame），而非 FastifyReply.raw
 * - state 由调用方持有并原地累积 → 客户端断开时可"按已收 chunk 结算"
 *
 * @param state - 流式状态（原地累积 usage / generatedText / finishReason / totalChunks）
 * @param upstreamResp - 上游 HTTP 响应
 * @param sendFrame - 向客户端发送一帧
 * @param isClosed - 客户端是否已断开（断开时停止读取）
 * @returns 是否收到 [DONE] 与是否异常中断
 */
export async function relayStreamToSocket(
  state: StreamState,
  upstreamResp: Response,
  sendFrame: (chunk: string) => void,
  isClosed: () => boolean,
): Promise<WsStreamRelayResult> {
  let sawDone = false;
  let abnormal = false;

  if (!upstreamResp.body) {
    return { sawDone: false, abnormal: true };
  }

  const reader = upstreamResp.body.getReader();
  const decoder = new TextDecoder();
  const bufferRef = { value: '' };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (isClosed()) {
        abnormal = true;
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      parseSSELines(bufferRef, chunk, (line, isData) => {
        if (isClosed()) {
          abnormal = true;
          return;
        }
        if (!isData) {
          // 非 data: 行 → 原样包装转发
          sendFrame(`${line}\n`);
          return;
        }
        if (line === '[DONE]') {
          sawDone = true;
          sendFrame('data: [DONE]\n\n');
          return;
        }
        // data: {...} → 累积 usage/文本后转发
        accumulateSseChunk(state, line);
        sendFrame(`data: ${line}\n`);
      });
    }
  } catch {
    // 上游中断（连接断开/读取错误）：state 保留已累积数据，由外层按异常结算
    abnormal = true;
  }

  return { sawDone, abnormal };
}

// ============================================================
// 方案 A：上游 WS 双向透传
// ============================================================

/**
 * 由渠道推导上游 WS 地址
 *
 * - baseUrl 已是 ws:// 或 wss:// → 原样使用
 * - http(s):// → 转成 ws(s):// 并补默认路径 /v1/ws
 *
 * @param channel - 选中的渠道
 * @returns 上游 WS URL
 */
export function buildUpstreamWsUrl(channel: SelectedChannel): string {
  const base = channel.supplier.baseUrl ?? '';
  if (/^wss?:\/\//i.test(base)) return base;
  return `${base.replace(/^http/i, 'ws').replace(/\/+$/, '')}/v1/ws`;
}

/** Node 22+ 全局 WebSocket（undici 实现）的最小结构描述 */
interface NodeBuiltinWebSocket {
  readyState: number;
  send(data: unknown): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: string, listener: (ev: unknown) => void): void;
}

/** 默认上游 WS 连接工厂：Node 22+ 内置 WebSocket（undici，浏览器风格事件 API → 适配 on()） */
function connectNodeWebSocket(url: string): UpstreamSocket {
  const NodeWebSocket = (globalThis as { WebSocket?: new (url: string) => NodeBuiltinWebSocket }).WebSocket;
  if (!NodeWebSocket) {
    throw new Error('WebSocket global not available (Node 22+ required for upstream ws relay)');
  }
  const ws = new NodeWebSocket(url);
  return {
    send: (data) => ws.send(data),
    close: (code, reason) => ws.close(code, reason),
    readyState: ws.readyState,
    on: (event, listener) => {
      if (event === 'open') ws.addEventListener('open', () => listener());
      else if (event === 'message') ws.addEventListener('message', (ev) => listener((ev as { data?: unknown })?.data));
      else if (event === 'close') ws.addEventListener('close', (ev) => listener((ev as { code?: number })?.code, (ev as { reason?: string })?.reason));
      else if (event === 'error') ws.addEventListener('error', (ev) => listener(ev));
      return ws;
    },
  };
}

/** 解析一帧上游 WS 文本消息并累积到 state（usage / delta.content，语义同 SSE 累积） */
function accumulateWsMessage(state: StreamState, text: string): void {
  // 与 SSE 累积同一实现：内部对非 JSON 帧静默跳过
  accumulateSseChunk(state, text);
}

/** 转发模式决策：auto 时按渠道 baseUrl 是否为 ws(s):// 判断 */
function resolveRelayMode(mode: 'auto' | 'ws' | 'http', channel: SelectedChannel): 'ws' | 'http' {
  if (mode !== 'auto') return mode;
  return /^wss?:\/\//i.test(channel.supplier.baseUrl ?? '') ? 'ws' : 'http';
}

// ============================================================
// 默认依赖
// ============================================================

const defaultTimers: WsTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** relayWebSocket 默认依赖（测试可整体覆盖） */
export const defaultWsRelayDeps: WsRelayDeps = {
  getBalance,
  selectChannel,
  determineStreamBilling,
  settleBilling: settleWsBilling,
  getPricingForModel,
  fetchImpl: fetch,
  connectUpstreamWs: connectNodeWebSocket,
  buildUpstreamWsUrl,
  timers: defaultTimers,
  now: () => Date.now(),
  mode: 'auto',
  heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
  recordChannelResult,
};

// ============================================================
// relayWebSocket 主编排
// ============================================================

/**
 * WebSocket 流式转发主编排（鉴权完成后调用）
 *
 * 流程：
 *   1. parseFirstMessage 解析首条消息（失败 → 400 错误帧 + 关闭）
 *   2. 余额预检（≤ 0 → 402 错误帧 + 关闭，不浪费上游调用）
 *   3. selectChannel 选路（null → mock 回退占位响应 + 结算）
 *   4. 启动心跳（每 30s ping，空闲 60s 断开）
 *   5. 按模式转发：
 *      方案 A（上游 WS）：connectUpstreamWs → 双向透传 → 断开时结算
 *      方案 B（上游 HTTP）：fetch POST → relayStreamToSocket 把 SSE 帧包装为 WS 消息 → 结算
 *   6. 结算：determineStreamBilling → settleBilling；WS 断开时若未结算则按已收 chunk 结算
 *
 * 依赖注入：deps 覆盖默认实现，socket/上游客户端/fetch/定时器均可 mock。
 *
 * @param opts - 转发选项（socket + 首条消息 + 鉴权上下文 + 可注入依赖）
 * @returns 转发结果（是否已结算 + 模式 + 错误信息）
 *
 * @example
 * ```ts
 * const result = await relayWebSocket({ socket, rawFirstMessage, ctx: { userId, apiKeyId, keyHash } });
 * ```
 */
export async function relayWebSocket(opts: WsRelayOptions): Promise<WsRelayResult> {
  const deps: WsRelayDeps = { ...defaultWsRelayDeps, ...opts.deps };
  const { socket } = opts;
  const now = deps.now;

  // ── 1. 解析首条消息 ──
  let first: RelayFirstMessage;
  try {
    first = parseFirstMessage(opts.rawFirstMessage);
  } catch (err) {
    const e = toWsError(err, 400, 'invalid_request_error');
    socket.send(wsErrorFrame(e.code, e.message, e.type));
    socket.close(4000, 'invalid_request');
    return { settled: false, error: e };
  }

  const ctx: PipelineContext = {
    requestId: randomUUID(),
    userId: opts.ctx.userId,
    apiKeyId: opts.ctx.apiKeyId,
    model: first.model,
    body: first as unknown as Record<string, unknown>,
    stream: first.stream ?? true,
    metadata: {},
  };

  const estimatedInputTokens = estimateInputTokens(first.messages, first.model);

  // ── 转发期共享状态 ──
  let closed = false;              // 客户端 socket 是否已断开
  let settled = false;             // 是否已发起结算（幂等）
  let settleTask: Promise<void> | null = null;
  let heartbeatId: unknown = null;
  let channelRef: SelectedChannel | null = null;
  let lastActivityAt = now();      // 最近一次收发活动时间（心跳空闲判定）
  let pricingCache: { input: number; output: number } | null = null;
  // 上游请求已发出且流结果未定（客户端此时断开 → 按已收 chunk 结算）。
  // 仅在此为 true 时，客户端断开才触发结算 —— 402/502/上游 5xx 等失败路径不结算（无消费）。
  let awaitingStream = false;
  const state: StreamState = { lastValidUsage: null, generatedText: '', finishReason: null, totalChunks: 0 };

  const isClosed = () => closed;

  const sendFrame = (chunk: string) => {
    if (closed) return;
    lastActivityAt = now();
    socket.send(chunk);
  };

  const endFrame = () => sendFrame('data: [DONE]\n\n');

  const sendError = (code: number, message: string, type = 'upstream_error') => {
    sendFrame(wsErrorFrame(code, message, type));
  };

  const cleanup = () => {
    if (heartbeatId !== null) {
      deps.timers.clearInterval(heartbeatId);
      heartbeatId = null;
    }
  };

  const finishClose = (code: number, reason: string) => {
    cleanup();
    if (!closed) socket.close(code, reason);
  };

  // 定价（懒加载 + 缓存，避免每次结算都查库）
  const getPricing = async (): Promise<{ input: number; output: number }> => {
    if (!pricingCache) pricingCache = await deps.getPricingForModel(first.model);
    return pricingCache;
  };

  // 结算（幂等：只执行一次；cost 由 relay 按定价计算后传给注入的 settleBilling）
  const settleWith = (args: Omit<WsSettleArgs, 'ctx' | 'channel' | 'cost'>): Promise<void> => {
    if (settleTask) return settleTask;
    settled = true;
    settleTask = (async () => {
      const pricing = await getPricing();
      const cost = computeCost(first.model, args.promptTokens, args.completionTokens, pricing);
      await deps.settleBilling({ ...args, ctx, channel: channelRef, cost });
    })().catch((err) => {
      // 记账失败仅记录（WS 已开始，无法改状态码；余额不足属罕见竞态）
      console.error(`[ws-relay] settle failed for ${ctx.requestId}:`, err);
    });
    return settleTask;
  };

  // 按当前已收 chunk 结算（异常结束 / 客户端断开时使用）
  const settleFromState = (abnormal: boolean, extra?: Partial<Pick<WsSettleArgs, 'finishReason' | 'errorCode'>>): Promise<void> => {
    if (settleTask) return settleTask;
    const billing = deps.determineStreamBilling(state, abnormal, estimatedInputTokens, first.model);
    return settleWith({
      promptTokens: billing.promptTokens,
      completionTokens: billing.completionTokens,
      streamed: true,
      trustUpstream: billing.trustUpstream,
      fallback: billing.fallback,
      finishReason: state.finishReason ?? undefined,
      ...extra,
    });
  };

  // ── 2. 客户端断开兜底：上游流未定 → 未结算则按已收 chunk 结算 ──
  const onClientClose = () => {
    closed = true;
    cleanup();
    if (awaitingStream && !settled) {
      void settleFromState(true, { errorCode: 'client_closed' });
    }
  };
  socket.on('close', onClientClose);

  // ── 3. 余额预检（0 余额直接 402，不浪费上游调用）──
  let balance: { availableBalance?: string | number | null } | null = null;
  try {
    balance = await deps.getBalance(opts.ctx.userId);
  } catch (err) {
    sendError(500, 'balance check failed');
    finishClose(4000, 'internal_error');
    return { settled: false, error: { code: 500, message: 'balance check failed' } };
  }
  if (Number(balance?.availableBalance ?? 0) <= 0) {
    sendError(402, '余额不足，请充值', 'insufficient_balance');
    finishClose(4000, 'insufficient_balance');
    return { settled: false, error: { code: 402, message: '余额不足，请充值', type: 'insufficient_balance' } };
  }

  // ── 4. selectChannel（无可用 → mock 回退）──
  try {
    channelRef = await deps.selectChannel(first.model);
  } catch (err) {
    sendError(502, 'channel selection failed');
    finishClose(4000, 'channel_unavailable');
    return { settled: false, error: { code: 502, message: 'channel selection failed' } };
  }
  const channel = channelRef;

  // ── 5. 心跳：每 30s ping，空闲 60s 断开（转发阶段才启动）──
  heartbeatId = deps.timers.setInterval(() => {
    if (closed) return;
    if (now() - lastActivityAt >= deps.idleTimeoutMs) {
      // 空闲超时：未结算则按已收 chunk 结算后断开
      if (!settled) void settleFromState(true, { errorCode: 'idle_timeout' });
      socket.close(4001, 'idle timeout');
      return;
    }
    if (typeof socket.ping === 'function') socket.ping();
    else sendFrame(JSON.stringify({ type: 'ping', ts: now() }));
  }, deps.heartbeatIntervalMs);

  // ── 6. mock 回退路径（无可用渠道）──
  if (!channel) {
    const mock = buildMockCompletion(first.model, first.messages, estimatedInputTokens);
    sendFrame(JSON.stringify({
      id: `chatcmpl-${ctx.requestId}`,
      object: 'chat.completion',
      created: Math.floor(now() / 1000),
      model: first.model,
      choices: [{ index: 0, message: { role: 'assistant', content: mock.content }, finish_reason: 'stop' }],
      usage: mock.usage,
      mock: true,
    }));
    endFrame();
    await settleWith({
      promptTokens: mock.usage.prompt_tokens,
      completionTokens: mock.usage.completion_tokens,
      streamed: false,
      trustUpstream: false,
      fallback: true,
      finishReason: 'stop',
    });
    finishClose(1000, 'done');
    return { settled: true, mode: 'mock' };
  }

  // ── 7. 按模式转发 ──
  const mode = resolveRelayMode(deps.mode, channel);

  // ══ 方案 A：上游 WS 双向透传 ══
  async function relayViaUpstreamWs(ch: SelectedChannel): Promise<WsRelayResult> {
    const wsUrl = deps.buildUpstreamWsUrl(ch);
    const headers = { Authorization: `Bearer ${ch.key.keyValue}` };

    let upstream: UpstreamSocket;
    try {
      upstream = deps.connectUpstreamWs(wsUrl, headers);
    } catch (err) {
      sendError(502, 'upstream ws connect failed');
      finishClose(4000, 'upstream_unavailable');
      return { settled: false, mode: 'ws', error: { code: 502, message: 'upstream ws connect failed' } };
    }
    awaitingStream = true; // 上游 WS 已建立（此后客户端断开 → 按已收 chunk 结算）

    const sendToUpstream = (data: string) => {
      if (upstream.readyState === WS_OPEN) upstream.send(data);
    };

    // 首条消息 → 上游（OpenAI realtime 风格：首帧即请求体）
    if (upstream.readyState === WS_OPEN) sendToUpstream(JSON.stringify(first));
    else upstream.on('open', () => sendToUpstream(JSON.stringify(first)));

    // 上游 → 客户端：原样透传 + 累积 usage/文本
    upstream.on('message', (data: unknown) => {
      if (closed) return;
      const text = typeof data === 'string' ? data : String(data);
      accumulateWsMessage(state, text);
      lastActivityAt = now();
      sendFrame(text);
    });

    // 上游错误 → 按异常结算并断开
    upstream.on('error', async () => {
      await deps.recordChannelResult(`supplier:${ch.supplier.id}:key:${ch.key.id}`, false).catch(() => {});
      if (closed) return;
      if (!settled) {
        endFrame();
        await settleFromState(true, { errorCode: 'upstream_error' });
        finishClose(4000, 'upstream_error');
      }
    });

    // 上游断开 → 客户端收到结束消息 + 结算
    upstream.on('close', async () => {
      if (closed) return;
      await deps.recordChannelResult(`supplier:${ch.supplier.id}:key:${ch.key.id}`, true).catch(() => {});
      const abnormal = !state.finishReason;
      if (!closed) endFrame();
      if (!settled) await settleFromState(abnormal);
      finishClose(1000, 'done');
    });

    // 客户端后续消息 → 双向透传上游
    const onClientMessage = (data: unknown) => {
      lastActivityAt = now();
      const text = typeof data === 'string' ? data : String(data);
      sendToUpstream(text);
    };
    socket.on('message', onClientMessage);

    // 客户端断开 → 关闭上游连接
    socket.on('close', () => {
      try {
        upstream.close(1000, 'client_closed');
      } catch { /* 上游可能已关闭 */ }
    });

    return { settled, mode: 'ws' };
  }

  if (mode === 'ws') {
    return relayViaUpstreamWs(channel);
  }

  // ══ 方案 B：上游 HTTP + SSE → WS 帧包装（推荐实现）══
  const upstreamUrl = `${channel.supplier.baseUrl}/v1/chat/completions`;
  const upstreamBody = buildUpstreamBody(first, channel.modelMapping.platformModel);
  const cbKey = `supplier:${channel.supplier.id}:key:${channel.key.id}`;

  let upstreamResp: Response;
  awaitingStream = true; // 上游请求已发出（此后客户端断开 → 按已收 chunk 结算）
  try {
    upstreamResp = await deps.fetchImpl(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.key.keyValue}`,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    awaitingStream = false; // 上游请求失败（未产生任何消费）→ 不结算
    await deps.recordChannelResult(cbKey, false).catch(() => {});
    sendError(502, 'upstream request failed');
    finishClose(4000, 'upstream_unavailable');
    return { settled: false, mode: 'http', error: { code: 502, message: 'upstream request failed' } };
  }

  if (!upstreamResp.ok) {
    awaitingStream = false; // 上游明确失败（5xx）→ 不结算
    await deps.recordChannelResult(cbKey, false).catch(() => {});
    const status = upstreamResp.status || 502;
    sendError(status, `upstream error: ${status}`);
    finishClose(4000, 'upstream_error');
    return { settled: false, mode: 'http', error: { code: status, message: `upstream error: ${status}` } };
  }

  const relayResult = await relayStreamToSocket(state, upstreamResp, sendFrame, isClosed);
  await deps.recordChannelResult(cbKey, !relayResult.abnormal).catch(() => {});

  const abnormal = relayResult.abnormal || !relayResult.sawDone;
  if (!closed && !relayResult.sawDone) endFrame(); // 上游断开（无 [DONE]）→ 补发结束消息
  await settleFromState(abnormal);
  finishClose(1000, 'done');
  return { settled: true, mode: 'http' };
}
