// ============================================================
//  3cloud (3C) — 通道熔断器（增强版 V2）
//  状态机: CLOSED → Level1(软降级) → Level2(半开) → Level3(永久)
//  Redis + DB 双持久化
// ============================================================
//
//  阈值配置：
//   Level 1（软降级）: 连续失败 5 次 → weight 降为 10%
//   Level 2（半开）  : 连续失败 10 次 → isDown=true, circuit_state='half_open'
//   Level 3（永久）  : 半开状态 3 次探测全失败 → circuit_state='dead'
//   探测成功 1 次    : 恢复 weight, isDown=false, circuit_state='closed'
//
//  全部打开时间可配置，默认值通过 config 或安全配置读取。
// ============================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { vendorModels, vendors, models, circuitHistory } from "../db/schema.js";
import { loadSecurityConfig } from "./login-security.js";
import { recordSecurityEvent } from "./security-event.js";
import { AppError } from "./auth-service.js";

// ── 常量 ──

const DEFAULT_OPEN_MS = 30000;      // Level 2 半开窗口（30秒）
const DEFAULT_HALF_OPEN_MS = 120000; // 半开探测窗口（2分钟）
const DEFAULT_TRIP_THRESHOLD = 3;    // 简化兼容：原有熔断阈值
const LEVEL1_FAIL_THRESHOLD = 5;     // 软降级阈值
const LEVEL2_FAIL_THRESHOLD = 10;    // 半开阈值
const LEVEL3_PROBE_FAIL_LIMIT = 3;   // 永久关停阈值（半开探测失败次数）
const WEIGHT_REDUCED = 10;           // 软降级后的权重

// ── Redis Key 前缀 ──

const KEY = {
  failures: (vmId: number) => `cb:v2:fail:${vmId}`,
  open: (vmId: number) => `cb:v2:open:${vmId}`,
  halfOpen: (vmId: number) => `cb:v2:half:${vmId}`,
  weightReduced: (vmId: number) => `cb:v2:degraded:${vmId}`,
  level3ProbeFails: (vmId: number) => `cb:v2:dead:probes:${vmId}`,
};

// ── 类型导出 ──

export type CircuitStateV2 = "closed" | "degraded" | "half_open" | "dead";

export interface CircuitStatusV2 {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  modelName: string;
  upstreamModelName: string;
  circuitState: CircuitStateV2;
  circuitOpenedAt: string | null;
  circuitRetryAfter: string | null;
  circuitFailCount: number;
  weight: number;
  isDown: boolean;
  failuresInWindow: number;
}

// ═══════════════════════════════════════════════
//  1. 检查厂商是否应被跳过
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
//  2. DB 持久化状态查询
// ═══════════════════════════════════════════════

async function getDbCircuitState(vendorModelId: number): Promise<{
  circuitState: string;
  circuitOpenedAt: Date | null;
  circuitRetryAfter: Date | null;
  circuitFailCount: number;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      circuitState: vendorModels.circuitState,
      circuitOpenedAt: vendorModels.circuitOpenedAt,
      circuitRetryAfter: vendorModels.circuitRetryAfter,
      circuitFailCount: vendorModels.circuitFailCount,
    })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  return row ?? null;
}

// ═══════════════════════════════════════════════
//  3. DB 状态转换
// ═══════════════════════════════════════════════

async function dbTransitionDegraded(vendorModelId: number): Promise<void> {
  const db = getDb();
  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState, weight: vendorModels.weight })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  if (vm.circuitState !== "closed") return; // 只有 closed 才能进入 degraded

  // 软降级：仅降低权重，不改变 DB circuitState
  // DB 的 circuitState 保持 closed，由 Redis weightReduced key 标记降级状态
  await db
    .update(vendorModels)
    .set({
      circuitFailCount: sql`${vendorModels.circuitFailCount} + 1`,
      weight: WEIGHT_REDUCED,
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, "closed", "closed", "软降级: 连续失败达到阈值, 权重降为10%");
}

