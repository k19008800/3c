/**
 * 自动熔断器 AutoBan — 滑动窗口统计 + 自动熔断/恢复
 *
 * 核心逻辑：
 * - 滑动窗口（默认 5 分钟）内统计 failure/total 比率
 * - 错误率 > 阈值（默认 30%）+ 最小样本数（默认 10）→ 自动熔断（status='open'）
 * - 冷却期（默认 60 秒）后自动进入半开状态
 * - 半开后放行 1 个试探请求：
 *   - 成功 → 恢复 active，计数器清零
 *   - 失败 → 继续熔断，重置冷却计时
 * - 手动恢复 → status='active'，计数器清零
 *
 * 使用 DB（非 Redis）存储熔断状态 — 简单可靠，避免 Redis 丢失导致熔断状态丢失
 *
 * @see newapi-migration-guide.md §1.5 自动熔断
 * @see coding-standards-control-logic.md §4 上游调用重试+熔断
 * @module services/upstream
 */

import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';

// ============================================================
// 配置（可通过环境变量覆盖）
// ============================================================

const WINDOW_MS = parseInt(process.env.CIRCUIT_BREAKER_WINDOW_MS || '300000', 10); // 5 分钟
const THRESHOLD = parseFloat(process.env.CIRCUIT_BREAKER_THRESHOLD || '0.30'); // 30%
const MIN_SAMPLES = parseInt(process.env.CIRCUIT_BREAKER_MIN_SAMPLES || '10', 10);
const COOLDOWN_MS = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || '60000', 10); // 60 秒

// ============================================================
// 类型定义
// ============================================================

/** 熔断状态记录 */
interface CircuitBreakerRecord {
  id: number;
  channelKey: string;
  failureCount: number;
  totalCount: number;
  windowStart: Date;
  status: 'active' | 'open' | 'half_open';
  openedAt: Date | null;
  lastProbeAt: Date | null;
}

// ============================================================
// 内部帮助函数
// ============================================================

/**
 * 从 DB 读取或创建熔断状态记录
 */
async function getOrCreateState(channelKey: string): Promise<CircuitBreakerRecord> {
  const rows = await db
    .select()
    .from(schema.circuitBreakerState)
    .where(eq(schema.circuitBreakerState.channelKey, channelKey))
    .limit(1);

  if (rows.length > 0 && rows[0]) {
    return rows[0] as unknown as CircuitBreakerRecord;
  }

  // 创建新记录
  const [created] = await db
    .insert(schema.circuitBreakerState)
    .values({
      channelKey,
      failureCount: 0,
      totalCount: 0,
      windowStart: new Date(),
      status: 'active',
    })
    .returning();

  return created as unknown as CircuitBreakerRecord;
}

/**
 * 判断窗口是否过期，需要重置
 */
