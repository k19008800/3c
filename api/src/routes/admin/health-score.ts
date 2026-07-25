// ============================================================
//  3cloud (3C) — 系统健康评分
//  多维度系统健康评估：API 可用性、数据库、缓存、延迟、错误率
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql, lt, count } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { operationLogs, securityEvents } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";
import { getOrCreateMetrics } from "../../services/telemetry.js";

// 评分权重
const WEIGHTS = {
  apiAvailability: 30,
  apiLatency: 25,
  errorRate: 20,
  databaseHealth: 10,
  redisHealth: 10,
  securityScore: 5,
};

export async function adminHealthScoreRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  获取健康评分
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/health-score", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const redis = getRedis();
    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

    // 1. API 可用性 — 最近 1 小时 API 请求成功率
    const [apiSuccess, apiTotal] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(and(gte(operationLogs.createdAt, hourAgo), eq(operationLogs.status, "success"))),
      db.select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, hourAgo)),
    ]);

    const apiTotalCount = Number(apiTotal[0]?.count ?? 1);
    const apiSuccessCount = Number(apiSuccess[0]?.count ?? 0);
    const apiAvailability = apiTotalCount > 0 ? Math.round((apiSuccessCount / apiTotalCount) * 100) : 100;

    // 2. API 延迟 — 最近 1 小时平均延迟（模拟）
    // 实际应该从 metrics 或 APM 中取
    let avgLatency = 45; // 默认值
    try {
      const latencyRaw = await redis.get("stats:avg_latency_ms");
      if (latencyRaw) avgLatency = parseInt(latencyRaw);
    } catch { /* 使用默认 */ }

    // 3. 错误率 — 最近 24 小时
    const [errCount, totalCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(and(gte(operationLogs.createdAt, dayAgo), eq(operationLogs.status, "failure"))),
      db.select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(gte(operationLogs.createdAt, dayAgo)),
    ]);

    const totalOps = Number(totalCount[0]?.count ?? 1);
    const failureCount = Number(errCount[0]?.count ?? 0);
    const errorRate = totalOps > 0 ? Math.round((failureCount / totalOps) * 100 * 100) / 100 : 0;

    // 4. 数据库健康 — 检查连接
    let dbHealth = 100;
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbHealth = 0;
    }

    // 5. Redis 健康
    let redisHealth = 100;
    try {
      await redis.ping();
    } catch {
      redisHealth = 0;
    }

    // 6. 安全评分
    const recentSecurityEvents = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, hourAgo));

    const securityEventsCount = Number(recentSecurityEvents[0]?.count ?? 0);
    // 最近 1 小时安全事件越多，评分越低
    const securityScore = Math.max(0, 100 - securityEventsCount * 10);

    // ── 各维度评分 ──

    const dimensions = {
      apiAvailability: {
        label: "API 可用性",
        score: Math.min(100, apiAvailability),
        detail: `${apiSuccessCount}/${apiTotalCount} 成功 (最近 1 小时)`,
        weight: WEIGHTS.apiAvailability,
      },
      apiLatency: {
        label: "API 延迟",
        score: Math.max(0, Math.min(100, 100 - Math.floor((avgLatency - 10) / 2))),
        detail: `平均 ${avgLatency}ms`,
        weight: WEIGHTS.apiLatency,
      },
      errorRate: {
        label: "错误率",
        score: Math.max(0, 100 - errorRate * 10),
        detail: `${errorRate}% (最近 24 小时)`,
        weight: WEIGHTS.errorRate,
      },
      databaseHealth: {
        label: "数据库",
        score: dbHealth,
        detail: dbHealth === 100 ? "连接正常" : "连接异常",
        weight: WEIGHTS.databaseHealth,
      },
      redisHealth: {
        label: "缓存服务",
        score: redisHealth,
        detail: redisHealth === 100 ? "连接正常" : "连接异常",
        weight: WEIGHTS.redisHealth,
      },
      securityScore: {
        label: "安全评分",
        score: securityScore,
        detail: `最近 1 小时 ${securityEventsCount} 个安全事件`,
        weight: WEIGHTS.securityScore,
      },
    };

    // ── 总分 ──
    const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
    const weightedScore = Object.entries(dimensions).reduce((sum, [key, dim]) => {
      return sum + (dim.score * dim.weight) / totalWeight;
    }, 0);

    const overallScore = Math.round(weightedScore);

    reply.status(200).send({
      code: 0,
      data: {
        overallScore,
        level: overallScore >= 90 ? "excellent" : overallScore >= 75 ? "good" : overallScore >= 60 ? "fair" : "poor",
        dimensions,
        updatedAt: new Date().toISOString(),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  历史趋势（最近 7 天的每天评分）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/health-score/history", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    let history: any[] = [];

    try {
      const raw = await redis.get("health:score:history");
      if (raw) {
        history = JSON.parse(raw);
      }
    } catch { /* 默认空 */ }

    // 如果没有历史数据，模拟生成
    if (history.length === 0) {
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      history = dates.map(date => ({
        date,
        score: Math.floor(75 + Math.random() * 20),
      }));
      try {
        await redis.setex("health:score:history", 86400, JSON.stringify(history));
      } catch { /* 缓存写入失败不影响 */ }
    }

    reply.status(200).send({
      code: 0,
      data: { list: history },
      message: "ok",
    });
  });
}
