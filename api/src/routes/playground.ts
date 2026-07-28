// ============================================================
//  3cloud (3C) — 在线调试面板后端
//  支持 chat/completions + embeddings + rerank 三种模式
//  调试模式不计费，返回 _chain 链路追踪
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../middleware/auth.js";
import { forwardRequest, forwardStreamRequest, selectRoute } from "../services/router.js";
import { getDb } from "../db/index.js";
import { models, vendorModels, vendors } from "../db/schema.js";
import { eq, and, asc, inArray } from "drizzle-orm";

const MODEL_TYPES = ["chat", "embeddings", "rerank", "image"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

/** 获取模型可用供应商 */
async function getVendorChains(modelId: number) {
  const db = getDb();
  return db
    .select({
      id: vendorModels.id,
      vendorName: vendors.name,
      vendorId: vendors.id,
      sellPriceInput: vendorModels.sellPriceInput,
      sellPriceOutput: vendorModels.sellPriceOutput,
      healthScore: vendorModels.healthScore,
      isDown: vendorModels.isDown,
      rpmLimit: vendorModels.rpmLimit,
      tpmLimit: vendorModels.tpmLimit,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .where(and(eq(vendorModels.modelId, modelId), eq(vendorModels.status, true), eq(vendors.status, "active")))
    .orderBy(asc(vendorModels.sellPriceInput));
}

export async function playgroundRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requirePerm(Perm.MODEL_MANAGE));

  // ──────────────────────────────────────────────
  //  GET /api/v1/playground/models — 获取可调试模型列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/playground/models", async (request, reply) => {
    const db = getDb();
    const rows = await db
      .select({
        id: models.id,
        name: models.name,
        type: models.type,
        description: models.description,
        vendorCount: vendorModels.id,
      })
      .from(models)
      .leftJoin(vendorModels, eq(vendorModels.modelId, models.id))
      .where(eq(models.visibility, "public"))
      .groupBy(models.id, models.name, models.type, models.description)
      .orderBy(asc(models.name));

    // 按类型分组
    const grouped: Record<string, any[]> = { chat: [], embeddings: [], rerank: [], image: [] };
    for (const row of rows) {
      const type = (row.type || "chat") as ModelType;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({ id: row.id, name: row.name, description: row.description });
    }

    return reply.status(200).send({ code: 0, data: { models: grouped, modelTypes: MODEL_TYPES }, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/playground/models/:id/vendors — 获取模型供应商详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/playground/models/:id/vendors", async (request, reply) => {
    const { id } = request.params as { id: string };
    const modelId = parseInt(id, 10);
    if (isNaN(modelId)) return reply.status(400).send({ code: 400, data: null, message: "无效模型 ID" });

    const chain = await getVendorChains(modelId);
    return reply.status(200).send({ code: 0, data: { vendors: chain }, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/playground/chat/completions — 对话调试
  // ──────────────────────────────────────────────

  app.post("/api/v1/playground/chat/completions", async (request, reply) => {
    const body = request.body as any;
    const modelName = body.model;
    if (!modelName) {
      return reply.status(400).send({ code: 400, data: null, message: "model 必填" });
    }

    const isStream = body.stream === true;
    const chain: any[] = [];
    const db = getDb();

    // Step 1: 模型解析
    const [model] = await db
      .select({ id: models.id, name: models.name, type: models.type })
      .from(models)
      .where(and(eq(models.name, modelName), eq(models.visibility, "public")))
      .limit(1);

    if (!model) {
      return reply.status(200).send({
        _chain: [{ step: 1, name: "模型解析", status: "error", detail: `模型 "${modelName}" 不存在或已下架` }],
        _testMode: true,
        error: { message: `模型 "${modelName}" 不存在或已下架`, type: "model_not_found" },
      });
    }
    chain.push({ step: 1, name: "模型解析", status: "ok", detail: `${model.name} (type: ${model.type})` });

    // Step 2: 路由候选
    const candidates = await getVendorChains(model.id);
    chain.push({
      step: 2, name: "路由选择",
      status: candidates.length > 0 ? "ok" : "error",
      detail: `候选: ${candidates.length} 个`,
      candidates: candidates.map((c) => ({
        vendorName: c.vendorName,
        sellPriceInput: Number(c.sellPriceInput),
        sellPriceOutput: Number(c.sellPriceOutput),
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

    // Step 4: 路由选择
    const route = await selectRoute({ modelName, strategy: body.strategy || "lowest_price", userId: request.user!.userId });

    // Step 5: 转发
    if (isStream) {
      const streamResult = await forwardStreamRequest(route, request);
      chain.push({
        step: 4, name: "上游转发", status: "ok", detail: "流式响应 (SSE)",
        vendorName: route.vendorName, upstreamModel: route.upstreamModelName,
      });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Test-Mode": "true",
        "X-Chain": JSON.stringify(chain),
      });

      const reader = streamResult.stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
      reply.raw.end();
      return;
    }

    // 非流式
    const forwardResult = await forwardRequest(route, request);
    chain.push({
      step: 4, name: "上游转发",
      status: forwardResult.status < 400 ? "ok" : "error",
      detail: `HTTP ${forwardResult.status}`,
      vendorName: route.vendorName,
      upstreamModel: route.upstreamModelName,
      usage: forwardResult.usage,
    });

    return reply.status(200).send({
      ...forwardResult.body,
      _chain: chain,
      _testMode: true,
      _warning: "调试模式，不计费",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/playground/embeddings — 向量嵌入调试
  // ──────────────────────────────────────────────

  app.post("/api/v1/playground/embeddings", async (request, reply) => {
    const body = request.body as any;
    const modelName = body.model;
    if (!modelName) return reply.status(400).send({ code: 400, data: null, message: "model 必填" });

    const chain: any[] = [];
    const db = getDb();

    const [model] = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(and(eq(models.name, modelName), eq(models.visibility, "public")))
      .limit(1);

    if (!model) {
      return reply.status(200).send({
        _chain: [{ step: 1, name: "模型解析", status: "error", detail: `模型 "${modelName}" 不存在或已下架` }],
        _testMode: true,
        error: { message: `模型 "${modelName}" 不存在或已下架`, type: "model_not_found" },
      });
    }
    chain.push({ step: 1, name: "模型解析", status: "ok", detail: model.name });

    const route = await selectRoute({ modelName, strategy: "lowest_price", userId: request.user!.userId });
    if (!route) {
      return reply.status(200).send({
        _chain: [...chain, { step: 2, name: "路由选择", status: "error", detail: "无可用供应商" }],
        _testMode: true,
        error: { message: "无可用供应商通道", type: "no_route" },
      });
    }
    chain.push({ step: 2, name: "路由选择", status: "ok", detail: `${route.vendorName} / ${route.upstreamModelName}` });

    const forwardResult = await forwardRequest(route, request);
    chain.push({
      step: 3, name: "上游转发", status: forwardResult.status < 400 ? "ok" : "error",
      detail: `HTTP ${forwardResult.status}`, vendorName: route.vendorName,
      usage: forwardResult.usage,
    });

    return reply.status(200).send({
      ...forwardResult.body,
      _chain, _testMode: true, _warning: "调试模式，不计费",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/playground/rerank — 重排序调试
  // ──────────────────────────────────────────────

  app.post("/api/v1/playground/rerank", async (request, reply) => {
    const body = request.body as any;
    const modelName = body.model;
    if (!modelName) return reply.status(400).send({ code: 400, data: null, message: "model 必填" });

    const chain: any[] = [];
    const db = getDb();

    const [model] = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(and(eq(models.name, modelName), eq(models.visibility, "public")))
      .limit(1);

    if (!model) {
      return reply.status(200).send({
        _chain: [{ step: 1, name: "模型解析", status: "error", detail: `模型 "${modelName}" 不存在或已下架` }],
        _testMode: true,
        error: { message: `模型 "${modelName}" 不存在或已下架`, type: "model_not_found" },
      });
    }

    chain.push({ step: 1, name: "模型解析", status: "ok", detail: model.name });
    const route = await selectRoute({ modelName, strategy: "lowest_price", userId: request.user!.userId });

    if (!route) {
      return reply.status(200).send({
        _chain: [...chain, { step: 2, name: "路由选择", status: "error", detail: "无可用供应商" }],
        _testMode: true,
        error: { message: "无可用供应商通道", type: "no_route" },
      });
    }
    chain.push({ step: 2, name: "路由选择", status: "ok", detail: `${route.vendorName} / ${route.upstreamModelName}` });

    const forwardResult = await forwardRequest(route, request);
    chain.push({
      step: 3, name: "上游转发", status: forwardResult.status < 400 ? "ok" : "error",
      detail: `HTTP ${forwardResult.status}`, vendorName: route.vendorName,
    });

    return reply.status(200).send({
      ...forwardResult.body,
      _chain, _testMode: true, _warning: "调试模式，不计费",
    });
  });
}