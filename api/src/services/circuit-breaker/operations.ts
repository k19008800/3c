// ============================================================
//  3cloud (3C) — 熔断器核心操作
//  检查/记录失败/记录成功/调整权重
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { vendorModels } from "../../db/schema.js";
import { loadSecurityConfig } from "../login-security.js";
import { recordSecurityEvent } from "../security-event.js";
import {
  KEY,
  DEFAULT_OPEN_MS,
  DEFAULT_HALF_OPEN_MS,
  DEFAULT_TRIP_THRESHOLD,
  LEVEL1_FAIL_THRESHOLD,
  LEVEL2_FAIL_THRESHOLD,
  LEVEL3_PROBE_FAIL_LIMIT,
  WEIGHT_REDUCED,
} from "./constants.js";
import {
  getDbCircuitState,
  dbTransitionDegraded,
  dbTransitionHalfOpen,
  dbTransitionDead,
  dbTransitionClosed,
} from "./persistence.js";

// ──────────────────────────────────────────────
//  1. 检查厂商是否应被跳过
// ──────────────────────────────────────────────

/**
 * 检查某个 vendorModel 在路由选择时是否应被跳过
 * 返回 true = 跳过此厂商（熔断中）
 */
export async function shouldSkipVendor(vendorModelId: number): Promise<boolean> {
  const redis = getRedis();

  // 1. 先查 DB 持久状态（优先级最高）
  const dbStatus = await getDbCircuitState(vendorModelId);

  // dead 状态 → 永远跳过
  if (dbStatus?.circuitState === "dead") {
    return true;
  }

  // half_open 且未到重试时间 → 跳过
  if (dbStatus?.circuitState === "half_open") {
    if (dbStatus.circuitRetryAfter && new Date() < dbStatus.circuitRetryAfter) {
      return true;
    }
    // 允许探测请求通过
    return false;
  }

  // 2. Redis 滑动窗口失败计数检查
  const cfg = await loadSecurityConfig();
  const openMs = cfg.circuit_breaker_open_ms ?? DEFAULT_OPEN_MS;
  const halfOpenMs = cfg.circuit_breaker_halfopen_ms ?? DEFAULT_HALF_OPEN_MS;
  const tripThreshold = cfg.circuit_breaker_trip ?? DEFAULT_TRIP_THRESHOLD;

  // Level 1: 检查是否处于软降级
  const weightReduced = await redis.get(KEY.weightReduced(vendorModelId));
  if (weightReduced) {
    // 软降级依旧可以走，但权重低，这里不跳过
    return false;
  }

  // Level 2: 检查 OPEN 状态
  const openRaw = await redis.get(KEY.open(vendorModelId));
  if (openRaw) {
    const openedAt = parseInt(openRaw, 10);
    const elapsed = Date.now() - openedAt;

    if (elapsed < openMs) {
      // 仍在 OPEN 窗口内
      return true;
    }

    // 超过 OPEN 窗口 → 进入 HALF-OPEN
    await dbTransitionHalfOpen(vendorModelId);
    await redis.del(KEY.open(vendorModelId));
    await redis.setex(KEY.halfOpen(vendorModelId), Math.ceil(halfOpenMs / 1000), String(Date.now()));

    recordSecurityEvent({
      userId: null,
      eventType: "circuit_recovery",
      riskLevel: "medium",
      detail: { vendorModelId, state: "half_open", reason: "OPEN窗口超时，进入探测模式" },
    }).catch(() => {});

    return false; // 允许探测请求
  }

  // Level 2: 检查 HALF-OPEN 状态
  const halfRaw = await redis.get(KEY.halfOpen(vendorModelId));
  if (halfRaw) {
    return false; // 允许探测请求
  }

  // 3. Level 1: 短窗口失败计数触发软降级
  const failCount = parseInt(await redis.get(KEY.failures(vendorModelId)) || "0", 10);
  if (failCount >= LEVEL1_FAIL_THRESHOLD && failCount < LEVEL2_FAIL_THRESHOLD) {
    // 进入软降级
    await dbTransitionDegraded(vendorModelId);
    await redis.setex(KEY.weightReduced(vendorModelId), 120, "1");
    return false; // 不跳过，但权重降低
  }

  // Level 2: 达到硬熔断阈值
  if (failCount >= LEVEL2_FAIL_THRESHOLD) {
    // 触发硬熔断
    await dbTransitionHalfOpen(vendorModelId);
    await redis.setex(KEY.open(vendorModelId), Math.ceil(openMs / 1000) + 30, String(Date.now()));
    await redis.del(KEY.weightReduced(vendorModelId));

    recordSecurityEvent({
      userId: null,
      eventType: "circuit_trip",
      riskLevel: "high",
      detail: { vendorModelId, failCount, state: "half_open" },
    }).catch(() => {});

    return true;
  }

  // 兼容原有熔断阈值
  if (failCount >= tripThreshold) {
    return true;
  }

  return false;
}

