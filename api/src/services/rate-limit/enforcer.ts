/**
 * 四级限流执行器（enforcer）— 用户组 QPS/TPM + 模型硬顶 + 客户例外
 *
 * 职责划分（防双重限流冲突，见 docs/iteration-plan-v2.md P0-2）：
 * - @fastify/rate-limit：全局 600/min 兜底 + Key 级 60/min（按 keyHash/IP 计数，保留现行为，本文件不改动）
 * - 本 enforcer：只负责缺失的三层 ——
 *     1) 用户组 QPS/TPM（user_groups.rate_limit_qps / rate_limit_tpm，按 userId 计数）
 *     2) 模型硬顶 cap_rpm/cap_tpm（model_rate_limits，按 userId+model 计数，超限即「截断」）
 *     3) 客户例外（quota_exception_rules，仅 status=active 且 period=forever 或在 start/end 区间内生效）
 *   计数维度（userId / userId+model）与 fastify 插件（keyHash/IP）不重叠。
 *
 * 生效值算法（纯函数见 ./effective.ts）：
 *   effective = min(例外 ?? 组默认 ?? 平台默认, 模型硬顶)
 *
 * 窗口计数（对齐 tech-stack-decision.md §四「ratelimit:{key}:{minute}」）：
 *   Redis INCR/INCRBY 原子自增，key = rl:{dim}:{scope}:{bucket}，bucket = floor(now / windowMs)；
 *   TTL 设 2 个窗口覆盖桶生命周期。固定窗口在最坏情况下允许窗口边界 2× 突发，
 *   对限流场景可接受（如需精确滑动窗口可后续升级 ZSET + Lua，见 OPTIMIZE 标注）。
 *
 * 降级语义（对齐 lib/redis.ts）：
 * - Redis 不可用（getRedis 返回 null）或命令异常 → 静默放行，不阻断主链路；
 * - DB 读取失败 → 对应配置视为空（fail-open）：限流是保护层，不能因自身故障打挂网关。
 *
 * @module services/rate-limit/enforcer
 * @see docs/iteration-plan-v2.md P0-2 四级限流强制落地
 * @see coding-standards-control-logic.md §九（配置驱动的限流参数）
 */

import Redis from 'ioredis';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../../db';
import { getRedis } from '../../lib/redis';
import { getUserGroup } from '../groups';
import { RateLimitError } from '../../lib/errors';
import { computeEffectiveLimits } from './effective';

// ============================================================
// 窗口常量（毫秒）
// ============================================================

/** 用户组 QPS 窗口：1 秒 */
const QPS_WINDOW_MS = 1000;
/** 模型 RPM 窗口：1 分钟 */
const RPM_WINDOW_MS = 60_000;
/** TPM 窗口：1 分钟 */
const TPM_WINDOW_MS = 60_000;

// ============================================================
// 平台默认（system_config enterprise_*/personal_*，读取失败回退常量）
// ============================================================

const ENTERPRISE_DEFAULTS = { rpm: 300, tpm: 1_000_000 };
const PERSONAL_DEFAULTS = { rpm: 60, tpm: 200_000 };

/** 平台默认键（按客户类型） */
const PLATFORM_KEYS = {
  enterprise: ['enterprise_rpm', 'enterprise_tpm'] as const,
  personal: ['personal_rpm', 'personal_tpm'] as const,
};

// ============================================================
// 类型
// ============================================================

/**
 * 限流执行上下文。
 *
 * 由路由层 preHandler 钩子（enforceRateLimitPreHandler）从请求构建，
 * 或由单元测试直接构造（tokens 可直接传入，避免依赖请求体估算）。
 */
export interface RateLimitContext {
  /** 用户 ID（从 request.apiKeyContext.userId 或 request.userContext.userId 取） */
  userId: number;
  /** 平台模型名（从请求体 model 取） */
  model: string;
  /** 本次请求的 token 消耗估算（TPM 维度权重）；缺省时按 body 自动估算 */
  tokens?: number;
  /** 原始请求体（缺省 tokens 时用于估算；preHandler 钩子自动填充） */
  body?: unknown;
}

/** 客户例外规则行（enforcer 只读取判定所需的列） */
interface ExceptionRuleRow {
  rpm: number | null;
  tpm: number | null;
  period: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  status: string;
}

