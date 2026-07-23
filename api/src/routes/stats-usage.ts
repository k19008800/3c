// ============================================================
//  3cloud (3C) — 用户端用量聚合统计路由
//  GET /api/v1/stats/usage/aggregated  — 用量聚合查询
//  GET /api/v1/stats/usage/detail      — 用量明细（含模型/供应商细分）
// 
// PERF: 此模块包含统计类接口，查询超时已通过 query-timeout 插件设置为 30 秒
//       支持复杂聚合查询，避免因数据量大导致超时中断
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import {
  aggregateUsage,
  getUsageDetail,
} from "../services/stats-usage-service.js";
import type { PeriodGranularity } from "../services/stats-usage-service.js";

export async function statsUsageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/stats/usage/aggregated — 用量聚合查询
  //  Query:
  //    start        — 开始时间 (ISO, 默认 7 天前)
  //    end          — 结束时间 (ISO, 默认现在)
  //    granularity  — 聚合粒度 hour/day/week/month (默认 day)
  //    model_name   — 按模型筛选
  //    vendor_name  — 按供应商筛选
  // ──────────────────────────────────────────────

  app.get("/api/v1/stats/usage/aggregated", async (request, reply) => {
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

      const result = await aggregateUsage({
        start: query.start,
        end: query.end,
        granularity,
        modelName: query.model_name,
        vendorName: query.vendor_name,
        userId: request.user!.userId,
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
        message: `查询用量聚合失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/stats/usage/detail — 用量明细
  //  Query:
  //    start        — 开始时间 (ISO, 默认 7 天前)
  //    end          — 结束时间 (ISO, 默认现在)
  //    granularity  — 聚合粒度 hour/day/week/month (默认 day)
  //    model_name   — 按模型筛选
  //    vendor_name  — 按供应商筛选
  //    limit        — 最大返回条数
  // ──────────────────────────────────────────────

  app.get("/api/v1/stats/usage/detail", async (request, reply) => {
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

      const result = await getUsageDetail(request.user!.userId, {
        start: query.start,
        end: query.end,
        granularity,
        modelName: query.model_name,
        vendorName: query.vendor_name,
        limit: parseInt(query.limit ?? "100", 10),
      });

      reply.send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询用量明细失败: ${err.message}`,
      });
    }
  });
}