// ──────────────────────────────────────────────
//  2. 记录失败
// ──────────────────────────────────────────────

export async function recordVendorModelFailure(
  vendorModelId: number,
  errorMessage?: string,
): Promise<void> {
  const redis = getRedis();
  const db = getDb();

  // Redis 滑动窗口计数
  const failKey = KEY.failures(vendorModelId);
  const count = await redis.incr(failKey);
  if (count === 1) {
    await redis.expire(failKey, 120);
  }

  // 更新 DB fail count
  await db
    .update(vendorModels)
    .set({
      circuitFailCount: sql`${vendorModels.circuitFailCount} + 1`,
    })
    .where(eq(vendorModels.id, vendorModelId));

  // 检查 Level 3: 半开状态下探测失败
  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (vm?.circuitState === "half_open") {
    const probeFails = await redis.incr(KEY.level3ProbeFails(vendorModelId));
    if (probeFails === 1) {
      await redis.expire(KEY.level3ProbeFails(vendorModelId), 300);
    }

    if (probeFails >= LEVEL3_PROBE_FAIL_LIMIT) {
      await dbTransitionDead(vendorModelId);
      await redis.del(KEY.halfOpen(vendorModelId));
      await redis.del(KEY.open(vendorModelId));
      await redis.del(KEY.level3ProbeFails(vendorModelId));
    }
  }
}

// ──────────────────────────────────────────────
//  3. 记录成功
// ──────────────────────────────────────────────

export async function recordVendorModelSuccess(
  vendorModelId: number,
): Promise<void> {
  const redis = getRedis();
  const db = getDb();

  // 清除 Redis 失败计数
  await redis.del(KEY.failures(vendorModelId));
  await redis.del(KEY.open(vendorModelId));
  await redis.del(KEY.halfOpen(vendorModelId));
  await redis.del(KEY.weightReduced(vendorModelId));
  await redis.del(KEY.level3ProbeFails(vendorModelId));

  // 检查当前状态，如果是非 closed 则恢复
  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (vm && vm.circuitState !== "closed") {
    await dbTransitionClosed(vendorModelId);
  } else {
    // 只是清理 fail count
    await db
      .update(vendorModels)
      .set({ circuitFailCount: 0 })
      .where(eq(vendorModels.id, vendorModelId));
  }
}

// ──────────────────────────────────────────────
//  4. 获取 adjusted weight（路由层调用）
// ──────────────────────────────────────────────

/**
 * 获取调整后的权重（软降级后返回 10%，否则返回原始权重）
 * 供路由选择时使用
 */
export async function getAdjustedWeight(vendorModelId: number, originalWeight: number): Promise<number> {
  const redis = getRedis();
  const weightReduced = await redis.get(KEY.weightReduced(vendorModelId));
  if (weightReduced) {
    return WEIGHT_REDUCED;
  }
  return originalWeight;
}
