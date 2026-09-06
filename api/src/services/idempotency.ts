/**
 * 幂等守卫服务 — request_id 三层去重（P0-3）
 *
 * 三层架构（见 coding-standards-control-logic.md §三）：
 *   L1: Redis SETNX（同 request_id 立即去重，带 TTL）→ 命中直接回放
 *   L2: consumption_records.request_id 唯一约束（DB 层兜底；P3-1 分区改造后为复合
 *       (request_id, created_at)，migration 0025，见 IDEMPOTENCY_UNIQUE_MSG_RE）
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
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { cacheGet, cacheSet, getRedis } from '../lib/redis.js';

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
 * 匹配 consumption_records.request_id 唯一约束名（23505 错误消息里）。
 *
 * 兼容两种命名（P3-1 分区改造后并存）：
 *   - 旧（非分区表唯一约束）：consumption_records_request_id_unique
 *   - 新（分区表子表唯一索引，PG 按「子表名_列名_key」命名）：
 *     consumption_records_2026_08_request_id_created_at_key
 *
 * 两者共同前缀为 consumption_records_（可选中间月份）_request_id，
 * 因此用 /consumption_records(?:_\d{4}_\d{2})?_request_id/ 一次匹配两种形态。
 */
const IDEMPOTENCY_UNIQUE_MSG_RE = /(?:consumption_records(?:_\d{4}_\d{2})?_request_id|uq_recharge_orders_idempotency_key)/i;

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
 * 幂等锁获取结果（四态）：
 * - acquired：首获锁，继续处理（token 用于失败时释放）
 * - duplicate：同键请求已存在（已处理或处理中）→ 走回放
 * - degraded：Redis 不可用且未开启 failClosed → 降级放行（DB 唯一约束兜底），
 *   用于模型消费链路（不阻断推理，见 pipeline/steps/idempotency.ts）
 * - unavailable：Redis 不可用且开启 failClosed → 资金写路径拒绝，
 *   调用方必须返回 503 IDEMPOTENCY_UNAVAILABLE，不得静默绕过（ADR-0009）
 */
export type IdempotencyLockResult =
  | { status: 'acquired'; token: string }
  | { status: 'duplicate' }
  | { status: 'degraded' }
  | { status: 'unavailable' };

/**
 * acquireIdempotencyLock 选项。
 */
export interface IdempotencyLockOptions {
  /**
   * true = 严格模式（资金写路径）：Redis 不可用时返回 'unavailable'，
   * 调用方必须转 503 IDEMPOTENCY_UNAVAILABLE，禁止静默绕过，防止同 Key 并发重复入账。
   * false = 兼容降级（模型消费链路默认）：Redis 不可用时返回 'degraded'，
   * 由 DB 唯一约束兜底，不阻断主链路（保留既有语义）。
   */
  failClosed?: boolean;
}

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
 *
 * request_fingerprint 是幂等回放安全的关键护栏：
 *   - 写入：路由 settle 必须把「本次请求指纹」（buildRequestFingerprint）写入该字段；
 *   - 校验：replayIdempotentRequest 在回放前比对当前请求指纹与缓存条目，异摘要 → 不回放、返回
 *     'conflict'（路由转 409 IDEMPOTENCY_CONFLICT），杜绝「同一幂等键不同参数/不同用户复用首次响应」。
 *   - 跨用户隔离由 user-scoped 锁/缓存键（scopeIdempotencyKey）保证，本字段为同键异参数的第二道防线。
 */
export interface IdempotencyCachedEntry {
  /** 首次请求是否流式 */
  streamed: boolean;
  /** 非流式完整响应体（仅 Redis 缓存可回放） */
  body?: unknown;
  /** 本次请求指纹（buildRequestFingerprint 输出，SHA-256）；同一幂等键不得跨用户/参数复用 */
  request_fingerprint?: string;
  /** usage/cost 摘要（流式命中 / DB 兜底时返回） */
  summary: IdempotencySummary;
  /** 缓存写入时间（诊断用）；由 cacheIdempotentResponse 写入，调用方无需提供 */
  cachedAt?: string;
}

/**
 * 幂等重放结果三态：
 * - 'replayed'：已回放（缓存命中且指纹一致 / DB 兜底命中）
 * - 'conflict'：同幂等键命中但指纹不一致（异参数/异用户复用）→ 调用方返回 409 IDEMPOTENCY_CONFLICT
 * - 'none'：无结果可回放（首次请求仍在处理中）→ 调用方返回 409「仍在处理」
 */
export type IdempotentReplayResult = 'replayed' | 'conflict' | 'none';

/**
 * replayIdempotentRequest 选项。
 */
