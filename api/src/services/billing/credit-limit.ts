/**
 * R6 拆分规避与限额服务 — 24h 滚动窗口「加钱事件」预占（PG 权威 + Redis ZSET 热路径）
 *
 * 调度终裁（覆盖 v1.0 派发指令）：
 * - **创建时预占**（人工上账创建 / 调账调增发起 / 红冲加钱方向发起 → 创建事务内预占，含本笔判定）；
 * - **驳回 / 红冲扣钱方向不回退累计**（无 DECRBY，lim_dec.lua 不建）；
 * - 调减不计入；充值订单审核（用户自助）不计入任何维度；白名单免审单也计入；
 * - 超 soft 升级审批（至少双人档）、超 hard 429 拒创建；`exceed_action` 可配置（escalate/reject）。
 *
 * 实现（ARCH v1.1 §3.1/§3.2）：
 * - PG 权威表 `credit_limit_events`（每笔一行，含时间戳，UNIQUE(scope,ref_type,ref_id) 幂等）；
 *   创建事务内 `pg_advisory_xact_lock` 串行化同维度并发（E16 先到先得）+ 24h 滚动 SUM + 判定 + 插行；
 * - Redis `lim:op:{userId}` / `lim:user:{userId}` ZSET（score=事件时间戳 ms，member="{refType}:{refId}:{amountCents}"，
 *   TTL 48h）为热路径缓存：提交后 `syncRedisAdd`（lim_add.lua）尽力同步，缺失回填；
 * - 降级：Redis 不可用 → 跳过缓存读写（PG 权威不受影响）；PG 不可用 → 创建事务本身失败（无计数不一致问题）。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §3 R6 限额
 * @module services/billing/credit-limit
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, schema } from '../../db/index.js';
import { and, eq, sql } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { getRedis } from '../../lib/redis.js';
import { getCreditLimits, type CreditLimits } from '../../lib/finance-rules.js';

/** 计数维度：operator = 操作人；user = 被入账用户 */
export type CreditScope = 'operator' | 'user';

/** 事件引用类型（v1.1 §3.1） */
export type CreditEventRefType = 'manual_topup' | 'adjustment' | 'reverse';

/** Drizzle 事务上下文（与 balance.ts creditBalance 同一类型约定） */
type TxContext = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Redis ZSET 键前缀（v1.1 §3.1，无日期后缀——事件级滚动窗口） */
const OP_KEY_PREFIX = 'lim:op:';
const USER_KEY_PREFIX = 'lim:user:';

// ── Lua 脚本加载（对齐 pre-consume.ts loadLuaScript 双路径约定） ──

function loadLuaScript(fileName: string): string {
  const candidates = [
    new URL(`../../scripts/${fileName}`, import.meta.url),
    new URL(`../../../src/scripts/${fileName}`, import.meta.url),
  ];
  for (const url of candidates) {
    try {
      return readFileSync(fileURLToPath(url), 'utf8');
    } catch {
      /* 尝试下一个候选路径 */
    }
  }
  throw new Error(`Lua script not found: ${fileName} (checked src/scripts and dist/scripts)`);
}

const limAddLua = loadLuaScript('lim_add.lua');

// ── 工具 ──

/** 滚动窗口（毫秒） */
export function rollingWindowMs(windowHours?: number): number {
  return Math.max(1, Math.round(windowHours ?? 24)) * 3600 * 1000;
}

/** Redis ZSET 键：lim:op:{userId} / lim:user:{userId} */
export function redisSetKey(scope: CreditScope, userId: number): string {
  return scope === 'operator' ? `${OP_KEY_PREFIX}${userId}` : `${USER_KEY_PREFIX}${userId}`;
}

/** 事件 member："{refType}:{refId}:{amountCents}"（尾部 amountCents 供 Lua 解析） */
export function eventMember(refType: CreditEventRefType, refId: string | number, amountCents: number): string {
  return `${refType}:${refId}:${amountCents}`;
}

/** 元 → 分（限额语义：2 位小数精度足够，调账 8 位尾差 <1 分不影响风控） */
export function yuanToCents(amountYuan: number): number {
  return Math.round(amountYuan * 100);
}

// ── PG 滚动汇总（executor 可为 db 或事务内 tx） ──

/**
 * PG 权威滚动汇总（24h 窗口内事件金额合计，元）。
 *
 * @param executor - db 或事务内 tx
 * @param scope - 维度
 * @param userId - 操作人 / 被入账用户
 * @param windowHours - 窗口小时数
 * @returns 滚动合计（元，Number）
 */
export async function readRollingSumPg(
  executor: typeof db | TxContext,
  scope: CreditScope,
  userId: number,
  windowHours: number,
): Promise<number> {
  const rows = await (executor as typeof db).select({ sum: sql<string>`COALESCE(SUM(${schema.creditLimitEvents.amount}), 0)` })
    .from(schema.creditLimitEvents)
    .where(and(
      eq(schema.creditLimitEvents.scope, scope),
      eq(schema.creditLimitEvents.userId, userId),
      sql`${schema.creditLimitEvents.createdAt} > now() - make_interval(hours => ${windowHours})`,
    ))
    .limit(1);
  return Number(rows[0]?.sum ?? 0);
}

