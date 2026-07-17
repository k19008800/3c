// ============================================================
//  3cloud (3C) — 供应商用量和收入统计
//  GET /api/vendor/stats
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  vendors,
  callLogs,
} from "../../db/schema.js";
import "./types.js";

export async function vendorStatsRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/vendor/stats — 用量和收入统计
  // ──────────────────────────────────────────────

  app.get("/api/vendor/stats", async (request, reply) => {
    const db = getDb();
    const vendorId = request.vendor!.id;

    const [vendor] = await db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });
      return;
    }

    const [totalCallsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayCallsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
        sql`${callLogs.createdAt} >= ${today}`,
      ));

    const [revenueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${callLogs.cost}), '0')` })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ));

    const modelStats = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${callLogs.totalTokens}), 0)`,
        revenue: sql<string>`COALESCE(SUM(${callLogs.cost}), '0')`,
      })
      .from(callLogs)
      .where(and(
        eq(callLogs.vendorName, vendor.name),
        eq(callLogs.status, "success"),
      ))
      .groupBy(callLogs.modelName)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    reply.status(200).send({
      code: 0,
      data: {
        totalCalls: Number(totalCallsResult?.count ?? 0),
        todayCalls: Number(todayCallsResult?.count ?? 0),
        totalRevenue: revenueResult?.total ?? "0",
        modelStats: modelStats.map((m) => ({
          modelName: m.modelName,
          calls: Number(m.calls),
          totalTokens: Number(m.totalTokens),
          revenue: m.revenue,
        })),
      },
      message: "ok",
    });
  });
}