function isWindowExpired(windowStart: Date): boolean {
  return Date.now() - windowStart.getTime() > WINDOW_MS;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 记录一次请求结果（成功/失败），返回是否需要熔断
 *
 * 自动处理：
 * - 窗口过期 → 重置计数器
 * - 半开试探请求 → 成功恢复/失败继续熔断
 * - 错误率超阈值 → 标记熔断
 *
 * @param channelKey - 渠道唯一标识（如 "supplier:1:key:3"）
 * @param success - 请求是否成功
 * @returns { shouldBan: boolean } — 是否触发熔断
 */
export async function recordChannelResult(
  channelKey: string,
  success: boolean,
): Promise<{ shouldBan: boolean }> {
  const state = await getOrCreateState(channelKey);
  const now = new Date();

  // 1. 窗口过期 → 重置计数器
  if (isWindowExpired(state.windowStart)) {
    await db
      .update(schema.circuitBreakerState)
      .set({
        failureCount: success ? 0 : 1,
        totalCount: 1,
        windowStart: now,
        status: 'active',
        openedAt: null,
        lastProbeAt: null,
      })
      .where(eq(schema.circuitBreakerState.id, state.id));

    return { shouldBan: false };
  }

  // 2. 半开状态处理：仅放行 1 个试探请求
  if (state.status === 'half_open') {
    if (success) {
      // 半开成功 → 恢复 active，计数器清零
      await db
        .update(schema.circuitBreakerState)
        .set({
          failureCount: 0,
          totalCount: 1,
          windowStart: now,
          status: 'active',
          openedAt: null,
          lastProbeAt: now,
        })
        .where(eq(schema.circuitBreakerState.id, state.id));

      return { shouldBan: false };
    }

    // 半开失败 → 继续熔断，重置冷却
    await db
      .update(schema.circuitBreakerState)
      .set({
        failureCount: state.failureCount + 1,
        totalCount: state.totalCount + 1,
        status: 'open',
        openedAt: now,
        lastProbeAt: now,
      })
      .where(eq(schema.circuitBreakerState.id, state.id));

    return { shouldBan: true };
  }

  // 3. 已开状态（open）→ 不应该再收到请求，但如果收到，记录并保持 open
  if (state.status === 'open') {
    // NOTE: 正常情况下到达此处的请求会被路由层拦截。如果路由未正确跳过则仅记录。
    await db
      .update(schema.circuitBreakerState)
      .set({
        failureCount: state.failureCount + 1,
        totalCount: state.totalCount + 1,
      })
      .where(eq(schema.circuitBreakerState.id, state.id));

    return { shouldBan: true };
  }

  // 4. active 状态：正常累计
  const newFailureCount = state.failureCount + (success ? 0 : 1);
  const newTotalCount = state.totalCount + 1;
  const errorRate = newFailureCount / newTotalCount;

  // 检查是否触发熔断
  if (newTotalCount >= MIN_SAMPLES && errorRate > THRESHOLD) {
    await db
      .update(schema.circuitBreakerState)
      .set({
        failureCount: newFailureCount,
        totalCount: newTotalCount,
        status: 'open',
        openedAt: now,
      })
      .where(eq(schema.circuitBreakerState.id, state.id));

    return { shouldBan: true };
  }

  // 正常更新计数
  await db
    .update(schema.circuitBreakerState)
    .set({
      failureCount: newFailureCount,
      totalCount: newTotalCount,
    })
    .where(eq(schema.circuitBreakerState.id, state.id));

  return { shouldBan: false };
}

/**
 * 检查是否可以试探恢复（半开）
 *
 * 逻辑：
 * - 状态为 'open' 且 冷却期已过 → 自动进入 half_open，返回 canProbe=true
 * - 状态为 'active' → canProbe=false（无需恢复）
 * - 状态为 'half_open' → canProbe=true（正在试探中，但只放行 1 个在 recordChannelResult 中已处理）
 * - 状态为 'open' 且 冷却期未过 → canProbe=false
 *
 * @param channelKey - 渠道唯一标识
 * @returns { canProbe: boolean; status: string } — 是否可以试探 + 当前状态
 */
export async function checkRecovery(
  channelKey: string,
): Promise<{ canProbe: boolean; status: string }> {
  const rows = await db
    .select()
    .from(schema.circuitBreakerState)
    .where(eq(schema.circuitBreakerState.channelKey, channelKey))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return { canProbe: false, status: 'active' };
  }

  const state = rows[0];

  // active → 无需恢复
  if (state.status === 'active') {
    return { canProbe: false, status: 'active' };
  }

  // open → 检查冷却期
  if (state.status === 'open') {
    const now = Date.now();
    const openedTime = state.openedAt ? new Date(state.openedAt).getTime() : 0;

    if (now - openedTime >= COOLDOWN_MS) {
      // 冷却期过 → 转为半开
      await db
        .update(schema.circuitBreakerState)
        .set({
          status: 'half_open',
          lastProbeAt: new Date(),
        })
        .where(eq(schema.circuitBreakerState.id, state.id));

      return { canProbe: true, status: 'half_open' };
    }

    return { canProbe: false, status: 'open' };
  }

  // half_open → 可以试探（已在 recordChannelResult 中控制放行 1 个）
  if (state.status === 'half_open') {
    return { canProbe: true, status: 'half_open' };
  }

  return { canProbe: false, status: 'active' };
}

/**
 * 判断指定 channelKey 是否处于熔断中（应跳过该 channel）
 *
 * 用于路由选择时快速跳过已熔断的 channel
 */
export async function isCircuitOpen(channelKey: string): Promise<boolean> {
  const { status } = await checkRecovery(channelKey);
  return status === 'open';
}

/**
 * 手动强制恢复
 *
 * 将熔断状态重置为 active，计数器清零。
 * 由运维后台调用。
 *
 * @param channelKey - 渠道唯一标识
 */
export async function forceRecovery(channelKey: string): Promise<void> {
  const rows = await db
    .select()
    .from(schema.circuitBreakerState)
    .where(eq(schema.circuitBreakerState.channelKey, channelKey))
    .limit(1);

  if (rows.length === 0) {
    // 没有记录 → 不需要恢复
    return;
  }

  const state = rows[0]!;
  await db
    .update(schema.circuitBreakerState)
    .set({
      failureCount: 0,
      totalCount: 0,
      windowStart: new Date(),
      status: 'active',
      openedAt: null,
      lastProbeAt: null,
    })
    .where(eq(schema.circuitBreakerState.id, state.id));
}

/**
 * 获取当前熔断状态（用于监控/调试）
 */
export async function getCircuitState(
  channelKey: string,
): Promise<{
  status: string;
  failureCount: number;
  totalCount: number;
  errorRate: number;
  openedAt: Date | null;
} | null> {
  const rows = await db
    .select()
    .from(schema.circuitBreakerState)
    .where(eq(schema.circuitBreakerState.channelKey, channelKey))
    .limit(1);

  if (rows.length === 0 || !rows[0]) return null;

  const s = rows[0];
  return {
    status: s.status,
    failureCount: s.failureCount,
    totalCount: s.totalCount,
    errorRate: s.totalCount > 0 ? s.failureCount / s.totalCount : 0,
    openedAt: s.openedAt,
  };
}
