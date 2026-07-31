// ============================================================
//  3cloud (3C) — 供应商绩效排名 API
//  GET /api/v1/admin/vendors/ranking — 供应商绩效排名
//  Query: period (7d|30d|90d), sortBy (cost|calls|successRate|latency|costEfficiency)
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs, vendors, vendorModels, models } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminVendorRankingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  app.get("/api/v1/admin/vendors/ranking", {
    preHandler: [requirePerm(Perm.VENDOR_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { period?: string; sortBy?: string };
    const period = query.period || "30d";
    const sortBy = query.sortBy || "cost";

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "7d": startDate = new Date(now.getTime() - 7 * 86400000); break;
      case "90d": startDate = new Date(now.getTime() - 90 * 86400000); break;
      default: startDate = new Date(now.getTime() - 30 * 86400000); break;
    }

    try {
      const db = getDb();

      // 按供应商汇总调用数据
      const rows = await db
        .select({
          vendorId: vendors.id,
          vendorName: vendors.name,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          totalTokens: sql<string>`coalesce(sum(${callLogs.totalTokens}), 0)`,
          callCount: sql<string>`count(*)`,
          successCount: sql<string>`count(*) filter (where ${callLogs.status} = 'success')`,
          failedCount: sql<string>`count(*) filter (where ${callLogs.status} = 'failed')`,
          avgDuration: sql<string>`coalesce(avg(${callLogs.durationMs}), 0)`,
          avgTokens: sql<string>`coalesce(avg(${callLogs.totalTokens}), 0)`,
        })
        .from(callLogs)
        .innerJoin(vendorModels, eq(callLogs.vendorModelId, vendorModels.id))
        .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
        .where(
          and(
            gte(callLogs.createdAt, startDate),
            lt(callLogs.createdAt, now)
          )
        )
        .groupBy(vendors.id, vendors.name)
        .orderBy(sql`coalesce(sum(${callLogs.cost}::numeric), 0) desc`);

      const totalCost = rows.reduce((s, r) => s + Number(r.totalCost), 0);
      const totalCalls = rows.reduce((s, r) => s + Number(r.callCount), 0);

      // 计算绩效指标
      const rankings = rows.map(r => {
        const calls = Number(r.callCount);
        const cost = Number(r.totalCost);
        const tokens = Number(r.totalTokens);
        const success = Number(r.successCount);
        const failed = Number(r.failedCount);
        const avgDur = Number(r.avgDuration);
        const avgTok = Number(r.avgTokens);

        const successRate = calls > 0 ? (success / calls) * 100 : 0;
        const costPerToken = tokens > 0 ? cost / tokens : 0;
        const costPerCall = calls > 0 ? cost / calls : 0;
        const tokensPerCall = calls > 0 ? tokens / calls : 0;

        // 综合评分 (0-100)：基于成功率、成本效率、响应速度
        const score = Math.round(
          (successRate * 0.35) +                    // 成功率权重 35%
          Math.max(0, 100 - (costPerToken * 1e6)) * 0.25 +  // 成本效率 25%
          Math.max(0, 100 - (avgDur / 100)) * 0.25 +       // 响应速度 25%
          (calls > 100 ? 15 : (calls / 100) * 15)          // 调用量 15%
        );

        return {
          vendorId: r.vendorId,
          vendorName: r.vendorName,
          totalCost: cost,
          costPercent: totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : "0",
          totalTokens: tokens,
          callCount: calls,
          callPercent: totalCalls > 0 ? ((calls / totalCalls) * 100).toFixed(1) : "0",
          successRate: parseFloat(successRate.toFixed(2)),
          failedCount: failed,
          avgDurationMs: parseFloat(avgDur.toFixed(0)),
          avgTokensPerCall: parseFloat(tokensPerCall.toFixed(0)),
          costPerToken: parseFloat(costPerToken.toFixed(8)),
          costPerCall: parseFloat(costPerCall.toFixed(6)),
          score: Math.min(100, score),
          trend: successRate > 98 ? 'stable' : successRate > 95 ? 'warning' : 'critical',
        };
      });

      // 排序
      const sortFn = (a: any, b: any) => {
        switch (sortBy) {
          case 'calls': return b.callCount - a.callCount;
          case 'successRate': return b.successRate - a.successRate;
          case 'latency': return a.avgDurationMs - b.avgDurationMs;
          case 'costEfficiency': return a.costPerToken - b.costPerToken;
          default: return b.totalCost - a.totalCost;
        }
      };
      rankings.sort(sortFn);

      reply.send({
        code: 0,
        data: {
          period,
          sortBy,
          totalCost: totalCost.toFixed(6),
          totalCalls,
          rankings,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({ code: 1, message: `查询失败: ${err.message}` });
    }
  });
}