async function dbTransitionHalfOpen(vendorModelId: number): Promise<void> {
  const db = getDb();
  const now = new Date();
  const retryAfter = new Date(now.getTime() + DEFAULT_HALF_OPEN_MS);

  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  const fromState = vm.circuitState;

  await db
    .update(vendorModels)
    .set({
      circuitState: "half_open",
      circuitOpenedAt: now,
      circuitRetryAfter: retryAfter,
      isDown: true,
      weight: WEIGHT_REDUCED,
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, fromState, "half_open", "硬熔断: 连续失败达到阈值, 进入半开探测");
}

async function dbTransitionDead(vendorModelId: number): Promise<void> {
  const db = getDb();

  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  const fromState = vm.circuitState;

  await db
    .update(vendorModels)
    .set({
      circuitState: "dead",
      isDown: true,
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, fromState, "dead", "永久关停: 半开探测连续失败");

  recordSecurityEvent({
    userId: null,
    eventType: "circuit_trip",
    riskLevel: "critical",
    detail: { vendorModelId, state: "dead", reason: "半开探测连续失败3次，需人工恢复" },
  }).catch(() => {});
}

async function dbTransitionClosed(vendorModelId: number): Promise<void> {
  const db = getDb();

  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  const fromState = vm.circuitState;

  await db
    .update(vendorModels)
    .set({
      circuitState: "closed",
      circuitOpenedAt: null,
      circuitRetryAfter: null,
      circuitFailCount: 0,
      isDown: false,
      weight: 100, // 恢复默认权重
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, fromState, "closed", "恢复: 探测成功");
}

// ═══════════════════════════════════════════════
//  4. 历史记录
// ═══════════════════════════════════════════════

async function recordHistory(
  vendorModelId: number,
  fromState: string | null,
  toState: string,
  reason: string,
): Promise<void> {
  try {
    const db = getDb();
    const failCount = await getRedis().get(KEY.failures(vendorModelId));
    await db.insert(circuitHistory).values({
      vendorModelId,
      fromState: fromState as any,
      toState: toState as any,
      reason,
      failCount: failCount ? parseInt(failCount, 10) : 0,
      detail: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    console.warn("[CircuitBreaker] 记录历史失败:", err);
  }
}

// ═══════════════════════════════════════════════
//  5. 记录失败
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
//  6. 记录成功
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
//  7. 批量获取所有熔断状态（管理端看板）
// ═══════════════════════════════════════════════

export async function getAllCircuitStatuses(): Promise<CircuitStatusV2[]> {
  const redis = getRedis();

  // 从 DB 查询所有 vendor_models 的电路状态（只查有熔断相关记录的）
  const db = getDb();
  const rows = await db
    .select({
      vendorModelId: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      modelName: models.name,
      upstreamModelName: vendorModels.upstreamModelName,
      circuitState: vendorModels.circuitState,
      circuitOpenedAt: vendorModels.circuitOpenedAt,
      circuitRetryAfter: vendorModels.circuitRetryAfter,
      circuitFailCount: vendorModels.circuitFailCount,
      weight: vendorModels.weight,
      isDown: vendorModels.isDown,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .innerJoin(models, eq(vendorModels.modelId, models.id))
    .where(
      sql`${vendorModels.circuitState} != 'closed' OR ${vendorModels.isDown} = true`
    )
    .orderBy(sql`${vendorModels.circuitFailCount} desc`);

  const statuses: CircuitStatusV2[] = [];

  for (const row of rows) {
    const failCount = parseInt(await redis.get(KEY.failures(row.vendorModelId)) || "0", 10);
    statuses.push({
      vendorModelId: row.vendorModelId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      modelName: row.modelName,
      upstreamModelName: row.upstreamModelName,
      circuitState: row.circuitState as CircuitStateV2,
      circuitOpenedAt: row.circuitOpenedAt?.toISOString() ?? null,
      circuitRetryAfter: row.circuitRetryAfter?.toISOString() ?? null,
      circuitFailCount: row.circuitFailCount,
      weight: row.weight,
      isDown: row.isDown,
      failuresInWindow: failCount,
    });
  }

  return statuses;
}

// ═══════════════════════════════════════════════
//  8. 手动恢复熔断
// ═══════════════════════════════════════════════

export async function resetCircuit(vendorModelId: number): Promise<void> {
  const redis = getRedis();

  await redis.del(KEY.failures(vendorModelId));
  await redis.del(KEY.open(vendorModelId));
  await redis.del(KEY.halfOpen(vendorModelId));
  await redis.del(KEY.weightReduced(vendorModelId));
  await redis.del(KEY.level3ProbeFails(vendorModelId));

  const db = getDb();
  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  const fromState = vm.circuitState;

  await db
    .update(vendorModels)
    .set({
      circuitState: "closed",
      circuitOpenedAt: null,
      circuitRetryAfter: null,
      circuitFailCount: 0,
      isDown: false,
      weight: 100,
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, fromState, "closed", "手动恢复");

  recordSecurityEvent({
    userId: null,
    eventType: "circuit_recovery",
    riskLevel: "low",
    detail: { vendorModelId, state: "closed", reason: "手动恢复" },
  }).catch(() => {});
}

// ═══════════════════════════════════════════════
//  9. 获取活跃熔断数（仪表盘用）
// ═══════════════════════════════════════════════

export async function getActiveCircuitCount(): Promise<number> {
  try {
    const redis = getRedis();
    const keys = await redis.keys("cb:v2:open:*");
    return keys.length;
  } catch {
    const db = getDb();
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorModels)
      .where(
        sql`${vendorModels.circuitState} IN ('half_open', 'dead')`
      );
    return result?.count ?? 0;
  }
}

// ═══════════════════════════════════════════════
//  10. 获取熔断历史记录
// ═══════════════════════════════════════════════

export async function getCircuitHistory(
  limit: number = 100,
  offset: number = 0,
  vmId?: number,
): Promise<Array<typeof circuitHistory.$inferSelect & { vendorName?: string; upstreamModelName?: string }>> {
  const db = getDb();

  const conditions = vmId ? [eq(circuitHistory.vendorModelId, vmId)] : [];

  const rows = await db
    .select()
    .from(circuitHistory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${circuitHistory.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  // 附加 vendor 信息
  const vmIds = [...new Set(rows.map(r => r.vendorModelId))];
  if (vmIds.length > 0) {
    const vmRows = await db
      .select({
        id: vendorModels.id,
        vendorName: vendors.name,
        upstreamModelName: vendorModels.upstreamModelName,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(inArray(vendorModels.id, vmIds));

    const vmMap = new Map(vmRows.map(r => [r.id, r]));

    return rows.map(r => ({
      ...r,
      vendorName: vmMap.get(r.vendorModelId)?.vendorName,
      upstreamModelName: vmMap.get(r.vendorModelId)?.upstreamModelName,
    }));
  }

  return rows;
}

// ═══════════════════════════════════════════════
//  11. 获取单个熔断详情
// ═══════════════════════════════════════════════

export async function getCircuitDetail(vmId: number): Promise<CircuitStatusV2 | null> {
  const db = getDb();
  const redis = getRedis();

  const [row] = await db
    .select({
      vendorModelId: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      modelName: models.name,
      upstreamModelName: vendorModels.upstreamModelName,
      circuitState: vendorModels.circuitState,
      circuitOpenedAt: vendorModels.circuitOpenedAt,
      circuitRetryAfter: vendorModels.circuitRetryAfter,
      circuitFailCount: vendorModels.circuitFailCount,
      weight: vendorModels.weight,
      isDown: vendorModels.isDown,
      healthScore: vendorModels.healthScore,
      status: vendorModels.status,
      apiEndpoint: vendorModels.apiEndpoint,
      rpmLimit: vendorModels.rpmLimit,
      tpmLimit: vendorModels.tpmLimit,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .innerJoin(models, eq(vendorModels.modelId, models.id))
    .where(eq(vendorModels.id, vmId))
    .limit(1);

  if (!row) return null;

  const failCount = parseInt(await redis.get(KEY.failures(vmId)) || "0", 10);
  const weightReduced = await redis.get(KEY.weightReduced(vmId));
  const isInOpenWindow = !!(await redis.get(KEY.open(vmId)));
  const isInHalfOpen = !!(await redis.get(KEY.halfOpen(vmId)));
  const probeFails = parseInt(await redis.get(KEY.level3ProbeFails(vmId)) || "0", 10);

  return {
    vendorModelId: row.vendorModelId,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    modelName: row.modelName,
    upstreamModelName: row.upstreamModelName,
    circuitState: row.circuitState as CircuitStateV2,
    circuitOpenedAt: row.circuitOpenedAt?.toISOString() ?? null,
    circuitRetryAfter: row.circuitRetryAfter?.toISOString() ?? null,
    circuitFailCount: row.circuitFailCount,
    weight: row.weight,
    isDown: row.isDown,
    failuresInWindow: failCount,
  };
}

// ═══════════════════════════════════════════════
//  12. 获取 adjusted weight（路由层调用）
// ═══════════════════════════════════════════════

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
