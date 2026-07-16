// ============================================================
//  3cloud (3C) — Dashboard 聚合摘要路由
//  GET /api/v1/admin/dashboard/summary — 首屏聚合数据
//  将原来的 6 个并行请求合并为 1 个，减轻首屏压力。
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, gte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { authenticateJWT } from "../../../middleware/auth.js";
import {
  vendorModels,
  callLogs,
  rechargeOrders,
} from "../../../db/schema.js";

const CACHE_TTL = 30;

export async function dashboardSummaryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  app.get("/api/v1/admin/dashboard/summary", async (_request, reply) => {
    const redis = getRedis();

    const cached = await redis.get("dashboard:summary");
    if (cached) {
      return { code: 0, data: JSON.parse(cached), message: "ok" };
    }

    const db = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      activeChannelsResult,
      todayCallsResult,
      todayTokensResult,
      todayCostResult,
      anomalyCountResult,
      pendingReviewsResult,
      recentAnomaliesResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(vendorModels)
        .where(and(eq(vendorModels.status, true), eq(vendorModels.isDown, false))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(callLogs)
        .where(gte(callLogs.createdAt, todayStart)),

      db.select({ total: sql<string>`coalesce(sum(total_tokens), 0)` })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, todayStart), eq(callLogs.status, "success"))),

      db.select({ total: sql<string>`coalesce(sum(cost), 0)` })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, todayStart), eq(callLogs.status, "success"))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(callLogs)
        .where(and(
          gte(callLogs.createdAt, todayStart),
          sql`status IN ('failed', 'timeout')`,
        )),

      db.select({ count: sql<number>`count(*)::int` })
        .from(rechargeOrders)
        .where(eq(rechargeOrders.status, "pending")),

      db.select({
        id: callLogs.id,
        userId: callLogs.userId,
        userEmail: sql<string>`(SELECT email FROM users WHERE id = ${callLogs.userId})`,
        modelName: callLogs.modelName,
        status: callLogs.status,
        errorMessage: callLogs.errorMessage,
        createdAt: callLogs.createdAt,
      })
        .from(callLogs)
        .where(and(
          sql`status IN ('failed', 'timeout')`,
          gte(callLogs.createdAt, new Date(now.getTime() - 3600000)),
        ))
        .orderBy(sql`${callLogs.createdAt} DESC`)
        .limit(5),
    ]);

    const data = {
      stats: {
        activeChannels: activeChannelsResult[0]?.count ?? 0,
        todayCalls: todayCallsResult[0]?.count ?? 0,
        todayTokens: Number(todayTokensResult[0]?.total ?? 0),
        todayCost: Number(todayCostResult[0]?.total ?? 0).toFixed(4),
        anomalyCount: anomalyCountResult[0]?.count ?? 0,
      },
      quickActions: {
        pendingReviews: pendingReviewsResult[0]?.count ?? 0,
      },
      recentAnomalies: recentAnomaliesResult.map((r: any) => ({
        id: r.id,
        userId: r.userId,
        user: r.userEmail || `#${r.userId}`,
        model: r.modelName,
        status: r.status,
        error: r.errorMessage,
        time: r.createdAt,
        relativeTime: getRelativeTime(r.createdAt),
      })),
    };

    await redis.setex("dashboard:summary", CACHE_TTL, JSON.stringify(data));
    return { code: 0, data, message: "ok" };
  });
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
