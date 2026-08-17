/**
 * 余额热账本（Redis）— P0-1 预扣冻结的存储层
 *
 * 背景：预扣（preConsume）需要"余额检查 + available→frozen 转移"的原子性，
 * 跨进程并发（PM2 cluster 多实例）下只有 Redis Lua 能保证不超扣。
 * PG（customer_balances）仍是持久化权威，Redis 账本作为预扣生命周期的热账本：
 *
 *   - `bal:{userId}`            HASH { available, frozen }，整数单位（1e-8 元）
 *   - `freeze:{requestId}`      STRING 冻结金额（整数单位），EX TTL（超时兜底自动消失）
 *   - `freeze-exp:{requestId}`  STRING "金额|到期时间戳"，无 TTL（清理任务依赖，避免 TTL 删除后丢失金额）
 *   - `neg:{userId}`            STRING '1'，旁路扣费余额为负后的强制预扣标记（充值回正清除）
 *
 * 单位约定：Lua 只做整数运算（避免浮点误差），金额统一换算为 1e-8 元整数
 * （与 PG numeric(18,8) 精度一致）：toLedgerUnits(元) = round(元 × 1e8)。
 *
 * 降级策略（与 lib/redis.ts 静默降级一致）：
 *   - Redis 不可用 → getRedis() 返回 null → 调用方 fail-open 旁路（回归旧"事后扣费"行为）；
 *   - 账本缺失且 PG 读取失败 → 视为无法预扣 → 旁路降级，不阻断主链路。
 *
 * @see coding-standards-control-logic.md §五 双层余额 + Redis Lua 原子预扣
 * @module services/billing
 */

import { getRedis } from '../../lib/redis';
import type Redis from 'ioredis';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================
// 常量
// ============================================================

/** 1 元的账本整数单位（1e-8 元，与 PG numeric(18,8) 精度一致） */
export const LEDGER_UNITS_PER_YUAN = 1e8;

// ============================================================
// 键与单位换算
// ============================================================

/** 用户余额账本键（HASH：available / frozen） */
export function balanceLedgerKey(userId: number): string {
  return `bal:${userId}`;
}

/** 单次预扣冻结记录键（STRING 冻结金额，EX TTL） */
export function freezeRecordKey(requestId: string): string {
  return `freeze:${requestId}`;
}

/** 预扣到期注册表键（STRING "金额|到期ms"，无 TTL，清理任务用） */
export function freezeExpiryKey(requestId: string): string {
  return `freeze-exp:${requestId}`;
}

/** 负余额强制预扣标记键 */
export function negativeFlagKey(userId: number): string {
  return `neg:${userId}`;
}

/** 元 → 账本整数单位 */
export function toLedgerUnits(yuanAmount: number | string): number {
  const n = Number(yuanAmount);
  if (!isFinite(n) || n < 0) return 0;
  // round 消除浮点误差（如 0.015 → 1500000）
  return Math.round(n * LEDGER_UNITS_PER_YUAN);
}

/** 账本整数单位 → 元（保留 8 位小数，与 PG numeric(18,8) 对齐） */
export function fromLedgerUnits(units: number | string): string {
  return (Number(units) / LEDGER_UNITS_PER_YUAN).toFixed(8);
}

// ============================================================
// 账本初始化与读取
// ============================================================

/**
 * 原子初始化 Lua 脚本（并发冷启动竞态修复，见脚本头注释）
 */
const initLedgerLua = (() => {
  const candidates = [
    // tsx/vitest 开发态：api/src/services/billing/ → api/src/scripts/
    new URL(`../../scripts/init-ledger.lua`, import.meta.url),
    // tsc 生产构建：api/dist/services/billing/ → 回退到 api/src/scripts/（源码随包部署）
    new URL(`../../../src/scripts/init-ledger.lua`, import.meta.url),
  ];
  for (const url of candidates) {
    try {
      return readFileSync(fileURLToPath(url), 'utf8');
    } catch {
      /* 尝试下一个候选路径 */
    }
  }
  throw new Error('Lua script not found: init-ledger.lua (checked src/scripts and dist/scripts)');
})();

/**
 * 从 PG（customer_balances）初始化用户 Redis 账本（幂等且原子）。
 *
 * 并发冷启动安全：所有并发调用统一走 initLedgerLua 原子脚本 ——
 * 只有账本缺失（或类型错误）时才写入，绝不覆盖已存在的 HASH。
 * 修复前为「exists 检查 → PG 读取 → HSET」两步式：并发下每个调用都读到
 * exists=0 后各自 HSET，晚到的 HSET 会把早到的预扣覆盖回 PG 快照，导致
 * 同一账本被反复重置、预扣多次成功（pre-consume.test.ts 10 并发实测 frozen=9）。
 *
 * PG 读取失败（DB 不可用 / 用户无余额账户）→ 抛错，由调用方 fail-open 旁路。
 *
 * @param userId - 用户 ID
 * @param r - Redis 客户端
 */
async function initLedgerFromPg(userId: number, r: Redis): Promise<void> {
  const rows = await db.select({
    availableBalance: schema.customerBalances.availableBalance,
    frozenBalance: schema.customerBalances.frozenBalance,
  }).from(schema.customerBalances)
    .where(eq(schema.customerBalances.userId, userId))
    .limit(1);

  const available = rows.length > 0 ? toLedgerUnits(String(rows[0]!.availableBalance)) : 0;
  const frozen = rows.length > 0 ? toLedgerUnits(String(rows[0]!.frozenBalance)) : 0;

  const key = balanceLedgerKey(userId);
  // 原子初始化：Lua 内完成「类型检查 + 写入」，并发下仅第一个生效，其余 no-op
  await r.eval(initLedgerLua, 1, key, String(available), String(frozen));
}