// ============================================================
// 纯函数：客户例外有效性 / token 估算 / 上下文构建
// ============================================================

/**
 * 判断客户例外规则当前是否生效。
 *
 * 规则：仅 status=active 且 period=forever，或 period=range 且 now 落在 [start, end] 区间内才生效。
 * start/end 为 DATE（无时间）：start 按当天 00:00:00.000、end 按当天 23:59:59.999 判定。
 *
 * @param rule - 例外规则行（period/status/startDate/endDate）
 * @param now - 判定时间点（默认当前时间；测试可注入固定时间）
 * @returns true = 生效
 */
export function isExceptionActive(
  rule: { status: string; period: string; startDate?: Date | string | null; endDate?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!rule || rule.status !== 'active') return false;
  if (rule.period === 'forever') return true;
  if (rule.period === 'range') {
    const start = parseDateBoundary(rule.startDate, 'start');
    const end = parseDateBoundary(rule.endDate, 'end');
    if (!start || !end) return false;
    return now >= start && now <= end;
  }
  // 未知 period → 保守不生效
  return false;
}

/**
 * 解析 DATE 边界：字符串 'YYYY-MM-DD' 或 Date。
 * start 返回当天 00:00:00.000，end 返回当天 23:59:59.999。
 *
 * @param value - DATE 值
 * @param edge - start / end
 * @returns 边界时刻；格式非法或缺失 → null
 */
function parseDateBoundary(value: Date | string | null | undefined, edge: 'start' | 'end'): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return edge === 'start'
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return edge === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);
}

/**
 * 估算请求体 token 消耗（TPM 维度权重，粗估）。
 *
 * 遍历请求体所有字符串值，按「4 字符 ≈ 1 token」估算输入；
 * 若携带 max_tokens（输出上限）则累加，覆盖潜在输出消耗（「截断」语义）。
 * 仅供限流预检，实际计费仍以 tiktoken 为准（见 routes/chat.ts estimateInputTokens）。
 *
 * @param body - 请求体
 * @returns 估算 token 数（至少 1）
 */
export function estimateRequestTokens(body: unknown): number {
  if (body == null || typeof body !== 'object') return 1;
  let chars = 0;
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      chars += value.length;
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) walk(v);
    }
  };
  walk(body);
  const maxTokens = (body as Record<string, unknown>).max_tokens;
  const outputCap = typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 0;
  return Math.max(1, Math.ceil(chars / 4) + outputCap);
}

/**
 * 从 Fastify 请求构建限流上下文。
 *
 * userId 优先取 apiKeyContext（网关 API Key 鉴权后填充），其次 userContext（JWT 鉴权）；
 * model 从请求体 model 字段取（6 个网关路由均为 body.model）。
 *
 * @param request - Fastify request
 * @returns 限流上下文（缺用户/模型时 enforceRateLimit 内部跳过）
 */
export function buildRateLimitContext(request: any): RateLimitContext {
  const apiKeyCtx = request?.apiKeyContext as { userId?: number } | undefined;
  const userCtx = request?.userContext as { userId?: number } | undefined;
  const body = (request?.body ?? {}) as Record<string, unknown>;
  const model = typeof body.model === 'string' ? body.model : '';
  return {
    userId: apiKeyCtx?.userId ?? userCtx?.userId ?? 0,
    model,
    body,
  };
}

// ============================================================
// DB 读取（fail-open：任一步失败按空处理）
// ============================================================

/** 读取模型硬顶（model_rate_limits），无记录 → null */
async function loadModelLimit(model: string): Promise<{ capRpm: number | null; capTpm: number | null } | null> {
  const rows = await db
    .select({
      capRpm: schema.modelRateLimits.capRpm,
      capTpm: schema.modelRateLimits.capTpm,
    })
    .from(schema.modelRateLimits)
    .where(eq(schema.modelRateLimits.modelName, model))
    .limit(1);
  return rows[0] ?? null;
}

