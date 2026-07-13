// ============================================================
//  3cloud (3C) — Dashboard Health Service
//  GET /api/v1/admin/dashboard/health — 系统健康全景
// ============================================================

import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { vendors, vendorModels, models, systemConfigs, callLogs } from "../../db/schema.js";
import { checkDbConnection } from "../../db/index.js";
import { checkRedisConnection } from "../../redis.js";

export interface HealthResult {
  code: number;
  data: {
    system: { uptime: number; db: boolean; redis: boolean; timestamp: string };
    vendors: {
      statusDistribution: Record<string, number>;
      avgHealthScore: string;
      totalActiveModels: number;
      downModelCount: number;
      unhealthyModels: Array<{
        vendorName: string; modelName: string | null; upstreamModelName: string | null;
        healthScore: string | null; isDown: boolean; consecutiveSuccess: number | null;
        lastCheckAgo: number | null; samples: number | null;
      }>;
      recovering: Array<{
        vendorName: string; modelName: string | null; upstreamModelName: string | null;
        consecutiveSuccess: number | null; healthScore: string | null;
      }>;
    };
    rateLimit: { globalRpm: { current: number; limit: number }; globalTpm: { current: number; limit: number } };
    recentFailures: {
      oneHourAgo: string; total: number; failed: number; timeout: number; cancelled: number;
      errorRate: number;
      topErrors: Array<{ modelName: string | null; errorMessage: string | null; count: number }>;
    };
  };
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildHealth(db: any, redis: Redis): Promise<HealthResult> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);

  const dbOk = await checkDbConnection();
  const redisOk = await checkRedisConnection();

  const vendorStatusCounts = await db
    .select({ status: vendors.status, count: sql<number>`count(*)::int` })
    .from(vendors)
    .groupBy(vendors.status)
    .orderBy(vendors.status);

  const [healthStats] = await db
    .select({
      avgScore: sql<string>`coalesce(avg(${vendorModels.healthScore}::numeric), 0)::numeric(5,2)`,
      totalModels: sql<number>`count(*)::int`,
      downModels: sql<number>`count(*) filter (where ${vendorModels.isDown} = true)::int`,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .where(eq(vendors.status, "active"));

  const unhealthyModels = await db
    .select({
      vendorModelId: vendorModels.id, vendorName: vendors.name, modelName: models.name,
      upstreamModelName: vendorModels.upstreamModelName, healthScore: vendorModels.healthScore,
      isDown: vendorModels.isDown, consecutiveSuccess: vendorModels.consecutiveSuccess,
      lastHealthCheckAt: vendorModels.lastHealthCheckAt, healthSamples: vendorModels.healthSamples,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .innerJoin(models, eq(vendorModels.modelId, models.id))
    .where(sql`(${vendorModels.isDown} = true OR ${vendorModels.healthScore}::numeric < 0.70)`)
    .orderBy(sql`${vendorModels.healthScore}::numeric asc`)
    .limit(20);

  let rateLimit = { globalRpm: { current: 0, limit: 30 }, globalTpm: { current: 0, limit: 50000 } };
  try {
    const nowMs = Date.now();
    const cutoff = nowMs - 60000;
    const [globalRpmCfg] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "rate_limit_global_rpm")).limit(1);
    const [globalTpmCfg] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "rate_limit_global_tpm")).limit(1);
    await redis.zremrangebyscore("rl:rpm:global:0", 0, cutoff);
    const rpmCurrent = await redis.zcard("rl:rpm:global:0");
    const tpmMembers = await redis.zrange("rl:tpm:global:0", 0, -1, "WITHSCORES");
    await redis.zremrangebyscore("rl:tpm:global:0", 0, cutoff);
    let tpmSum = 0;
    for (let i = 1; i < tpmMembers.length; i += 2) tpmSum += parseInt(tpmMembers[i] ?? "0");
    rateLimit = {
      globalRpm: { current: Math.min(rpmCurrent, 99999), limit: parseInt(globalRpmCfg?.value ?? "30") },
      globalTpm: { current: Math.min(tpmSum, 99999999), limit: parseInt(globalTpmCfg?.value ?? "50000") },
    };
  } catch { /* Redis 不可用时返回 0 */ }

  const [recentFailures] = await db
    .select({
      failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      timeout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
      cancelled: sql<number>`count(*) filter (where ${callLogs.status} = 'cancelled')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(gte(callLogs.createdAt, oneHourAgo));

  const topErrors = await db
    .select({
      modelName: callLogs.modelName, errorMessage: callLogs.errorMessage, count: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .where(and(gte(callLogs.createdAt, oneHourAgo), sql`${callLogs.status} IN ('failed', 'timeout')`, sql`${callLogs.errorMessage} IS NOT NULL`))
    .groupBy(callLogs.modelName, callLogs.errorMessage)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const recovering = await db
    .select({
      vendorName: vendors.name, modelName: models.name, upstreamModelName: vendorModels.upstreamModelName,
      consecutiveSuccess: vendorModels.consecutiveSuccess, healthScore: vendorModels.healthScore,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .innerJoin(models, eq(vendorModels.modelId, models.id))
    .where(and(eq(vendorModels.isDown, true), sql`${vendorModels.consecutiveSuccess} > 0`))
    .orderBy(sql`${vendorModels.consecutiveSuccess} desc`);

  return {
    code: 0,
    data: {
      system: { uptime: process.uptime(), db: dbOk, redis: redisOk, timestamp: now.toISOString() },
      vendors: {
        statusDistribution: vendorStatusCounts.reduce((acc: Record<string, number>, r: any) => { acc[r.status] = r.count; return acc; }, {}),
        avgHealthScore: healthStats?.avgScore ?? "0.00",
        totalActiveModels: healthStats?.totalModels ?? 0,
        downModelCount: healthStats?.downModels ?? 0,
        unhealthyModels: unhealthyModels.map((m: any) => ({
          vendorName: m.vendorName, modelName: m.modelName, upstreamModelName: m.upstreamModelName,
          healthScore: m.healthScore, isDown: m.isDown, consecutiveSuccess: m.consecutiveSuccess,
          lastCheckAgo: m.lastHealthCheckAt ? Math.round((Date.now() - m.lastHealthCheckAt.getTime()) / 1000) : null,
          samples: m.healthSamples,
        })),
        recovering: recovering.map((r: any) => ({
          vendorName: r.vendorName, modelName: r.modelName, upstreamModelName: r.upstreamModelName,
          consecutiveSuccess: r.consecutiveSuccess, healthScore: r.healthScore,
        })),
      },
      rateLimit,
      recentFailures: {
        oneHourAgo: oneHourAgo.toISOString(),
        total: recentFailures.total, failed: recentFailures.failed, timeout: recentFailures.timeout,
        cancelled: recentFailures.cancelled,
        errorRate: recentFailures.total > 0 ? Number((((recentFailures.failed + recentFailures.timeout) / recentFailures.total) * 100).toFixed(2)) : 0,
        topErrors,
      },
    },
    message: "ok",
  };
}
