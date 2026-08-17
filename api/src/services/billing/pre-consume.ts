/**
 * 余额预扣服务 — 阈值旁路 + Redis Lua 原子冻结（P0-1）
 *
 * 策略（BOSS 拍板，见 docs/iteration-plan-v2.md P0-1）：
 *   - 余额 > 阈值（默认 ¥100，system_config `billing.balance_threshold` 可配）→ 旁路：
 *     不预扣、直接转发、响应后按实际用量扣费（零延迟）；
 *   - 余额 ≤ 阈值 → 预扣：Redis Lua 冻结（available → frozen）+ 多退少补；
 *   - 免费兜底：旁路扣费后余额 < 0（极端并发竞态）→ 允许记负 + 写 risk_events，
 *     该用户后续请求强制预扣（neg 标记）直到充值回正（addBalance 清除）。
 *
 * 冻结存储（见 ledger.ts）：
 *   - `bal:{userId}` HASH（available/frozen，整数单位 1e-8 元）— 热账本；
 *   - `freeze:{requestId}` EX TTL 冻结记录（超时兜底自动消失）；
 *   - `freeze-exp:{requestId}` "金额|到期ms|userId" 注册表（清理任务依赖）；
 *   - `neg:{userId}` 负余额强制预扣标记。
 *
 * 降级：Redis/DB 异常 → fail-open 旁路（回归旧"事后扣费"行为，不阻断主链路），
 * 与 lib/redis.ts 静默降级语义一致；余额不足（业务明确失败）→ 402 不降级。
 *
 * @see coding-standards-control-logic.md §五 双层余额 + Redis Lua 原子预扣
 * @see docs/iteration-plan-v2.md P0-1
 * @module services/billing
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import { getRedis, cacheGet, cacheSet, cacheDel } from '../../lib/redis';
import { getBalance, freezeBalance, settleFrozenBalance, releaseFrozenBalance, deductBalance } from './balance';
import {
  balanceLedgerKey,
  freezeRecordKey,
  freezeExpiryKey,
  toLedgerUnits,
  fromLedgerUnits,
  ensureLedger,
  readLedgerAvailable,
  setNegativeFlag,
  isNegativeFlagged,
} from './ledger';
import { PreConsumeFailedError } from '../../lib/errors';

// ============================================================
// 常量
// ============================================================

/** 默认旁路阈值（元）：余额 > 此值 → 不预扣直接转发 */
export const DEFAULT_BALANCE_THRESHOLD = 100;

/** system_config 中阈值配置键 */
export const BILLING_THRESHOLD_CONFIG_KEY = 'billing.balance_threshold';

/** 阈值 Redis 缓存键 + TTL（60s，后台修改后即时失效） */
const THRESHOLD_CACHE_KEY = 'billing:balance_threshold';
const THRESHOLD_CACHE_TTL_SECONDS = 60;

/** 冻结记录默认 TTL（秒）：30 分钟，超时自动消失（Redis TTL 兜底） */
export const FREEZE_TTL_SECONDS = 1800;

/** 负余额强制预扣风控规则名（seed.ts 预置，risk_events.rule_id 引用） */
export const NEGATIVE_BALANCE_RULE_NAME = 'negative-balance-force-preconsume';

// ============================================================
// Lua 脚本加载（缓存；src/scripts 开发态，dist/scripts 生产态回退源码）
// ============================================================

