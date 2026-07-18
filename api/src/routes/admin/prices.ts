// ============================================================
//  3cloud (3C) — 价格管理路由（管理员）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";
import { getDb } from "../../db/index.js";
import { vendorModels, models, vendors, systemConfigs } from "../../db/schema.js";
import {
  batchUpdateSellPrices,
  batchUpdateCostPrices,
  updatePricingMultiplier,
  getPriceChangeHistory,
  DEFAULT_PRICING_MULTIPLIER,
} from "../../services/price-service.js";

export async function priceRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/prices — 模型售价列表
  //  返回所有 vendor_models 的售价信息（含当前定价倍率）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/prices", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (_request, reply) => {
    try {
      const db = getDb();

      // 从 vendor_models + models + vendors 联表获取售价列表
      const rows = await db
        .select({
          id: vendorModels.id,
          vendorId: vendorModels.vendorId,
          modelId: vendorModels.modelId,
          modelName: models.displayName,
          modelInternalName: models.name,
          vendorName: vendors.name,
          upstreamModelName: vendorModels.upstreamModelName,
          costPriceInput: vendorModels.costPriceInput,
          costPriceOutput: vendorModels.costPriceOutput,
          sellPriceInput: vendorModels.sellPriceInput,
          sellPriceOutput: vendorModels.sellPriceOutput,
          status: vendorModels.status,
          updatedAt: vendorModels.updatedAt,
        })
        .from(vendorModels)
        .leftJoin(models, eq(vendorModels.modelId, models.id))
        .leftJoin(vendors, eq(vendorModels.vendorId, vendors.id))
        .orderBy(desc(vendorModels.updatedAt));

      // 获取当前定价倍率
      const [cfg] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "pricing_multiplier"))
        .limit(1);

      const multiplier = cfg ? parseFloat(cfg.value) : DEFAULT_PRICING_MULTIPLIER;

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map(r => ({
            id: r.id,
            vendorId: r.vendorId,
            modelId: r.modelId,
            modelName: r.modelName || r.modelInternalName || `Model #${r.modelId}`,
            vendorName: r.vendorName,
            upstreamModelName: r.upstreamModelName,
            sellPriceInput: r.sellPriceInput,
            sellPriceOutput: r.sellPriceOutput,
            costPriceInput: r.costPriceInput,
            costPriceOutput: r.costPriceOutput,
            status: r.status,
            updatedAt: r.updatedAt,
          })),
          multiplier,
          total: rows.length,
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
  //  POST /api/v1/admin/finance/prices/sell — 批量改售价
  //  Body: { vendorModelIds[], sellPriceInput, sellPriceOutput, reason }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/prices/sell", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        modelIds?: number[];
        vendorModelIds?: number[];
        sellPriceInput: string;
        sellPriceOutput: string;
        reason: string;
      };

      // 兼容前端 modelIds / vendorModelIds 两种字段名
      const ids = body.vendorModelIds ?? body.modelIds;
      if (!ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请至少选择一个模型" });
        return;
      }
      if (body.sellPriceInput === undefined || body.sellPriceOutput === undefined) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 sellPriceInput 和 sellPriceOutput" });
        return;
      }
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "请提供变更原因" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await batchUpdateSellPrices(
        ids,
        body.sellPriceInput,
        body.sellPriceOutput,
        body.reason,
        operatorId
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: `已更新 ${result.updatedCount} 个模型的售价`,
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
  //  POST /api/v1/admin/finance/prices/cost — 批量改成本
  //  Body: { vendorModelIds[], costPriceInput, costPriceOutput, reason }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/prices/cost", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        vendorModelIds?: number[];
        modelIds?: number[];
        costPriceInput: string;
        costPriceOutput: string;
        reason: string;
      };

      // 兼容前端 modelIds / vendorModelIds 两种字段名
      const ids = body.vendorModelIds ?? body.modelIds;
      if (!ids?.length) {
        reply.status(400).send({ code: 400, data: null, message: "请至少选择一个模型" });
        return;
      }
      if (body.costPriceInput === undefined || body.costPriceOutput === undefined) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 costPriceInput 和 costPriceOutput" });
        return;
      }
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "请提供变更原因" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await batchUpdateCostPrices(
        ids,
        body.costPriceInput,
        body.costPriceOutput,
        body.reason,
        operatorId
      );

      reply.status(200).send({
        code: 0,
        data: result,
        message: `已更新 ${result.updatedCount} 个模型的成本价`,
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
  //  POST /api/v1/admin/finance/prices/multiplier — 改定价倍率
  //  Body: { value, reason }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/finance/prices/multiplier", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const body = request.body as { value: string; reason: string };

      if (body.value === undefined) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 value" });
        return;
      }
      if (!body.reason) {
        reply.status(400).send({ code: 400, data: null, message: "请提供变更原因" });
        return;
      }

      const operatorId = (request as any).user.userId;
      const result = await updatePricingMultiplier(body.value, body.reason, operatorId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: `定价倍率已更新（原值: ${result.beforeValue ?? "无"})`,
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
  //  GET /api/v1/admin/finance/prices/history — 价格变更历史
  //  Query: targetType?, targetId?, page?, pageSize?
  //  不传 targetType 返回全量历史
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/prices/history", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        targetType?: string;
        targetId?: string;
        page?: string;
        pageSize?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const targetId = query.targetId ? parseInt(query.targetId, 10) : undefined;

      const result = await getPriceChangeHistory(query.targetType || undefined, targetId, page, pageSize);

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
}
