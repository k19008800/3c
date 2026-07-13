// ============================================================
//  3cloud (3C) — 代理端用量聚合统计路由
//  GET /api/v1/agent/stats/usage — 代理端用量聚合
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { getAgentUsageSummary } from "../../services/stats-usage-service.js";
import type { PeriodGranularity } from "../../services/stats-usage-service.js";

export async function agentStatsUsageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/agent/stats/usage — 代理端用量聚合
  //  Query:
  //    start        — 开始时间 (ISO, 默认 30 天前)
  //    end          — 结束时间 (ISO, 默认现在)
  //    granularity  — 聚合粒度 hour/day/week/month (默认 day)
  //    model_name   — 按模型筛选
  //    vendor_name  — 按供应商筛选
  // ──────────────────────────────────────────────

  app.get("/api/v1/agent/stats/usage", async (request, reply) => {
    try {
      const query = request.query as {
        start?: string;
        end?: string;
        granularity?: string;
        model_name?: string;
        vendor_name?: string;
        limit?: string;
      };

      const validGranularities = ["hour", "day", "week", "month"];
      const granularity = validGranularities.includes(query.granularity ?? "")
        ? (query.granularity as PeriodGranularity)
        : "day";

      const result = await getAgentUsageSummary(request.user!.userId, {
        start: query.start,
        end: query.end,
        granularity,
        modelName: query.model_name,
        vendorName: query.vendor_name,
        limit: parseInt(query.limit ?? "365", 10),
      });

      reply.send({
        code: 0,
        data: {
          granularity,
          ...result,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询代理用量失败: ${err.message}`,
      });
    }
  });
}