export interface ReplayIdempotentOptions {
  /** 当前请求指纹（buildRequestFingerprint 输出）；提供时与缓存/DB 条目比对拦截异摘要回放 */
  fingerprint?: string;
  /** 原始幂等键（= consumption_records.request_id）；L2 DB 兜底查询用 */
  requestId?: string;
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
// 请求指纹（幂等回放安全护栏）
// ============================================================

/**
 * 稳定 JSON 序列化：对象键按字典序排序、数组保序、跳过 undefined 值、
 * 循环引用 / 序列化失败兜底 'null'。用于把请求体规范化为与键序无关的摘要输入，
 * 保证「语义相同但对象键书写顺序不同」的两次请求得到同一指纹（幂等可命中）。
 *
 * @param body - 任意请求体
 * @returns 规范化 JSON 字符串
 */
export function canonicalizeBody(body: unknown): string {
  try {
    return JSON.stringify(sortObjectKeys(body)) ?? 'null';
  } catch {
    return 'null';
  }
}

/** 递归排序对象键（数组保序）；返回新结构，不改原对象。 */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v === undefined) continue; // undefined 不入指纹，避免脆弱
      out[k] = sortObjectKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * 规范化路径：去首尾空白、去掉 query，折叠连续斜杠，去首尾斜杠，小写。
 * 网关把 URL（如 /v1/chat/completions）作为指纹的 canonical path 分量。
 *
 * @param path - 原始路径（可含 query）
 * @returns 规范化路径
 */
