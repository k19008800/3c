/**
 * 幂等守卫服务 — request_id 三层去重（P0-3）
 *
 * 三层架构（见 coding-standards-control-logic.md §三）：
 *   L1: Redis SETNX（同 request_id 立即去重，带 TTL）→ 命中直接回放
 *   L2: consumption_records.request_id 唯一约束（DB 层兜底已存在，无需 migration）
 *   L3: 幂等命中返回首次处理结果、不重复扣费
 *
 * 幂等键来源：优先 Idempotency-Key 请求头；无则用服务端生成的 requestId
 * （路由层已把 pipelineCtx.requestId 统一为幂等键，保证 consumption_records.request_id
 *   与 Redis 锁/缓存使用同一把键，L2 兜底才成立）。
 *
 * 幂等命中响应策略（docs/iteration-plan-v2.md P0-3）：
 *   - 非流式：缓存首次响应 JSON（TTL 24h），命中直接回放 + X-Idempotent-Replay: true
 *   - 流式：无法回放完整 SSE，命中时返回首次 usage/cost 摘要 + X-Idempotent-Replay: true
 *   - Redis 缓存失效（崩溃/重启）→ 查 consumption_records 兜底（补偿写回缓存）→ 回放摘要
 *   - Redis 不可用 → 降级放行（acquire 返回 degraded），由 DB 唯一约束兜底，冲突转 409
 *
 * 所有 Redis 操作均走 lib/redis.ts 的降级语义：Redis 不可用/异常时返回 null/false
 * 或静默跳过，绝不因缓存故障阻断主链路。
 *
 * @see coding-standards-control-logic.md §三 三层幂等守卫
 * @see docs/iteration-plan-v2.md P0-3 幂等守卫
 * @see lib/redis.ts 降级语义
 * @module services/idempotency
 */

import crypto from 'crypto';
import type { FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { cacheGet, cacheSet, getRedis } from '../lib/redis';

// ============================================================
// 常量
// ============================================================

/** 幂等去重窗口（秒）：与响应缓存 TTL 一致，覆盖最大重试窗口（P0-3：TTL 如 24h） */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Redis key 前缀：幂等锁（L1 立即去重，键 = idem:{幂等键}） */
export const IDEMPOTENCY_LOCK_KEY_PREFIX = 'idem:';
/** Redis key 前缀：首次响应缓存（键 = idem:resp:{幂等键}） */
export const IDEMPOTENCY_RESP_KEY_PREFIX = 'idem:resp:';

/** consumption_records.request_id 为 varchar(100)，超长截断避免 DB 报错 */
const MAX_REQUEST_ID_LENGTH = 100;

/**
 * 释放锁的 Lua 脚本：仅当锁值等于调用方持有的 token 时才删除。
 *
 * 防止误删竞态：请求 A 处理失败释放锁的瞬间，请求 B 已重新 SETNX 成功，
 * 若无值校验 A 的 DEL 会误删 B 的锁，导致第三个请求绕过幂等。
 */
const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

// ============================================================
// 类型
// ============================================================

/**
 * 幂等锁获取结果（三态）：
 * - acquired：首获锁，继续处理（token 用于失败时释放）
 * - duplicate：同键请求已存在（已处理或处理中）→ 走回放
 * - degraded：Redis 不可用 → 降级放行（DB 唯一约束兜底）
 */
export type IdempotencyLockResult =
  | { status: 'acquired'; token: string }
  | { status: 'duplicate' }
  | { status: 'degraded' };

/**
 * 幂等命中摘要（流式请求 / DB 兜底回放时返回给客户端）
 * 字段对齐 consumption_records 的 usage/cost 语义。
 */
export interface IdempotencySummary {
  /** 幂等回放标记，帮助客户端识别这是重放而非新请求 */
  idempotent_replay: boolean;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: string;
  finish_reason: string | null;
  streamed: boolean;
  request_id: string;
}

/**
 * 幂等缓存条目：
 * - 非流式：body = 首次完整响应体（回放用）+ summary（供流式重复请求回放摘要）
 * - 流式：仅 summary（无法回放完整 SSE）
 */
export interface IdempotencyCachedEntry {
  /** 首次请求是否流式 */
  streamed: boolean;
  /** 非流式完整响应体（仅 Redis 缓存可回放） */
  body?: unknown;
  /** usage/cost 摘要（流式命中 / DB 兜底时返回） */
  summary: IdempotencySummary;
  /** 缓存写入时间（诊断用）；由 cacheIdempotentResponse 写入，调用方无需提供 */
  cachedAt?: string;
}

// ============================================================
// 幂等键解析
// ============================================================

/**
 * 解析幂等键：优先 Idempotency-Key 请求头，无则用服务端生成的 requestId。
 *
 * 头部超长时截断到 consumption_records.request_id 列长度（100），
 * 防止 insert 时 value too long 报错；空头视为未传。
 *
 * @param request - 请求对象（仅取 headers）
 * @param fallbackRequestId - 服务端生成的 requestId（各路由原 crypto.randomUUID()）
 * @returns 幂等键
 */
export function resolveIdempotencyKey(
  request: { headers: Record<string, string | string[] | undefined> },
  fallbackRequestId: string,
): string {
  const header = request.headers?.['idempotency-key'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, MAX_REQUEST_ID_LENGTH);
  }
  return fallbackRequestId;
}

