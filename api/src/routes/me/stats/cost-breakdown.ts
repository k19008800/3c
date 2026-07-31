// ============================================================
//  3cloud (3C) — 成本分解分析 API
//  GET /api/v1/me/stats/cost-breakdown — 按模型/Key/时间维度分解成本
//  Query: period (7d|30d|90d), groupBy (model|key|day)
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { callLogs, apiKeys } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

export async function meStatsCostBreakdownRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/cost-breakdown
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/cost-breakdown", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as { period?: string; groupBy?: string };
    const period = query.period || "7d";
    const groupBy = query.groupBy || "model";

    // 计算时间范围
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "30d": startDate = new Date(now.getTime() - 30 * 86400000); break;
      case "90d": startDate = new Date(now.getTime() - 90 * 86400000); break;
      default: startDate = new Date(now.getTime() - 7 * 86400000); break;
    }

    try {
      const db = getDb();

      // ── 按模型分组 ──
      if (groupBy === "model") {
        const breakdown = await db
          .select({
            modelName: callLogs.modelName,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
            totalTokens: sql<string>`coalesce(sum(${callLogs.totalTokens}), 0)`,
            callCount: sql<string>`count(*)`,
            avgCost: sql<string>`coalesce(avg(${callLogs.cost}::numeric), 0)`,
          })
          .from(callLogs)
          .where(
            and(
              eq(callLogs.userId, userId),
              gte(callLogs.createdAt, startDate),
              lt(callLogs.createdAt, now)
            )
          )
          .groupBy(callLogs.modelName)
          .orderBy(sql`coalesce(sum(${callLogs.cost}::numeric), 0) desc`);

        const totalCost = breakdown.reduce((sum, r) => sum + Number(r.totalCost), 0);
        const totalCalls = breakdown.reduce((sum, r) => sum + Number(r.callCount), 0);

        return reply.send({
          code: 0,
          data: {
            period,
            totalCost: totalCost.toFixed(6),
            totalCalls,
            breakdown: breakdown.map(r => ({
              name: r.modelName,
              cost: Number(r.totalCost),
              costPercent: totalCost > 0 ? (Number(r.totalCost) / totalCost * 100).toFixed(1) : "0",
              tokens: Number(r.totalTokens),
              calls: Number(r.callCount),
              avgCost: Number(r.avgCost),
            })),
          },
          message: "ok",
        });
      }

      // ── 按 API Key 分组 ──
      if (groupBy === "key") {
        const breakdown = await db
          .select({
            apiKeyId: callLogs.apiKeyId,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
            totalTokens: sql<string>`coalesce(sum(${callLogs.totalTokens}), 0)`,
            callCount: sql<string>`count(*)`,
          })
          .from(callLogs)
          .where(
            and(
              eq(callLogs.userId, userId),
              gte(callLogs.createdAt, startDate),
              lt(callLogs.createdAt, now)
            )
          )
          .groupBy(callLogs.apiKeyId)
          .orderBy(sql`coalesce(sum(${callLogs.cost}::numeric), 0) desc`);

        // 获取 Key 名称
        const keyIds = breakdown.map(r => r.apiKeyId).filter(Boolean);
        const keyMap = new Map<number, string>();
        if (keyIds.length > 0) {
          const keys = await db
            .select({ id: apiKeys.id, name: apiKeys.name })
            .from(apiKeys)
            .where(sql`${apiKeys.id} = any(${keyIds})`);
          keys.forEach(k => keyMap.set(k.id, k.name));
        }

        const totalCost = breakdown.reduce((sum, r) => sum + Number(r.totalCost), 0);

        return reply.send({
          code: 0,
          data: {
            period,
            totalCost: totalCost.toFixed(6),
            totalCalls: breakdown.reduce((sum, r) => sum + Number(r.callCount), 0),
            breakdown: breakdown.map(r => ({
              keyId: r.apiKeyId,
              keyName: keyMap.get(r.apiKeyId) || `Key #${r.apiKeyId}`,
              cost: Number(r.totalCost),
              costPercent: totalCost > 0 ? (Number(r.totalCost) / totalCost * 100).toFixed(1) : "0",
              tokens: Number(r.totalTokens),
              calls: Number(r.callCount),
            })),
          },
          message: "ok",
        });
      }

      // ── 按天分组（时序数据）──
      const dailyCosts = await db
        .select({
          date: sql<string>`${callLogs.createdAt}::date::text`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          totalTokens: sql<string>`coalesce(sum(${callLogs.totalTokens}), 0)`,
          callCount: sql<string>`count(*)`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, startDate),
            lt(callLogs.createdAt, now)
          )
        )
        .groupBy(sql`${callLogs.createdAt}::date`)
        .orderBy(sql`${callLogs.createdAt}::date asc`);

      // 填充缺失日期
      const dailyMap = new Map(dailyCosts.map(r => [r.date, r]));
      const days = Math.ceil((now.getTime() - startDate.getTime()) / 86400000);
      const dailySeries: { date: string; cost: number; tokens: number; calls: number }[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        const existing = dailyMap.get(dateKey);
        dailySeries.push({
          date: dateKey,
          cost: existing ? Number(existing.totalCost) : 0,
          tokens: existing ? Number(existing.totalTokens) : 0,
          calls: existing ? Number(existing.callCount) : 0,
        });
      }

      const totalCost = dailySeries.reduce((sum, d) => sum + d.cost, 0);

      return reply.send({
        code: 0,
        data: {
          period,
          totalCost: totalCost.toFixed(6),
          totalCalls: dailySeries.reduce((sum, d) => sum + d.calls, 0),
          dailySeries,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `成本分析失败: ${err.message}`,
      });
    }
  });
}