export function canonicalizePath(path: string): string {
  const withoutQuery = String(path || '').trim().split('?')[0] ?? '';
  return withoutQuery.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

/**
 * 统一 request fingerprint（SHA-256）。
 *
 * 分量（至少）：
 *   1. user identity（userId）—— 跨用户同键隔离
 *   2. method（规范化大写）   —— 方法不同即请求不同
 *   3. canonical path         —— 路由不同即请求不同
 *   4. canonical body（键序无关）—— 参数不同即请求不同
 *
 * 各分量用 '|' 连接后 SHA-256 摘要。userId 在指纹内再次出现，与 user-scoped 锁/缓存键
 * 构成双重防线：锁键隔离保证跨用户不会碰撞，指纹比对拦截同键异参数/跨用户复用首次响应。
 *
 * @param input - 指纹输入
 * @returns 64 位 hex SHA-256
 */
export function buildRequestFingerprint(input: {
  userId: number;
  method: string;
  path: string;
  body: unknown;
}): string {
  const canonicalBody = canonicalizeBody(input.body);
  const raw = [
    String(input.userId ?? 0),
    (input.method || 'POST').toUpperCase(),
    canonicalizePath(input.path || ''),
    canonicalBody,
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * 用户作用域幂等键：把原始幂等键命名空间到 userId。
 *
 * 锁与响应缓存都用 `{原始幂等键}:{userId}` 作为实际存储 key，因此**跨用户同键不会碰撞**：
 * 用户 B 用与用户 A 相同的 Idempotency-Key 时，二者落在不同的 Redis key 上，B 请求照常独立
 * 处理，绝不会拿到 A 的首次响应（消除跨用户回放泄露）。
 *
 * consumption_records.request_id 仍写入原始幂等键（见 pipeline idempotency step），
 * 保持 L2 DB 唯一约束口径不变。
 *
 * @param baseKey - 原始幂等键（Idempotency-Key 头或 requestId）
 * @param userId - 鉴权后的用户 ID
 * @returns user-scoped 幂等键
 */
export function scopeIdempotencyKey(baseKey: string, userId: number): string {
  return `${baseKey}:${userId}`;
}

// ============================================================
// L1: Redis 幂等锁
// ============================================================

/**
 * 获取幂等锁：Redis SETNX（NX + EX，原子）。
 *
 * 同键首次请求返回 acquired（携带释放锁用的 token）；已存在返回 duplicate；
 * Redis 不可用/异常时：
 *   - failClosed=true（资金写路径）→ 返回 unavailable，调用方须转 503
 *     IDEMPOTENCY_UNAVAILABLE，不得静默绕过（ADR-0009，防重复入账）；
 *   - 否则（模型消费链路默认）→ 返回 degraded 降级放行，由 L2 DB 唯一约束兜底。
 *
 * 两表面策略不可混用：资金写操作禁止降级。
 *
 * @param key - 幂等键（= pipelineCtx.requestId 或路由解析的 Idempotency-Key）
 * @param ttlSeconds - 锁 TTL（秒），默认与响应缓存一致（24h）
 * @param options - 见 IdempotencyLockOptions（failClosed 资金写路径走严格模式）
 * @returns 三态/四态结果，见 IdempotencyLockResult
 */
export async function acquireIdempotencyLock(
  key: string,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS,
  options: IdempotencyLockOptions = {},
): Promise<IdempotencyLockResult> {
  try {
    const r = getRedis();
    if (!r) {
      return options.failClosed ? { status: 'unavailable' } : { status: 'degraded' };
    }
    const token = crypto.randomUUID();
    const ok = await r.set(lockKey(key), token, 'EX', ttlSeconds, 'NX');
    return ok === 'OK' ? { status: 'acquired', token } : { status: 'duplicate' };
  } catch {
    return options.failClosed ? { status: 'unavailable' } : { status: 'degraded' };
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
 * P3-1 分区改造后约束名形态见 IDEMPOTENCY_UNIQUE_MSG_RE（新旧两种都匹配）。
 *
 * @param err - 捕获的异常
 * @returns true = 幂等唯一约束冲突
 */
export function isIdempotencyUniqueViolation(err: unknown): boolean {
  // 逐层解包 Error.cause（P0-4 pipeline 把非 Error 原始值如 PG { code: '23505' }
  // 经 Error.cause 传递），最多 3 层防环
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    const cur = e as { code?: unknown; message?: unknown; cause?: unknown };
    if (cur.code === '23505') return true;
    if (typeof cur.message === 'string'
      && /duplicate key value violates unique constraint/i.test(cur.message)
      && IDEMPOTENCY_UNIQUE_MSG_RE.test(cur.message)) {
      return true;
    }
    e = cur.cause;
    if (e === undefined || e === null) break;
  }
  return false;
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
 * 调用方（路由）在 acquireIdempotencyLock 返回 duplicate 时调用；key 须为
 * user-scoped 幂等键（scopeIdempotencyKey 输出），保证跨用户查询隔离。
 *
 * - L1 缓存命中：
 *   - 指纹比对一致（或无缓存的 request_fingerprint）→ 回放，返回 'replayed'
 *   - 指纹不一致（opts.fingerprint ≠ cached.request_fingerprint）→ 不回放，返回 'conflict'（异参数复用）
 * - L2 DB 兜底命中（Redis 缓存丢失）→ 补偿写回缓存 + 回放摘要，返回 'replayed'
 *   （DB 记录不存指纹；跨用户已由 user-scoped 锁键在上游隔离，故不额外阻断合法恢复）
 * - 两者皆无 → 首次请求仍在处理中，返回 'none'（路由返回 409「仍在处理」）
 *
 * @param reply - Fastify 响应
 * @param key - user-scoped 幂等键（scopeIdempotencyKey 输出，用于锁/缓存查询）
 * @param isStreamRequest - 当前请求是否流式
 * @param opts - 见 ReplayIdempotentOptions（fingerprint 用于异摘要回放拦截；requestId 供 L2 DB 兜底查询）
 * @returns IdempotentReplayResult：'replayed' 已回放 / 'conflict' 异摘要需 409 / 'none' 仍在处理需 409
 */
export async function replayIdempotentRequest(
  reply: FastifyReply,
  key: string,
  isStreamRequest: boolean,
  opts: ReplayIdempotentOptions = {},
): Promise<IdempotentReplayResult> {
  const cached = await getCachedIdempotentResponse(key);
  if (cached) {
    // 异摘要不得回放：同一幂等键但请求指纹（user+method+path+body）不同 → 冲突 409
    if (opts.fingerprint && cached.request_fingerprint && cached.request_fingerprint !== opts.fingerprint) {
      return 'conflict';
    }
    await sendIdempotentReplay(reply, cached, isStreamRequest);
    return 'replayed';
  }

  // L2 兜底：Redis 缓存丢失（崩溃/重启/写失败）→ 查 DB 补偿回放
  // requestId = 原始幂等键（consumption_records.request_id 口径）；跨用户已由上层的
  // user-scoped 锁键隔离，DB 兜底仅在「同用户、同键、缓存丢失」时触发，可安全补偿回放。
  const record = await findConsumptionByRequestId(opts.requestId ?? key);
  if (record) {
    const entry = buildEntryFromConsumptionRecord(record);
    if (opts.fingerprint && entry.request_fingerprint && entry.request_fingerprint !== opts.fingerprint) {
      return 'conflict';
    }
    // 补偿写回缓存，后续同键请求直接 L1 命中（user-scoped key）
    await cacheIdempotentResponse(key, entry);
    await sendIdempotentReplay(reply, entry, isStreamRequest);
    return 'replayed';
  }

  return 'none';
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
