// ============================================================
//  3cloud (3C) — 在线调试面板后端
//  POST /api/v1/playground/chat/completions — 调试代理请求
//  与正常代理走相同流程，但返回 _chain 链路追踪
//  调试模式不计费
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../middleware/auth.js";
import { forwardRequest, selectRoute } from "../services/router.js";
import { getDb } from "../db/index.js";
import { models, vendorModels, vendors } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";

export async function playgroundRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requirePerm(Perm.MODEL_MANAGE));

  app.post("/api/v1/playground/chat/completions", async (request, reply) => {
    const body = request.body as any;
    const modelName = body.model;
    if (!modelName) {
      return reply.status(400).send({ code: 400, data: null, message: "model 必填" });
    }

    const chain: any[] = [];
    const db = getDb();

    // Step 1: 模型解析
    const [model] = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(and(eq(models.name, modelName), eq(models.status, true)))
      .limit(1);

    if (!model) {
      return reply.status(200).send({
        _chain: [{ step: 1, name: "模型解析", status: "error", detail: `模型 "${modelName}" 不存在或已下架` }],
        _testMode: true,
        error: { message: `模型 "${modelName}" 不存在或已下架`, type: "model_not_found" },
      });
    }
    chain.push({ step: 1, name: "模型解析", status: "ok", detail: `${model.name} (id: ${model.id})` });

    // Step 2: 路由候选
    const candidates = await db
      .select({
        id: vendorModels.id,
        vendorName: vendors.name,
        sellPrice: vendorModels.sellPriceInput,
        healthScore: vendorModels.healthScore,
        isDown: vendorModels.isDown,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(and(eq(vendorModels.modelId, model.id), eq(vendorModels.status, true), eq(vendors.status, "active")))
      .orderBy(asc(vendorModels.sellPriceInput));

    chain.push({
      step: 2, name: "路由选择",
      status: candidates.length > 0 ? "ok" : "error",
      detail: `候选: ${candidates.length} 个`,
      candidates: candidates.map((c: any) => ({
        vendorName: c.vendorName,
        sellPrice: Number(c.sellPrice),
        isDown: c.isDown,
        healthScore: Number(c.healthScore),
      })),
    });

    if (candidates.length === 0) {
      return reply.status(200).send({
        _chain: chain, _testMode: true, _warning: "无可用供应商",
        error: { message: `模型 "${modelName}" 无可用供应商通道`, type: "no_route" },
      });
    }

    // Step 3: 限流检查
    chain.push({ step: 3, name: "限流检查", status: "ok", detail: "调试模式跳过" });

    // Step 4: 转发
    const route = await selectRoute({ modelName, strategy: body.strategy || "lowest_price", userId: request.user!.userId });
    const forwardResult = await forwardRequest(route, request);

    chain.push({
      step: 4, name: "上游转发",
      status: forwardResult.status < 400 ? "ok" : "error",
      detail: `HTTP ${forwardResult.status}`,
      vendorName: route.vendorName,
      upstreamModel: route.upstreamModelName,
    });

    return {
      ...forwardResult.body,
      _chain: chain,
      _testMode: true,
      _warning: "调试模式，不计费",
    };
  });
}