/**
 * 确保用户 Redis 账本已初始化，返回 Redis 客户端。
 *
 * @param userId - 用户 ID
 * @returns Redis 客户端
 * @throws 初始化失败（PG 读取异常 / Redis 不可用）→ 调用方旁路降级
 */
export async function ensureLedger(userId: number): Promise<Redis> {
  const r = getRedis();
  if (!r) throw new Error('Redis unavailable for balance ledger');

  const key = balanceLedgerKey(userId);
  // 残留 STRING（两段式初始化崩溃遗留）→ 删除重建；HASH 存在则复用
  try {
    if ((await r.exists(key)) === 0) {
      await initLedgerFromPg(userId, r);
    } else if ((await r.type(key)) !== 'hash') {
      await r.del(key);
      await initLedgerFromPg(userId, r);
    }
  } catch (err) {
    // 初始化失败 → 抛错（调用方 fail-open 旁路）
    throw err;
  }
  return r;
}

/**
 * 读取账本当前可用余额（元）。
 *
 * 账本缺失时尝试初始化（initIfMissing=true，预扣路径默认）；初始化失败（PG 不可用）→
 * 抛错（调用方旁路降级）。initIfMissing=false（旁路判定只读）→ 账本缺失直接返回
 * pgAvailable，不写 Redis（避免旁路判定残留账本）。
 *
 * @param userId - 用户 ID
 * @param pgAvailable - PG 可用余额（元，账本缺失且无法初始化时的兜底值）
 * @param opts - 可选：initIfMissing（默认 true；false = 只读不初始化）
 * @returns 可用余额（元）
 */
export async function readLedgerAvailable(
  userId: number,
  pgAvailable: number,
  opts?: { initIfMissing?: boolean },
): Promise<number> {
  const r = getRedis();
  if (!r) return pgAvailable; // Redis 不可用 → 用 PG 值（判定仍可用）
  const initIfMissing = opts?.initIfMissing !== false;

  const key = balanceLedgerKey(userId);
  for (let attempt = 0; attempt < 3; attempt++) {
    // 不存在或类型错误（残留 STRING 等）→ 重新初始化；HGET 抛 WRONGTYPE 时也重试
    try {
      if ((await r.exists(key)) === 0) {
        if (!initIfMissing) return pgAvailable; // 只读：不初始化，直接 PG 值
        await initLedgerFromPg(userId, r);
        continue; // 重新读取（可能是他人刚写入）
      }
      const raw = await r.hget(key, 'available');
      if (raw != null) return Number(raw) / LEDGER_UNITS_PER_YUAN;
    } catch (err) {
      if (!initIfMissing) return pgAvailable; // 只读：异常直接 PG 值
      // WRONGTYPE（残留非 HASH）→ 删除并重试初始化；其他异常也重试，3 次后回退 PG 值
      await r.del(key).catch(() => {});
      if (attempt === 2) throw err;
    }
  }
  return pgAvailable;
}

/**
 * 账本可用余额增减（尽力而为，供 deductBalance / addBalance 同步热账本）。
 *
 * 账本不存在时跳过（下次预扣会从 PG 重新初始化）；Redis 异常静默忽略（PG 仍是权威）。
 *
 * @param userId - 用户 ID
 * @param deltaYuan - 增减金额（元，可为负）
 */
export async function adjustLedgerAvailable(userId: number, deltaYuan: number): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    const key = balanceLedgerKey(userId);
    if ((await r.exists(key)) === 0) return; // 无热账本 → 无需同步
    const delta = toLedgerUnits(deltaYuan);
    if (delta === 0) return;
    await r.hincrby(key, 'available', delta);
  } catch {
    /* 账本同步失败不阻断主链路（PG 权威，Redis 下次初始化会自愈） */
  }
}

// ============================================================
// 负余额强制预扣标记（P0-1 记负兜底）
// ============================================================

/**
 * 设置负余额强制预扣标记（旁路扣费后余额 < 0 时写入）。
 *
 * 该标记使 shouldBypass 恒为 false（强制预扣），直到充值回正由 addBalance 清除。
 *
 * @param userId - 用户 ID
 */
export async function setNegativeFlag(userId: number): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(negativeFlagKey(userId), '1');
  } catch {
    /* 标记写失败不阻断；shouldBypass 还有 PG available < 0 兜底判定 */
  }
}

/**
 * 清除负余额强制预扣标记（充值/退款使余额回正时调用）。
 *
 * @param userId - 用户 ID
 */
export async function clearNegativeFlag(userId: number): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.del(negativeFlagKey(userId));
  } catch {
    /* 清除失败不阻断 */
  }
}

/**
 * 查询负余额强制预扣标记。
 *
 * Redis 不可用 → 返回 false（PG available < 0 由 shouldBypass 单独兜底）。
 *
 * @param userId - 用户 ID
 * @returns 是否处于强制预扣状态
 */
export async function isNegativeFlagged(userId: number): Promise<boolean> {
  try {
    const r = getRedis();
    if (!r) return false;
    return (await r.exists(negativeFlagKey(userId))) === 1;
  } catch {
    return false;
  }
}