// ============================================================
// L1: Redis 幂等锁
// ============================================================

/**
 * 获取幂等锁：Redis SETNX（NX + EX，原子）。
 *
 * 同键首次请求返回 acquired（携带释放锁用的 token）；已存在返回 duplicate；
 * Redis 不可用/异常返回 degraded —— 降级放行，由 L2 DB 唯一约束兜底，不阻断主链路。
 *
 * @param key - 幂等键（= pipelineCtx.requestId）
 * @param ttlSeconds - 锁 TTL（秒），默认与响应缓存一致（24h）
 * @returns 三态结果，见 IdempotencyLockResult
 */
export async function acquireIdempotencyLock(
  key: string,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS,
): Promise<IdempotencyLockResult> {
  try {
    const r = getRedis();
    if (!r) return { status: 'degraded' };
    const token = crypto.randomUUID();
    const ok = await r.set(lockKey(key), token, 'EX', ttlSeconds, 'NX');
    return ok === 'OK' ? { status: 'acquired', token } : { status: 'duplicate' };
  } catch {
    return { status: 'degraded' };
  }
}

/**
 * 释放幂等锁（仅当锁值等于 token 时才删除，见 RELEASE_LOCK_LUA）。
 *
 * 处理失败时调用，允许客户端用同一幂等键重试；Redis 不可用时静默跳过。
 * 幂等命中（duplicate）路径不调用 —— 成功请求的锁必须保留到 TTL 到期，
 * 否则同键重复请求会在窗口内被重复处理。
 *
 * @param key - 幂等键
 * @param token - acquireIdempotencyLock 返回的锁 token
 */
export async function releaseIdempotencyLock(key: string, token: string): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.eval(RELEASE_LOCK_LUA, 1, lockKey(key), token);
  } catch {
    /* 释放失败不阻断主链路（TTL 到期自动清理） */
  }
}

// ============================================================
// 首次响应缓存（非流式回放 / 流式摘要）
// ============================================================

/**
 * 缓存首次成功处理的响应（非流式存完整 body，流式存摘要）。
 * Redis 不可用时 cacheSet 内部静默跳过，不阻断主链路。
 *
 * @param key - 幂等键
 * @param entry - 缓存条目（见 IdempotencyCachedEntry）
 * @param ttlSeconds - 缓存 TTL（秒），默认 24h
 */
export async function cacheIdempotentResponse(
  key: string,
  entry: IdempotencyCachedEntry,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS,
): Promise<void> {
  await cacheSet(respKey(key), JSON.stringify({ ...entry, cachedAt: new Date().toISOString() }), ttlSeconds);
}

/**
 * 读取缓存的首次响应；无缓存 / JSON 损坏 / Redis 不可用时返回 null。
 *
 * @param key - 幂等键
 * @returns 缓存条目或 null
 */
export async function getCachedIdempotentResponse(key: string): Promise<IdempotencyCachedEntry | null> {
  const raw = await cacheGet(respKey(key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdempotencyCachedEntry;
  } catch {
    return null;
  }
}

// ============================================================
// L2: DB 兜底（consumption_records.request_id 唯一约束）
// ============================================================

/**
 * 判断是否 consumption_records.request_id 唯一约束冲突（Postgres 23505）。
 *
 * Redis 首层失效（崩溃/重启）时由 DB 兜底：重复 insert 冲突 → 路由层据此
 * 返回幂等提示（409）而非 500。网关热路径上唯一可能触发 23505 的写入就是
 * consumption_records（agent_commissions 为异步 fire-and-forget、对话留痕为
 * 旁路写入且自带 catch），故 code=23505 即可判定为幂等冲突。
 *
 * @param err - 捕获的异常
 * @returns true = 幂等唯一约束冲突
 */
export function isIdempotencyUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === '23505') return true;
  return typeof e.message === 'string'
    && /duplicate key value violates unique constraint/i.test(e.message)
    && /consumption_records_request_id/i.test(e.message);
}

/**
 * 按幂等键查消费记录（L2 DB 兜底：Redis 缓存丢失时找 DB 补偿回放）。
 *
 * @param requestId - 幂等键（consumption_records.request_id）
 * @returns 消费记录或 null
 */