/** 读取客户例外规则（quota_exception_rules，按 客户×模型），无记录 → null */
async function loadExceptionRule(userId: number, model: string): Promise<ExceptionRuleRow | null> {
  const rows = await db
    .select({
      rpm: schema.quotaExceptionRules.rpm,
      tpm: schema.quotaExceptionRules.tpm,
      period: schema.quotaExceptionRules.period,
      startDate: schema.quotaExceptionRules.startDate,
      endDate: schema.quotaExceptionRules.endDate,
      status: schema.quotaExceptionRules.status,
    })
    .from(schema.quotaExceptionRules)
    .where(and(
      eq(schema.quotaExceptionRules.customerId, userId),
      eq(schema.quotaExceptionRules.modelName, model),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** 读取客户类型（users.customerType，决定企业/个人平台默认），无记录 → null */
async function loadUserType(userId: number): Promise<{ customerType: string | null } | null> {
  const rows = await db
    .select({ customerType: schema.users.customerType })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** 读取平台默认限流值（system_config），缺失/非法 → 常量兜底 */
async function loadPlatformDefaults(customerType?: string | null): Promise<{ rpm: number; tpm: number }> {
  const type = customerType === 'enterprise' ? 'enterprise' : 'personal';
  const keys = PLATFORM_KEYS[type];
  const fallback = type === 'enterprise' ? ENTERPRISE_DEFAULTS : PERSONAL_DEFAULTS;

  const rows = await db
    .select({
      key: schema.systemConfig.key,
      value: schema.systemConfig.value,
    })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.key, [...keys]));

  const values = new Map<string, number>();
  for (const row of rows) {
    const n = Number.parseInt(row.value, 10);
    if (!Number.isNaN(n)) values.set(row.key, n);
  }
  return { rpm: values.get(keys[0]) ?? fallback.rpm, tpm: values.get(keys[1]) ?? fallback.tpm };
}

// ============================================================
// Redis 窗口计数
// ============================================================

/**
 * Redis 固定窗口计数（INCR/INCRBY 原子自增）。
 *
 * key = {keyPrefix}:{bucket}，bucket = floor(now / windowMs)；
 * TTL = 2 × windowMs，覆盖桶生命周期。返回窗口内累计值。
 *
 * @param redis - ioredis 客户端
 * @param keyPrefix - 计数键前缀（不含桶号）
 * @param windowMs - 窗口长度（毫秒）
 * @param weight - 单次权重：1 = 请求数（RPM/QPS），token 数（TPM）
 * @returns 本次累计值
 */
async function windowIncr(redis: Redis, keyPrefix: string, windowMs: number, weight: number): Promise<number> {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `${keyPrefix}:${bucket}`;
  const multi = redis.multi();
  if (weight === 1) {
    multi.incr(key);
  } else {
    multi.incrby(key, weight);
  }
  multi.pexpire(key, windowMs * 2);
  const results = await multi.exec();
  const first = results?.[0] as [Error | null, number] | undefined;
  return first ? Number(first[1] ?? 0) : 0;
}

// ============================================================
// 核心：enforceRateLimit(ctx)
// ============================================================

/**
 * 执行四级限流（enforcer 核心，纯 ctx 驱动，无 Fastify 依赖，便于单测）。
 *
 * 流程：
 *   1. 并行读取 分组 / 模型硬顶 / 客户例外 / 客户类型（fail-open）；
 *   2. 校验客户例外有效性（isExceptionActive）；
 *   3. 计算模型级生效值（effective = min(例外 ?? 组默认 ?? 平台默认, 硬顶)）；
 *   4. 依次计数：组 QPS（userId）→ 组 TPM（userId）→ 模型 RPM（userId+model）→ 模型 TPM（userId+model）；
 *   5. 任一维度超限 → 抛 RateLimitError（429）。
 *
 * 降级：Redis 不可用直接放行；DB/Redis 异常只跳过对应维度（fail-open），不阻断主链路。
 *
 * @param ctx - 限流上下文（userId + model 必填）
 * @throws {RateLimitError} 任一层超限（HTTP 429）
 */
export async function enforceRateLimit(ctx: RateLimitContext): Promise<void> {
  const { userId, model } = ctx;
  // 无有效用户或模型 → 无法判定限流维度，跳过（如 /v1/models 列表接口）
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!model) return;

  // Redis 不可用 → 静默放行（与 lib/redis.ts 降级语义一致，不阻断主链路）
  const redis = getRedis();
  if (!redis) return;

  const tokens = ctx.tokens ?? estimateRequestTokens(ctx.body ?? {});

  try {
    // 1. 并行读取限流配置
    const [group, modelLimit, exceptionRow, userRow] = await Promise.all([
      getUserGroup(userId).catch(() => null),
      loadModelLimit(model).catch(() => null),
      loadExceptionRule(userId, model).catch(() => null),
      loadUserType(userId).catch(() => null),
    ]);

    // 2. 例外有效性：仅 status=active 且 period=forever 或在 start/end 区间内生效
    const exception = exceptionRow && isExceptionActive(exceptionRow) ? exceptionRow : null;

    // 3. 平台默认（企业/个人，读取失败回退常量）
    const platform = (await loadPlatformDefaults(userRow?.customerType).catch(() => null))
      ?? (userRow?.customerType === 'enterprise' ? ENTERPRISE_DEFAULTS : PERSONAL_DEFAULTS);

    const groupQps = group?.rateLimitQps ?? null;
    const groupTpm = group?.rateLimitTpm ?? null;

    // 4. 用户组 QPS（per-user，1s 窗口）
    if (groupQps != null && groupQps > 0) {
      const count = await windowIncr(redis, `rl:qps:u${userId}`, QPS_WINDOW_MS, 1);
      if (count > groupQps) {
        throw new RateLimitError(`group qps exceeded: ${count}/${groupQps}`);
      }
    }

    // 5. 用户组 TPM（per-user，60s 窗口，按 token 权重累计）
    if (groupTpm != null && groupTpm > 0) {
      const sum = await windowIncr(redis, `rl:tpm:u${userId}`, TPM_WINDOW_MS, tokens);
      if (sum > groupTpm) {
        throw new RateLimitError(`group tpm exceeded: ${sum}/${groupTpm}`);
      }
    }

    // 6. 模型级 RPM/TPM（per userId+model，生效值含例外/组默认/平台默认，受硬顶截断）
    const { rpm: effRpm, tpm: effTpm } = computeEffectiveLimits({
      capRpm: modelLimit?.capRpm ?? null,
      capTpm: modelLimit?.capTpm ?? null,
      groupQps,
      groupTpm,
      exceptionRpm: exception?.rpm ?? null,
      exceptionTpm: exception?.tpm ?? null,
      platformRpm: platform.rpm,
      platformTpm: platform.tpm,
    });

    if (effRpm != null) {
      const count = await windowIncr(redis, `rl:rpm:u${userId}:m${model}`, RPM_WINDOW_MS, 1);
      if (count > effRpm) {
        throw new RateLimitError(`model rpm exceeded: ${count}/${effRpm}`);
      }
    }

    if (effTpm != null) {
      const sum = await windowIncr(redis, `rl:tpm:u${userId}:m${model}`, TPM_WINDOW_MS, tokens);
      if (sum > effTpm) {
        throw new RateLimitError(`model tpm exceeded: ${sum}/${effTpm}`);
      }
    }
  } catch (err) {
    // 超限（RateLimitError）→ 向上抛，由 preHandler 钩子转 429
    if (err instanceof RateLimitError) throw err;
    // Redis / DB 等基础设施异常 → 静默放行（限流层不阻断主链路）
  }
}

// ============================================================
// Fastify preHandler 钩子（路由层接入点）
// ============================================================

/**
 * Fastify preHandler 钩子：在 apiKeyAuth 之后执行限流，超限直接回 429。
 *
 * 响应格式统一为 OpenAI 风格 error 对象（与 apiKeyAuth 同模式，直接 send 不抛错）：
 *   { error: { message, type: 'rate_limit_error', code: 429 } }
 *
 * @param request - Fastify request
 * @param reply - Fastify reply
 */
export async function enforceRateLimitPreHandler(request: any, reply: any): Promise<void> {
  const ctx = buildRateLimitContext(request);
  try {
    await enforceRateLimit(ctx);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return reply.status(429).send({
        error: {
          message: '请求过于频繁，请稍后重试',
          type: 'rate_limit_error',
          code: 429,
        },
      });
    }
    // 非限流错误（理论上不会发生，enforceRateLimit 已 fail-open）→ 交还 Fastify
    throw err;
  }
}
