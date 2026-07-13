// ============================================================
//  3cloud (3C) — 利润分析路由（管理员）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import {
  computeProfitRollup,
  getProfitSummary,
  getProfitTrend,
  getLowMarginModels,
} from "../../services/profit-service.js";
import { getDb } from "../../db/index.js";
import { financeProfitRecords, models, vendors } from "../../db/schema.js";

export async function profitRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/profit — 利润明细列表
  //  Query: period, vendorId?, modelId?
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/profit", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        period: string;
        vendorId?: string;
        modelId?: string;
        page?: string;
        pageSize?: string;
      };

      if (!query.period) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 period 参数 (格式: YYYY-MM)" });
        return;
      }

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const conditions: any[] = [eq(financeProfitRecords.period, query.period)];

      if (query.vendorId) {
        conditions.push(eq(financeProfitRecords.vendorId, parseInt(query.vendorId, 10)));
      }
      if (query.modelId) {
        conditions.push(eq(financeProfitRecords.modelId, parseInt(query.modelId, 10)));
      }

      const [totalResult] = await getDb()
        .select({ count: sql<number>`count(*)` })
        .from(financeProfitRecords)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);

      const rows = await getDb()
        .select({
          id: financeProfitRecords.id,
          period: financeProfitRecords.period,
          vendorModelId: financeProfitRecords.vendorModelId,
          modelId: financeProfitRecords.modelId,
          vendorId: financeProfitRecords.vendorId,
          modelName: models.name,
          modelType: models.type,
          vendorName: vendors.name,
          totalCalls: financeProfitRecords.totalCalls,
          totalTokens: financeProfitRecords.totalTokens,
          totalUserCost: financeProfitRecords.totalUserCost,
          totalCostPrice: financeProfitRecords.totalCostPrice,
          grossProfit: financeProfitRecords.grossProfit,
          grossMargin: financeProfitRecords.grossMargin,
          totalCommission: financeProfitRecords.totalCommission,
          computedAt: financeProfitRecords.computedAt,
        })
        .from(financeProfitRecords)
        .leftJoin(models, eq(financeProfitRecords.modelId, models.id))
        .leftJoin(vendors, eq(financeProfitRecords.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(financeProfitRecords.computedAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            ...r,
            computedAt: r.computedAt?.toISOString() ?? null,
          })),
          total,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/profit/summary — 聚合概览
  //  Query: period, granularity(model|vendor)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/profit/summary", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        period: string;
        granularity: "model" | "vendor";
      };

      if (!query.period) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 period 参数" });
        return;
      }

      if (!query.granularity || !["model", "vendor"].includes(query.granularity)) {
        reply.status(400).send({ code: 400, data: null, message: "granularity 必须为 model 或 vendor" });
        return;
      }

      const result = await getProfitSummary({
        period: query.period,
        granularity: query.granularity,
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/profit/trend — 月度趋势
  //  Query: startPeriod, endPeriod
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/profit/trend", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        startPeriod: string;
        endPeriod: string;
      };

      if (!query.startPeriod || !query.endPeriod) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 startPeriod 和 endPeriod 参数" });
        return;
      }

      const result = await getProfitTrend(query.startPeriod, query.endPeriod);

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/profit/low-margin — 亏损模型告警
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/profit/low-margin", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const result = await getLowMarginModels();

      reply.status(200).send({
        code: 0,
        data: result,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/profit/compute — 手动触发利润计算
  //  Body: { period }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/profit/compute", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as { period: string } || {};

      if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
        reply.status(400).send({ code: 400, data: null, message: "请提供有效的 period 参数 (格式: YYYY-MM)" });
        return;
      }

      const result = await computeProfitRollup(body.period);

      reply.status(200).send({
        code: 0,
        data: result,
        message: `利润计算完成，已更新 ${result.inserted} 条记录`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
