// ============================================================
//  3cloud (3C) — 熔断器 DB + Redis 持久化（内部函数）
//  状态转换与历史记录
// ============================================================

import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { vendorModels, circuitHistory } from "../../db/schema.js";
import { recordSecurityEvent } from "../security-event.js";
import { KEY, DEFAULT_HALF_OPEN_MS, WEIGHT_REDUCED } from "./constants.js";

// ──────────────────────────────────────────────
//  DB 持久化状态查询
// ──────────────────────────────────────────────

export async function getDbCircuitState(vendorModelId: number): Promise<{
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

// ──────────────────────────────────────────────
//  DB 状态转换
// ──────────────────────────────────────────────

export async function dbTransitionDegraded(vendorModelId: number): Promise<void> {
  const db = getDb();
  const [vm] = await db
    .select({ circuitState: vendorModels.circuitState, weight: vendorModels.weight })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;
  if (vm.circuitState !== "closed") return;

  // 注意：circuitFailCount 由 recordVendorModelFailure 统一递增，此处不重复计数
  await db
    .update(vendorModels)
    .set({
      weight: WEIGHT_REDUCED,
    })
    .where(eq(vendorModels.id, vendorModelId));

  await recordHistory(vendorModelId, "closed", "closed", "软降级: 连续失败达到阈值, 权重降为10%");
}

export async function dbTransitionHalfOpen(vendorModelId: number): Promise<void> {
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

export async function dbTransitionDead(vendorModelId: number): Promise<void> {
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

export async function dbTransitionClosed(vendorModelId: number): Promise<void> {
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

  await recordHistory(vendorModelId, fromState, "closed", "恢复: 探测成功");
}

// ──────────────────────────────────────────────
//  历史记录
// ──────────────────────────────────────────────

export async function recordHistory(
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
