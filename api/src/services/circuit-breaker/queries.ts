// ============================================================
//  3cloud (3C) — 熔断器查询
//  批量状态、详情、历史、计数、手动恢复
// ============================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { vendorModels, vendors, models, circuitHistory } from "../../db/schema.js";
import { recordSecurityEvent } from "../security-event.js";
import { KEY } from "./constants.js";
import { recordHistory } from "./persistence.js";
import { CircuitStateV2, CircuitStatusV2 } from "./types.js";

// ──────────────────────────────────────────────
//  1. 批量获取所有熔断状态（管理端看板）
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  2. 手动恢复熔断
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  3. 获取活跃熔断数（仪表盘用）
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  4. 获取熔断历史记录
// ──────────────────────────────────────────────

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

// ──────────────────────────────────────────────
//  5. 获取单个熔断详情
// ──────────────────────────────────────────────

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