// ── 创建事务内：判定（advisory lock + 滚动汇总 + 超限拒绝） ──

/** 预检/预占输入（判定阶段；事件插行由 reserveInTx 在单据 ID 确定后调用） */
export interface CheckLimitsInput {
  /** 操作人（发起者）ID */
  opUserId: number;
  /** 被入账用户 ID */
  targetUserId: number;
  /** 本笔金额（元，正数） */
  amountYuan: number;
  /** 操作者角色（豁免判定，B8） */
  role: string;
  /** 软限（元）：projected > soft → escalated（至少双人档）；exceed_action='reject' 时直接 429 */
  softLimitYuan: number;
  /** 硬限（元）：projected > hard → 429 拒创建（终裁 hard 闸，不受 exceed_action 影响） */
  hardLimitYuan: number;
  /** 超 soft 行为（escalate=升级 / reject=429） */
  exceedAction: 'escalate' | 'reject';
  /** 豁免角色列表（B8；默认空 = 不豁免，super_admin 不豁免） */
  exemptRoles: string[];
  /** 滚动窗口（小时） */
  windowHours: number;
  /**
   * 终审档触发线（元，= approval.superReviewThreshold / level2_max，默认 100,000）。
   * 调度终裁（Gate 5 P1-3）：**单笔 tier3（amount > 本线）创建时豁免 hard 累计拒绝与 soft 升级**
   * ——大额由三人审批链承接，soft/hard 只约束 tier1/tier2 拆分场景；仍计入 24h 累计
   * （limit_check 记录 `exempt_reason='large_approval_chain'`）。传 undefined 则不启用豁免。
   */
  superReviewThresholdYuan?: number;
}

/** 单维度判定结果 */
export interface DimensionCheck {
  usedYuan: number;
  projectedYuan: number;
  escalated: boolean;
  /** op 维度角色豁免（B8）：跳过预检与插行，审计标记 limit_exempt */
  exempt: boolean;
}

/** 预检/预占判定结果 */
export interface CheckLimitsResult {
  op: DimensionCheck;
  user: DimensionCheck;
  windowHours: number;
  /** 调度终裁 P1-3：本笔为单笔 tier3（> superReviewThreshold）→ 豁免 hard/soft，大额由三人审批链承接 */
  largeApprovalChain: boolean;
}

/**
 * 创建事务内限额判定（ARCH v1.1 §3.2 / §3.4 + 调度终裁 Gate 5 P1-3）：
 * ① 每维度 `pg_advisory_xact_lock` 串行化同维度并发（E16 先到先得）；
 * ② 24h 滚动 SUM；
 * ③ 判定：projected > hard → 429 拒创建；soft < projected ≤ hard →
 *    exceed_action='reject' → 429 / 'escalate' → 升级标记；
 * ④ 豁免角色（op 维度，B8）跳过判定与插行；
 * ⑤ **tier3 单笔豁免（调度终裁 P1-3）**：本笔金额 > superReviewThresholdYuan（>100,000）
 *    时豁免 hard 累计拒绝与 soft 升级——大额由三人审批链承接，soft/hard 只约束 tier1/tier2
 *    拆分场景；仍计入 24h 累计（调用方在 limit_check 记 `exempt_reason='large_approval_chain'`）。
 *
 * 注意：事件插行（reserveInTx）在调用方生成单据 ID 后执行，与判定同事务（失败整体回滚）。
 *
 * @param tx - 调用方已开启的事务（人工上账创建 / 调账发起 / 红冲加钱方向发起）
 * @param input - 见 CheckLimitsInput
 * @returns 双维度判定结果（escalated 供 tier 升级与 limit_escalated 落库；largeApprovalChain 供审计）
 * @throws {AppError} 429 DAILY_LIMIT_EXCEEDED — projected > hard（非 tier3 豁免）或 exceed_action='reject' 且超 soft（事务回滚，单据不创建）
 */