export async function findConsumptionByRequestId(requestId: string) {
  const rows = await db.select({
    requestId: schema.consumptionRecords.requestId,
    model: schema.consumptionRecords.model,
    inputTokens: schema.consumptionRecords.inputTokens,
    outputTokens: schema.consumptionRecords.outputTokens,
    totalTokens: schema.consumptionRecords.totalTokens,
    cost: schema.consumptionRecords.cost,
    finishReason: schema.consumptionRecords.finishReason,
    streamed: schema.consumptionRecords.streamed,
  }).from(schema.consumptionRecords)
    .where(eq(schema.consumptionRecords.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 由消费记录构建缓存条目（DB 兜底路径：无完整响应体 → 仅摘要）。
 * 补偿写回 Redis 后，后续同键请求直接 L1 命中，无需再查 DB。
 *
 * @param record - findConsumptionByRequestId 返回的记录
 * @returns 缓存条目（无 body，仅 summary）
 */
export function buildEntryFromConsumptionRecord(record: {
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: string;
  finishReason: string | null;
  streamed: boolean;
}): IdempotencyCachedEntry {
  return {
    streamed: record.streamed,
    summary: buildIdempotencySummary({
      requestId: record.requestId,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cost: String(record.cost ?? '0'),
      finishReason: record.finishReason,
      streamed: record.streamed,
    }),
    cachedAt: new Date().toISOString(),
  };
}

// ============================================================
// 摘要构建与回放
// ============================================================

/**
 * 构建幂等命中摘要（usage/cost + 回放标记）。
 *
 * @param params - requestId / model / token 数 / cost / finishReason / streamed
 * @returns IdempotencySummary
 */
export function buildIdempotencySummary(params: {
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: string | number;
  finishReason?: string | null;
  streamed: boolean;
}): IdempotencySummary {
  return {
    idempotent_replay: true,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    total_tokens: params.inputTokens + params.outputTokens,
    cost: typeof params.cost === 'number' ? params.cost.toFixed(8) : params.cost,
    finish_reason: params.finishReason ?? null,
    streamed: params.streamed,
    request_id: params.requestId,
  };
}

/**
 * 幂等命中回放：统一打 X-Idempotent-Replay: true 头。
 *
 * - 非流式请求 + 有完整响应体 → 回放首次响应 JSON
 * - 非流式请求 + 仅摘要（首次为流式 / DB 兜底）→ 返回摘要 JSON
 * - 流式请求 → SSE 单帧摘要 + [DONE]（无法回放完整 SSE，按 P0-3 决策）
 *
 * @param reply - Fastify 响应
 * @param entry - 缓存条目（缓存或 DB 兜底构建）
 * @param isStreamRequest - 当前请求是否流式
 */
export async function sendIdempotentReplay(
  reply: FastifyReply,
  entry: IdempotencyCachedEntry,
  isStreamRequest: boolean,
): Promise<void> {
  reply.header('X-Idempotent-Replay', 'true');
  if (!isStreamRequest) {
    if (entry.body !== undefined) {
      reply.send(entry.body);
      return;
    }
    reply.send(entry.summary);
    return;
  }
  // 流式：SSE 摘要帧 + [DONE]
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Idempotent-Replay': 'true',
  });
  reply.raw.write(`data: ${JSON.stringify(entry.summary)}\n\n`);
  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
}

/**
 * 幂等命中统一处理：缓存优先 → DB 兜底 → 无结果（首次仍在处理中）。
 *
 * 调用方（路由）在 acquireIdempotencyLock 返回 duplicate 时调用：
 * - L1 缓存命中 → 回放完整响应/摘要，返回 true
 * - L2 DB 兜底命中 → 补偿写回缓存 + 回放摘要，返回 true
 * - 两者皆无 → 首次请求仍在处理中，返回 false（路由返回 409 幂等提示）
 *
 * @param reply - Fastify 响应
 * @param key - 幂等键
 * @param isStreamRequest - 当前请求是否流式
 * @returns true = 已回放，路由直接结束；false = 无结果可回放，需返回 409
 */
export async function replayIdempotentRequest(
  reply: FastifyReply,
  key: string,
  isStreamRequest: boolean,
): Promise<boolean> {
  const cached = await getCachedIdempotentResponse(key);
  if (cached) {
    await sendIdempotentReplay(reply, cached, isStreamRequest);
    return true;
  }

  // L2 兜底：Redis 缓存丢失（崩溃/重启/写失败）→ 查 DB 补偿回放
  const record = await findConsumptionByRequestId(key);
  if (record) {
    const entry = buildEntryFromConsumptionRecord(record);
    // 补偿写回缓存，后续同键请求直接 L1 命中
    await cacheIdempotentResponse(key, entry);
    await sendIdempotentReplay(reply, entry, isStreamRequest);
    return true;
  }

  return false;
}

// ============================================================
// Key 工具
// ============================================================

/** 幂等锁 Redis key：idem:{幂等键} */
function lockKey(key: string): string {
  return `${IDEMPOTENCY_LOCK_KEY_PREFIX}${key}`;
}

/** 响应缓存 Redis key：idem:resp:{幂等键} */
function respKey(key: string): string {
  return `${IDEMPOTENCY_RESP_KEY_PREFIX}${key}`;
}