function loadLuaScript(fileName: string): string {
  const candidates = [
    // tsx/vitest 开发态：api/src/services/billing/ → api/src/scripts/
    new URL(`../../scripts/${fileName}`, import.meta.url),
    // tsc 生产构建：api/dist/services/billing/ → 回退到 api/src/scripts/（源码随包部署）
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

const preConsumeLua = loadLuaScript('pre-consume.lua');
const settlePreConsumeLua = loadLuaScript('settle-pre-consume.lua');
const releasePreConsumeLua = loadLuaScript('release-pre-consume.lua');

// ============================================================
// Types
// ============================================================

/** 预扣结果：mode='frozen' 时请求已冻结，结算/异常需走 settle/release */
export interface PreConsumeResult {
  mode: 'bypass' | 'frozen';
  /** 冻结金额（元）；bypass 时为 0 */
  amount: number;
  requestId: string;
}

/** preConsume 可选参数 */
export interface PreConsumeOptions {
  /** 已获取的余额（避免重复查询 PG） */
  balance?: { availableBalance?: string | number | null };
  /** 冻结记录 TTL（秒），测试可缩短；默认 FREEZE_TTL_SECONDS */
  ttlSeconds?: number;
}

/** 预扣上下文（路由 PipelineContext 的最小切片，便于单测） */
export interface PreConsumeContext {
  userId: number;
  requestId: string;
}

// ============================================================
// 阈值旁路判定
// ============================================================

/**
 * 读取计费阈值（system_config `billing.balance_threshold`，默认 ¥100）
 *
 * Redis 缓存 60s（后台 PUT /admin/settings/billing 后调用 invalidateThresholdCache 即时生效）；
 * DB/缓存异常 → 默认值，不阻断主链路。
 *
 * @returns 阈值（元）
 */
export async function getBillingThreshold(): Promise<number> {
  const cached = await cacheGet(THRESHOLD_CACHE_KEY);
  if (cached != null) {
    const n = Number(cached);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  let threshold = DEFAULT_BALANCE_THRESHOLD;
  let readOk = false; // DB 读取成功才写缓存：DB 异常（含测试 mock）不污染共享缓存
  try {
    const rows = await db.select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, BILLING_THRESHOLD_CONFIG_KEY))
      .limit(1);
    if (rows.length > 0) {
      const n = Number(rows[0]!.value);
      if (Number.isFinite(n) && n >= 0) threshold = n;
    }
    readOk = true;
  } catch {
    /* DB 异常 → 默认值 */
  }

  if (readOk) {
    await cacheSet(THRESHOLD_CACHE_KEY, String(threshold), THRESHOLD_CACHE_TTL_SECONDS);
  }
  return threshold;
}

/**
 * 失效阈值缓存（后台修改 billing.balance_threshold 后调用，判定即时生效）
 */
export async function invalidateThresholdCache(): Promise<void> {
  await cacheDel(THRESHOLD_CACHE_KEY);
}

/**
 * 阈值旁路判定：余额 > 阈值 → 旁路（不预扣）
 *
 * 判定优先级：
 *   1. 可用余额 ≤ 0 → 不旁路（预扣路径，路由预检已 402 拦截，此处防御）；
 *   2. 负余额强制预扣标记（记负兜底）→ 不旁路；
 *   3. 热账本（Redis）可用余额 > 阈值 → 旁路；
 *   4. Redis/DB 异常 → fail-open 旁路（回归旧"事后扣费"行为）。
 *
 * @param ctx - 预扣上下文
 * @param balance - 已获取的余额（缺省时内部查询）
 * @returns true = 旁路（不预扣）；false = 预扣
 */
export async function shouldBypass(
  ctx: PreConsumeContext,
  balance?: { availableBalance?: string | number | null } | null,
): Promise<boolean> {
  const threshold = await getBillingThreshold();
  const b = balance ?? await getBalance(ctx.userId);
  const available = Number(b?.availableBalance ?? 0);
  if (available <= 0) return false; // 无可用余额 → 不旁路

  try {
    if (await isNegativeFlagged(ctx.userId)) return false; // 记负兜底 → 强制预扣
    // 热账本为准，但只读不初始化：旁路判定不该残留账本（写 Redis 由真正预扣时的
    // ensureLedger 负责）。账本缺失 → readLedgerAvailable 返回 PG 值，判定仍正确。
    const redisAvailable = await readLedgerAvailable(ctx.userId, available, { initIfMissing: false });
    return redisAvailable > threshold;
  } catch {
    // Redis/DB 异常 → fail-open 旁路（不阻断主链路）
    return true;
  }
}

// ============================================================
// 预扣冻结 / 结算 / 解冻
// ============================================================

/**
 * 执行预扣：阈值旁路判定 →（旁路 或 Redis Lua 原子冻结 + PG 镜像）
 *
 * 冻结失败分类：
 *   - 余额不足（Lua 返回 -1）→ 抛 PreConsumeFailedError（402，明确业务错误，不降级）；
 *   - Redis/DB 故障 → 释放可能已冻结的部分 + 旁路降级（不阻断主链路）。
 *
 * @param ctx - 预扣上下文
 * @param estimatedAmount - 预估费用（元，>= 0；<= 0 直接旁路）
 * @param opts - 可选参数（balance / ttlSeconds）
 * @returns 预扣结果（mode='frozen' 时请求已冻结）
 * @throws {PreConsumeFailedError} 余额不足（402）
 */
export async function preConsume(
  ctx: PreConsumeContext,
  estimatedAmount: number,
  opts?: PreConsumeOptions,
): Promise<PreConsumeResult> {
  const amount = Number(estimatedAmount) || 0;
  const requestId = ctx.requestId;
  // 预估费用为 0（无 token 消耗）→ 无需冻结
  if (amount <= 0) return { mode: 'bypass', amount: 0, requestId };

  let balance: { availableBalance?: string | number | null } | null | undefined = opts?.balance;
  if (!balance) {
    try { balance = await getBalance(ctx.userId); } catch { balance = null; }
  }

  // 阈值旁路判定（判定异常 → 旁路降级）
  let bypass = true;
  try { bypass = await shouldBypass(ctx, balance); } catch { bypass = true; }
  if (bypass) return { mode: 'bypass', amount: 0, requestId };

  // 预扣冻结路径
  try {
    const r = await ensureLedger(ctx.userId);
    const ttlSeconds = opts?.ttlSeconds ?? FREEZE_TTL_SECONDS;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const res = await r.eval(
      preConsumeLua,
      3,
      balanceLedgerKey(ctx.userId),
      freezeRecordKey(requestId),
      freezeExpiryKey(requestId),
      String(toLedgerUnits(amount)),
      String(ttlSeconds),
      String(expiresAt),
      String(ctx.userId),
    ) as [number, number, number];

    if (res[0] === -1) {
      // 余额不足：Lua 未做任何转移，直接 402
      throw new PreConsumeFailedError(String(balance?.availableBalance ?? '0'), amount.toFixed(8));
    }
    if (res[0] === 1) {
      // 幂等命中：同 requestId 已冻结（极端重试场景），直接返回已冻结金额
      return { mode: 'frozen', amount: Number(fromLedgerUnits(res[1])), requestId };
    }

    // PG 镜像（available -= amount, frozen += amount）；失败 → 仅释放 Redis 冻结后抛错（500）
    try {
      await freezeBalance(ctx.userId, amount.toFixed(8), requestId);
    } catch (pgErr) {
      await releasePreConsume(ctx, { mode: 'frozen', amount, requestId }).catch(() => { /* 尽力而为 */ });
      throw pgErr;
    }

    return { mode: 'frozen', amount, requestId };
  } catch (err) {
    if (err instanceof PreConsumeFailedError) throw err;
    // 其他异常（Redis/DB 故障）→ 旁路降级（回归旧"事后扣费"行为）
    console.error(`[pre-consume] freeze failed for ${requestId}, fallback to bypass:`, err);
    return { mode: 'bypass', amount: 0, requestId };
  }
}

/**
 * 直通扣费（允许记负）：冻结过期/Redis 不可用时的兜底路径。
 * 扣成负数 → 记负风控（risk_events + 强制预扣标记），与旁路扣费兜底语义一致。
 */
async function chargeDirect(ctx: PreConsumeContext, actualAmount: number): Promise<void> {
  const result = await deductBalance(ctx.userId, actualAmount.toFixed(8), 'consumption', ctx.requestId, { allowNegative: true });
  if (Number(result.balanceAfter) < 0) {
    await recordNegativeBalanceRisk(ctx, result.balanceAfter);
  }
}

/**
 * 结算预扣：冻结额按实际用量解冻（多退少补）
 *
 * Lua 结算结果处理：
 *   - 多退（actual ≤ frozen）→ 差额退回 available；
 *   - 少补（actual > frozen）→ 差额从 available 补扣，不足 → 解冻全部 + 402（PreConsumeFailedError）；
 *   - 冻结记录不存在（TTL 过期/已被并发释放）→ 直通扣费（deductBalance）。
 *
 * @param ctx - 预扣上下文
 * @param actualAmount - 实际消费金额（元）
 * @param pre - preConsume 的返回结果（mode 必须为 'frozen'）
 * @throws {PreConsumeFailedError} 补扣余额不足（402，冻结已全额释放）
 */
export async function settlePreConsume(
  ctx: PreConsumeContext,
  actualAmount: number,
  pre: PreConsumeResult,
): Promise<void> {
  if (pre.mode !== 'frozen') return;

  const actualUnits = toLedgerUnits(actualAmount);
  const r = getRedis();
  if (!r) {
    // Redis 不可用：无法结算冻结 → 直通扣费（冻结记录 TTL 兜底自动释放）
    await chargeDirect(ctx, actualAmount);
    return;
  }

  const res = await r.eval(
    settlePreConsumeLua,
    3,
    balanceLedgerKey(ctx.userId),
    freezeRecordKey(ctx.requestId),
    freezeExpiryKey(ctx.requestId),
    String(actualUnits),
  ) as [number, number];

  if (res[0] === -2) {
    // 冻结记录不存在（TTL 过期/已被并发释放）→ 直通扣费
    await chargeDirect(ctx, actualAmount);
    return;
  }
  if (res[0] === -3) {
    // 补扣余额不足：Lua 已解冻全部 → PG 镜像释放（解冻）+ 402（无消费入账）
    await releaseFrozenBalance(ctx.userId, pre.amount.toFixed(8), ctx.requestId)
      .catch((e) => console.error(`[pre-consume] settle release PG mirror failed for ${ctx.requestId}:`, e));
    throw new PreConsumeFailedError(actualAmount.toFixed(8), pre.amount.toFixed(8));
  }

  // 结算成功：PG 镜像（available += (frozen - actual), frozen -= frozen）
  await settleFrozenBalance(ctx.userId, pre.amount.toFixed(8), actualAmount.toFixed(8), ctx.requestId);
}

/**
 * 释放预扣（异常/超时解冻）
 *
 * 调用时机：上游失败、客户端断开、超时等未进入结算的路径。
 * 幂等：冻结记录已被结算/释放/过期 → no-op（Redis 侧判断）；PG 镜像只在 Redis 实际释放时执行。
 * Redis 不可用 → 直接返回（冻结记录 TTL 兜底自动释放 + 清理任务自愈）。
 *
 * @param ctx - 预扣上下文
 * @param pre - preConsume 的返回结果（mode 非 'frozen' → no-op）
 */
export async function releasePreConsume(
  ctx: PreConsumeContext,
  pre: PreConsumeResult | null | undefined,
): Promise<void> {
  if (!pre || pre.mode !== 'frozen') return;

  const r = getRedis();
  if (!r) return; // Redis 不可用：冻结记录 TTL 兜底

  const balKey = balanceLedgerKey(ctx.userId);
  const recKey = freezeRecordKey(ctx.requestId);
  const expKey = freezeExpiryKey(ctx.requestId);

  try {
    const res = await r.eval(releasePreConsumeLua, 3, balKey, recKey, expKey, '-1') as [number, number];
    if (res[0] === 0) {
      // Redis 已解冻 → PG 镜像（available += frozen, frozen -= frozen）
      await releaseFrozenBalance(ctx.userId, pre.amount.toFixed(8), ctx.requestId)
        .catch((e) => console.error(`[pre-consume] release PG mirror failed for ${ctx.requestId}:`, e));
      return;
    }

    // 冻结记录缺失（TTL 过期）：从注册表恢复金额释放；注册表也被清 → 已释放/已结算，no-op
    const raw = await r.get(expKey);
    if (raw) {
      const [amountUnits, expiresAt] = String(raw).split('|');
      if (Number(expiresAt) <= Date.now()) {
        const res2 = await r.eval(releasePreConsumeLua, 3, balKey, recKey, expKey, String(amountUnits)) as [number, number];
        if (res2[0] === 0) {
          await releaseFrozenBalance(ctx.userId, fromLedgerUnits(Number(amountUnits)), ctx.requestId)
            .catch((e) => console.error(`[pre-consume] release(TTL) PG mirror failed for ${ctx.requestId}:`, e));
        }
      }
    }
  } catch (err) {
    // 释放失败尽力而为：清理任务 + TTL 兜底自愈
    console.error(`[pre-consume] release failed for ${ctx.requestId}:`, err);
  }
}

// ============================================================
// 记负兜底（旁路扣费后余额 < 0）
// ============================================================

/** 负余额风控规则 ID 缓存（null = 已确认不存在，undefined = 未查询） */
let negativeBalanceRuleId: number | null | undefined;

/**
 * 查询负余额强制预扣风控规则 ID（seed.ts 预置；查询失败 → null，事件写入跳过）
 */
async function getNegativeBalanceRuleId(): Promise<number | null> {
  if (negativeBalanceRuleId !== undefined) return negativeBalanceRuleId;
  try {
    const rows = await db.select({ id: schema.riskRules.id }).from(schema.riskRules)
      .where(eq(schema.riskRules.name, NEGATIVE_BALANCE_RULE_NAME))
      .limit(1);
    negativeBalanceRuleId = rows.length > 0 ? rows[0]!.id : null;
  } catch {
    negativeBalanceRuleId = null;
  }
  return negativeBalanceRuleId;
}

/**
 * 记录旁路扣费后的负余额风控事件 + 设置强制预扣标记
 *
 * 写 risk_events（引用 seed 预置的 negative-balance-force-preconsume 规则，rule_id NOT NULL）；
 * 该用户后续请求 shouldBypass 恒为 false（强制预扣），直到充值回正由 addBalance 清除标记。
 * DB 写入失败只记日志（标记仍设置，安全优先）。
 *
 * @param ctx - 预扣上下文
 * @param balanceAfter - 扣费后余额（< 0 触发）
 */
export async function recordNegativeBalanceRisk(
  ctx: PreConsumeContext,
  balanceAfter: string | number,
): Promise<void> {
  try {
    const ruleId = await getNegativeBalanceRuleId();
    if (ruleId != null) {
      await db.insert(schema.riskEvents).values({
        ruleId,
        userId: ctx.userId,
        eventType: 'negative_balance',
        severity: 'high',
        details: { balanceAfter: String(balanceAfter), requestId: ctx.requestId, source: 'bypass_settle' } as unknown as Record<string, unknown>,
      });
    }
  } catch (err) {
    console.error(`[pre-consume] record negative-balance risk event failed for ${ctx.requestId}:`, err);
  }
  await setNegativeFlag(ctx.userId);
}

// ============================================================
// 超时清理（TTL 兜底）
// ============================================================

/**
 * 清理已过期未结算的冻结（Redis TTL 兜底的主执行者）
 *
 * 扫描 `freeze-exp:*` 注册表（无 TTL，TTL 删除后仍可恢复金额），
 * 到期且未结算的 → 释放冻结（Redis + PG 镜像）。
 *
 * @returns 本次释放的冻结数
 */
export async function cleanupExpiredFreezes(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;

  let released = 0;
  const stream = r.scanStream({ match: 'freeze-exp:*', count: 100 });
  try {
    for await (const keys of stream) {
      for (const key of keys as string[]) {
        try {
          const raw = await r.get(key);
          if (!raw) continue;
          const [amountUnits, expiresAt, userId] = String(raw).split('|');
          if (Number(expiresAt) > Date.now()) continue; // 未到期
          const requestId = key.slice('freeze-exp:'.length);
          const res = await r.eval(
            releasePreConsumeLua,
            3,
            balanceLedgerKey(Number(userId)),
            freezeRecordKey(requestId),
            key,
            String(amountUnits),
          ) as [number, number];
          if (res[0] === 0) {
            await releaseFrozenBalance(Number(userId), fromLedgerUnits(Number(amountUnits)), requestId)
              .catch((e) => console.error(`[pre-consume] cleanup PG mirror failed for ${requestId}:`, e));
            released++;
          }
        } catch (err) {
          console.error(`[pre-consume] cleanup failed for key ${key}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[pre-consume] cleanupExpiredFreezes scan failed:', err);
  }
  return released;
}

/**
 * 启动超时冻结清理调度器（startApp 调用；测试直接调用 cleanupExpiredFreezes）
 *
 * @param intervalMs - 清理间隔（默认 60s）
 * @returns NodeJS.Timeout（进程退出时 clear）
 */
export function startFreezeCleanupScheduler(intervalMs = 60_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    cleanupExpiredFreezes().catch((err) => {
      console.error('[pre-consume] cleanup scheduler error:', err);
    });
  }, intervalMs);
}
