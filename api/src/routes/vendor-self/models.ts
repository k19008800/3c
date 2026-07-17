// ============================================================
//  3cloud (3C) — 供应商模型管理路由
//  GET    /api/vendor/models              — 查看模型列表
//  POST   /api/vendor/models              — 添加模型
//  PATCH  /api/vendor/models/:id          — 上下架模型
//  PUT    /api/vendor/models/:id          — 更新模型
//  PUT    /api/vendor/models/:id/price    — 更新模型价格
//  DELETE /api/vendor/models/:id          — 下架模型
//  POST   /api/vendor/api-keys            — 轮换 API Key
//  PUT    /api/vendor/key                 — 轮换自己的 API Key（旧方法）
//  GET    /api/vendor/health              — 查看通道健康状态
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../../db/index.js";
import {
  vendors,
  vendorApiKeys,
  vendorModels,
  models,
  callLogs,
} from "../../db/schema.js";
import "./types.js";

export async function vendorModelRoutes(app: FastifyInstance) {
  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/vendor/models — 查看自己的模型
  // ──────────────────────────────────────────────
  app.get("/api/vendor/models", async (request, reply) => {
    const vendorId = request.vendor!.id;

    const vms = await db
      .select({
        id: vendorModels.id,
        modelId: vendorModels.modelId,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        apiEndpoint: vendorModels.apiEndpoint,
        costPriceInput: vendorModels.costPriceInput,
        costPriceOutput: vendorModels.costPriceOutput,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
        weight: vendorModels.weight,
        status: vendorModels.status,
        rpmLimit: vendorModels.rpmLimit,
        tpmLimit: vendorModels.tpmLimit,
        healthScore: vendorModels.healthScore,
        isDown: vendorModels.isDown,
        circuitState: vendorModels.circuitState,
        circuitFailCount: vendorModels.circuitFailCount,
        createdAt: vendorModels.createdAt,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId))
      .orderBy(desc(vendorModels.createdAt));

    reply.status(200).send({
      code: 0,
      data: vms.map((vm) => ({
        ...vm,
        costPriceInput: vm.costPriceInput.toString(),
        costPriceOutput: vm.costPriceOutput.toString(),
        sellPriceInput: vm.sellPriceInput.toString(),
        sellPriceOutput: vm.sellPriceOutput.toString(),
        createdAt: vm.createdAt.toISOString(),
      })),
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/vendor/models — 添加模型
  // ──────────────────────────────────────────────
  app.post("/api/vendor/models", async (request, reply) => {
    const vendorId = request.vendor!.id;
    const body = request.body as any;

    const { modelId, upstreamModelName, apiEndpoint, costPriceInput, costPriceOutput, sellPriceInput, sellPriceOutput, rpmLimit, tpmLimit } = body || {};

    if (!modelId || !upstreamModelName) {
      reply.status(400).send({ code: 400, data: null, message: "modelId 和 upstreamModelName 必填" });
      return;
    }

    const [model] = await db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.id, modelId))
      .limit(1);

    if (!model) {
      reply.status(404).send({ code: 404, data: null, message: "模型不存在" });
      return;
    }

    const vendor = await db
      .select({ baseUrl: vendors.baseUrl })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    const endpoint = apiEndpoint || (vendor?.[0]?.baseUrl || "") + "/v1/chat/completions";

    try {
      const [vm] = await db
        .insert(vendorModels)
        .values({
          vendorId,
          modelId,
          upstreamModelName,
          apiEndpoint: endpoint,
          apiKeyEncrypted: "",
          costPriceInput: costPriceInput || "0.000000",
          costPriceOutput: costPriceOutput || "0.000000",
          sellPriceInput: sellPriceInput || "0.000000",
          sellPriceOutput: sellPriceOutput || "0.000000",
          status: false,
          rpmLimit: rpmLimit || null,
          tpmLimit: tpmLimit || null,
          weight: 100,
        })
        .returning();

      reply.status(200).send({
        code: 0,
        data: vm,
        message: "模型已提交，等待管理员审核",
      });
    } catch (err: any) {
      const isDup = err?.message?.includes?.("duplicate") || err?.code === "23505";
      if (isDup) {
        reply.status(409).send({ code: 409, data: null, message: "该模型已添加" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/vendor/models/:id — 上下架模型（切换 status）
  // ──────────────────────────────────────────────
  app.patch("/api/vendor/models/:id", async (request, reply) => {
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    if (body.status === undefined) {
      reply.status(400).send({ code: 400, data: null, message: "需要 status 字段" });
      return;
    }

    const [existing] = await db
      .select({ id: vendorModels.id, status: vendorModels.status })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set({ status: !!body.status })
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({
      code: 0,
      data: { id: vm.id, status: vm.status },
      message: body.status ? "模型已上架" : "模型已下架",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/models/:id — 更新模型/价格
  // ──────────────────────────────────────────────
  app.put("/api/vendor/models/:id", async (request, reply) => {
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    const allowedFields = ["sellPriceInput", "sellPriceOutput", "upstreamModelName", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({ code: 0, data: vm, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/models/:id/price — 更新模型价格
  // ──────────────────────────────────────────────
  app.put("/api/vendor/models/:id/price", async (request, reply) => {
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const body = request.body as any;
    const priceFields = ["sellPriceInput", "sellPriceOutput", "costPriceInput", "costPriceOutput"] as const;
    const updates: Record<string, any> = {};
    for (const field of priceFields) {
      if (body[field] !== undefined) updates[field] = String(body[field]);
    }

    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "需要至少一个价格字段" });
      return;
    }

    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({
      code: 0,
      data: {
        id: vm.id,
        sellPriceInput: vm.sellPriceInput.toString(),
        sellPriceOutput: vm.sellPriceOutput.toString(),
        costPriceInput: vm.costPriceInput.toString(),
        costPriceOutput: vm.costPriceOutput.toString(),
      },
      message: "价格已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/vendor/models/:id — 下架模型
  // ──────────────────────────────────────────────
  app.delete("/api/vendor/models/:id", async (request, reply) => {
    const vendorId = request.vendor!.id;
    const vmId = parseInt((request.params as any).id, 10);
    if (isNaN(vmId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模型 ID" });
      return;
    }

    const [existing] = await db
      .select({ id: vendorModels.id })
      .from(vendorModels)
      .where(and(eq(vendorModels.id, vmId), eq(vendorModels.vendorId, vendorId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "模型配置不存在" });
      return;
    }

    const [vm] = await db
      .update(vendorModels)
      .set({ status: false })
      .where(eq(vendorModels.id, vmId))
      .returning();

    reply.status(200).send({ code: 0, data: vm, message: "模型已下架" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/vendor/api-keys — 轮换 API Key
  // ──────────────────────────────────────────────
  app.post("/api/vendor/api-keys", async (request, reply) => {
    const vendorId = request.vendor!.id;

    const body = request.body as any;
    if (body?.revoke_old !== false) {
      await db
        .update(vendorApiKeys)
        .set({ status: false })
        .where(and(eq(vendorApiKeys.vendorId, vendorId), eq(vendorApiKeys.status, true)));
    }

    const rawKey = `v_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const [keyRecord] = await db.insert(vendorApiKeys).values({
      vendorId,
      keyHash,
      keyPrefix,
      permissions: ["vendor:*"],
      status: body?.auto_activate === true,
    }).returning();

    reply.status(200).send({
      code: 0,
      data: {
        key: rawKey,
        keyPrefix,
        id: keyRecord.id,
        status: keyRecord.status,
      },
      message: body?.auto_activate ? "新 API Key 已生成并激活" : "新 API Key 已生成，等待管理员激活",
    });
  });

  // ──────────────────────────────────────────────
  //  PUT /api/vendor/key — 轮换自己的 API Key（申请）
  // ──────────────────────────────────────────────
  app.put("/api/vendor/key", async (request, reply) => {
    const vendorId = request.vendor!.id;

    await db
      .update(vendorApiKeys)
      .set({ status: false })
      .where(and(eq(vendorApiKeys.vendorId, vendorId), eq(vendorApiKeys.status, true)));

    const rawKey = `v_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    await db.insert(vendorApiKeys).values({
      vendorId,
      keyHash,
      keyPrefix,
      permissions: ["vendor:*"],
      status: false,
    });

    reply.status(200).send({
      code: 0,
      data: {
        key: rawKey,
        keyPrefix,
        message: "新 Key 已生成，等待管理员激活后可用",
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/vendor/health — 查看通道健康状态
  // ──────────────────────────────────────────────
  app.get("/api/vendor/health", async (request, reply) => {
    const vendorId = request.vendor!.id;

    const vms = await db
      .select({
        id: vendorModels.id,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        healthScore: vendorModels.healthScore,
        healthSamples: vendorModels.healthSamples,
        consecutiveSuccess: vendorModels.consecutiveSuccess,
        lastHealthCheckAt: vendorModels.lastHealthCheckAt,
        isDown: vendorModels.isDown,
        modelName: models.name,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId))
      .orderBy(desc(vendorModels.healthScore));

    reply.status(200).send({
      code: 0,
      data: vms.map((vm) => ({
        vendorModelId: vm.id,
        modelName: vm.modelName,
        upstreamModelName: vm.upstreamModelName,
        status: vm.status,
        healthScore: vm.healthScore,
        healthSamples: vm.healthSamples,
        consecutiveSuccess: vm.consecutiveSuccess,
        lastHealthCheckAt: vm.lastHealthCheckAt?.toISOString() ?? null,
        isDown: vm.isDown,
      })),
      message: "ok",
    });
  });
}