export async function checkLimitsInTx(tx: TxContext, input: CheckLimitsInput): Promise<CheckLimitsResult> {
  // ⑤ tier3 单笔豁免：amount > super_review_threshold（level2_max）→ 大额由审批链承接
  const largeApprovalChain = input.superReviewThresholdYuan != null
    && Number.isFinite(input.superReviewThresholdYuan)
    && input.amountYuan > input.superReviewThresholdYuan;

  const checkDimension = async (scope: CreditScope, userId: number, exempt: boolean): Promise<DimensionCheck> => {
    if (exempt) {
      // B8 豁免：跳过锁/汇总/判定（不产生事件；审计 limit_exempt 由调用方标记）
      return { usedYuan: 0, projectedYuan: input.amountYuan, escalated: false, exempt: true };
    }
    // ① advisory lock：同维度并发严格串行（粒度 = 用户；hashtext 冲突概率可忽略）
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('lim:' || ${scope} || ':' || ${userId})::bigint)`);
    // ② 24h 滚动汇总（PG 权威）
    const usedYuan = await readRollingSumPg(tx, scope, userId, input.windowHours);
    const projectedYuan = usedYuan + input.amountYuan;
    // ③ 判定（tier3 单笔豁免：跳过 hard 拒绝；soft 升级对 tier3 本就无意义，一并跳过）
    if (!largeApprovalChain) {
      if (projectedYuan > input.hardLimitYuan) {
        throw new AppError(
          `今日累计加钱将超过限额（¥${input.hardLimitYuan.toLocaleString()}），该笔已拒绝，如有特殊情况请联系管理员`,
          429,
          'DAILY_LIMIT_EXCEEDED',
          { scope, userId, usedYuan, amountYuan: input.amountYuan, hardLimitYuan: input.hardLimitYuan },
        );
      }
      if (projectedYuan > input.softLimitYuan && input.exceedAction === 'reject') {
        throw new AppError(
          `今日累计加钱已超限额（¥${input.softLimitYuan.toLocaleString()}），当前配置为超限拒绝`,
          429,
          'DAILY_LIMIT_EXCEEDED',
          { scope, userId, usedYuan, amountYuan: input.amountYuan, softLimitYuan: input.softLimitYuan },
        );
      }
    }
    return {
      usedYuan,
      projectedYuan,
      // tier3 单笔豁免：不因本笔触发 soft 升级（大额走审批链，limit_escalated 无意义）
      escalated: !largeApprovalChain && projectedYuan > input.softLimitYuan,
      exempt: false,
    };
  };

  const opExempt = input.exemptRoles.includes(input.role);
  const op = await checkDimension('operator', input.opUserId, opExempt);
  const user = await checkDimension('user', input.targetUserId, false);
  return { op, user, windowHours: input.windowHours, largeApprovalChain };
}

/**
 * 创建事务内事件插行（op + user 各一行；UNIQUE(scope, ref_type, ref_id) 幂等，
 * 同单重试/双写仅计一次）。调用方在单据（order/adjustment record/reverse record）生成后调用。
 *
 * @param tx - 调用方已开启的事务
 * @param input - scope/userId/amountYuan/refType/refId
 */
export async function reserveInTx(
  tx: TxContext,
  input: { scope: CreditScope; userId: number; amountYuan: number; refType: CreditEventRefType; refId: string },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO credit_limit_events (scope, user_id, amount, ref_type, ref_id)
    VALUES (${input.scope}, ${input.userId}, ${input.amountYuan.toFixed(2)}, ${input.refType}, ${input.refId})
    ON CONFLICT (scope, ref_type, ref_id) DO NOTHING
  `);
}

// ── 提交后：Redis ZSET 热路径同步（尽力而为，不阻断主链路） ──

/**
 * 提交后 Redis 事件入集（lim_add.lua：剪枝窗口外 + ZADD + TTL；allow=1 不再判定——
 * 判定已在 PG 权威事务内完成，此处仅缓存同步；失败静默跳过，缺失下次回填自愈）。
 *
 * @param scope - 维度
 * @param userId - 操作人 / 被入账用户
 * @param refType - 引用类型
 * @param refId - 引用 ID
 * @param amountCents - 本笔金额（分）
 * @param windowMs - 滚动窗口（毫秒）
 * @param nowMs - 事件时间戳（毫秒，默认 Date.now()）
 */
export async function syncRedisAdd(
  scope: CreditScope,
  userId: number,
  refType: CreditEventRefType,
  refId: string | number,
  amountCents: number,
  windowMs: number,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    const r = getRedis();
    if (!r || amountCents <= 0) return;
    const member = eventMember(refType, refId, amountCents);
    // allow=1：提交后同步，不做超限判定（判定已由 PG 权威完成）
    await r.eval(limAddLua, 1, redisSetKey(scope, userId), member, String(nowMs), String(amountCents), String(windowMs), '0', '1');
  } catch {
    /* Redis 同步失败不阻断主链路（PG 权威已落，可回填） */
  }
}

/**
 * Redis 滚动汇总（读路径；剪枝窗口外 + 求和；Redis 不可用 → null）。
 *
 * @param scope - 维度
 * @param userId - 操作人 / 被入账用户
 * @param windowMs - 滚动窗口（毫秒）
 * @returns 滚动合计（分）；Redis 不可用返回 null（调用方回退 PG）
 */
export async function redisRollingSumCents(scope: CreditScope, userId: number, windowMs: number): Promise<number | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    const key = redisSetKey(scope, userId);
    const minScore = Date.now() - windowMs;
    await r.zremrangebyscore(key, '-inf', minScore);
    const members = await r.zrangebyscore(key, minScore, '+inf');
    let sum = 0;
    for (const m of members) {
      const tail = m.match(/:(\d+)$/);
      if (tail) sum += Number(tail[1]!);
    }
    return sum;
  } catch {
    return null;
  }
}

/**
 * 读取当前限额上下文（配置 + 滚动窗口毫秒；预检/同步共用）。
 *
 * @returns { limits, windowMs }
 */
export async function currentLimitContext(): Promise<{ limits: CreditLimits; windowMs: number }> {
  const limits = await getCreditLimits();
  return { limits, windowMs: rollingWindowMs(limits.windowHours) };
}
